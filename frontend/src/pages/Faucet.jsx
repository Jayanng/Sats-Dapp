import { useState, useEffect, useCallback } from 'react'
import { openContractCall } from '@stacks/connect'
import {
    Cl,
    PostConditionMode,
    Pc,
    fetchCallReadOnlyFunction,
    cvToJSON
} from '@stacks/transactions'
import toast from 'react-hot-toast'
import { useWallet } from '../context/WalletContext'
import { pollTx } from '../lib/pollTx.jsx'
import TxPendingModal from '../components/TxPendingModal'
import TxSuccessModal from '../components/TxSuccessModal'

const CONTRACT_ADDRESS = 'ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV'

const TOKENS = [
    { id: 'stx', label: 'Testnet STX', sub: 'Native Stacks Token', icon: 'layers', iconColor: 'text-indigo-500', ring: 'bg-indigo-500/10 border-indigo-500/20', mintAmt: '1,000', mintNum: 1000 },
    { id: 'sbtc', label: 'Testnet sBTC', sub: 'Synthetic Bitcoin Asset', icon: 'currency_bitcoin', iconColor: 'text-orange-500', ring: 'bg-orange-500/10 border-orange-500/20', mintAmt: '1', mintNum: 1 },
    { id: 'usda', label: 'Vault USD (VUSD)', sub: 'Earned by borrowing against sBTC', icon: 'payments', iconColor: 'text-emerald-500', ring: 'bg-emerald-500/10 border-emerald-500/20', mintAmt: 'Via Borrow', mintNum: 0 },
]

