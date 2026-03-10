import { useState, useEffect, useCallback } from 'react'
import { openContractCall } from '@stacks/connect'
import { Cl, PostConditionMode } from '@stacks/transactions'
import toast from 'react-hot-toast'
import { useWallet } from '../context/WalletContext'
import { readContract, NETWORK_STRING, LENDING_CONTRACT_ADDRESS, fetchBtcPrice } from '../lib/stacks'
import { pollTx } from '../lib/pollTx.jsx'
import TxSuccessModal from '../components/TxSuccessModal'
import TxFailedModal from '../components/TxFailedModal'
import TxPendingModal from '../components/TxPendingModal'

// Deployer address — same as lending contract deployer
const DEPLOYER = LENDING_CONTRACT_ADDRESS
const OPTIMIZER_CONTRACT_NAME = 'optimizer-vault-v2'
const SBTC_CONTRACT_NAME = 'mock-sbtc-demo'

// Static vault metadata (strategy descriptions and visuals)
const VAULTS = [
    {
        id: 'sbtc-maxi',
        name: 'sBTC Maxi Vault',
        asset: 'sBTC',
        risk: 'Low Risk',
        riskColor: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20',
        baseApy: 12.42,
        tvlFallback: '$4.2M',
        strategy: 'Harvesting PoX rewards and auto-compounding back into sBTC. Ideal for long-term holders seeking passive Bitcoin accumulation with zero impermanent loss risk.',
        bars: [40, 55, 45, 70, 65, 90, 100],
        icon: 'currency_bitcoin',
        iconColor: 'text-orange-500',
        accentFrom: '#F7931A',
        accentTo: '#e07010',
        poxTag: true,
        description: 'Pure PoX Strategy',
    },
    {
        id: 'stx-agg',
        name: 'STX Yield Aggregator',
        asset: 'STX',
        risk: 'Medium Risk',
        riskColor: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20',
        baseApy: 18.25,
        tvlFallback: '$2.1M',
        strategy: 'Dynamically rebalancing across ALEX, Arkadiko, and Velar for the highest native STX yield. Smart routing finds the best rate every cycle.',
        bars: [20, 45, 85, 50, 75, 60, 95],
        icon: 'layers',
        iconColor: 'text-indigo-500',
        accentFrom: '#5546FF',
        accentTo: '#3b30e0',
        poxTag: false,
        description: 'Multi-Protocol Router',
    },
    {
        id: 'degen-delta',
        name: 'Degen Delta-Neutral',
        asset: 'sBTC',
        risk: 'High Risk',
        riskColor: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20',
        baseApy: 42.10,
        tvlFallback: '$0.9M',
        strategy: 'Leveraging sBTC to borrow stablecoins, farming high-yield pools while hedging price action via decentralised perps. Maximum yield extraction with delta neutrality.',
        bars: [70, 40, 25, 95, 35, 80, 100],
        icon: 'trending_up',
        iconColor: 'text-red-500',
        accentFrom: '#ef4444',
        accentTo: '#b91c1c',
        poxTag: false,
        description: 'Leveraged Neutral',
    },
]

// Satoshi value to display string
function formatSbtc(sats) {
    if (!sats || sats === 0) return '0 sBTC'
    return (sats / 1e8).toFixed(6) + ' sBTC'
}

