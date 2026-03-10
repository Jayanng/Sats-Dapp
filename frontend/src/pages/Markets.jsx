import { useState, useEffect, useCallback } from 'react'
import { openContractCall } from '@stacks/connect'
import {
    Cl,
    PostConditionMode,
    Pc
} from '@stacks/transactions'
import toast from 'react-hot-toast'
import { useWallet } from '../context/WalletContext'
import { fetchBtcPrice, FALLBACK_BTC_PRICE } from '../lib/stacks'

import { pollTx } from '../lib/pollTx.jsx'
import TxSuccessModal from '../components/TxSuccessModal'
import TxFailedModal from '../components/TxFailedModal'
import TxPendingModal from '../components/TxPendingModal'

const CONTRACT_ADDRESS = 'ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV'

// ── Borrow Modal ─────────────────────────────────────────────────
const TRUST_SCORE = 842
const STD_RATIO = 150   // %
const USER_RATIO = 85    // % (based on trust score)
const SAVINGS_PP = STD_RATIO - USER_RATIO

function BorrowModal({ asset, onClose, pendingTxId, setPendingTxId }) {
    const { address } = useWallet()
    const [amount, setAmount] = useState('0.5')
    const [duration, setDuration] = useState('30')
    const [isTxPending, setIsTxPending] = useState(false)
    const [confirmedTxId, setConfirmedTxId] = useState(null)
    const [failedReason, setFailedReason] = useState(null)
    const [liveBtcPrice, setLiveBtcPrice] = useState(FALLBACK_BTC_PRICE)
    useEffect(() => { fetchBtcPrice(address).then(setLiveBtcPrice).catch(() => { }) }, [address])
    if (!asset) return null

    const priceUSD = asset.sym === 'sBTC' ? liveBtcPrice : asset.sym === 'STX' ? 1.84 : 1.00
    const borrowUSD = parseFloat(amount || 0) * priceUSD
    const stdCollat = borrowUSD * (STD_RATIO / 100)
    const userCollat = borrowUSD * (USER_RATIO / 100)
    const savedUSD = stdCollat - userCollat
    const fmt = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

    const handleBorrow = async () => {
        if (!address) {
            toast.error('Please connect your Leather wallet first.')
            return
        }

        const amountVusd = Math.floor(borrowUSD * 1_000_000)
        const riskEngineAddress = CONTRACT_ADDRESS
        const riskEngineContract = 'mock-reputation-engine-demo'
        const oracleAddress = CONTRACT_ADDRESS
        const oracleContract = 'mock-oracle-demo'

        const functionArgs = [
            Cl.uint(amountVusd),
            Cl.contractPrincipal(CONTRACT_ADDRESS, 'mock-sbtc-demo'),
            Cl.contractPrincipal(riskEngineAddress, riskEngineContract),
            Cl.contractPrincipal(oracleAddress, oracleContract)
        ]

        setIsTxPending(true)

        openContractCall({
            network: 'testnet',
            contractAddress: CONTRACT_ADDRESS,
            contractName: 'lending-protocol-v3',
            functionName: 'borrow',
            functionArgs,
            postConditionMode: PostConditionMode.Allow,
            postConditions: [],
            onFinish: (data) => {
                setPendingTxId(data.txId)
                pollTx(data.txId, { 
                    setIsTxPending,
                    onConfirmed: (txId) => {
                        setPendingTxId(null)
                        setConfirmedTxId(txId)
                    },
                    onFailed: (txId, reason) => {
                        setPendingTxId(null)
                        setFailedReason(reason)
                    }
                })
            },
            onCancel: () => {
                toast.error('Borrow transaction canceled.')
                setIsTxPending(false)
            }
        })
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={onClose}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Panel */}
            <div className="relative w-full max-w-md card p-0 overflow-hidden shadow-2xl max-h-[85vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}>

                {/* ── Modals ── */}
                <TxSuccessModal 
                    isOpen={!!confirmedTxId}
                    onClose={onClose}
                    txId={confirmedTxId}
                    title="Borrow Confirmed!"
                    subtitle="Your VUSD is now in your wallet."
                    details={[
                        { label: 'Amount Borrowed', value: `${amount} VUSD` },
                        { label: 'Collateral Type', value: asset.sym },
                        { label: 'Required Ratio', value: `${USER_RATIO}%` }
                    ]}
                />

                <TxFailedModal 
                    isOpen={!!failedReason}
                    onClose={() => setFailedReason(null)}
                    error={failedReason}
                />

                {/* Header */}
                <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 shrink-0 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center border ${asset.iconBg}`}>
                            <span className={`material-symbols-outlined text-[18px] ${asset.iconColor}`}>{asset.icon}</span>
                        </div>
                        <div>
                            <h3 className="font-bold text-zinc-900 dark:text-zinc-100">Borrow VUSD</h3>
                            <p className="text-[10px] text-zinc-500">{asset.sym} Collateral · Undercollateralized</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
                        <span className="material-symbols-outlined text-zinc-500 text-[20px]">close</span>
                    </button>
                </div>

                <div className="px-6 py-4 space-y-4 overflow-y-auto">

                    {/* ── Trust Score Highlight ── */}
                    <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Your Trust Score</span>
                            <span className="mono font-black text-primary text-lg">{TRUST_SCORE} <span className="text-xs font-normal text-zinc-400">/ 1000</span></span>
                        </div>

                        {/* Collateral comparison bar */}
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs text-zinc-500">
                                <span>Standard protocol</span>
                                <span className="line-through opacity-60 mono font-bold">{STD_RATIO}% collateral</span>
                            </div>
                            <div className="w-full h-3 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden flex">
                                <div className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                                    style={{ width: `${USER_RATIO / STD_RATIO * 100}%` }}>
                                </div>
                                <div className="h-full bg-zinc-300 dark:bg-zinc-600 flex-1" />
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-primary font-black mono">{USER_RATIO}% required</span>
                                <span className="text-emerald-500 font-bold">{SAVINGS_PP}pp freed</span>
                            </div>
                        </div>
                    </div>

                    {/* Amount input */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Borrow Amount</label>
                        <div className="flex items-center gap-2 card px-4 py-3 border-2 focus-within:border-primary/40 transition-colors">
                            <input
                                type="number" min="0" step="0.01" value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="flex-1 bg-transparent mono font-bold text-lg text-zinc-900 dark:text-zinc-100 focus:outline-none"
                            />
                            <span className="text-sm font-bold text-zinc-400">{asset.sym}</span>
                        </div>
                        {borrowUSD > 0 && (
                            <p className="text-xs text-zinc-400 mono">≈ {fmt(borrowUSD)}</p>
                        )}
                    </div>

                    {/* Duration */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Duration</label>
                        <div className="flex gap-2">
                            {['7', '14', '30', '60', '90'].map((d) => (
                                <button key={d}
                                    onClick={() => setDuration(d)}
                                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all border ${duration === d
                                        ? 'bg-primary text-white border-primary'
                                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-primary/40'
                                        }`}>
                                    {d}d
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Collateral summary */}
                    {borrowUSD > 0 && (
                        <div className="card p-4 space-y-2.5 bg-zinc-50 dark:bg-zinc-900/50">
                            <div className="flex justify-between text-sm">
                                <span className="text-zinc-500">Standard collateral needed</span>
                                <span className="mono font-bold line-through opacity-50 text-zinc-700 dark:text-zinc-300">{fmt(stdCollat)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-zinc-500">Your collateral needed</span>
                                <span className="mono font-black text-primary">{fmt(userCollat)}</span>
                            </div>
                            <div className="pt-2.5 border-t border-zinc-200 dark:border-zinc-800 flex justify-between text-sm">
                                <span className="font-bold text-zinc-700 dark:text-zinc-300">Capital freed</span>
                                <span className="mono font-black text-emerald-500">+{fmt(savedUSD)} unlocked</span>
                            </div>
                        </div>
                    )}

                    {/* CTA */}
                    <button
                        onClick={handleBorrow}
                        disabled={isTxPending || !address}
                        className="w-full py-4 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-xl transition-all shadow-lg shadow-primary/20 text-sm tracking-wide flex items-center justify-center gap-2">
                        {isTxPending ? (
                            <>
                                <span className="material-symbols-outlined animate-spin text-sm">refresh</span>
                                Broadcasting...
                            </>
                        ) : (
                            `Confirm Borrow · ${USER_RATIO}% Collateral`
                        )}
                    </button>
                    <p className="text-center text-[10px] text-zinc-400">Terms verified on-chain via Clarity contract · Trustless settlement</p>
                </div>
            </div>
        </div>
    )
}

