import { useState, useEffect, useCallback } from 'react'
import { openContractCall } from '@stacks/connect'
import { fetchCallReadOnlyFunction, cvToJSON, Cl, PostConditionMode } from '@stacks/transactions'
import toast from 'react-hot-toast'
import { useWallet } from '../context/WalletContext'
import { NETWORK_STRING, LENDING_CONTRACT_ADDRESS } from '../lib/stacks'
import { pollTx } from '../lib/pollTx.jsx'
import TxSuccessModal from '../components/TxSuccessModal'
import TxFailedModal from '../components/TxFailedModal'
import TxPendingModal from '../components/TxPendingModal'

const DEPLOYER = 'ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV'
const P2P_CONTRACT = 'p2p-matching-demo'
const VUSD_CONTRACT = 'vault-usd-final'
const SBTC_CONTRACT = 'mock-sbtc-demo'
const REPUTATION_CONTRACT = 'mock-reputation-engine-demo'
const ORACLE_CONTRACT = 'mock-oracle-demo'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// APR in BPS -> readable string
function formatRate(bps) {
    return (bps / 100).toFixed(2) + '% APR'
}

// VUSD micro-units -> display
function formatVusd(amount) {
    if (!amount) return '0 VUSD'
    return (Number(amount) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' VUSD'
}

// sBTC sats -> display
function formatSbtc(sats) {
    return (Number(sats) / 1e8).toFixed(6) + ' sBTC'
}

// duration in blocks -> human readable
function formatDuration(blocks) {
    const days = Math.round(blocks / 144)
    return days < 1 ? `${blocks} blocks` : `${days} day${days > 1 ? 's' : ''}`
}

function OfferRow({ offer, onFillPending, onFillSuccess, onFillFailed }) {
    const { address } = useWallet()
    const [filling, setFilling] = useState(false)

    async function handleFill() {
        if (!address) {
            alert('Please connect your wallet first')
            return
        }

        // sBTC balance check
        try {
            const sbtcRes = await fetchCallReadOnlyFunction({
                network: 'testnet',
                contractAddress: DEPLOYER,
                contractName: SBTC_CONTRACT,
                functionName: 'get-balance',
                functionArgs: [Cl.principal(address)],
                senderAddress: address,
            })
            const sbtcBalance = Number(cvToJSON(sbtcRes).value?.value || 0)
            if (sbtcBalance === 0) {
                alert('You need sBTC collateral to fill this offer. Go to the Faucet to mint testnet tokens first.')
                return
            }
        } catch (e) {
            console.error('sBTC balance check failed:', e)
        }

        setFilling(true)
        try {
            console.log('Building fill-offer tx:', {
                offerId: offer.offerId,
                address: address,
            })

            await openContractCall({
                contractAddress: DEPLOYER,
                contractName: P2P_CONTRACT,
                functionName: 'fill-offer',
                functionArgs: [
                    Cl.uint(offer.offerId),
                    Cl.uint(offer.minDuration || 144),
                    Cl.contractPrincipal(DEPLOYER, SBTC_CONTRACT),
                    Cl.contractPrincipal(DEPLOYER, VUSD_CONTRACT),
                    Cl.contractPrincipal(DEPLOYER, REPUTATION_CONTRACT),
                    Cl.contractPrincipal(DEPLOYER, ORACLE_CONTRACT),
                ],
                network: NETWORK_STRING,
                postConditionMode: PostConditionMode.Allow,
                onFinish: (data) => {
                    onFillPending(data.txId)
                    pollTx(data.txId, {
                        setIsTxPending: setFilling,
                        onConfirmed: (txId) => {
                            onFillSuccess(txId, offer)
                        },
                        onFailed: (txId, reason) => {
                            onFillFailed(txId, reason)
                        }
                    })
                },
                onCancel: () => {
                    setFilling(false)
                    console.log('User cancelled fill')
                },
            })
        } catch (e) {
            console.error('Fill error:', e)
            setFilling(false)
        }
    }

    return (
        <tr className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
            <td className="px-4 py-3 text-sm font-mono text-zinc-500">#{offer.offerId}</td>
            <td className="px-4 py-3 text-sm font-mono text-zinc-500 hidden md:table-cell">
                {offer.lender.slice(0, 8)}...{offer.lender.slice(-4)}
            </td>
            <td className="px-4 py-3">
                <span className="font-black mono text-zinc-900 dark:text-zinc-100">{formatVusd(offer.amount)}</span>
            </td>
            <td className="px-4 py-3">
                <span className="text-emerald-500 font-bold text-sm">{formatRate(offer.rateBps)}</span>
            </td>
            <td className="px-4 py-3 text-sm text-zinc-500 hidden lg:table-cell">
                {formatDuration(offer.minDuration)}
            </td>
            <td className="px-4 py-3">
                {offer.lender.toLowerCase() === address?.toLowerCase() ? (
                    <span className="px-3 py-1 bg-zinc-700 text-zinc-400 text-xs rounded-lg">Your Offer</span>
                ) : (
                    <button
                        id={`fill-offer-${offer.offerId}`}
                        onClick={handleFill}
                        disabled={filling}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90 disabled:opacity-40 transition-colors"
                    >
                        {filling ? 'Confirming...' : 'Fill Offer'}
                    </button>
                )}
            </td>
        </tr>
    )
}

function PostOfferPanel({ onOfferPosted, pendingTxId, setPendingTxId }) {
    const { isConnected } = useWallet()
    const [amount, setAmount] = useState('')
    const [rate, setRate] = useState('')
    const [duration, setDuration] = useState('144')
    const [posting, setPosting] = useState(false)
    const [confirmedTxId, setConfirmedTxId] = useState(null)
    const [failedReason, setFailedReason] = useState(null)

    async function handlePost() {
        if (!isConnected) { toast.error('Connect wallet first'); return }
        if (!amount || !rate) return
        const amountMicro = Math.round(parseFloat(amount) * 1e6)
        const rateBps = Math.round(parseFloat(rate) * 100)
        const durationBlocks = parseInt(duration)
        setPosting(true)
        try {
            await openContractCall({
                contractAddress: DEPLOYER,
                contractName: P2P_CONTRACT,
                functionName: 'post-offer',
                functionArgs: [
                    Cl.uint(amountMicro),
                    Cl.uint(rateBps),
                    Cl.uint(durationBlocks),
                    Cl.contractPrincipal(DEPLOYER, VUSD_CONTRACT),
                ],
                postConditionMode: PostConditionMode.Allow,
                postConditions: [],
                network: NETWORK_STRING,
                onFinish: (data) => {
                    setPendingTxId(data.txId)
                    pollTx(data.txId, {
                        setIsTxPending: setPosting,
                        onConfirmed: (txId) => {
                            setPendingTxId(null)
                            setConfirmedTxId(txId)
                            onOfferPosted?.()
                        },
                        onFailed: (txId, reason) => {
                            setPendingTxId(null)
                            setFailedReason(reason)
                        }
                    })
                    setAmount(''); setRate('')
                },
                onCancel: () => toast('Cancelled'),
            })
        } catch (e) {
            toast.error('Failed to post offer')
        } finally {
            setPosting(false)
        }
    }

    const DURATION_PRESETS = [
        { label: '1 day', blocks: '144' },
        { label: '7 days', blocks: '1008' },
        { label: '30 days', blocks: '4320' },
        { label: '90 days', blocks: '12960' },
    ]

    return (
        <div className="card p-6 space-y-5">
            <TxSuccessModal 
                isOpen={!!confirmedTxId}
                onClose={() => setConfirmedTxId(null)}
                txId={confirmedTxId}
                title="Offer Posted"
                subtitle="Your loan offer is now live in the order book."
                details={[
                    { label: 'Amount', value: `${amount} VUSD` },
                    { label: 'Rate', value: `${rate}% APR` }
                ]}
            />

            <TxFailedModal 
                isOpen={!!failedReason}
                onClose={() => setFailedReason(null)}
                error={failedReason}
            />
            <div>
                <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100">Post a Loan Offer</h3>
                <p className="text-sm text-zinc-500 mt-1">Lock VUSD in the contract at your desired rate. Borrowers fill your offer with sBTC collateral.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">VUSD Amount</label>
                    <div className="flex items-center gap-2 card px-3 py-2 border-2 focus-within:border-primary/40 transition-colors">
                        <input type="number" min="0" step="1" placeholder="0"
                            value={amount} onChange={e => setAmount(e.target.value)}
                            className="flex-1 bg-transparent mono font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600" />
                        <span className="text-xs font-bold text-zinc-400">VUSD</span>
                    </div>
                </div>
                <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">Interest Rate (% APR)</label>
                    <div className="flex items-center gap-2 card px-3 py-2 border-2 focus-within:border-primary/40 transition-colors">
                        <input type="number" min="0.01" step="0.01" placeholder="5.00"
                            value={rate} onChange={e => setRate(e.target.value)}
                            className="flex-1 bg-transparent mono font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600" />
                        <span className="text-xs font-bold text-zinc-400">%</span>
                    </div>
                </div>
            </div>
            <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">Min Loan Duration</label>
                <div className="flex gap-2 flex-wrap">
                    {DURATION_PRESETS.map(p => (
                        <button key={p.blocks} onClick={() => setDuration(p.blocks)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${duration === p.blocks ? 'bg-primary text-white border-primary' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>
            {amount && rate && (
                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 flex items-center justify-between text-sm">
                    <span className="text-zinc-500">You earn at {parseFloat(rate).toFixed(2)}% APR</span>
                    <span className="font-black text-emerald-600 dark:text-emerald-400">
                        ~{formatVusd(parseFloat(amount) * parseFloat(rate) / 100 * 1e6)} / yr
                    </span>
                </div>
            )}
            <button id="post-offer-btn" onClick={handlePost} disabled={posting || !amount || !rate}
                className="w-full py-3 rounded-xl font-black text-sm bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                {posting
                    ? <><span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>Submitting...</>
                    : <><span className="material-symbols-outlined text-[18px]">add_circle</span>Post Offer</>}
            </button>
        </div>
    )
}

export default function P2PMarket() {
    const [tab, setTab] = useState('offers')
    const [offers, setOffers] = useState([])
    const [loading, setLoading] = useState(false)
    const [offersLoading, setOffersLoading] = useState(true)
    const [pendingTxId, setPendingTxId] = useState(null)
    const [fillTxModal, setFillTxModal] = useState({ type: null, txId: null, reason: null, offer: null })
    const [myLoans, setMyLoans] = useState([])

    const { address } = useWallet()

    const fetchLiveOffers = async () => {
        try {
            setLoading(true)
            const offerPromises = Array.from(
                { length: 15 }, 
                (_, i) => fetchCallReadOnlyFunction({
                    network: 'testnet',
                    contractAddress: DEPLOYER,
                    contractName: 'p2p-matching-demo',
                    functionName: 'get-offer',
                    functionArgs: [Cl.uint(i + 1)],
                    senderAddress: address || DEPLOYER,
                }).catch(() => null)
            )
            
            const results = await Promise.all(offerPromises)
            console.log('Raw offer 1 result:', JSON.stringify(cvToJSON(results[0]), null, 2))
            const parsed = []
            
            results.forEach((res, i) => {
                if (!res) return
                try {
                    const json = cvToJSON(res)
                    const offer = json?.value?.value
                    if (!offer) return
                    const isActive = offer?.active?.value || offer?.['is-active']?.value
                    if (!isActive) return
                    parsed.push({
                        offerId: i + 1,
                        amount: Number(offer?.amount?.value ?? 0),
                        rateBps: Number(offer?.['rate-bps']?.value || offer?.rate?.value || 0),
                        lender: offer?.lender?.value ?? '',
                        minDuration: Number(offer?.['min-duration']?.value ?? 0),
                        active: true,
                    })
                } catch (e) {}
            })
            
            setOffers(parsed)
            setOffersLoading(false)
        } catch (e) {
            console.error('fetchLiveOffers error:', e)
        } finally {
            setLoading(false)
        }
    }

    const fetchMyLoans = async () => {
        if (!address) return
        try {
            const loanPromises = Array.from(
                { length: 15 },
                (_, i) => fetchCallReadOnlyFunction({
                    network: 'testnet',
                    contractAddress: DEPLOYER,
                    contractName: P2P_CONTRACT,
                    functionName: 'get-loan',
                    functionArgs: [Cl.uint(i + 1)],
                    senderAddress: address,
                }).catch(() => null)
            )
            const results = await Promise.all(loanPromises)
            console.log('Raw loan check offer 1:', JSON.stringify(cvToJSON(results[0]), null, 2))
            const loans = []
            results.forEach((res, i) => {
                if (!res) return
                try {
                    const json = cvToJSON(res)
                    const loan = json?.value?.value
                    if (!loan) return
                    const borrower = loan?.borrower?.value
                    const repaid = loan?.repaid?.value
                    console.log(`Loan ${i+1}:`, {
                        borrower,
                        repaid,
                        myAddress: address
                    })
                    if (borrower && borrower.toLowerCase() === address.toLowerCase()) {
                        loans.push({
                            loanId: i + 1,
                            amount: Number(loan?.amount?.value ?? 0),
                            rateBps: Number(loan?.['rate-bps']?.value ?? 0),
                            lender: loan?.lender?.value ?? '',
                            collateral: Number(loan?.collateral?.value ?? 0),
                            dueBlock: Number(loan?.['due-block']?.value ?? 0),
                            isActive: !loan?.repaid?.value,
                        })
                    }
                } catch (e) {}
            })
            setMyLoans(loans)
        } catch (e) {
            console.error('fetchMyLoans error:', e)
        }
    }

    const handleRepayLoan = async (loanId, amount) => {
        if (!address) return
        try {
            await openContractCall({
                network: 'testnet',
                contractAddress: DEPLOYER,
                contractName: P2P_CONTRACT,
                functionName: 'repay-loan',
                functionArgs: [
                    Cl.uint(loanId),
                    Cl.contractPrincipal(DEPLOYER, VUSD_CONTRACT),
                    Cl.contractPrincipal(DEPLOYER, SBTC_CONTRACT),
                ],
                postConditionMode: PostConditionMode.Allow,
                onFinish: (data) => {
                    setFillTxModal({ type: 'pending', txId: data.txId })
                    pollTx(data.txId, {
                        onConfirmed: (txId) => {
                            setFillTxModal({ 
                                type: 'success', 
                                txId,
                                title: 'Loan Repaid',
                                description: 'Your loan has been fully repaid.',
                                details: {
                                    'Amount Repaid': `${(amount / 1_000_000).toFixed(2)} VUSD`,
                                    'Loan ID': `#${loanId}`,
                                    'Status': 'Closed'
                                }
                            })
                            setTimeout(() => fetchMyLoans(), 5000)
                        },
                        onFailed: (txId, reason) => {
                            setFillTxModal({ type: 'failed', txId, reason })
                        }
                    })
                }
            })
        } catch (e) {
            console.error('Repay error:', e)
            toast.error('Failed to initiate repayment')
        }
    }

    useEffect(() => {
        fetchLiveOffers()
        fetchMyLoans()
    }, [address])

    const tabs = [
        { id: 'offers', label: 'Offer Book', icon: 'local_offer' },
        { id: 'post', label: 'Post Offer', icon: 'add_circle' },
        { id: 'loans', label: 'My Loans', icon: 'account_balance' },
    ]

    return (
        <div className="p-8 space-y-8 max-w-5xl">
            <header className="max-w-3xl">
                <h1 className="text-4xl lg:text-5xl font-black text-zinc-900 dark:text-zinc-100 mb-3 tracking-tight">
                    Peer-to-Peer <span className="text-primary">Loan Market</span>
                </h1>
                <p className="text-lg text-zinc-500 dark:text-zinc-400">
                    Morpho-style order book. Lenders post VUSD offers at their desired rate.
                    Borrowers fill instantly by locking sBTC collateral. No intermediary, fully on-chain.
                </p>
            </header>

            {/* Stats strip */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: 'Active Offers', value: offers.filter(o => o.active).length.toString(), icon: 'local_offer', color: 'text-primary' },
                    { label: 'Total VUSD Listed', value: formatVusd(offers.reduce((s, o) => s + o.amount, 0)), icon: 'payments', color: 'text-emerald-500' },
                    { label: 'Avg Rate', value: offers.length ? formatRate(Math.round(offers.reduce((s, o) => s + o.rateBps, 0) / offers.length)) : '—', icon: 'percent', color: 'text-indigo-500' },
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

            <div className="flex justify-end mb-2">
                <button
                    onClick={() => {
                        fetchLiveOffers()
                    }}
                    className="flex items-center gap-1 text-xs font-bold text-zinc-400 hover:text-primary transition-colors">
                    <span className="material-symbols-outlined text-sm">refresh</span>
                    Refresh Offers
                </button>
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
                {tabs.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>
                        <span className="material-symbols-outlined text-[16px]">{t.icon}</span>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Offer Book tab */}
            {tab === 'offers' && (
                <div className="card overflow-hidden">
                    {loading ? (
                        <div className="text-center py-12 text-zinc-400">
                            <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full mx-auto mb-3"></div>
                            <p>Loading offers...</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                                    {['ID', 'Lender', 'Amount', 'Rate', 'Min Duration', ''].map(h => (
                                        <th key={h} className={`px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400 ${h === 'Lender' ? 'hidden md:table-cell' : ''} ${h === 'Min Duration' ? 'hidden lg:table-cell' : ''}`}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {offers.map(o => (
                                    <OfferRow 
                                        key={o.offerId} 
                                        offer={o} 
                                        onFillPending={(txId) => setFillTxModal({ type: 'pending', txId, offer: o })}
                                        onFillSuccess={(txId, offer) => {
                                            setFillTxModal({ 
                                                type: 'success', 
                                                txId, 
                                                title: "Offer Filled",
                                                description: "Loan matched directly on-chain.",
                                                details: {
                                                    'Offer ID': `#${offer.offerId}`,
                                                    'Amount': formatVusd(offer.amount),
                                                    'Rate': formatRate(offer.rateBps)
                                                }
                                            })
                                            setTimeout(() => {
                                                fetchLiveOffers()
                                                setTimeout(() => fetchMyLoans(), 5000)
                                            }, 1000)
                                        }}
                                        onFillFailed={(txId, reason) => setFillTxModal({ type: 'failed', txId, reason })}
                                    />
                                ))}
                                {offers.length === 0 && (
                                    <tr><td colSpan={6} className="px-4 py-12 text-center text-zinc-400 text-sm">No active offers. Be the first to post one!</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
                </div>
            )}

            {/* Post Offer tab */}
            {tab === 'post' && <PostOfferPanel onOfferPosted={() => {
                fetchLiveOffers()
            }} pendingTxId={pendingTxId} setPendingTxId={setPendingTxId} />}

            {/* Fill Offer flow modals */}
            <TxPendingModal isOpen={fillTxModal.type === 'pending'} txId={fillTxModal.txId} />
            <TxSuccessModal 
                isOpen={fillTxModal.type === 'success'} 
                txId={fillTxModal.txId}
                onClose={() => setFillTxModal({ type: null })}
                title={fillTxModal.title ?? "Success!"}
                description={fillTxModal.description ?? ""}
                details={fillTxModal.details ?? {}}
            />
            <TxFailedModal 
                isOpen={fillTxModal.type === 'failed'}
                txId={fillTxModal.txId}
                error={fillTxModal.reason}
                onClose={() => setFillTxModal({ type: null })} 
            />

            <TxPendingModal isOpen={!!pendingTxId} txId={pendingTxId} />

            {/* My Loans tab */}
            {tab === 'loans' && (
                myLoans.length === 0 ? (
                    <div className="card p-8 flex flex-col items-center gap-4 text-center">
                        <div className="w-16 h-16 rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center">
                            <span className="material-symbols-outlined text-3xl text-zinc-300">account_balance</span>
                        </div>
                        <div>
                            <h3 className="font-black text-zinc-900 dark:text-zinc-100 mb-1">No Active Loans</h3>
                            <p className="text-sm text-zinc-400">Connect your wallet and fill an offer to see your loans here.</p>
                        </div>
                    </div>
                ) : (
                    <div className="card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                                        {['Loan ID', 'Amount', 'Rate', 'Lender', 'Status', 'Action'].map(h => (
                                            <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {myLoans.map(loan => (
                                        <tr key={loan.loanId} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                                            <td className="px-4 py-3 text-sm font-mono text-zinc-500">#{loan.loanId}</td>
                                            <td className="px-4 py-3 font-black mono text-zinc-900 dark:text-zinc-100">
                                                {(loan.amount / 1_000_000).toFixed(2)} VUSD
                                            </td>
                                            <td className="px-4 py-3 text-emerald-500 font-bold text-sm">
                                                {(loan.rateBps / 100).toFixed(2)}% APR
                                            </td>
                                            <td className="px-4 py-3 text-sm font-mono text-zinc-500">
                                                {loan.lender.slice(0, 8)}...{loan.lender.slice(-4)}
                                            </td>
                                            <td className="px-4 py-3">
                                                {loan.isActive ? (
                                                    <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-wider">
                                                        Active
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-1 rounded bg-zinc-500/10 text-zinc-500 text-[10px] font-black uppercase tracking-wider">
                                                        Repaid
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {loan.isActive && (
                                                    <button
                                                        onClick={() => handleRepayLoan(loan.loanId, loan.amount)}
                                                        className="px-3 py-1 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-all"
                                                    >
                                                        Repay
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            )}

            {/* Info box */}
            <div className="p-5 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 flex items-start gap-4">
                <span className="material-symbols-outlined text-primary shrink-0 mt-0.5">info</span>
                <div>
                    <h4 className="font-bold text-zinc-900 dark:text-zinc-100 mb-1">How P2P Matching Works</h4>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Lenders post VUSD into the <code className="text-xs bg-zinc-100 dark:bg-zinc-800 px-1 rounded">p2p-matching</code> contract at their desired rate.
                        Borrowers lock sBTC as collateral (≥ 150% LTV) and receive VUSD instantly.
                        Loans earning interest block-by-block. Overdue loans can be permissionlessly liquidated —
                        the liquidator receives a 5% sBTC bonus.
                    </p>
                </div>
            </div>
        </div>
    )
}