export default function Faucet() {
    const { address, stxBalance } = useWallet()
    const [balances, setBalances] = useState({ stx: 0, sbtc: 0, usda: 0 })
    const [minting, setMinting] = useState({})
    const [minted, setMinted] = useState({})
    const [pendingTxId, setPendingTxId] = useState(null)
    const [successTxId, setSuccessTxId] = useState(null)
    const [successToken, setSuccessToken] = useState('')
    const [hasSupplied, setHasSupplied] = useState(false)
    const [hasBorrowed, setHasBorrowed] = useState(false)

    const fetchBalances = useCallback(async () => {
        if (!address) return

        try {
            // Fetch mock-sbtc balance (8 decimals)
            const sbtcResponse = await fetchCallReadOnlyFunction({
                network: 'testnet',
                contractAddress: CONTRACT_ADDRESS,
                contractName: 'mock-sbtc-demo',
                functionName: 'get-balance',
                functionArgs: [Cl.principal(address)],
                senderAddress: address,
            })
            const sbtcJson = cvToJSON(sbtcResponse)
            const sbtcBal = sbtcJson.type && sbtcJson.type.startsWith('(response') && sbtcJson.value ? Number(sbtcJson.value.value) / 100_000_000 : 0

            // Fetch vault-usd balance (6 decimals)
            const usdaResponse = await fetchCallReadOnlyFunction({
                network: 'testnet',
                contractAddress: CONTRACT_ADDRESS,
                contractName: 'vault-usd-final',
                functionName: 'get-balance',
                functionArgs: [Cl.principal(address)],
                senderAddress: address,
            })
            const usdaJson = cvToJSON(usdaResponse)
            const usdaBal = usdaJson.type && usdaJson.type.startsWith('(response') && usdaJson.value ? Number(usdaJson.value.value) / 1_000_000 : 0

            // Fetch vault data for checklist tracking
            const vaultRes = await fetchCallReadOnlyFunction({
                network: 'testnet',
                contractAddress: CONTRACT_ADDRESS,
                contractName: 'lending-protocol-v3',
                functionName: 'get-vault',
                functionArgs: [Cl.principal(address)],
                senderAddress: address,
            })
            const vaultJson = cvToJSON(vaultRes)
            const collateral = Number(vaultJson?.value?.value?.['collateral']?.value ?? 0)
            const debt = Number(vaultJson?.value?.value?.['debt']?.value ?? 0)

            setHasSupplied(collateral > 0)
            setHasBorrowed(debt > 0)

            setBalances({
                stx: stxBalance || 0,
                sbtc: sbtcBal,
                usda: usdaBal
            })
        } catch (error) {
            console.error('Error fetching token balances:', error)
        }
    }, [address, stxBalance])

    // Fetch on mount and set up a polling interval every 15 seconds to catch block confirmations
    useEffect(() => {
        fetchBalances()
        const interval = setInterval(fetchBalances, 15000)
        return () => clearInterval(interval)
    }, [fetchBalances])

    // Derive checklist state from balances
    const hasMinted = Object.values(balances).some(b => b > 0)

    const completedSteps = [hasMinted, hasSupplied, hasBorrowed].filter(Boolean).length
    const progressPct = Math.round((completedSteps / 3) * 100)

    function handleMint(token) {
        if (!address) {
            toast.error('Please connect your Leather wallet first.')
            return
        }

        if (token.id === 'stx') {
            window.open('https://explorer.hiro.so/sandbox/faucet?chain=testnet', '_blank')
            toast.success('Opened Hiro Testnet Faucet.')
            return
        }

        if (token.id === 'usda') {
            toast('VUSD is earned by borrowing against your sBTC collateral. Head to Markets → Borrow!', {
                icon: '💡',
                duration: 5000,
            })
            return
        }

        let contractName = 'vault-usd-final'
        let functionName = 'mint'
        let amountToMint = 100_000_000_000 // 100,000 VUSD

        if (token.id === 'sbtc') {
            contractName = 'mock-sbtc-demo'
            amountToMint = 1_00000000 // 1 mock-sBTC
        }
        const functionArgs = [
            Cl.uint(amountToMint), // amount
            Cl.principal(address)  // recipient
        ]

        setMinting(prev => ({ ...prev, [token.id]: true }))

        openContractCall({
            network: 'testnet',
            contractAddress: CONTRACT_ADDRESS,
            contractName: contractName,
            functionName: functionName,
            functionArgs,
            postConditionMode: PostConditionMode.Allow,
            postConditions: [],
            onFinish: (data) => {
                setPendingTxId(data.txId)
                setMinting(prev => ({ ...prev, [token.id]: false }))
                pollTx(data.txId, {
                    onConfirmed: (txId) => {
                        setPendingTxId(null)
                        setSuccessToken(token.label)
                        setSuccessTxId(txId)
                        setMinted(prev => ({ ...prev, [token.id]: true }))
                        setTimeout(() => setMinted(prev => ({ ...prev, [token.id]: false })), 5000)
                        setTimeout(fetchBalances, 2000)
                    },
                    onFailed: (txId, reason) => {
                        setPendingTxId(null)
                        toast.error('Mint failed: ' + reason)
                    }
                })
            },
            onCancel: () => {
                toast.error('Transaction cancelled.')
                setMinting(prev => ({ ...prev, [token.id]: false }))
            }
        })
    }

    function fmtBalance(id, val) {
        if (id === 'sbtc') return val.toFixed(4)
        return val.toLocaleString()
    }

    return (
        <div className="p-8 space-y-8 max-w-5xl mx-auto w-full">

            {/* ── Testnet Notice ──────────────────────────── */}
            <section className="bg-primary/5 border border-primary/20 rounded-xl p-5 flex items-start gap-4">
                <div className="bg-primary/10 p-2 rounded-lg text-primary shrink-0">
                    <span className="material-symbols-outlined">info</span>
                </div>
                <div className="flex-1">
                    <h3 className="text-primary font-bold">Testnet Environment</h3>
                    <p className="text-sm text-zinc-500 mt-1">
                        You are exploring the Satoshi Vaults sandbox. All tokens listed here are for testing
                        purposes only and have no financial value. Happy minting!
                    </p>
                </div>
                <a className="text-sm font-bold text-primary flex items-center gap-1 hover:underline shrink-0" href="#">
                    Docs <span className="material-symbols-outlined text-sm">open_in_new</span>
                </a>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* ── Faucet Card ─────────────────────────── */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="card overflow-hidden shadow-xl shadow-zinc-200/50 dark:shadow-none">
                        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
                            <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Claim Test Assets</h3>
                            <p className="text-xs text-zinc-500 mt-1">Mint mock tokens to start supplying and borrowing on Satoshi Vaults.</p>
                        </div>

                        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {TOKENS.map(token => {
                                const bal = balances[token.id]
                                const isMinting = minting[token.id]
                                const isMinted = minted[token.id]
                                return (
                                    <div key={token.id}
                                        className="p-6 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-full border flex items-center justify-center ${token.ring}`}>
                                                <span className={`material-symbols-outlined ${token.iconColor}`}>{token.icon}</span>
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-zinc-900 dark:text-zinc-100">{token.label}</h4>
                                                <p className="text-xs text-zinc-500">{token.sub}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            <span className="text-xs text-zinc-500 mono">
                                                Balance: <span className={`font-bold ${bal > 0 ? 'text-zinc-800 dark:text-zinc-200' : ''}`}>
                                                    {fmtBalance(token.id, bal)} {token.id.toUpperCase()}
                                                </span>
                                            </span>
                                            <button
                                                onClick={() => handleMint(token)}
                                                disabled={isMinting}
                                                className="bg-primary hover:bg-primary/90 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 shadow-sm min-w-[120px] justify-center">
                                                {isMinted ? (
                                                    <><span className="material-symbols-outlined text-sm">check</span> Minted!</>
                                                ) : isMinting ? (
                                                    <><span className="material-symbols-outlined text-sm animate-spin">refresh</span> Minting…</>
                                                ) : (
                                                    <><span className="material-symbols-outlined text-sm">bolt</span> Mint {token.mintAmt}</>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>

                {/* ── Right Column ─────────────────────────── */}
                <div className="space-y-6">

                    {/* Onboarding Checklist */}
                    <div className="card p-6">
                        <h3 className="font-bold text-lg mb-5 text-zinc-900 dark:text-zinc-100">Onboarding Progress</h3>
                        <div className="space-y-6 relative">
                            {/* Progress line */}
                            <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-zinc-200 dark:bg-zinc-800" />

                            {/* Step 1 — Mint */}
                            <div className="relative flex items-start gap-4">
                                <div className={`z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-500 ${hasMinted
                                    ? 'bg-primary/20 border-primary text-primary'
                                    : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-400'
                                    }`}>
                                    {hasMinted
                                        ? <span className="material-symbols-outlined text-sm">check</span>
                                        : <span className="material-symbols-outlined text-sm">pending</span>}
                                </div>
                                <div className="pt-1">
                                    <h4 className={`text-sm font-bold ${hasMinted ? 'text-primary' : 'text-zinc-400'}`}>1. Mint Assets</h4>
                                    <p className="text-xs text-zinc-500 mt-1">Claim your first test tokens from the faucet to begin.</p>
                                    {hasMinted
                                        ? <span className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">COMPLETE</span>
                                        : <span className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">PENDING</span>
                                    }
                                </div>
                            </div>

                            {/* Step 2 — Supply */}
                            <div className="relative flex items-start gap-4">
                                <div className={`z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-500 ${hasSupplied
                                    ? 'bg-primary/20 border-primary text-primary'
                                    : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-400'
                                    }`}>
                                    {hasSupplied
                                        ? <span className="material-symbols-outlined text-sm">check</span>
                                        : <span className="text-xs font-bold">2</span>}
                                </div>
                                <div className="pt-1">
                                    <h4 className={`text-sm font-bold ${hasSupplied ? 'text-primary' : 'text-zinc-400'}`}>2. Supply to Market</h4>
                                    <p className="text-xs text-zinc-500 mt-1">Deposit assets into a vault or market to start earning yield.</p>
                                    {hasSupplied
                                        ? <span className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">COMPLETE</span>
                                        : <span className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">PENDING</span>
                                    }
                                </div>
                            </div>

                            {/* Step 3 — Borrow */}
                            <div className="relative flex items-start gap-4">
                                <div className={`z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-500 ${hasBorrowed
                                    ? 'bg-primary/20 border-primary text-primary'
                                    : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-400'
                                    }`}>
                                    {hasBorrowed
                                        ? <span className="material-symbols-outlined text-sm">check</span>
                                        : <span className="text-xs font-bold">3</span>}
                                </div>
                                <div className="pt-1">
                                    <h4 className={`text-sm font-bold ${hasBorrowed ? 'text-primary' : 'text-zinc-400'}`}>3. Borrow against Rep Score</h4>
                                    <p className="text-xs text-zinc-500 mt-1">Unlock under-collateralised loans using your Reputation Score.</p>
                                    {hasBorrowed
                                        ? <span className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">COMPLETE</span>
                                        : <span className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">PENDING</span>
                                    }
                                </div>
                            </div>
                        </div>

                        {/* Progress bar */}
                        <div className="mt-8 p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700/50">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Total Completion</span>
                                <span className="text-sm font-bold text-primary">{progressPct}%</span>
                            </div>
                            <div className="w-full bg-zinc-200 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-primary h-full rounded-full transition-all duration-700"
                                    style={{ width: `${progressPct}%` }} />
                            </div>
                        </div>
                    </div>

                    {/* Mini Help Card */}
                    <div className="card p-6 overflow-hidden relative">
                        <div className="absolute -right-4 -bottom-4 opacity-10">
                            <span className="material-symbols-outlined text-8xl">help_center</span>
                        </div>
                        <h4 className="font-bold mb-2 text-zinc-900 dark:text-zinc-100">Need more gas?</h4>
                        <p className="text-xs text-zinc-500 leading-relaxed mb-4">
                            If you run out of STX for transaction fees, use the official Stacks Explorer faucet.
                        </p>
                        <button className="w-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-100 text-xs font-bold py-2 rounded-lg transition-colors">
                            Explorer Faucet
                        </button>
                    </div>
                </div>
            </div>

            <TxPendingModal isOpen={!!pendingTxId} txId={pendingTxId} />

            <TxSuccessModal
                isOpen={!!successTxId}
                onClose={() => { setSuccessTxId(null); fetchBalances() }}
                txId={successTxId}
                title="Mint Confirmed!"
                subtitle="Your testnet tokens are now in your wallet."
                details={[
                    { label: 'Token', value: successToken },
                    { label: 'Network', value: 'Stacks Testnet' },
                ]}
            />

        </div>
    )
}