// ── Supply Modal ─────────────────────────────────────────────────
function SupplyModal({ asset, onClose, pendingTxId, setPendingTxId }) {
    const { address, refreshBalance } = useWallet()
    const [amount, setAmount] = useState('1.0')
    const [strategy, setStrategy] = useState('p2p')  // 'flex' | 'p2p' | 'pox'
    const [isTxPending, setIsTxPending] = useState(false)
    const [confirmedTxId, setConfirmedTxId] = useState(null)
    const [failedReason, setFailedReason] = useState(null)
    const [liveBtcPrice, setLiveBtcPrice] = useState(FALLBACK_BTC_PRICE)
    useEffect(() => { fetchBtcPrice(address).then(setLiveBtcPrice).catch(() => { }) }, [address])
    if (!asset) return null

    const priceUSD = asset.sym === 'sBTC' ? liveBtcPrice : asset.sym === 'STX' ? 1.84 : 1.00
    const supplyUSD = parseFloat(amount || 0) * priceUSD
    const fmt = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

    const baseApy = parseFloat(asset.base)
    const poxApy = parseFloat(asset.pox.val)
    const p2pApy = parseFloat(asset.p2p.val)

    const strategies = [
        { id: 'flex', label: 'Flexible', desc: 'Withdraw any time', apy: baseApy, color: 'text-zinc-600 dark:text-zinc-300' },
        { id: 'pox', label: 'PoX Stack', desc: 'Earn native BTC yield', apy: baseApy + poxApy, color: 'text-indigo-500', badge: 'BTC' },
        { id: 'p2p', label: 'P2P Match', desc: 'Best rate, direct match', apy: p2pApy, color: 'text-primary', badge: 'MAX' },
    ]
    const active = strategies.find(s => s.id === strategy)
    const annualEarningsUSD = supplyUSD * (active.apy / 100)
    const annualEarningsAsset = supplyUSD > 0 ? (annualEarningsUSD / priceUSD).toFixed(6) : '0.000000'

    const handleSupply = async () => {
        if (!address) {
            toast.error('Please connect your Leather wallet first.')
            return
        }

        if (asset.sym !== 'sBTC') {
            toast.error('Currently, only sBTC is supported as collateral in this testnet release.')
            return
        }

        const amountSats = Math.floor(parseFloat(amount) * 100_000_000)
        const riskEngineAddress = CONTRACT_ADDRESS
        const riskEngineContract = 'mock-reputation-engine-demo'
        const sbtcAddress = CONTRACT_ADDRESS
        const sbtcContract = 'mock-sbtc-demo'

        const functionArgs = [
            Cl.uint(amountSats),
            Cl.contractPrincipal(sbtcAddress, sbtcContract),
            Cl.contractPrincipal(riskEngineAddress, riskEngineContract)
        ]

        const standardFungiblePostCondition = Pc.principal(address)
            .willSendEq(amountSats)
            .ft(`${CONTRACT_ADDRESS}.mock-sbtc-demo`, 'mock-sbtc');

        setIsTxPending(true)

        openContractCall({
            network: 'testnet',
            contractAddress: CONTRACT_ADDRESS,
            contractName: 'lending-protocol-v3',
            functionName: 'supply',
            functionArgs,
            postConditionMode: PostConditionMode.Allow,
            postConditions: [standardFungiblePostCondition],
            onFinish: (data) => {
                setPendingTxId(data.txId)
                pollTx(data.txId, {
                    setIsTxPending,
                    onConfirmed: (txId) => {
                        setPendingTxId(null)
                        setConfirmedTxId(txId)
                        refreshBalance()
                    },
                    onFailed: (txId, reason) => {
                        setPendingTxId(null)
                        setFailedReason(reason)
                    }
                })
            },
            onCancel: () => {
                toast.error('Supply transaction canceled.')
                setIsTxPending(false)
            }
        })
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative w-full max-w-md card p-0 overflow-hidden shadow-2xl max-h-[85vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}>

                {/* ── Modals ── */}
                <TxSuccessModal 
                    isOpen={!!confirmedTxId}
                    onClose={onClose}
                    txId={confirmedTxId}
                    title="Supply Confirmed!"
                    subtitle="Your assets are now earning yield on-chain."
                    details={[
                        { label: 'Amount Supplied', value: `${amount} ${asset.sym}` },
                        { label: 'Strategy', value: strategy === 'p2p' ? 'P2P Match' : strategy === 'pox' ? 'PoX Stack' : 'Flexible' },
                        { label: 'APY Earning', value: `${strategies.find(s => s.id === strategy)?.apy.toFixed(2)}%` }
                    ]}
                />

                <TxFailedModal 
                    isOpen={!!failedReason}
                    onClose={() => setFailedReason(null)}
                    error={failedReason}
                />

                {/* Header */}
                <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 shrink-0 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center border ${asset.iconBg}`}>
                            <span className={`material-symbols-outlined text-[18px] ${asset.iconColor}`}>{asset.icon}</span>
                        </div>
                        <div>
                            <h3 className="font-bold text-zinc-900 dark:text-zinc-100">Supply {asset.sym}</h3>
                            <p className="text-[10px] text-zinc-500">Choose a yield strategy</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
                        <span className="material-symbols-outlined text-zinc-500 text-[20px]">close</span>
                    </button>
                </div>

                <div className="px-6 py-4 space-y-4 overflow-y-auto">

                    {/* Strategy picker */}
                    <div className="space-y-1.5">
                        <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Yield Strategy</p>
                        <div className="grid grid-cols-3 gap-2">
                            {strategies.map((s) => (
                                <button key={s.id} onClick={() => setStrategy(s.id)}
                                    className={`p-3 rounded-xl border-2 text-left transition-all ${strategy === s.id
                                        ? 'border-primary bg-primary/5'
                                        : 'border-zinc-200 dark:border-zinc-700 hover:border-primary/40'
                                        }`}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] font-bold text-zinc-500 uppercase">{s.label}</span>
                                        {s.badge && (
                                            <span className="text-[9px] font-black bg-primary/10 text-primary px-1 rounded">{s.badge}</span>
                                        )}
                                    </div>
                                    <p className={`text-lg font-black mono ${s.color}`}>{s.apy.toFixed(2)}%</p>
                                    <p className="text-[10px] text-zinc-400 mt-0.5">{s.desc}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Amount */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Supply Amount</label>
                        <div className="flex items-center gap-2 card px-4 py-3 border-2 focus-within:border-primary/40 transition-colors">
                            <input
                                type="number" min="0" step="0.01" value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="flex-1 bg-transparent mono font-bold text-lg text-zinc-900 dark:text-zinc-100 focus:outline-none"
                            />
                            <span className="text-sm font-bold text-zinc-400">{asset.sym}</span>
                        </div>
                        {supplyUSD > 0 && <p className="text-xs text-zinc-400 mono">≈ {fmt(supplyUSD)}</p>}
                    </div>

                    {/* APY breakdown */}
                    <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-4 space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2">APY Breakdown</p>
                        <div className="flex justify-between text-sm">
                            <span className="text-zinc-500">Base lending rate</span>
                            <span className="mono font-bold text-zinc-900 dark:text-zinc-100">{baseApy.toFixed(2)}%</span>
                        </div>
                        {strategy === 'pox' && (
                            <div className="flex justify-between text-sm">
                                <span className="text-zinc-500">PoX stacking reward</span>
                                <span className="mono font-bold text-indigo-500">+{poxApy.toFixed(2)}%</span>
                            </div>
                        )}
                        {strategy === 'p2p' && (
                            <div className="flex justify-between text-sm">
                                <span className="text-zinc-500">P2P match premium</span>
                                <span className="mono font-bold text-primary">+{(p2pApy - baseApy).toFixed(2)}%</span>
                            </div>
                        )}
                        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700 flex justify-between">
                            <span className="font-bold text-zinc-700 dark:text-zinc-300">Total APY</span>
                            <span className={`mono font-black text-lg ${active.color}`}>{active.apy.toFixed(2)}%</span>
                        </div>
                    </div>

                    {/* Estimated earnings */}
                    {supplyUSD > 0 && (
                        <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-4 flex items-center gap-4">
                            <span className="material-symbols-outlined text-emerald-500 text-3xl">savings</span>
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Est. Annual Earnings</p>
                                <p className="text-xl font-black mono text-emerald-500">{annualEarningsAsset} {asset.sym}</p>
                                <p className="text-xs text-zinc-500">≈ {fmt(annualEarningsUSD)} / year at {active.apy.toFixed(2)}% APY</p>
                            </div>
                        </div>
                    )}

                    {/* CTA */}
                    <button
                        onClick={handleSupply}
                        disabled={isTxPending || !address}
                        className={`w-full py-4 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-xl transition-all shadow-lg shadow-primary/20 text-sm flex items-center justify-center gap-2`}>
                        {isTxPending ? (
                            <>
                                <span className="material-symbols-outlined animate-spin text-sm">refresh</span>
                                Broadcasting...
                            </>
                        ) : (
                            `Confirm Supply · ${active.apy.toFixed(2)}% APY`
                        )}
                    </button>
                    <p className="text-center text-[10px] text-zinc-400">Deposits secured by Clarity smart contracts · Non-custodial</p>
                </div>
            </div>
        </div>
    )
}

// ── Withdraw Modal ─────────────────────────────────────────────────
function WithdrawModal({ asset, onClose, pendingTxId, setPendingTxId }) {
    const { address, refreshBalance } = useWallet()
    const [amount, setAmount] = useState('0.1')
    const [isTxPending, setIsTxPending] = useState(false)
    const [confirmedTxId, setConfirmedTxId] = useState(null)
    const [failedReason, setFailedReason] = useState(null)
    if (!asset) return null

    const handleWithdraw = async () => {
        if (!address) {
            toast.error('Please connect your Leather wallet first.')
            return
        }

        const amountSats = Math.floor(parseFloat(amount) * 100_000_000)
        const riskEngineAddress = CONTRACT_ADDRESS
        const riskEngineContract = 'mock-reputation-engine-demo'
        const sbtcAddress = CONTRACT_ADDRESS
        const sbtcContract = 'mock-sbtc-demo'
        const oracleAddress = CONTRACT_ADDRESS
        const oracleContract = 'mock-oracle-demo'

        const functionArgs = [
            Cl.uint(amountSats),
            Cl.contractPrincipal(sbtcAddress, sbtcContract),
            Cl.contractPrincipal(riskEngineAddress, riskEngineContract),
            Cl.contractPrincipal(oracleAddress, oracleContract)
        ]

        const contractFungiblePostCondition = Pc.principal(`${CONTRACT_ADDRESS}.lending-protocol-v3`)
            .willSendEq(amountSats)
            .ft(`${CONTRACT_ADDRESS}.mock-sbtc-demo`, 'mock-sbtc');

        setIsTxPending(true)

        openContractCall({
            network: 'testnet',
            contractAddress: CONTRACT_ADDRESS,
            contractName: 'lending-protocol-v3',
            functionName: 'withdraw',
            functionArgs,
            postConditionMode: PostConditionMode.Deny,
            postConditions: [contractFungiblePostCondition],
            onFinish: (data) => {
                setPendingTxId(data.txId)
                pollTx(data.txId, { 
                    setIsTxPending,
                    onConfirmed: (txId) => {
                        setPendingTxId(null)
                        setConfirmedTxId(txId)
                        refreshBalance()
                    },
                    onFailed: (txId, reason) => {
                        setPendingTxId(null)
                        setFailedReason(reason)
                    }
                })
            },
            onCancel: () => {
                toast.error('Withdraw transaction canceled.')
                setIsTxPending(false)
            }
        })
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative w-full max-w-md card p-0 overflow-hidden shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}>

                {/* ── Modals ── */}
                <TxSuccessModal 
                    isOpen={!!confirmedTxId}
                    onClose={onClose}
                    txId={confirmedTxId}
                    title="Withdrawal Confirmed!"
                    subtitle="Your assets have been returned to your wallet."
                    details={[
                        { label: 'Amount Withdrawn', value: `${amount} ${asset.sym}` }
                    ]}
                />

                <TxFailedModal 
                    isOpen={!!failedReason}
                    onClose={() => setFailedReason(null)}
                    error={failedReason}
                />

                <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 shrink-0 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center border ${asset.iconBg}`}>
                            <span className={`material-symbols-outlined text-[18px] ${asset.iconColor}`}>{asset.icon}</span>
                        </div>
                        <div>
                            <h3 className="font-bold text-zinc-900 dark:text-zinc-100">Withdraw {asset.sym}</h3>
                            <p className="text-[10px] text-zinc-500">Remove collateral from your vault</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
                        <span className="material-symbols-outlined text-zinc-500 text-[20px]">close</span>
                    </button>
                </div>

                <div className="px-6 py-5 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Amount to Withdraw</label>
                        <div className="flex items-center gap-2 card px-4 py-3 border-2 focus-within:border-primary/40 transition-colors">
                            <input
                                type="number" min="0" step="0.01" value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="flex-1 bg-transparent mono font-bold text-lg text-zinc-900 dark:text-zinc-100 focus:outline-none"
                            />
                            <span className="text-sm font-bold text-zinc-400">{asset.sym}</span>
                        </div>
                    </div>

                    <button
                        onClick={handleWithdraw}
                        disabled={isTxPending || !address}
                        className="w-full py-4 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-xl transition-all shadow-lg shadow-primary/20 text-sm flex items-center justify-center gap-2">
                        {isTxPending ? (
                            <>
                                <span className="material-symbols-outlined animate-spin text-sm">refresh</span>
                                Broadcasting...
                            </>
                        ) : 'Confirm Withdraw'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Repay Modal ─────────────────────────────────────────────────
function RepayModal({ asset, onClose, pendingTxId, setPendingTxId }) {
    const { address, refreshBalance } = useWallet()
    const [amount, setAmount] = useState('100')
    const [isTxPending, setIsTxPending] = useState(false)
    const [confirmedTxId, setConfirmedTxId] = useState(null)
    const [failedReason, setFailedReason] = useState(null)
    if (!asset) return null

    const handleRepay = async () => {
        if (!address) {
            toast.error('Please connect your Leather wallet first.')
            return
        }

        const amountVusd = Math.floor(parseFloat(amount) * 1_000_000)
        const riskEngineAddress = CONTRACT_ADDRESS
        const functionArgs = [
            Cl.uint(amountVusd)
        ]

        const repayPostCondition = Pc.principal(address)
            .willSendEq(amountVusd)
            .ft(`${CONTRACT_ADDRESS}.vault-usd-final`, 'vault-usd');

        setIsTxPending(true)

        openContractCall({
            network: 'testnet',
            contractAddress: CONTRACT_ADDRESS,
            contractName: 'lending-protocol-v3',
            functionName: 'repay',
            functionArgs,
            postConditionMode: PostConditionMode.Deny,
            postConditions: [repayPostCondition],
            onFinish: (data) => {
                setPendingTxId(data.txId)
                pollTx(data.txId, { 
                    setIsTxPending,
                    onConfirmed: (txId) => {
                        setPendingTxId(null)
                        setConfirmedTxId(txId)
                        refreshBalance()
                    },
                    onFailed: (txId, reason) => {
                        setPendingTxId(null)
                        setFailedReason(reason)
                    }
                })
            },
            onCancel: () => {
                toast.error('Repay transaction canceled.')
                setIsTxPending(false)
            }
        })
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative w-full max-w-md card p-0 overflow-hidden shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}>

                {/* ── Modals ── */}
                <TxSuccessModal 
                    isOpen={!!confirmedTxId}
                    onClose={onClose}
                    txId={confirmedTxId}
                    title="Repay Confirmed!"
                    subtitle="Your debt has been reduced and Health Factor increased."
                    details={[
                        { label: 'Amount Repaid', value: `${amount} VUSD` }
                    ]}
                />

                <TxFailedModal 
                    isOpen={!!failedReason}
                    onClose={() => setFailedReason(null)}
                    error={failedReason}
                />

                <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 shrink-0 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center border ${asset.iconBg}`}>
                            <span className={`material-symbols-outlined text-[18px] ${asset.iconColor}`}>{asset.icon}</span>
                        </div>
                        <div>
                            <h3 className="font-bold text-zinc-900 dark:text-zinc-100">Repay Debt</h3>
                            <p className="text-[10px] text-zinc-500">Burn VUSD to reduce your loan</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
                        <span className="material-symbols-outlined text-zinc-500 text-[20px]">close</span>
                    </button>
                </div>

                <div className="px-6 py-5 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Amount of VUSD to Repay</label>
                        <div className="flex items-center gap-2 card px-4 py-3 border-2 focus-within:border-primary/40 transition-colors">
                            <input
                                type="number" min="0" step="1" value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="flex-1 bg-transparent mono font-bold text-lg text-zinc-900 dark:text-zinc-100 focus:outline-none"
                            />
                            <span className="text-sm font-bold text-zinc-400">VUSD</span>
                        </div>
                    </div>

                    <button
                        onClick={handleRepay}
                        disabled={isTxPending || !address}
                        className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-xl transition-all shadow-lg shadow-emerald-500/20 text-sm flex items-center justify-center gap-2">
                        {isTxPending ? (
                            <>
                                <span className="material-symbols-outlined animate-spin text-sm">refresh</span>
                                Broadcasting...
                            </>
                        ) : 'Confirm Repay'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Redeem Modal (V2 Action) ─────────────────────────────────────────────────
function RedeemModal({ asset, onClose, pendingTxId, setPendingTxId }) {
    const { address, refreshBalance } = useWallet()
    const [amount, setAmount] = useState('50')
    const [isTxPending, setIsTxPending] = useState(false)
    const [confirmedTxId, setConfirmedTxId] = useState(null)
    const [failedReason, setFailedReason] = useState(null)
    if (!asset) return null

    const handleRedeem = async () => {
        if (!address) {
            toast.error('Please connect your Leather wallet first.')
            return
        }

        const amountVusd = Math.floor(parseFloat(amount) * 1_000_000)
        if (!amountVusd || amountVusd <= 0) {
            toast.error('Please enter a valid VUSD amount to redeem.')
            return
        }

        const sbtcAddress = CONTRACT_ADDRESS
        const sbtcContract = 'mock-sbtc-demo'
        const riskEngineAddress = CONTRACT_ADDRESS
        const riskEngineContract = 'mock-reputation-engine-demo'
        const oracleAddress = CONTRACT_ADDRESS
        const oracleContract = 'mock-oracle-demo'

        const functionArgs = [
            Cl.uint(amountVusd),
            Cl.contractPrincipal(sbtcAddress, sbtcContract),
            Cl.contractPrincipal(riskEngineAddress, riskEngineContract),
            Cl.contractPrincipal(oracleAddress, oracleContract)
        ]

        setIsTxPending(true)

        openContractCall({
            network: 'testnet',
            contractAddress: CONTRACT_ADDRESS,
            contractName: 'lending-protocol-v3',
            functionName: 'redeem',
            functionArgs,
            postConditionMode: PostConditionMode.Allow, 
            postConditions: [],
            onFinish: (data) => {
                setPendingTxId(data.txId)
                pollTx(data.txId, {
                    setIsTxPending,
                    onConfirmed: (txId) => {
                        setPendingTxId(null)
                        setConfirmedTxId(txId)
                        refreshBalance()
                    },
                    onFailed: (txId, reason) => {
                        setPendingTxId(null)
                        setFailedReason(reason)
                    }
                })
            },
            onCancel: () => {
                toast.error('Redeem transaction canceled.')
                setIsTxPending(false)
            }
        })
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative w-full max-w-md card p-0 overflow-hidden shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}>

                {/* ── Modals ── */}
                <TxSuccessModal 
                    isOpen={!!confirmedTxId}
                    onClose={onClose}
                    txId={confirmedTxId}
                    title="Redeem Confirmed!"
                    subtitle="Debt burned and collateral returned to your wallet."
                    details={[
                        { label: 'Amount Redeemed', value: `${amount} VUSD` }
                    ]}
                />

                <TxFailedModal 
                    isOpen={!!failedReason}
                    onClose={() => setFailedReason(null)}
                    error={failedReason}
                />

                <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 shrink-0 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center border ${asset.iconBg}`}>
                            <span className={`material-symbols-outlined text-[18px] ${asset.iconColor}`}>{asset.icon}</span>
                        </div>
                        <div>
                            <h3 className="font-bold text-zinc-900 dark:text-zinc-100">Redeem Asset</h3>
                            <p className="text-[10px] text-zinc-500">Fast-burn VUSD to unlock related collateral.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">
                        <span className="material-symbols-outlined text-zinc-500 text-[20px]">close</span>
                    </button>
                </div>

                <div className="px-6 py-5 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Amount of VUSD Debt to auto-settle</label>
                        <div className="flex items-center gap-2 card px-4 py-3 border-2 focus-within:border-primary/40 transition-colors">
                            <input
                                type="number" min="0" step="1" value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="flex-1 bg-transparent mono font-bold text-lg text-zinc-900 dark:text-zinc-100 focus:outline-none"
                            />
                            <span className="text-sm font-bold text-zinc-400">VUSD</span>
                        </div>
                    </div>

                    <button
                        onClick={handleRedeem}
                        disabled={isTxPending || !address}
                        className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-xl transition-all shadow-lg shadow-emerald-500/20 text-sm flex items-center justify-center gap-2">
                        {isTxPending ? (
                            <>
                                <span className="material-symbols-outlined animate-spin text-sm">refresh</span>
                                Broadcasting...
                            </>
                        ) : 'Confirm Auto-Redeem'}
                    </button>
                    <p className="text-[10px] text-center text-zinc-400 px-4">This uniquely executes VUSD burning and collateral release in the same on-chain state transition.</p>
                </div>
            </div>
        </div>
    )
}