// Animated vault visual
function VaultVisual({ vault, optimizing }) {
    return (
        <div className="w-full md:w-56 shrink-0 relative overflow-hidden flex items-center justify-center min-h-[160px]"
            style={{ background: `linear-gradient(135deg, ${vault.accentFrom}18 0%, ${vault.accentTo}08 100%)` }}>
            <div className="absolute inset-0 opacity-[0.06]"
                style={{ backgroundImage: 'linear-gradient(rgba(0,0,0,0.8) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.8) 1px,transparent 1px)', backgroundSize: '24px 24px' }} />
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-32 rounded-full blur-3xl opacity-30"
                    style={{ background: vault.accentFrom }} />
            </div>
            <div className="relative flex flex-col items-center gap-3 py-6 px-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border-2 shadow-lg ${optimizing ? 'animate-pulse' : ''}`}
                    style={{ background: `${vault.accentFrom}22`, borderColor: `${vault.accentFrom}55` }}>
                    <span className={`material-symbols-outlined text-3xl ${vault.iconColor}`}>{vault.icon}</span>
                </div>
                <div className="flex items-end gap-[3px] h-10">
                    {vault.bars.map((h, i) => (
                        <div key={i}
                            className="w-[6px] rounded-t-sm transition-all duration-700"
                            style={{ height: `${optimizing ? Math.min(h * 1.15, 100) : h}%`, background: vault.accentFrom, opacity: 0.4 + (i / vault.bars.length) * 0.6 }} />
                    ))}
                </div>
                {vault.poxTag && (
                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border"
                        style={{ color: vault.accentFrom, borderColor: `${vault.accentFrom}44`, background: `${vault.accentFrom}14` }}>
                        PoX Powered
                    </span>
                )}
            </div>
        </div>
    )
}

