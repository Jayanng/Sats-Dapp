import { useState, useEffect } from 'react'
import { openContractCall } from '@stacks/connect'
import {
    fetchCallReadOnlyFunction,
    cvToJSON,
    Cl,
    PostConditionMode,
    Pc
} from '@stacks/transactions'
import toast from 'react-hot-toast'
import { useWallet } from '../context/WalletContext'
import { fetchBtcPrice, FALLBACK_BTC_PRICE, getStackingStatus, delegateToPoX, revokePoX } from '../lib/stacks'
import { pollTx } from '../lib/pollTx.jsx'
import TxSuccessModal from '../components/TxSuccessModal'
import TxFailedModal from '../components/TxFailedModal'
import TxPendingModal from '../components/TxPendingModal'

const CONTRACT_ADDRESS = 'ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV'

const CYCLE_TOTAL = 2100   // blocks per PoX cycle (~2 weeks)
const CYCLE_NUM = 89
const CYCLE_APY = 8.42
const CIRCUMFERENCE = 2 * Math.PI * 60  // r=60

// ── Liquidation Modal ──────────────────────────────────────────
function LiquidationModal({ vaultData, onClose, onLiquidationConfirmed, setPendingTxId }) {
    const { address } = useWallet()
    const [isTxPending, setIsTxPending] = useState(false)
    const [confirmedTxId, setConfirmedTxId] = useState(null)
    const [failedReason, setFailedReason] = useState(null)
    const [failedTxId, setFailedTxId] = useState(null)

    // Example calculation for liquidator perspective
    const currentPriceUsd = 85000  // will use live from outer scope via prop if needed
    const collateralUsd = vaultData.collateral * currentPriceUsd
    const debtUsd = vaultData.debt
    const isUnhealthy = debtUsd > 0 && (collateralUsd / debtUsd) < 1.15 // mock threshold

    const executeLiquidation = async () => {
        if (!address) {
            toast.error('Please connect your Leather wallet first.')
            return
        }

        // Fix: Calculate the exact amount of VUSD to repay (6 decimals)
        const repayAmountVusd = Math.floor(vaultData.debt * 1_000_000)

        // Calculate expected sBTC return based on the mock oracle price ($61,400) + 5% liquidator premium
        // (repayAmount / oraclePrice) * 1.05
        const expectedSbtcSats = Math.floor(((repayAmountVusd * 100_000_000) / 61400000000) * 1.05)

        const riskEngineAddress = CONTRACT_ADDRESS
        const riskEngineContract = 'mock-reputation-engine-demo'
        const sbtcAddress = CONTRACT_ADDRESS
        const sbtcContract = 'mock-sbtc-demo'
        const oracleAddress = CONTRACT_ADDRESS
        const oracleContract = 'mock-oracle-demo'

        // Fix: Added the missing Cl.uint(repayAmountVusd) argument
        const functionArgs = [
            Cl.principal(address), // Target (self for demo)
            Cl.uint(repayAmountVusd), // Amount of debt to repay
            Cl.contractPrincipal(sbtcAddress, sbtcContract),
            Cl.contractPrincipal(riskEngineAddress, riskEngineContract),
            Cl.contractPrincipal(oracleAddress, oracleContract)
        ]

        // Condition 1: Liquidator must burn exactly the repay amount of VUSD
        const liquidatorVusdCondition = Pc.principal(address)
            .willSendEq(repayAmountVusd)
            .ft(`${CONTRACT_ADDRESS}.vault-usd-final`, 'vault-usd');

        // Condition 2: Liquidator must receive >= expected sBTC from the protocol
        const protocolSbtcCondition = Pc.principal(`${CONTRACT_ADDRESS}.lending-protocol-v3`)
            .willSendGte(expectedSbtcSats)
            .ft(`${CONTRACT_ADDRESS}.mock-sbtc-demo`, 'mock-sbtc');

        setIsTxPending(true)

        openContractCall({
            network: 'testnet',
            contractAddress: CONTRACT_ADDRESS,
            contractName: 'lending-protocol-v3',
            functionName: 'liquidate',
            functionArgs,
            postConditionMode: PostConditionMode.Deny, // STRICT MODE ENFORCED
            postConditions: [liquidatorVusdCondition, protocolSbtcCondition],
            onFinish: (data) => {
                setPendingTxId(data.txId)
                pollTx(data.txId, {
                    setIsTxPending,
                    onConfirmed: (txId) => {
                        setPendingTxId(null)
                        setConfirmedTxId(txId)
                        onLiquidationConfirmed?.()
                    },
                    onFailed: (txId, reason) => {
                        setPendingTxId(null)
                        setFailedReason(reason)
                        setFailedTxId(txId)
                    }
                })
            },
            onCancel: () => {
                toast.error('Liquidation canceled.')
                setIsTxPending(false)
            }
        })
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={onClose}>
            <div className="relative card p-0 overflow-hidden w-full max-w-md shadow-2xl border border-red-500/20"
                onClick={(e) => e.stopPropagation()}>

                {/* ── Modals ── */}
                <TxSuccessModal 
                    isOpen={!!confirmedTxId}
                    onClose={onClose}
                    txId={confirmedTxId}
                    title="Liquidation Confirmed!"
                    subtitle="Transaction successful. Repaid debt and received collateral bonus."
                    details={[
                        { label: 'Repay Amount', value: `${vaultData.debt.toFixed(2)} VUSD` },
                        { label: 'Collateral Bonus', value: '10%' }
                    ]}
                />

                <TxFailedModal 
                    isOpen={!!failedReason}
                    onClose={() => { setFailedReason(null); setFailedTxId(null) }}
                    error={failedReason}
                    txId={failedTxId}
                />

                <div className="bg-red-500/10 px-6 py-4 flex justify-between items-center border-b border-red-500/20">
                    <h3 className="font-black text-red-500 flex items-center gap-2">
                        <span className="material-symbols-outlined font-black">gavel</span>
                        Liquidate Vault
                    </h3>
                    <button onClick={onClose} className="text-red-400 hover:text-red-500">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <p className="text-sm text-zinc-400 leading-relaxed mb-6">
                        As a liquidator, you repay another user's VUSD debt in exchange for their sBTC collateral at a <span className="font-bold text-red-400">10% discount</span>.
                    </p>

                    <div className="card bg-zinc-50 dark:bg-zinc-900/50 p-4 border border-zinc-200 dark:border-zinc-800 space-y-3">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-zinc-500">Target Vault:</span>
                            <span className="mono font-bold text-zinc-900 dark:text-zinc-100">{address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'None'}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-zinc-500">Vault Health:</span>
                            <span className={`font-black ${isUnhealthy ? 'text-red-500' : 'text-emerald-500'}`}>
                                {isUnhealthy ? 'UNHEALTHY (<115%)' : 'HEALTHY (Cannot Liquidate)'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center text-sm pt-2 border-t border-zinc-200 dark:border-zinc-800">
                            <span className="text-zinc-500">Expected Profit:</span>
                            <span className="mono font-black text-emerald-500">+10% Bonus</span>
                        </div>
                    </div>

                    {!isUnhealthy && debtUsd > 0 && (
                        <p className="text-[10px] text-yellow-500 text-center uppercase tracking-wider font-bold">
                            Warning: Transaction may fail since vault is healthy
                        </p>
                    )}

                    <button
                        onClick={executeLiquidation}
                        disabled={isTxPending || !address}
                        className="w-full py-4 text-white font-black bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all flex justify-center items-center gap-2 shadow-lg shadow-red-500/20 text-sm">
                        {isTxPending ? 'Broadcasting Tx...' : 'Fire Liquidation Bot'}
                    </button>
                </div>
            </div>
        </div>
    )
}

async function fetchActivityEvents() {
    try {
        const res = await fetch(
            'https://api.testnet.hiro.so/extended/v1/contract/ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV.lending-protocol-v3/events?limit=20'
        )
        const data = await res.json()
        return data.results ?? []
    } catch {
        return []
    }
}

function parseEvent(raw) {
    const repr = raw?.contract_log?.value?.repr ?? ''
    const get = (key) => {
        const match = repr.match(new RegExp(`\\(${key} ([^)]+)\\)`))
        return match ? match[1] : null
    }
    const eventType = get('event')?.replace(/"/g, '') ?? 'unknown'
    const owner = get('owner')?.replace(/'/g, '') ?? ''
    const amount = get('amount') ?? get('vusd-burned') ?? get('repay-amount') ?? '0'
    const sbtcReturned = get('sbtc-returned')
    const block = get('block')?.replace('u', '') ?? ''
    const txId = raw?.tx_id ?? ''

    const amountNum = Number(amount.replace('u', ''))

    let displayAmount = ''
    let asset = ''
    let icon = 'south_west'
    let iconBg = 'bg-emerald-500/10'
    let iconColor = 'text-emerald-500'

    if (eventType === 'supply') {
        displayAmount = (amountNum / 1e8).toFixed(4)
        asset = 'sBTC'
        icon = 'south_west'
        iconBg = 'bg-emerald-500/10'
        iconColor = 'text-emerald-500'
    } else if (eventType === 'borrow') {
        displayAmount = (amountNum / 1e6).toFixed(2)
        asset = 'VUSD'
        icon = 'north_east'
        iconBg = 'bg-primary/10'
        iconColor = 'text-primary'
    } else if (eventType === 'repay') {
        displayAmount = (amountNum / 1e6).toFixed(2)
        asset = 'VUSD'
        icon = 'payments'
        iconBg = 'bg-blue-500/10'
        iconColor = 'text-blue-500'
    } else if (eventType === 'redeem') {
        const sbtcNum = Number((sbtcReturned ?? '0').replace('u', ''))
        displayAmount = (sbtcNum / 1e8).toFixed(6)
        asset = 'sBTC'
        icon = 'currency_exchange'
        iconBg = 'bg-purple-500/10'
        iconColor = 'text-purple-500'
    } else if (eventType === 'liquidate') {
        displayAmount = (amountNum / 1e6).toFixed(2)
        asset = 'VUSD'
        icon = 'gavel'
        iconBg = 'bg-red-500/10'
        iconColor = 'text-red-500'
    }

    return {
        eventType, owner, displayAmount, asset,
        icon, iconBg, iconColor, block, txId
    }
}

export default function Dashboard() {
    const { stxBalance, address } = useWallet()
    const [isLiquidationModalOpen, setIsLiquidationModalOpen] = useState(false)
    const [pendingTxId, setPendingTxId] = useState(null)

    // Live vault state
    const [vaultData, setVaultData] = useState({ collateral: 0, debt: 0, exists: false, isLoading: true })

    // Fetch the user's live vault from the testnet contract
    useEffect(() => {
        if (!address) {
            setVaultData({ collateral: 0, debt: 0, exists: false, isLoading: false })
            return
        }
        async function fetchVault() {
            setVaultData(prev => ({ ...prev, isLoading: true }))
            try {
                const response = await fetchCallReadOnlyFunction({
                    network: 'testnet',
                    contractAddress: CONTRACT_ADDRESS,
                    contractName: 'lending-protocol-v3',
                    functionName: 'get-vault',
                    functionArgs: [Cl.principal(address)],
                    senderAddress: address,
                })

                const json = cvToJSON(response)

                // Fix: Remove `json.success` and map the v7 `optional` tuple structure correctly
                if (json && json.type && json.type.startsWith('(optional') && json.value !== null) {
                    const data = json.value.value // Step into the tuple wrapper
                    setVaultData({
                        collateral: Number(data.collateral.value) / 100_000_000, // 8 decimals for sBTC
                        debt: Number(data.debt.value) / 1_000_000, // 6 decimals for VUSD
                        exists: true,
                        isLoading: false
                    })
                } else {
                    // Vault doesn't exist yet or is empty
                    setVaultData({ collateral: 0, debt: 0, exists: false, isLoading: false })
                }
            } catch (error) {
                console.error('Error fetching vault:', error)
                setVaultData({ collateral: 0, debt: 0, exists: false, isLoading: false })
            }
        }

        fetchVault()

        // Re-fetch whenever the user tabs back to this page (e.g. after doing a supply in Markets)
        const onVisible = () => { if (document.visibilityState === 'visible') fetchVault() }
        document.addEventListener('visibilitychange', onVisible)
        return () => document.removeEventListener('visibilitychange', onVisible)
    }, [address])

    // Live BTC/USD price from pyth-wrapper (falls back to FALLBACK_BTC_PRICE)
    const [priceSbtc, setPriceSbtc] = useState(FALLBACK_BTC_PRICE)
    useEffect(() => {
        fetchBtcPrice(address).then(setPriceSbtc).catch(() => setPriceSbtc(FALLBACK_BTC_PRICE))
        const id = setInterval(() => {
            fetchBtcPrice(address).then(setPriceSbtc).catch(() => { })
        }, 60_000)
        return () => clearInterval(id)
    }, [address])

    // ── PoX delegation status ────────────────────────────────────
    const [poxStatus, setPoxStatus] = useState(null)   // null = not yet loaded
    const [poxLoading, setPoxLoading] = useState(false)
    const [poxTxPending, setPoxTxPending] = useState(false)
    const [delegateAmt, setDelegateAmt] = useState('1000')
    const [confirmedTxId, setConfirmedTxId] = useState(null)
    const [failedReason, setFailedReason] = useState(null)
    const [failedTxId, setFailedTxId] = useState(null)
    const [lastPoxAction, setLastPoxAction] = useState(null) // 'delegate' | 'revoke'
    const [poxInfoModal, setPoxInfoModal] = useState(false)

    useEffect(() => {
        if (!address) return
        getStackingStatus(address).then(setPoxStatus).catch(() => setPoxStatus(null))
    }, [address])

    async function handleDelegate() {
        if (!address) { toast.error('Connect wallet first'); return }
        setPoxTxPending(true)
        try {
            const uStx = Math.round(parseFloat(delegateAmt) * 1_000_000)
            const data = await delegateToPoX(uStx)
            setPendingTxId(data.txId)
            setLastPoxAction('delegate')
            pollTx(data.txId, {
                setIsTxPending: setPoxTxPending,
                onConfirmed: (txId) => {
                    setPendingTxId(null)
                    setConfirmedTxId(txId)
                    getStackingStatus(address).then(setPoxStatus)
                },
                onFailed: (txId, reason) => {
                    setPendingTxId(null)
                    if (reason?.includes('u401')) {
                        setPoxTxPending(false)
                        setPoxInfoModal(true)
                    } else {
                        setFailedReason(reason)
                        setFailedTxId(txId)
                    }
                }
            })
        } catch (e) {
            if (e?.message !== 'User cancelled') toast.error('Delegation failed: ' + e.message)
        } finally {
            setPoxTxPending(false)
        }
    }

    async function handleRevoke() {
        if (!address) { toast.error('Connect wallet first'); return }
        setPoxTxPending(true)
        try {
            const data = await revokePoX()
            setPendingTxId(data.txId)
            setLastPoxAction('revoke')
            pollTx(data.txId, {
                setIsTxPending: setPoxTxPending,
                onConfirmed: (txId) => {
                    setPendingTxId(null)
                    setConfirmedTxId(txId)
                    getStackingStatus(address).then(setPoxStatus)
                },
                onFailed: (txId, reason) => {
                    setPendingTxId(null)
                    setFailedReason(reason)
                }
            })
        } catch (e) {
            if (e?.message !== 'User cancelled') toast.error('Revoke failed: ' + e.message)
        } finally {
            setPoxTxPending(false)
        }
    }
    const [blocksLeft, setBlocksLeft] = useState(1247)
    useEffect(() => {
        const t = setInterval(() => setBlocksLeft(b => (b > 1 ? b - 1 : CYCLE_TOTAL)), 10000)
        return () => clearInterval(t)
    }, [])

    const [activityEvents, setActivityEvents] = useState([])
    const [activityLoading, setActivityLoading] = useState(true)

    useEffect(() => {
        fetchActivityEvents().then(events => {
            setActivityEvents(events)
            setActivityLoading(false)
        })
        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                fetchActivityEvents().then(setActivityEvents)
            }
        }
        document.addEventListener('visibilitychange', onVisible)
        return () => document.removeEventListener('visibilitychange', onVisible)
    }, [])

    const pctDone = (CYCLE_TOTAL - blocksLeft) / CYCLE_TOTAL
    const dashOffset = CIRCUMFERENCE * (1 - pctDone)

    // Calculate dynamic Net Worth and Health Factor based on vault
    // Assuming mock oracle price: 1 sBTC = $61,400, 1 VUSD = $1
    const collateralValueUsd = vaultData.collateral * priceSbtc
    const debtValueUsd = vaultData.debt

    // Net worth = STX (mocked at $1.85) + Collateral - Debt
    const stxUsd = (stxBalance || 0) * 1.85
    const netWorthUsd = stxUsd + collateralValueUsd - debtValueUsd

    // Health Factor (Collateral Value / Debt Value)
    // If debt is 0, practically infinite. 
    let healthFactor = 3.0 // Default/Max for UI gauge
    if (debtValueUsd > 0) {
        healthFactor = collateralValueUsd / debtValueUsd
        if (healthFactor > 3.0) healthFactor = 3.0 // Cap at 3 for the dial visually
    } else if (collateralValueUsd === 0) {
        healthFactor = 1.0 // Empty vault
    }

    // Needle mapping for SVG: 1.0 - 3.0 scale -> angle mapping
    const hfPct = Math.max(0, Math.min(1, (healthFactor - 1.0) / 2.0))
    const needleAngle = -90 + (hfPct * 180)
    return (
        <>
            <div className="p-8">
                <TxSuccessModal 
                    isOpen={!!confirmedTxId}
                    onClose={() => setConfirmedTxId(null)}
                    txId={confirmedTxId}
                    title={lastPoxAction === 'delegate' ? "Delegation Confirmed!" : "Revocation Confirmed!"}
                    subtitle={lastPoxAction === 'delegate' ? "Your STX has been delegated to the PoX pool." : "Delegation has been revoked successfully."}
                    details={lastPoxAction === 'delegate' ? [
                        { label: 'Delegated Amount', value: `${delegateAmt} STX` }
                    ] : []}
                />

                <TxFailedModal 
                    isOpen={!!failedReason}
                    onClose={() => { setFailedReason(null); setFailedTxId(null) }}
                    error={failedReason}
                    txId={failedTxId}
                />

                <TxPendingModal isOpen={!!pendingTxId} txId={pendingTxId} />

                {poxInfoModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md p-8 flex flex-col items-center gap-5 text-center">
                            <div className="w-20 h-20 rounded-full bg-blue-500/10 border-2 border-blue-500 flex items-center justify-center">
                                <span className="material-symbols-outlined text-blue-500 text-4xl">info</span>
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">
                                    PoX Delegation
                                </h2>
                                <p className="text-zinc-500 text-sm mt-2 leading-relaxed">
                                    PoX delegation requires a registered pool operator. 
                                    On mainnet, this would delegate your STX to a live 
                                    stacking pool earning BTC rewards every cycle.
                                </p>
                            </div>
                            <div className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-4 space-y-2 text-left">
                                <div className="flex justify-between text-sm">
                                    <span className="text-zinc-500">Current Cycle</span>
                                    <span className="font-bold text-zinc-900 dark:text-zinc-100">#89</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-zinc-500">PoX APY</span>
                                    <span className="font-bold text-emerald-500">8.42%</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-zinc-500">Your stacking history</span>
                                    <span className="font-bold text-primary">Tracked on-chain ✓</span>
                                </div>
                            </div>
                            <button
                                onClick={() => setPoxInfoModal(false)}
                                className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-black rounded-xl transition-all shadow-lg shadow-primary/20">
                                Got it
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Protocol Stats Strip ─────────────────────────────── */}
                <div className="mb-8 card overflow-hidden border-l-4 border-l-primary">
                    <div className="grid grid-cols-2 md:grid-cols-5 divide-y md:divide-y-0 divide-x-0 md:divide-x divide-zinc-100 dark:divide-zinc-800">

                        {/* TVL */}
                        <div className="px-6 py-4 flex flex-col gap-1">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Total Value Locked</p>
                            <p className="text-2xl font-black mono text-zinc-900 dark:text-zinc-100">$12.4M</p>
                            <p className="flex items-center gap-1 text-xs text-emerald-500 font-bold">
                                <span className="material-symbols-outlined text-[14px]">trending_up</span>+8.3%
                                <span className="text-zinc-400 font-normal">7d</span>
                            </p>
                        </div>

                        {/* Total Borrowed */}
                        <div className="px-6 py-4 flex flex-col gap-1">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Total Borrowed</p>
                            <p className="text-2xl font-black mono text-zinc-900 dark:text-zinc-100">$4.1M</p>
                            <p className="flex items-center gap-1 text-xs text-emerald-500 font-bold">
                                <span className="material-symbols-outlined text-[14px]">trending_up</span>+12.1%
                                <span className="text-zinc-400 font-normal">7d</span>
                            </p>
                        </div>

                        {/* Borrowers */}
                        <div className="px-6 py-4 flex flex-col gap-1">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Active Borrowers</p>
                            <p className="text-2xl font-black mono text-zinc-900 dark:text-zinc-100">847</p>
                            <p className="flex items-center gap-1 text-xs text-emerald-500 font-bold">
                                <span className="material-symbols-outlined text-[14px]">trending_up</span>+34
                                <span className="text-zinc-400 font-normal">this week</span>
                            </p>
                        </div>

                        {/* Best APY */}
                        <div className="px-6 py-4 flex flex-col gap-1">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Best APY</p>
                            <p className="text-2xl font-black mono text-primary">14.2%</p>
                            <p className="text-xs text-zinc-400">sBTC P2P Matched</p>
                        </div>

                        {/* PoX Cycle */}
                        <div className="px-6 py-4 flex flex-col gap-1 bg-primary/5 dark:bg-primary/10">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-primary/70">PoX Cycle</p>
                            <p className="text-2xl font-black mono text-zinc-900 dark:text-zinc-100">#{CYCLE_NUM}</p>
                            <div className="flex items-center gap-1.5">
                                <span className="relative flex h-1.5 w-1.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary"></span>
                                </span>
                                <p className="text-xs text-zinc-500 mono">{blocksLeft.toLocaleString()} blocks left</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── PoX Delegation Panel ─────────────────────────────── */}
                <div className="mb-8 card p-5 flex flex-col md:flex-row items-start md:items-center gap-5 border border-primary/10 bg-primary/5 dark:bg-primary/10">
                    {/* Left: icon + title */}
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="size-11 rounded-xl bg-primary/20 flex items-center justify-center">
                            <span className="material-symbols-outlined text-primary text-2xl">stacks</span>
                        </div>
                        <div>
                            <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">PoX Stacking</p>
                            {poxStatus ? (
                                <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-500">
                                    <span className="relative flex h-1.5 w-1.5 mr-0.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                    </span>
                                    Active
                                </span>
                            ) : (
                                <span className="text-[11px] text-zinc-400">Not Delegating</span>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 w-full">
                        {poxStatus ? (
                            /* Active delegation display */
                            <div className="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-zinc-400 mb-0.5">Pool</p>
                                    <p className="font-mono text-xs text-zinc-600 dark:text-zinc-400 truncate">
                                        {poxStatus.pool ? `${poxStatus.pool.slice(0, 10)}...` : '--'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-zinc-400 mb-0.5">Delegated</p>
                                    <p className="font-bold text-zinc-900 dark:text-zinc-100">
                                        {(poxStatus.amount / 1_000_000).toLocaleString()} STX
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-zinc-400 mb-0.5">Since Block</p>
                                    <p className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
                                        #{poxStatus.delegatedAt ? poxStatus.delegatedAt.toLocaleString() : '--'}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            /* Delegate input form */
                            <div className="flex flex-col sm:flex-row gap-3">
                                <div className="flex-1">
                                    <label className="text-[10px] font-bold uppercase text-zinc-400 mb-1 block">Amount (STX)</label>
                                    <input
                                        type="number" min="1" value={delegateAmt}
                                        onChange={(e) => setDelegateAmt(e.target.value)}
                                        className="w-full border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-primary/40"
                                        placeholder="1000"
                                    />
                                </div>
                                <div className="flex items-end">
                                    <button
                                        onClick={handleDelegate}
                                        disabled={poxTxPending || !address}
                                        className="px-5 py-2.5 bg-primary text-white font-bold rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-2"
                                    >
                                        {poxTxPending ? (
                                            <><span className="animate-spin inline-block size-3.5 border-2 border-white/30 border-t-white rounded-full" /><span>Pending...</span></>
                                        ) : (
                                            <><span className="material-symbols-outlined text-[16px]">bolt</span><span>Delegate STX</span></>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Revoke button — only shown when active */}
                    {poxStatus && (
                        <button
                            onClick={handleRevoke}
                            disabled={poxTxPending}
                            className="shrink-0 px-4 py-2.5 border border-red-200 dark:border-red-800 text-red-500 font-bold rounded-xl text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
                        >
                            {poxTxPending ? 'Pending...' : 'Revoke'}
                        </button>
                    )}
                </div>

                <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

                    {/* ── Net Worth — white in light / dark brown in dark ── */}
                    <div className="premium-card portfolio-card lg:col-span-2 rounded-2xl relative overflow-hidden min-h-[250px] flex flex-col">

                        {/* Subtle grid lines — adapts per mode */}
                        <div className="absolute inset-0 opacity-[0.035] dark:opacity-[0.04] pointer-events-none"
                            style={{ backgroundImage: 'linear-gradient(rgba(0,0,0,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.5) 1px,transparent 1px)', backgroundSize: '48px 48px' }}
                            aria-hidden="true" />

                        {/* Orange glow blob — subtle in light, vivid in dark */}
                        <div className="absolute -top-20 -right-20 w-72 h-72 bg-primary/10 dark:bg-primary/25 rounded-full blur-3xl pointer-events-none" />

                        <div className="relative p-4 flex flex-col flex-1">
                            {/* Header row */}
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-400 dark:text-primary/50 mb-1">Net Worth Portfolio</p>
                                    <div className="flex items-baseline gap-2">
                                        <div className="text-4xl mono font-black text-zinc-900 dark:text-white tracking-tight flex items-baseline">
                                            {stxBalance !== null ? (
                                                <>
                                                    <span>{Math.floor(stxBalance).toLocaleString()}</span>
                                                    <span className="text-[0.65em] opacity-40 ml-0.5">
                                                        .{stxBalance.toString().split('.')[1]?.slice(0, 5) || '00'}
                                                    </span>
                                                </>
                                            ) : '0.00'}
                                        </div>
                                        <span className="text-stacks font-black text-lg ml-1">STX</span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-2">
                                        <span className="text-zinc-400 mono text-sm">
                                            ≈ ${netWorthUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                        <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 text-xs font-bold bg-emerald-50 dark:bg-emerald-400/10 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-400/20">
                                            <span className="material-symbols-outlined text-[13px]">trending_up</span>+4.2%
                                        </span>
                                    </div>
                                </div>
                                <div className="flex p-1 bg-zinc-100 dark:bg-white/5 rounded-xl border border-zinc-200 dark:border-white/10 shrink-0">
                                    {['1D', '30D', 'ALL'].map((t) => (
                                        <button key={t}
                                            className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all ${t === '30D' ? 'bg-primary text-black' : 'text-zinc-400 dark:text-white/30 hover:text-zinc-700 dark:hover:text-white/70'}`}>
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Chart */}
                            <div className="mt-auto h-16 w-full">
                                <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 80">
                                    <defs>
                                        <linearGradient id="darkChartFill" x1="0" x2="0" y1="0" y2="1">
                                            <stop offset="0%" stopColor="#F7931A" stopOpacity="0.4" />
                                            <stop offset="100%" stopColor="#F7931A" stopOpacity="0.02" />
                                        </linearGradient>
                                    </defs>
                                    {/* Subtle horizontal grid lines */}
                                    {[20, 40, 60].map(y => (
                                        <line key={y} x1="0" y1={y} x2="400" y2={y}
                                            stroke="currentColor" strokeWidth="1"
                                            className="text-zinc-200 dark:text-white/4" />
                                    ))}
                                    {/* Area */}
                                    <path d="M0,65 C40,60 60,70 90,55 S140,38 170,44 S220,28 260,34 S320,16 355,20 S385,6 400,3 V80 H0 Z"
                                        fill="url(#darkChartFill)" />
                                    {/* Line with neon glow */}
                                    <path d="M0,65 C40,60 60,70 90,55 S140,38 170,44 S220,28 260,34 S320,16 355,20 S385,6 400,3"
                                        fill="none" stroke="#F7931A" strokeWidth="2.5" strokeLinecap="round"
                                        style={{ filter: 'drop-shadow(0 0 6px rgba(247, 147, 26, 0.4))' }} />
                                    {/* Drop line */}
                                    <line x1="400" y1="3" x2="400" y2="80" stroke="rgba(247,147,26,0.18)" strokeWidth="1" strokeDasharray="3,3" />
                                    {/* Glowing dot — fill adapts to card bg */}
                                    <circle cx="400" cy="3" r="5" className="fill-white dark:fill-[#180f05]" stroke="#F7931A" strokeWidth="2.5" />
                                    <circle cx="400" cy="3" r="2" fill="#F7931A" />
                                </svg>
                            </div>

                            {/* Bottom stats */}
                            <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-white/10 grid grid-cols-3 gap-1">
                                <div>
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <span className="material-symbols-outlined text-[12px] text-zinc-400">inventory_2</span>
                                        <p className="text-[9px] uppercase tracking-widest text-zinc-400 dark:text-white/40 font-bold">Supplied</p>
                                    </div>
                                    <p className="text-sm font-black mono text-zinc-900 dark:text-white">
                                        {vaultData.isLoading ? '...' : vaultData.collateral.toFixed(4)} <span className="text-[10px] opacity-60">sBTC</span>
                                    </p>
                                    <p className="text-[10px] text-zinc-400 dark:text-white/40 mono mt-0.5">
                                        {vaultData.isLoading ? '...' : `$${collateralValueUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                                    </p>
                                </div>
                                <div>
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <span className="material-symbols-outlined text-[12px] text-zinc-400">payments</span>
                                        <p className="text-[9px] uppercase tracking-widest text-zinc-400 dark:text-white/40 font-bold">Borrowed</p>
                                    </div>
                                    <p className="text-sm font-black mono text-zinc-900 dark:text-white">
                                        {vaultData.isLoading ? '...' : vaultData.debt.toLocaleString(undefined, { minimumFractionDigits: 2 })} <span className="text-[10px] opacity-60">VUSD</span>
                                    </p>
                                    <p className="text-[10px] text-zinc-400 dark:text-white/40 mono mt-0.5">
                                        {vaultData.isLoading ? '...' : `$${debtValueUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                                    </p>
                                </div>
                                <div>
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <span className="material-symbols-outlined text-[12px] text-zinc-400">trending_up</span>
                                        <p className="text-[9px] uppercase tracking-widest text-zinc-400 dark:text-white/40 font-bold">Net APY</p>
                                    </div>
                                    <p className="text-sm font-black mono text-emerald-600 dark:text-emerald-400">
                                        {vaultData.exists ? '+13.7%' : '0.0%'}
                                    </p>
                                    <p className="text-[10px] text-zinc-400 dark:text-white/40 mt-0.5">
                                        {vaultData.exists ? 'weighted avg' : '-'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── Health Factor — SVG arc gauge ── */}
                    <div className="bg-[#fdf8f2] dark:bg-zinc-900/95 border border-orange-100/60 dark:border-zinc-800 p-4 rounded-2xl flex flex-col min-h-[250px] shadow-sm">
                        <div className="flex justify-between items-start mb-1">
                            <div>
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">Health Factor</p>
                                <p className="text-[9px] text-zinc-600 dark:text-zinc-500 font-medium mt-0.5">Position safety score</p>
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-wider">Safe</span>
                            </div>
                        </div>

                        {/* Half-arc gauge or no-debt state */}
                        <div className="flex-1 flex items-center justify-center">
                            {(!vaultData.exists || vaultData.debt === 0) ? (
                                // No-debt empty state
                                <div className="flex flex-col items-center gap-3 py-6 text-center">
                                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-emerald-500 text-3xl">shield</span>
                                    </div>
                                    <div>
                                        <p className="text-lg font-black text-emerald-500">No Active Debt</p>
                                        <p className="text-[11px] text-zinc-400 mt-1 max-w-[160px]">Your position is fully safe. Borrow VUSD to activate your health score.</p>
                                    </div>
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                                        <span className="text-[11px] font-black text-emerald-500 mono">∞ Health Factor</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="relative w-full max-w-[140px]">
                                    <svg viewBox="0 0 200 115" className="w-full overflow-visible">
                                        <defs>
                                            <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                                <stop offset="0%" stopColor="#ef4444" />
                                                <stop offset="28%" stopColor="#f97316" />
                                                <stop offset="55%" stopColor="#eab308" />
                                                <stop offset="80%" stopColor="#10b981" />
                                                <stop offset="100%" stopColor="#10b981" />
                                            </linearGradient>
                                        </defs>
                                        {/* Track background */}
                                        <path d="M16 104 A 84 84 0 0 1 184 104" fill="none" stroke="currentColor"
                                            strokeWidth="13" strokeLinecap="round" className="text-zinc-100 dark:text-zinc-800" />
                                        {/* Gradient arc */}
                                        <path d="M16 104 A 84 84 0 0 1 184 104" fill="none" stroke="url(#gaugeGrad)"
                                            strokeWidth="13" strokeLinecap="round"
                                            strokeDasharray="264" strokeDashoffset="0" />
                                        {/* Glowing Floating Indicator — replaces the simple needle */}
                                        <g transform="translate(100,104)">
                                            <g transform={`rotate(${needleAngle})`}>
                                                {/* Outer glow bloom */}
                                                <circle r="12" fill="#F7931A" className="opacity-20 animate-pulse" />
                                                {/* Floating indicator ball */}
                                                <g className="animate-float">
                                                    <circle cy="-84" r="6" fill="white" stroke="#F7931A" strokeWidth="3" style={{ filter: 'drop-shadow(0 0 8px #F7931A)' }} />
                                                    <circle cy="-84" r="2" fill="#F7931A" />
                                                </g>
                                            </g>
                                            {/* Pivot point */}
                                            <circle r="8" fill="#F7931A" stroke="white" strokeWidth="2" />
                                        </g>
                                        {/* Zone markers — repositioned slightly for better fit */}
                                        <text x="16" y="118" fontSize="10" fill="#ef4444" fontWeight="black" fontFamily="monospace" textAnchor="middle">1.0</text>
                                        <text x="184" y="118" fontSize="10" fill="#10b981" fontWeight="black" fontFamily="monospace" textAnchor="middle">3.0</text>

                                        {/* Central value — score is already bold, Index label needs more punch */}
                                        <text x="100" y="86" textAnchor="middle" className="fill-zinc-900 dark:fill-zinc-100 font-black" style={{ fontSize: '30px', fontFamily: '"JetBrains Mono", monospace' }}>
                                            {vaultData.exists && vaultData.debt === 0 && vaultData.collateral > 0 ? '∞' : healthFactor.toFixed(2)}
                                        </text>
                                        <text x="100" y="98" textAnchor="middle" className="fill-zinc-500 dark:fill-zinc-400 uppercase font-black" style={{ fontSize: '7.5px', letterSpacing: '0.18em' }}>
                                            Health Index
                                        </text>
                                    </svg>
                                </div>
                            )}
                        </div>

                        {/* Risk zone bar */}
                        <div className="space-y-1.5 mt-2">
                            <div className="flex rounded-full overflow-hidden h-1.5">
                                <div className="w-[12%] bg-red-500" />
                                <div className="w-[12%] bg-orange-400" />
                                <div className="w-[18%] bg-yellow-400" />
                                <div className="flex-1 bg-emerald-500" />
                            </div>
                            <div className="flex justify-between text-[9px] font-mono">
                                <span className="text-red-500 font-bold">Danger</span>
                                <span className="text-yellow-500">Risk</span>
                                <span className="text-emerald-500 font-bold">Optimal ◀</span>
                            </div>
                        </div>

                        <div className="mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                            <span className="text-[9px] text-zinc-600 dark:text-zinc-400 font-bold uppercase tracking-wider">Buffer to liquidation</span>
                            <span className="text-[10px] font-black text-emerald-500 mono">
                                {vaultData.exists && vaultData.debt > 0 ? `${((healthFactor - 1.0) * 100).toFixed(1)}% safe` : '100% safe'}
                            </span>
                        </div>

                        <button
                            onClick={() => setIsLiquidationModalOpen(true)}
                            className="group relative mt-2 w-full py-2 overflow-hidden bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold text-[10px] uppercase tracking-[0.2em] rounded-xl border border-red-500/20 transition-all flex items-center justify-center gap-2">
                            <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
                            <span className="material-symbols-outlined text-[14px]">bolt</span>
                            Simulate Liquidation
                        </button>
                    </div>
                </section>

                {/* ── PoX Cycle Tracker ─────────────────────────────── */}
                <section className="mb-8">
                    <div className="card p-6">
                        <div className="flex flex-col lg:flex-row items-center gap-8">

                            {/* Ring */}
                            <div className="relative shrink-0 flex items-center justify-center">
                                <svg width="160" height="160" className="-rotate-90">
                                    {/* Background track */}
                                    <circle cx="80" cy="80" r="60" fill="none"
                                        stroke="currentColor"
                                        strokeWidth="10"
                                        className="text-zinc-100 dark:text-zinc-800" />
                                    {/* Progress arc */}
                                    <circle cx="80" cy="80" r="60" fill="none"
                                        stroke="#F7931A"
                                        strokeWidth="10"
                                        strokeLinecap="round"
                                        strokeDasharray={CIRCUMFERENCE}
                                        strokeDashoffset={dashOffset}
                                        style={{ transition: 'stroke-dashoffset 1s ease' }} />
                                </svg>
                                {/* Centre label */}
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Cycle</span>
                                    <span className="text-3xl font-black text-zinc-900 dark:text-zinc-100 mono">#{CYCLE_NUM}</span>
                                    <span className="text-[10px] text-zinc-400 mono">{Math.round(pctDone * 100)}% done</span>
                                </div>
                            </div>

                            {/* Stats grid */}
                            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-6 w-full">

                                {/* Blocks Remaining */}
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Blocks Left</p>
                                    <p className="text-2xl font-black mono text-zinc-900 dark:text-zinc-100">{blocksLeft.toLocaleString()}</p>
                                    <p className="text-[10px] text-zinc-500 mono">~{Math.round(blocksLeft * 10 / 60 / 24)} days</p>
                                </div>

                                {/* Current stacking APY */}
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">PoX APY</p>
                                    <p className="text-2xl font-black mono text-primary">{CYCLE_APY}%</p>
                                    <p className="text-[10px] text-zinc-500">Native BTC yield</p>
                                </div>

                                {/* Your stacking */}
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Your Stacking</p>
                                    <p className="text-2xl font-black mono text-zinc-900 dark:text-zinc-100">0.842</p>
                                    <p className="text-[10px] text-zinc-500">sBTC locked</p>
                                </div>

                                {/* Next payout */}
                                <div className="space-y-1">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Next Payout</p>
                                    <p className="text-2xl font-black mono text-emerald-500">+0.00071</p>
                                    <p className="text-[10px] text-zinc-500">BTC est.</p>
                                </div>
                            </div>

                            {/* Status badge */}
                            <div className="shrink-0 flex flex-col items-center gap-3">
                                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
                                    <span className="relative flex h-2.5 w-2.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60"></span>
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
                                    </span>
                                    <span className="text-sm font-black text-primary uppercase tracking-widest">Stacking</span>
                                </div>
                                <p className="text-[10px] text-zinc-500 text-center max-w-[100px] leading-relaxed">
                                    sBTC earning BTC via PoX
                                </p>
                                <button className="text-xs font-bold text-primary hover:opacity-80 transition-opacity flex items-center gap-1">
                                    View on Explorer
                                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Summary Cards ──────────────────────────────────── */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">

                    {/* Total Supplied */}
                    <div className="glass p-6 rounded-xl hover:shadow-lg dark:hover:border-zinc-700 transition-all cursor-pointer">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-zinc-400 dark:text-slate-500 text-xs font-bold uppercase tracking-widest mb-2">
                                    Total Supplied
                                </p>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl mono font-bold text-zinc-900 dark:text-slate-100">
                                        {vaultData.isLoading ? '...' : vaultData.collateral.toFixed(4)}
                                    </span>
                                    <span className="text-zinc-400 dark:text-slate-400 text-sm font-medium">sBTC</span>
                                </div>
                                <p className="text-zinc-400 dark:text-slate-600 mono text-sm mt-1">
                                    ≈ {vaultData.isLoading ? '...' : `$${collateralValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                </p>
                            </div>
                            <div className="bg-stacks/10 border border-stacks/20 px-3 py-1.5 rounded-lg flex flex-col items-end">
                                <span className="text-[10px] text-stacks font-bold uppercase">Net APY</span>
                                <span className="text-stacks mono font-bold">13.7%</span>
                            </div>
                        </div>
                        <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-4">
                            <div className="flex -space-x-2">
                                <div className="size-6 rounded-full bg-primary flex items-center justify-center border-2 border-white dark:border-zinc-900" title="sBTC">
                                    <span className="material-symbols-outlined text-[14px] text-black font-bold">currency_bitcoin</span>
                                </div>
                                <div className="size-6 rounded-full bg-stacks flex items-center justify-center border-2 border-white dark:border-zinc-900" title="STX">
                                    <span className="material-symbols-outlined text-[14px] text-white">token</span>
                                </div>
                            </div>
                            <p className="text-xs text-zinc-400 dark:text-slate-400">
                                <span className="text-stacks font-semibold">9.2% Base</span>
                                {' '}+{' '}
                                <span className="text-zinc-700 dark:text-slate-200">4.5% PoX Yield</span>
                            </p>
                        </div>
                    </div>

                    {/* Total Borrowed */}
                    <div className="glass p-6 rounded-xl hover:shadow-lg dark:hover:border-zinc-700 transition-all cursor-pointer">
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-zinc-400 dark:text-slate-500 text-xs font-bold uppercase tracking-widest mb-2">
                                    Total Borrowed
                                </p>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl mono font-bold text-zinc-900 dark:text-slate-100">
                                        {vaultData.isLoading ? '...' : vaultData.debt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                    <span className="text-zinc-400 dark:text-slate-400 text-sm font-medium">VUSD</span>
                                </div>
                                <p className="text-zinc-400 dark:text-slate-600 mono text-sm mt-1">
                                    ≈ {vaultData.isLoading ? '...' : `$${debtValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                </p>
                            </div>
                            <div className="bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg flex flex-col items-end">
                                <span className="text-[10px] text-red-400 font-bold uppercase">Borrow Rate</span>
                                <span className="text-red-400 mono font-bold">4.2%</span>
                            </div>
                        </div>
                        <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                            <div className="flex items-center gap-2 w-full max-w-[200px]">
                                <div className="flex-1 h-1 bg-zinc-200 dark:bg-zinc-800 rounded-full">
                                    <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, Math.max(0, (debtValueUsd / (collateralValueUsd * 0.66)) * 100))}%` }}></div>
                                </div>
                                <span className="text-[10px] text-zinc-400 dark:text-slate-500 uppercase font-bold whitespace-nowrap">
                                    Limit Used: {collateralValueUsd > 0 ? `${Math.round((debtValueUsd / (collateralValueUsd * 0.66)) * 100)}%` : '0%'}
                                </span>
                            </div>
                            <button className="text-xs font-bold text-primary hover:underline ml-4">Manage Loans</button>
                        </div>
                    </div>
                </section>

                {/* ── Activity Table ─────────────────────────────────── */}
                <section className="glass rounded-xl overflow-hidden">
                    <div className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                        <h3 className="font-bold text-lg text-zinc-900 dark:text-slate-100">Recent Activity</h3>
                        <button className="text-xs font-bold text-zinc-400 dark:text-slate-500 hover:text-zinc-700 dark:hover:text-slate-300 flex items-center gap-1 transition-colors">
                            VIEW HISTORY
                            <span className="material-symbols-outlined text-sm">open_in_new</span>
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="text-[10px] uppercase tracking-widest text-zinc-400 dark:text-slate-500 border-b border-zinc-100 dark:border-zinc-800/50">
                                    <th className="px-6 py-4 font-bold">Action</th>
                                    <th className="px-6 py-4 font-bold">Asset</th>
                                    <th className="px-6 py-4 font-bold">Amount</th>
                                    <th className="px-6 py-4 font-bold">TX Hash</th>
                                    <th className="px-6 py-4 font-bold">Time</th>
                                    <th className="px-6 py-4 font-bold">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50 text-sm">
                                {activityLoading ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center">
                                            <div className="flex items-center justify-center gap-2 text-zinc-400">
                                                <div className="size-4 border-2 border-zinc-300 border-t-primary rounded-full animate-spin" />
                                                Loading activity...
                                            </div>
                                        </td>
                                    </tr>
                                ) : activityEvents.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center text-zinc-400 text-sm">
                                            No activity yet. Supply sBTC to get started.
                                        </td>
                                    </tr>
                                ) : (
                                    activityEvents.map((raw, i) => {
                                        const ev = parseEvent(raw)
                                        return (
                                            <tr key={i} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`size-8 rounded-lg ${ev.iconBg} flex items-center justify-center`}>
                                                            <span className={`material-symbols-outlined ${ev.iconColor} text-lg`}>{ev.icon}</span>
                                                        </div>
                                                        <span className="font-semibold text-zinc-800 dark:text-slate-200 capitalize">
                                                            {ev.eventType}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="mono font-medium text-zinc-700 dark:text-slate-200">{ev.asset}</span>
                                                </td>
                                                <td className="px-6 py-4 mono text-zinc-800 dark:text-slate-200">{ev.displayAmount}</td>
                                                <td className="px-6 py-4 text-primary mono text-xs">
                                                    {ev.txId ? `${ev.txId.slice(0, 6)}...${ev.txId.slice(-4)}` : '--'}
                                                </td>
                                                <td className="px-6 py-4 text-zinc-400 dark:text-slate-500 text-xs">
                                                    Block #{ev.block}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 text-[10px] font-bold uppercase tracking-tighter">
                                                        Confirmed
                                                    </span>
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            {/* ── Floating Action Button ───────────────────────────── */}
            <div className="fixed bottom-8 right-8 flex flex-col gap-3">
                <button className="relative size-14 bg-primary text-black rounded-full shadow-[0_0_30px_rgba(247,147,26,0.3)] flex items-center justify-center hover:scale-105 transition-transform group">
                    <span className="material-symbols-outlined text-2xl font-bold">add</span>
                    <div className="absolute right-16 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-lg dark:shadow-none px-4 py-2 rounded-lg text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none text-zinc-800 dark:text-slate-100">
                        Quick Deposit sBTC
                    </div>
                </button>
            </div>

            {isLiquidationModalOpen && (
                <LiquidationModal 
                    vaultData={vaultData} 
                    onClose={() => setIsLiquidationModalOpen(false)}
                    onLiquidationConfirmed={() => {
                        // Refresh vault or stats if needed
                    }}
                    setPendingTxId={setPendingTxId}
                />
            )}
        </>
    )
}