// ── Mock P2P order book data ────────────────────────────────────
const BORROW_REQUESTS = [
    { id: 'B1', wallet: 'SP3R…4G7W', asset: 'sBTC', amount: '0.500', rate: '6.20', duration: '30d', score: 842, status: 'matching' },
    { id: 'B2', wallet: 'SP1K…9ZXA', asset: 'sBTC', amount: '1.200', rate: '7.10', duration: '14d', score: 710, status: 'open' },
    { id: 'B3', wallet: 'SP2M…3BFW', asset: 'STX', amount: '5,000', rate: '9.80', duration: '60d', score: 590, status: 'open' },
    { id: 'B4', wallet: 'SP4T…7YQR', asset: 'sBTC', amount: '0.250', rate: '5.90', duration: '7d', score: 920, status: 'open' },
]
const LEND_OFFERS = [
    { id: 'L1', wallet: 'SP7W…2LKQ', asset: 'sBTC', amount: '0.500', rate: '5.90', duration: '30d', status: 'matching' },
    { id: 'L2', wallet: 'SP9P…8GHX', asset: 'sBTC', amount: '2.000', rate: '6.50', duration: '30d', status: 'open' },
    { id: 'L3', wallet: 'SP5N…1VDR', asset: 'STX', amount: '8,000', rate: '8.90', duration: '60d', status: 'open' },
    { id: 'L4', wallet: 'SP6C…4KMP', asset: 'sBTC', amount: '0.300', rate: '5.50', duration: '7d', status: 'open' },
]
const RECENT_MATCHES = [
    { id: 'M1', borrower: 'SP2A…6WQZ', lender: 'SP8F…3TPL', asset: 'sBTC', amount: '0.800', rate: '6.00', ago: '2m ago' },
    { id: 'M2', borrower: 'SP3K…9BNR', lender: 'SP1Q…7YVC', asset: 'STX', amount: '3,200', rate: '9.10', ago: '8m ago' },
    { id: 'M3', borrower: 'SP4Z…2MXF', lender: 'SP6D…5RHW', asset: 'sBTC', amount: '0.150', rate: '5.75', ago: '15m ago' },
]