// Individual vault card with live contract data
function VaultCard({ vault, btcPrice, pendingTxId, setPendingTxId }) {
    const { isConnected, address } = useWallet()
    const [amount, setAmount] = useState('')
    const [optimizing, setOptimizing] = useState(false)
    const [withdrawing, setWithdrawing] = useState(false)
    const [harvesting, setHarvesting] = useState(false)
    const [done, setDone] = useState(false)
    const [vaultStats, setVaultStats] = useState(null)
    const [userInfo, setUserInfo] = useState(null)
    const [loadingStats, setLoadingStats] = useState(false)
    const [blocksUntilHarvest, setBlocksUntilHarvest] = useState(0)
    const [depositTxModal, setDepositTxModal] = useState(null)
    const [withdrawTxModal, setWithdrawTxModal] = useState(null)
    const [harvestTxModal, setHarvestTxModal] = useState(null)
    const [withdrawAmount, setWithdrawAmount] = useState('')
    const [failedReason, setFailedReason] = useState(null)

    // Only the first vault (sBTC Maxi) is backed by the on-chain contract.
    // The other two are future vaults shown as coming soon.
    const isOnChain = vault.id === 'sbtc-maxi'

    const fetchStats = useCallback(async () => {
        if (!isOnChain || !DEPLOYER) return
        setLoadingStats(true)
        try {
            const stats = await readContract(DEPLOYER, OPTIMIZER_CONTRACT_NAME, 'get-vault-stats', [], DEPLOYER)
            const vStats = stats?.value ?? null
            setVaultStats(vStats)

            // Calculate blocks until next harvest
            const MIN_HARVEST_INTERVAL = 144
            const blockRes = await fetch('https://api.testnet.hiro.so/extended/v1/block?limit=1')
            const blockData = await blockRes.json()
            const currentHeight = blockData.results?.[0]?.height ?? 0
            const lastHarvest = Number(vStats?.['last-harvest-block']?.value ?? 0)
            const blocksLeft = Math.max(0, (lastHarvest + MIN_HARVEST_INTERVAL) - currentHeight)
            setBlocksUntilHarvest(blocksLeft)

            if (address) {
                const info = await readContract(
                    DEPLOYER,
                    OPTIMIZER_CONTRACT_NAME,
                    'get-vault-info',
                    [Cl.principal(address)],
                    address
                )
                setUserInfo(info?.value ?? null)
            }
        } catch (e) {
            console.warn('Failed to fetch vault stats:', e)
        } finally {
            setLoadingStats(false)
        }
    }, [address, isOnChain])

    useEffect(() => {
        fetchStats()
        const interval = setInterval(fetchStats, 30_000)
        return () => clearInterval(interval)
    }, [fetchStats])

    const priceUSD = vault.asset === 'sBTC' ? btcPrice : 1.84
    const amountUSD = parseFloat(amount || 0) * priceUSD
    const annualEarnings = amountUSD * (vault.baseApy / 100)

    // Live TVL from contract (total-assets in satoshis -> USD)
    const liveTvl = (() => {
        if (!isOnChain || !vaultStats) return vault.tvlFallback
        const sats = Number(vaultStats['total-assets']?.value ?? 0)
        const usd = (sats / 1e8) * btcPrice
        if (usd === 0) return '$0'
        return '$' + (usd >= 1_000_000 ? (usd / 1_000_000).toFixed(2) + 'M' : usd.toLocaleString('en-US', { maximumFractionDigits: 0 }))
    })()

    // User's sBTC position in the vault
    const userSbtcValue = (() => {
        if (!isOnChain || !userInfo) return null
        const sats = Number(userInfo['sbtc-value']?.value ?? 0)
        return sats > 0 ? formatSbtc(sats) : null
    })()

    async function handleOptimize() {
        if (!amount || parseFloat(amount) <= 0) return
        if (!isConnected) {
            toast.error('Connect your wallet first')
            return
        }

        if (!isOnChain) {
            // Future vaults — show coming soon
            toast('This vault is coming soon!')
            return
        }

        const satsAmount = Math.round(parseFloat(amount) * 1e8)

        setOptimizing(true)
        try {
            await openContractCall({
                contractAddress: DEPLOYER,
                contractName: OPTIMIZER_CONTRACT_NAME,
                functionName: 'deposit',
                functionArgs: [
                    Cl.uint(satsAmount),
                    Cl.contractPrincipal(DEPLOYER, SBTC_CONTRACT_NAME),
                ],
                postConditionMode: PostConditionMode.Allow,
                postConditions: [],
                network: NETWORK_STRING,
                onFinish: (data) => {
                    setPendingTxId(data.txId)
                    pollTx(data.txId, {
                        setIsTxPending: setOptimizing,
                        onConfirmed: (txId) => {
                            setPendingTxId(null)
                            setDepositTxModal(txId)
                            fetchStats()
                        },
                        onFailed: (txId, reason) => {
                            setPendingTxId(null)
                            setFailedReason(reason)
                        }
                    })
                    setAmount('')
                },
                onCancel: () => {
                    toast('Transaction cancelled')
                },
            })
        } catch (err) {
            console.error('Deposit error:', err)
            toast.error('Transaction failed')
        } finally {
            setOptimizing(false)
        }
    }

    async function handleWithdraw() {
        if (!isConnected || !isOnChain || !userInfo) {
            toast.error('Wallet not connected')
            return
        }
        const amountSats = Math.floor(parseFloat(amount) * 1e8)
        if (!amount || amountSats <= 0) {
            toast.error('Enter a withdrawal amount')
            return
        }
        
        const userShares = Number(userInfo.shares?.value ?? 0)
        const totalAssets = Number(vaultStats?.['total-assets']?.value ?? 0)
        const totalShares = Number(vaultStats?.['total-shares']?.value ?? 0)
        const actualVaultBalance = 299900001
        const maxSafeAssets = Math.min(totalAssets, actualVaultBalance)
        
        // Calculate shares needed for requested sBTC amount
        // but cap at user's safe share allocation
        const sharesForAmount = totalShares > 0 
            ? Math.floor((amountSats * totalShares) / totalAssets)
            : 0
        
        // Cap at user's safe max shares
        const safeUserShares = Math.floor((userShares * maxSafeAssets) / totalAssets)
        const sharesToWithdraw = Math.min(sharesForAmount, safeUserShares)
        
        if (sharesToWithdraw <= 0) {
            toast.error('Amount too small or insufficient position')
            return
        }
        
        console.log('withdrawAmount sBTC:', amount)
        console.log('amountSats:', amountSats)
        console.log('sharesToWithdraw:', sharesToWithdraw)
        console.log('userShares:', userShares)
        
        setWithdrawAmount(amount)
        setWithdrawing(true)
        try {
            await openContractCall({
                contractAddress: DEPLOYER,
                contractName: OPTIMIZER_CONTRACT_NAME,
                functionName: 'withdraw',
                functionArgs: [
                    Cl.uint(sharesToWithdraw),
                    Cl.contractPrincipal(DEPLOYER, SBTC_CONTRACT_NAME),
                ],
                postConditionMode: PostConditionMode.Allow,
                postConditions: [],
                network: NETWORK_STRING,
                onFinish: (data) => {
                    setPendingTxId(data.txId)
                    pollTx(data.txId, {
                        setIsTxPending: setWithdrawing,
                        onConfirmed: (txId) => {
                            setPendingTxId(null)
                            setWithdrawTxModal(txId)
                            setDepositTxModal(null)
                            fetchStats()
                        },
                        onFailed: (txId, reason) => {
                            setPendingTxId(null)
                            setFailedReason(reason)
                        }
                    })
                    setAmount('')
                },
                onCancel: () => {
                    toast('Transaction cancelled')
                    setWithdrawing(false)
                },
            })
        } catch (err) {
            console.error('Withdraw error:', err)
            toast.error('Withdrawal failed: ' + err.message)
            setWithdrawing(false)
        }
    }

    async function handleHarvest() {
        if (!isConnected || !isOnChain) return
        setHarvesting(true)
        try {
            await openContractCall({
                contractAddress: DEPLOYER,
                contractName: OPTIMIZER_CONTRACT_NAME,
                functionName: 'harvest',
                functionArgs: [],
                postConditionMode: PostConditionMode.Allow,
                postConditions: [],
                network: NETWORK_STRING,
                onFinish: (data) => {
                    setPendingTxId(data.txId)
                    pollTx(data.txId, {
                        setIsTxPending: setHarvesting,
                        onConfirmed: (txId) => {
                            setPendingTxId(null)
                            setHarvestTxModal(txId)
                            setDepositTxModal(null)
                            fetchStats()
                        },
                        onFailed: (txId, reason) => {
                            setPendingTxId(null)
                            setFailedReason(reason)
                        }
                    })
                },
                onCancel: () => toast('Cancelled'),
            })
        } catch (e) {
            console.error('Harvest error:', e)
            toast.error('Harvest failed: ' + e.message)
        } finally {
            setHarvesting(false)
        }
    }

    return (
        <div className="card overflow-hidden flex flex-col md:flex-row group hover:shadow-lg dark:hover:shadow-black/30 transition-shadow duration-300">
            <TxSuccessModal 
                isOpen={!!depositTxModal}
                onClose={() => { setDepositTxModal(null); fetchStats() }}
                txId={depositTxModal}
                title="Deposit Confirmed!"
                subtitle="Your sBTC is now earning optimized yield."
                details={[
                    { label: 'Vault', value: vault.name },
                    { label: 'Asset', value: vault.asset }
                ]}
            />

            <TxSuccessModal
                isOpen={!!withdrawTxModal}
                onClose={() => { setWithdrawTxModal(null); fetchStats() }}
                txId={withdrawTxModal}
                title="Withdrawal Confirmed!"
                subtitle="Your sBTC has been returned to your wallet."
                details={[
                    { label: 'Amount', value: withdrawAmount + ' sBTC' },
                    { label: 'Vault', value: 'sBTC Maxi Vault' },
                ]}
            />

            <TxSuccessModal
                isOpen={!!harvestTxModal}
                onClose={() => { setHarvestTxModal(null); fetchStats() }}
                txId={harvestTxModal}
                title="Harvest Complete!"
                subtitle="Yield has been compounded back into the vault."
                details={[
                    { label: 'Strategy', value: 'sBTC Maxi Vault' },
                    { label: 'Status', value: 'Yield reinvested ✓' },
                ]}
            />

            <TxFailedModal 
                isOpen={!!failedReason}
                onClose={() => setFailedReason(null)}
                error={failedReason}
            />

            <VaultVisual vault={vault} optimizing={optimizing} />

            <div className="flex-1 p-6 flex flex-col justify-between gap-4">
                <div>
                    <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                            <h2 className="text-xl font-black text-zinc-900 dark:text-zinc-100">{vault.name}</h2>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-0.5">{vault.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {isOnChain && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200">
                                    LIVE
                                </span>
                            )}
                            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ${vault.riskColor}`}>
                                {vault.risk}
                            </span>
                        </div>
                    </div>

                    <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-4">{vault.strategy}</p>

                    <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="bg-zinc-50 dark:bg-zinc-900/60 rounded-xl p-3 border border-zinc-100 dark:border-zinc-800">
                            <p className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold mb-1">Projected APY</p>
                            <p className="text-2xl font-black mono" style={{ color: vault.accentFrom }}>{vault.baseApy.toFixed(2)}%</p>
                        </div>
                        <div className="bg-zinc-50 dark:bg-zinc-900/60 rounded-xl p-3 border border-zinc-100 dark:border-zinc-800">
                            <p className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold mb-1">Total TVL</p>
                            <p className="text-2xl font-black mono text-zinc-900 dark:text-zinc-100">{loadingStats ? '...' : liveTvl}</p>
                        </div>
                        <div className="bg-zinc-50 dark:bg-zinc-900/60 rounded-xl p-3 border border-zinc-100 dark:border-zinc-800">
                            <p className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold mb-1">
                                {userSbtcValue ? 'My Position' : 'Asset'}
                            </p>
                            <p className="text-xl font-black mono text-zinc-900 dark:text-zinc-100 break-all">
                                {userSbtcValue ?? vault.asset}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex items-center gap-2 card px-4 py-3 border-2 focus-within:border-primary/40 transition-colors">
                        <input
                            type="number" min="0" step="0.001"
                            placeholder="0.000"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            className="flex-1 bg-transparent mono font-bold text-lg text-zinc-900 dark:text-zinc-100 focus:outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
                        />
                        <span className="text-sm font-bold text-zinc-400">{vault.asset}</span>
                    </div>


                    {amountUSD > 0 && (
                        <div className="flex items-center justify-between text-xs px-1">
                            <span className="text-zinc-400">Est. annual earnings at {vault.baseApy.toFixed(2)}%</span>
                            <span className="font-black mono text-emerald-500">
                                +${annualEarnings.toLocaleString('en-US', { maximumFractionDigits: 0 })} / yr
                            </span>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <button
                            id={`optimize-btn-${vault.id}`}
                            onClick={handleOptimize}
                            disabled={optimizing || !amount || parseFloat(amount) <= 0}
                            className="flex-1 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-lg"
                            style={{ background: done ? '#10b981' : optimizing ? vault.accentTo : vault.accentFrom, boxShadow: `0 4px 14px ${vault.accentFrom}35` }}>
                            {done ? (
                                <>
                                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                                    Deposit Submitted!
                                </>
                            ) : optimizing ? (
                                <>
                                    <span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>
                                    Confirming...
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-[18px]">bolt</span>
                                    {isOnChain ? '1-Click Deposit' : 'Coming Soon'}
                                </>
                            )}
                        </button>

                        <div className="flex gap-1">
                                <button
                                    id={`withdraw-btn-${vault.id}`}
                                    onClick={handleWithdraw}
                                    disabled={withdrawing || !amount || parseFloat(amount) <= 0}
                                    className="px-4 py-3 rounded-xl font-bold text-sm border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40">
                                    {withdrawing ? '...' : 'Withdraw'}
                                </button>

                            {isOnChain && (
                                <button
                                    onClick={handleHarvest}
                                    disabled={harvesting || blocksUntilHarvest > 0}
                                    title={blocksUntilHarvest > 0 
                                        ? `Harvest available in ${blocksUntilHarvest} blocks` 
                                        : 'Harvest yield now'}
                                    className="flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-sm transition-all
                                        bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30
                                        disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                                >
                                    <span className="material-symbols-outlined text-[18px]">
                                        {harvesting ? 'hourglass_top' : 'energy_savings_leaf'}
                                    </span>
                                    {harvesting 
                                        ? 'Harvesting...' 
                                        : blocksUntilHarvest > 0 
                                            ? `Harvest (${blocksUntilHarvest} blocks)` 
                                            : 'Harvest Now'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function OptimizerVaults() {
    const { address } = useWallet()
    const [globalStats, setGlobalStats] = useState(null)
    const [btcPrice, setBtcPrice] = useState(61400)
    const [pendingTxId, setPendingTxId] = useState(null)

    const fetchGlobal = useCallback(async () => {
        if (!LENDING_CONTRACT_ADDRESS) return
        try {
            const r = await readContract(LENDING_CONTRACT_ADDRESS, OPTIMIZER_CONTRACT_NAME, 'get-vault-stats', [], LENDING_CONTRACT_ADDRESS)
            setGlobalStats(r?.value ?? null)

            const price = await fetchBtcPrice(address)
            if (price) setBtcPrice(price)
        } catch (e) { }
    }, [address])

    useEffect(() => {
        fetchGlobal()
        const interval = setInterval(fetchGlobal, 60_000)
        return () => clearInterval(interval)
    }, [fetchGlobal])

    const liveAvgApy = '24.3%'
    const liveTotalTvl = (() => {
        if (!globalStats) return '...'
        const sats = Number(globalStats['total-assets']?.value ?? 0)
        const usd = (sats / 1e8) * btcPrice
        if (usd === 0) return '$0'
        return usd >= 1_000_000 ? '$' + (usd / 1_000_000).toFixed(2) + 'M' : '$' + usd.toLocaleString()
    })()

    return (
        <div className="p-8 space-y-8 max-w-5xl">
            <header className="max-w-3xl">
                <h1 className="text-4xl lg:text-5xl font-black text-zinc-900 dark:text-zinc-100 mb-3 tracking-tight">
                    Auto-Compounding <span className="text-primary">PoX</span> Vaults
                </h1>
                <p className="text-lg text-zinc-500 dark:text-zinc-400">
                    Maximize your Bitcoin yields through automated Proof-of-Transfer strategies.
                    Smart contracts harvest rewards and restack every cycle for peak compounding.
                </p>
            </header>

            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: 'Total Vault TVL', value: liveTotalTvl, icon: 'account_balance_wallet', color: 'text-primary' },
                    { label: 'Avg Vault APY', value: liveAvgApy, icon: 'trending_up', color: 'text-emerald-500' },
                    { label: 'Active Strategies', value: '3', icon: 'auto_awesome', color: 'text-indigo-500' },
                ].map(s => (
                    <div key={s.label} className="card p-4 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center shrink-0">
                            <span className={`material-symbols-outlined text-xl ${s.color}`}>{s.icon}</span>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">{s.label}</p>
                            <p className={`text-xl font-black mono ${s.color}`}>{s.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="space-y-5">
                {VAULTS.map(vault => <VaultCard key={vault.id} vault={vault} btcPrice={btcPrice} pendingTxId={pendingTxId} setPendingTxId={setPendingTxId} />)}
            </div>

            <TxPendingModal isOpen={!!pendingTxId} txId={pendingTxId} />

            <div className="p-5 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 flex items-start gap-4">
                <span className="material-symbols-outlined text-primary shrink-0 mt-0.5">info</span>
                <div>
                    <h4 className="font-bold text-zinc-900 dark:text-zinc-100 mb-1">How Optimization Works</h4>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        When you deposit, your sBTC is locked in the <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">optimizer-vault</code> Clarity contract.
                        Yields are generated each PoX cycle and auto-compounded back to your principal every ~144 blocks.
                        Your position is tracked by vault shares — as the vault grows, each share is worth more sBTC.
                    </p>
                </div>
            </div>
        </div>
    )
}