function ScoreBadge({ score }) {
    const color = score >= 800 ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
        : score >= 600 ? 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20'
            : 'text-red-500 bg-red-500/10 border-red-500/20'
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border mono ${color}`}>
            ⬡ {score}
        </span>
    )
}

function MatchPulse() {
    return (
        <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
        </span>
    )
}

export default function Markets() {
    const [mode, setMode] = useState('supply')
    const [matchFlash, setMatchFlash] = useState(false)
    const [borrowAsset, setBorrowAsset] = useState(null)
    const [supplyAsset, setSupplyAsset] = useState(null)
    const [withdrawAsset, setWithdrawAsset] = useState(null)
    const [repayAsset, setRepayAsset] = useState(null)
    const [redeemAsset, setRedeemAsset] = useState(null)
    const [pendingTxId, setPendingTxId] = useState(null)

    // Simulate a new match every 8 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setMatchFlash(true)
            setTimeout(() => setMatchFlash(false), 1500)
        }, 8000)
        return () => clearInterval(interval)
    }, [])

    return (
        <div className="p-8 space-y-8">
            {/* ── Modals ── */}
            <BorrowModal asset={borrowAsset} onClose={() => setBorrowAsset(null)} pendingTxId={pendingTxId} setPendingTxId={setPendingTxId} />
            <SupplyModal asset={supplyAsset} onClose={() => setSupplyAsset(null)} pendingTxId={pendingTxId} setPendingTxId={setPendingTxId} />
            <WithdrawModal asset={withdrawAsset} onClose={() => setWithdrawAsset(null)} pendingTxId={pendingTxId} setPendingTxId={setPendingTxId} />
            <RepayModal asset={repayAsset} onClose={() => setRepayAsset(null)} pendingTxId={pendingTxId} setPendingTxId={setPendingTxId} />
            <RedeemModal asset={redeemAsset} onClose={() => setRedeemAsset(null)} pendingTxId={pendingTxId} setPendingTxId={setPendingTxId} />
            
            <TxPendingModal isOpen={!!pendingTxId} txId={pendingTxId} />

            {/* ── Summary Stats ──────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="card p-6">
                    <p className="text-xs text-zinc-500 uppercase font-semibold tracking-wider mb-2">Total Market Size</p>
                    <p className="text-3xl font-bold mono text-zinc-900 dark:text-zinc-100">$258,742,109</p>
                    <p className="text-emerald-500 text-sm mt-2 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[16px]">trending_up</span>+2.4%
                    </p>
                </div>
                <div className="card p-6">
                    <p className="text-xs text-zinc-500 uppercase font-semibold tracking-wider mb-2">Total Value Locked</p>
                    <p className="text-3xl font-bold mono text-zinc-900 dark:text-zinc-100">$182,410,000</p>
                    <p className="text-emerald-500 text-sm mt-2 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[16px]">trending_up</span>+1.1%
                    </p>
                </div>
                <div className="card p-6">
                    <p className="text-xs text-zinc-500 uppercase font-semibold tracking-wider mb-2">24h Volume</p>
                    <p className="text-3xl font-bold mono text-zinc-900 dark:text-zinc-100">$12,504,892</p>
                    <p className="text-red-500 text-sm mt-2 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[16px]">trending_down</span>-0.5%
                    </p>
                </div>
            </div>

            {/* ── Pool Table ──────────────────────────────────── */}
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
                        <button onClick={() => setMode('supply')} className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${mode === 'supply' ? 'bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>Supply</button>
                        <button onClick={() => setMode('borrow')} className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${mode === 'borrow' ? 'bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>Borrow</button>
                        <button onClick={() => setMode('withdraw')} className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${mode === 'withdraw' ? 'bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>Redeem</button>
                        <button onClick={() => setMode('repay')} className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${mode === 'repay' ? 'bg-white dark:bg-zinc-800 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>Repay</button>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500 uppercase font-semibold tracking-wider">Sort by:</span>
                        <select className="bg-transparent border-none text-sm font-medium focus:ring-0 cursor-pointer text-zinc-900 dark:text-zinc-200 focus:outline-none">
                            <option>Total Pool Size</option>
                            <option>APY (High to Low)</option>
                            <option>Asset Name</option>
                        </select>
                    </div>
                </div>

                <div className="card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
                                    <th className="px-6 py-4 text-xs text-zinc-500 uppercase font-bold whitespace-nowrap">Asset</th>
                                    <th className="px-6 py-4 text-xs text-zinc-500 uppercase font-bold whitespace-nowrap">Total Pool Size</th>
                                    <th className="px-6 py-4 text-xs text-zinc-500 uppercase font-bold whitespace-nowrap"><div className="flex items-center gap-1">Base APY<span className="material-symbols-outlined text-[14px] cursor-help text-zinc-400">info</span></div></th>
                                    <th className="px-6 py-4 text-xs text-zinc-500 uppercase font-bold whitespace-nowrap"><div className="flex items-center gap-1">PoX Reward APY<span className="material-symbols-outlined text-[14px] cursor-help text-zinc-400">info</span></div></th>
                                    <th className="px-6 py-4 text-xs text-zinc-500 uppercase font-bold whitespace-nowrap"><div className="flex items-center gap-1">P2P Matched APY<span className="material-symbols-outlined text-[14px] cursor-help text-zinc-400">stars</span></div></th>
                                    <th className="px-6 py-4 text-xs text-zinc-500 uppercase font-bold text-right whitespace-nowrap">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {(mode === 'borrow' ? [
                                    // In borrow mode, show the STABLECOIN you receive, not the collateral
                                    { sym: 'VUSD', name: 'Vault USD Stablecoin', icon: 'paid', iconColor: 'text-emerald-500', iconBg: 'bg-emerald-500/10 border-emerald-500/20', pool: '$45,028,670', base: '5.85%', pox: { val: 'N/A', tag: '', style: 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 border-zinc-300 dark:border-zinc-600' }, p2p: { val: '8.20%', tag: 'MAX' } },
                                    { sym: 'USDC', name: 'USD Coin (Coming V2)', icon: 'payments', iconColor: 'text-blue-500', iconBg: 'bg-blue-500/10 border-blue-500/20', pool: '$89,204,115', base: '4.20%', pox: { val: 'N/A', tag: '', style: 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 border-zinc-300 dark:border-zinc-600' }, p2p: { val: '6.50%', tag: 'MAX' } },
                                    { sym: 'STX', name: 'Stacks Token (Coming V2)', icon: 'layers', iconColor: 'text-indigo-500', iconBg: 'bg-indigo-500/10 border-indigo-500/20', pool: '$22,500,000', base: '2.40%', pox: { val: '12.10%', tag: 'STX', style: 'bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border-indigo-500/20' }, p2p: { val: '14.50%', tag: 'MAX' } },
                                ] : [
                                    // Supply / Withdraw / Repay modes show the collateral asset
                                    { sym: 'sBTC', name: 'Stacks Bitcoin', icon: 'currency_bitcoin', iconColor: 'text-orange-500', iconBg: 'bg-orange-500/10 border-orange-500/20', pool: '$124,510,024', base: '1.20%', pox: { val: '4.50%', tag: 'STX', style: 'bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border-indigo-500/20' }, p2p: { val: '6.80%', tag: 'MAX' } },
                                    { sym: 'STX', name: 'Stacks Token', icon: 'layers', iconColor: 'text-indigo-500', iconBg: 'bg-indigo-500/10 border-indigo-500/20', pool: '$89,204,115', base: '2.40%', pox: { val: '12.10%', tag: 'STX', style: 'bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border-indigo-500/20' }, p2p: { val: '14.50%', tag: 'MAX' } },
                                    { sym: 'USDA', name: 'Arkadiko Stablecoin', icon: 'payments', iconColor: 'text-emerald-500', iconBg: 'bg-emerald-500/10 border-emerald-500/20', pool: '$45,028,670', base: '5.85%', pox: { val: '0.00%', tag: 'STX', style: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' }, p2p: { val: '8.20%', tag: 'MAX' } },
                                ]).map((row) => (
                                    <tr key={row.sym} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${row.iconBg}`}>
                                                    <span className={`material-symbols-outlined ${row.iconColor}`}>{row.icon}</span>
                                                </div>
                                                <div>
                                                    <p className="font-bold text-zinc-900 dark:text-zinc-100">{row.sym}</p>
                                                    <p className="text-xs text-zinc-500">{row.name}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 mono font-medium text-zinc-900 dark:text-zinc-100">{row.pool}</td>
                                        <td className="px-6 py-5 mono text-emerald-500 font-bold">{row.base}</td>
                                        <td className="px-6 py-5"><div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border mono text-sm font-bold ${row.pox.style}`}>{row.pox.val} <span className="text-[10px] opacity-70">{row.pox.tag}</span></div></td>
                                        <td className="px-6 py-5"><div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary px-3 py-1 rounded-full border border-primary/20 mono text-sm font-bold">{row.p2p.val} <span className="text-[10px] opacity-70">{row.p2p.tag}</span></div></td>
                                        <td className="px-6 py-5 text-right">
                                            <button
                                                onClick={() => {
                                                    if (mode === 'borrow' && row.sym === 'VUSD') {
                                                        setBorrowAsset(row)
                                                    } else if (row.sym === 'sBTC') {
                                                        if (mode === 'supply') setSupplyAsset(row)
                                                        else if (mode === 'withdraw') setRedeemAsset(row)
                                                        else if (mode === 'repay') setRepayAsset(row)
                                                    }
                                                }}
                                                disabled={mode === 'borrow' ? row.sym !== 'VUSD' : row.sym !== 'sBTC'}
                                                className={`font-bold text-sm px-6 py-2 rounded-lg transition-all shadow-sm capitalize ${(mode === 'borrow' ? row.sym === 'VUSD' : row.sym === 'sBTC')
                                                    ? 'bg-primary hover:bg-primary/90 text-white'
                                                    : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
                                                    }`}
                                            >
                                                {(mode === 'borrow' ? row.sym === 'VUSD' : row.sym === 'sBTC') ? (mode === 'withdraw' ? 'Redeem' : mode) : 'Coming V2'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="flex items-center justify-between text-sm text-zinc-500">
                    <p>Displaying 3 of 12 active markets</p>
                    <div className="flex items-center gap-4">
                        <button className="flex items-center gap-1 hover:text-zinc-800 dark:hover:text-white transition-colors"><span className="material-symbols-outlined text-[18px]">download</span>Export Data</button>
                        <div className="flex items-center gap-2">
                            <button className="px-3 py-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-not-allowed opacity-50">Prev</button>
                            <button className="px-3 py-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors">Next</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════
                ── P2P MATCH BOARD ──────────────────────────────────
                ══════════════════════════════════════════════════════ */}
            <div className="space-y-4">
                {/* Section header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">compare_arrows</span>
                            P2P Match Board
                        </h3>
                        <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
                            <MatchPulse /> LIVE
                        </span>
                    </div>
                    <p className="text-xs text-zinc-500">Direct peer-to-peer lending — no pool intermediation</p>
                </div>

                {/* Order book + recent matches */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                    {/* ── Borrow Requests ── */}
                    <div className="card overflow-hidden">
                        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-400 inline-block"></span>
                                Borrow Requests
                            </span>
                            <span className="text-xs text-zinc-500">{BORROW_REQUESTS.length} open</span>
                        </div>
                        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {BORROW_REQUESTS.map((req) => (
                                <div key={req.id} className={`px-5 py-3.5 transition-colors ${req.status === 'matching' ? 'bg-primary/5' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'}`}>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="mono text-xs text-zinc-500">{req.wallet}</span>
                                        <div className="flex items-center gap-2">
                                            {req.status === 'matching' && <MatchPulse />}
                                            <ScoreBadge score={req.score} />
                                        </div>
                                    </div>
                                    <div className="flex items-end justify-between">
                                        <div>
                                            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mono">{req.amount} {req.asset}</span>
                                            <p className="text-[10px] text-zinc-400 mt-0.5">for {req.duration}</p>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-sm font-bold text-red-500 mono">@ {req.rate}%</span>
                                            <p className="text-[10px] text-zinc-400 mt-0.5">max rate</p>
                                        </div>
                                    </div>
                                    {req.status === 'matching' && (
                                        <div className="mt-2 text-[10px] font-bold text-primary flex items-center gap-1 animate-pulse">
                                            <span className="material-symbols-outlined text-sm">sync</span>
                                            Matching in progress…
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800">
                            <button className="w-full text-sm font-bold text-primary hover:opacity-80 transition-opacity flex items-center justify-center gap-1">
                                <span className="material-symbols-outlined text-sm">add</span> Place Borrow Request
                            </button>
                        </div>
                    </div>

                    {/* ── Lend Offers ── */}
                    <div className="card overflow-hidden">
                        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                                Lend Offers
                            </span>
                            <span className="text-xs text-zinc-500">{LEND_OFFERS.length} open</span>
                        </div>
                        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {LEND_OFFERS.map((offer) => (
                                <div key={offer.id} className={`px-5 py-3.5 transition-colors ${offer.status === 'matching' ? 'bg-primary/5' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'}`}>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="mono text-xs text-zinc-500">{offer.wallet}</span>
                                        {offer.status === 'matching' && <MatchPulse />}
                                    </div>
                                    <div className="flex items-end justify-between">
                                        <div>
                                            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mono">{offer.amount} {offer.asset}</span>
                                            <p className="text-[10px] text-zinc-400 mt-0.5">for {offer.duration}</p>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-sm font-bold text-emerald-500 mono">@ {offer.rate}%</span>
                                            <p className="text-[10px] text-zinc-400 mt-0.5">min rate</p>
                                        </div>
                                    </div>
                                    {offer.status === 'matching' && (
                                        <div className="mt-2 text-[10px] font-bold text-primary flex items-center gap-1 animate-pulse">
                                            <span className="material-symbols-outlined text-sm">sync</span>
                                            Matching in progress…
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800">
                            <button className="w-full text-sm font-bold text-primary hover:opacity-80 transition-opacity flex items-center justify-center gap-1">
                                <span className="material-symbols-outlined text-sm">add</span> Place Lend Offer
                            </button>
                        </div>
                    </div>

                    {/* ── Recent Matches ── */}
                    <div className="card overflow-hidden">
                        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-[18px]">handshake</span>
                                Recent Matches
                            </span>
                            {matchFlash && (
                                <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full animate-pulse">
                                    NEW MATCH
                                </span>
                            )}
                        </div>
                        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {RECENT_MATCHES.map((match, i) => (
                                <div key={match.id} className={`px-5 py-3.5 ${i === 0 && matchFlash ? 'bg-primary/5' : ''} transition-colors`}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] text-zinc-400">{match.ago}</span>
                                        <span className="mono text-xs font-bold text-emerald-500">@ {match.rate}%</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs">
                                        <span className="mono text-zinc-600 dark:text-zinc-400">{match.borrower}</span>
                                        <span className="material-symbols-outlined text-primary text-[14px]">compare_arrows</span>
                                        <span className="mono text-zinc-600 dark:text-zinc-400">{match.lender}</span>
                                    </div>
                                    <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 mono mt-1">{match.amount} {match.asset}</p>
                                </div>
                            ))}
                        </div>
                        <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
                            <span>Fully on-chain · Trustless settlement</span>
                            <button className="text-primary font-bold hover:opacity-80 transition-opacity">View all →</button>
                        </div>
                    </div>
                </div>

                {/* Info strip */}
                <div className="flex items-center gap-3 px-5 py-3.5 rounded-xl bg-primary/5 border border-primary/10 text-sm text-zinc-600 dark:text-zinc-400">
                    <span className="material-symbols-outlined text-primary shrink-0">info</span>
                    <span>P2P matching eliminates pool intermediation — borrowers and lenders agree on exact terms, settled trustlessly on-chain via Clarity contracts. Rates reflect live demand; matched loans settle within the same Stacks block.</span>
                </div>
            </div>

        </div>
    )
}
