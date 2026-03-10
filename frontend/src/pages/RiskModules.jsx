import { useState, useEffect } from 'react'
import { fetchCallReadOnlyFunction, cvToJSON, Cl } from '@stacks/transactions'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { LENDING_CONTRACT_ADDRESS, FALLBACK_BTC_PRICE } from '../lib/stacks'

const CONTRACT_ADDRESS = LENDING_CONTRACT_ADDRESS

// ── Plug data ───────────────────────────────────────────────────
const INITIAL_PLUGS = [
    { id: 1, icon: 'history', title: 'PoX Stacking History', description: 'Proof of Transfer participation increases capital efficiency by up to 15%.', label: 'Impact', value: '-25% Required Ratio', scoreBonus: 200, connected: true },
    { id: 2, icon: 'payments', title: 'Arkadiko Repayment History', description: 'Connect Arkadiko history to prove long-term solvency in decentralized markets.', label: 'Potential', value: '-10% Required Ratio', scoreBonus: 80, connected: false },
    { id: 3, icon: 'calendar_today', title: 'Wallet Age', description: 'Account maturity > 2 years provides substantial trust bonuses for borrowing.', label: 'Impact', value: '-40% Required Ratio', scoreBonus: 320, connected: true },
]

// ── Collateral ratio formula ─────────────────────────────────────
// Score 0 -> 175%   Score 1000 -> 65%   (linear interpolation)
function calcRatio(score) {
    return Math.round(175 - (score / 1000) * 110)
}

function ScoreTier({ score }) {
    if (score >= 850) return <span className="text-emerald-500 font-bold">Elite</span>
    if (score >= 700) return <span className="text-primary font-bold">High</span>
    if (score >= 500) return <span className="text-yellow-500 font-bold">Medium</span>
    return <span className="text-red-500 font-bold">Low</span>
}

// Gauge arc helper -- strokeDashoffset for a circle r=70, circumference=440
function gaugeOffset(ratio) {
    const pct = Math.max(0, Math.min(1, (175 - ratio) / 110))
    return Math.round(440 * (1 - pct))
}

export default function RiskModules() {
    const { address } = useWallet()
    const [plugs, setPlugs] = useState(INITIAL_PLUGS)
    const [sliderScore, setSliderScore] = useState(500)
    const [liveScore, setLiveScore] = useState(null)   // null = loading
    const [liveRatioBps, setLiveRatioBps] = useState(null)
    const [scoreLoading, setScoreLoading] = useState(false)
    const [repayCount, setRepayCount] = useState(0)
    const [liquidationCount, setLiquidationCount] = useState(0)
    const [lastUpdated, setLastUpdated] = useState(0)

    const navigate = useNavigate()

    // Fetch live score from reputation-score.clar and ratio from reputation-engine.clar
    useEffect(() => {
        if (!address) return
        setScoreLoading(true)

        async function fetchScore() {
            try {
                // Get full profile from reputation-score-demo
                const profileRes = await fetchCallReadOnlyFunction({
                    network: 'testnet',
                    contractAddress: CONTRACT_ADDRESS,
                    contractName: 'reputation-score-demo',
                    functionName: 'get-full-profile',
                    functionArgs: [Cl.principal(address)],
                    senderAddress: address,
                })
                const profile = cvToJSON(profileRes)?.value?.value
                const score = Number(profile?.score?.value ?? 500)
                const repayCount = Number(profile?.['repay-count']?.value ?? 0)
                const liquidationCount = Number(profile?.['liquidation-count']?.value ?? 0)
                const lastUpdated = Number(profile?.['last-updated']?.value ?? 0)
                
                setLiveScore(score)
                setSliderScore(score)
                setRepayCount(repayCount)
                setLiquidationCount(liquidationCount)
                setLastUpdated(lastUpdated)
                
                // Also get required collateral ratio from mock-reputation-engine-demo
                const ratioRes = await fetchCallReadOnlyFunction({
                    network: 'testnet',
                    contractAddress: CONTRACT_ADDRESS,
                    contractName: 'mock-reputation-engine-demo',
                    functionName: 'get-required-collateral',
                    functionArgs: [Cl.principal(address)],
                    senderAddress: address,
                })
                const ratioBps = Number(cvToJSON(ratioRes)?.value?.value ?? 15000)
                setLiveRatioBps(ratioBps)
            } catch (err) {
                console.warn('Score fetch failed:', err)
            } finally {
                setScoreLoading(false)
            }
        }

        fetchScore()
    }, [address])

    // Change 5: Make Risk Plugs score-aware
    useEffect(() => {
        if (liveScore === null) return
        const bonusFromPlugs = plugs
            .filter(p => p.connected)
            .reduce((sum, p) => sum + p.scoreBonus, 0)
        const baseScore = Math.max(0, (liveScore ?? 500) - 
            INITIAL_PLUGS.filter(p => p.connected)
                .reduce((sum, p) => sum + p.scoreBonus, 0))
        const newScore = Math.min(1000, baseScore + bonusFromPlugs)
        setSliderScore(newScore)
    }, [plugs, liveScore])


    const togglePlug = (id) =>
        setPlugs((prev) => prev.map((p) => (p.id === id ? { ...p, connected: !p.connected } : p)))

    const activeCount = plugs.filter((p) => p.connected).length
    const required = calcRatio(sliderScore)
    const standard = 175
    const savings = standard - required
    const savingsPct = Math.round((savings / standard) * 100)
    const offset = gaugeOffset(required)

    // Calculate performance from real data
    const performanceText = repayCount > 0 
        ? `+${repayCount * 10} pts earned` 
        : 'No activity yet'
    const performanceSubtext = `${repayCount} repayments · ${liquidationCount} liquidations`

    // Yield bonus: 0% at score 0, up to 3% at score 1000
    const yieldBonus = ((liveScore ?? sliderScore) / 1000 * 3).toFixed(2)

    // Score tier colour for slider thumb fill
    const sliderColour = sliderScore >= 850 ? '#10b981' : sliderScore >= 700 ? '#F7931A' : sliderScore >= 500 ? '#eab308' : '#ef4444'

    return (
        <div className="p-8 space-y-8 max-w-7xl mx-auto">

            {/* ── Profile Overview ─────────────────────────── */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 card p-6 flex flex-col md:flex-row items-center gap-8">
                    <div className="relative shrink-0">
                        <div className="size-32 rounded-full border-4 border-primary/20 p-1">
                            <img className="w-full h-full rounded-full object-cover" alt="Abstract crypto identity avatar"
                                src="https://lh3.googleusercontent.com/aida-public/AB6AXuA4N6UbVpv1VUfrna4I7BAFkWAUddE1PdBsOwozbP2T-wKHt5E0KeOEzNdYCN_-637bQcLwEee9zqSLEJ8Z_jzd-iVsDvPv4ITX70h-jP_jEInDRxwuB3qC1lXOunhAN3mcsUsIG5n8CT2MLeJBBgPTz3uWOhBxxHTlwH_iRDbxky1JFVm0_UyOeAIILUrVucwpf6_ppT3lqIVSM0GOEaqru5CzegZLlBFXKkeJbvEK5aHxeTGMtSVnlG_8YUnCDBNaHiLn8oEFwH4" />
                        </div>
                        <div className="absolute -bottom-2 -right-2 bg-green-500 text-white p-1 rounded-full border-4 border-white dark:border-zinc-900">
                            <span className="material-symbols-outlined text-sm block">verified</span>
                        </div>
                    </div>
                    <div className="flex-1 text-center md:text-left">
                        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-2">
                            <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                                {address
                                    ? `${address.slice(0, 8)}...${address.slice(-4)}`
                                    : 'Connect Wallet'
                                }
                            </h3>
                            {lastUpdated > 0 && (
                                <p className="text-xs text-zinc-400 mt-1">
                                    Last activity: block #{lastUpdated}
                                </p>
                            )}
                            <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-xs font-bold rounded-full border border-green-200 dark:border-green-800 uppercase">
                                Trust Level: <ScoreTier score={sliderScore} />
                            </span>
                        </div>
                        <p className="text-zinc-500 mb-4 max-w-md">Your identity profile aggregates on-chain history to reduce collateral requirements across all vaults.</p>
                        <div className="flex flex-wrap justify-center md:justify-start gap-4">
                            <button className="px-6 py-2 bg-primary text-white font-bold rounded-xl text-sm hover:opacity-90 transition-opacity">Edit Portfolio</button>
                            <button className="px-6 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold rounded-xl text-sm border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">Sync Wallets</button>
                        </div>
                    </div>
                </div>
                <div className="bg-primary p-6 rounded-xl flex flex-col justify-between text-white relative overflow-hidden group">
                    <div className="absolute -right-8 -top-8 size-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all"></div>
                    <div>
                        <p className="text-sm font-medium text-white/80 mb-1">On-Chain Trust Score</p>
                        {scoreLoading ? (
                            <h4 className="text-4xl font-black opacity-60">...</h4>
                        ) : (
                            <h4 className="text-4xl font-black">
                                {liveScore !== null ? liveScore : sliderScore}
                                <span className="text-xl font-medium text-white/60"> / 1000</span>
                                {liveScore !== null && (
                                    <span className="ml-2 text-xs bg-white/20 px-2 py-0.5 rounded-full font-normal">LIVE</span>
                                )}
                            </h4>
                        )}
                    </div>
                    <div className="mt-6 flex items-end justify-between">
                        <div>
                            <p className="text-xs font-bold text-white/70 uppercase tracking-widest">
                                On-Chain Activity
                            </p>
                            <p className="text-lg font-bold">
                                {performanceText}
                                <span className="text-sm font-normal opacity-80 ml-1">
                                    {performanceSubtext}
                                </span>
                            </p>
                        </div>
                        <span className="material-symbols-outlined text-4xl opacity-50">analytics</span>
                    </div>
                </div>
            </section>

            {/* ── Risk Plugs + Collateral Calculator ─────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

                {/* Risk Plugs */}
                <div className="xl:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                            <span className="material-symbols-outlined text-primary">power</span>Risk Plugs
                        </h3>
                        <span className="text-sm text-zinc-500">{activeCount} Plug{activeCount !== 1 ? 's' : ''} Active</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {plugs.map((plug) => (
                            <div key={plug.id} onClick={() => togglePlug(plug.id)}
                                className={`p-5 card cursor-pointer transition-all ${plug.connected ? 'border-2 border-primary/30 hover:border-primary/60' : 'border-2 border-zinc-200 dark:border-zinc-800 opacity-60 hover:opacity-100'}`}>
                                <div className="flex justify-between items-start mb-4">
                                    <div className={`size-10 rounded-lg flex items-center justify-center ${plug.connected ? 'bg-primary/10 text-primary' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'}`}>
                                        <span className="material-symbols-outlined">{plug.icon}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${plug.connected ? 'text-green-500 bg-green-50 dark:bg-green-900/20' : 'text-zinc-400 bg-zinc-50 dark:bg-zinc-800'}`}>
                                            {plug.connected ? 'Connected' : 'Disconnected'}
                                        </span>
                                        <div className={`w-10 h-6 rounded-full relative p-1 transition-colors ${plug.connected ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-700'}`}>
                                            <div className={`size-4 bg-white rounded-full absolute top-1 transition-all shadow-sm ${plug.connected ? 'right-1' : 'left-1'}`}></div>
                                        </div>
                                    </div>
                                </div>
                                <h4 className="font-bold mb-1 text-zinc-900 dark:text-zinc-100">{plug.title}</h4>
                                <p className="text-xs text-zinc-500 leading-relaxed">{plug.description}</p>
                                <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-between">
                                    <span className="text-[10px] font-bold text-zinc-400 uppercase">{plug.label}</span>
                                    <span className={`text-[10px] font-bold ${plug.connected ? 'text-primary' : 'text-zinc-400'}`}>{plug.value}</span>
                                </div>
                            </div>
                        ))}
                        <div className="p-5 bg-zinc-50 dark:bg-zinc-900/30 rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center text-center group cursor-pointer hover:border-primary/40 transition-colors">
                            <span className="material-symbols-outlined text-3xl text-zinc-300 dark:text-zinc-700 group-hover:text-primary transition-colors">add_circle</span>
                            <p className="text-sm font-bold text-zinc-400 dark:text-zinc-600 mt-2">Explore more modules</p>
                        </div>
                    </div>
                </div>

                {/* ── Collateral Efficiency Calculator (Interactive) ── */}
                <div className="space-y-6">
                    <h3 className="text-lg font-bold flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                        <span className="material-symbols-outlined text-primary">calculate</span>
                        Collateral Efficiency
                    </h3>

                    <div className="card p-6 space-y-6">

                        {/* Gauge */}
                        <div className="relative h-44 flex items-center justify-center">
                            <svg className="size-40 -rotate-90" viewBox="0 0 160 160">
                                <circle className="text-zinc-100 dark:text-zinc-800" cx="80" cy="80" fill="transparent" r="70" stroke="currentColor" strokeWidth="12" />
                                <circle
                                    cx="80" cy="80" fill="transparent" r="70"
                                    stroke={sliderColour}
                                    strokeDasharray="440"
                                    strokeDashoffset={offset}
                                    strokeWidth="12"
                                    style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.4s ease' }}
                                />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-4xl font-black mono transition-all duration-300" style={{ color: sliderColour }}>{required}%</span>
                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tight">Required Ratio</span>
                            </div>
                        </div>

                        {/* Slider */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Trust Score</span>
                                <div className="flex items-center gap-1.5">
                                    <span className="mono text-sm font-black text-zinc-900 dark:text-zinc-100">{sliderScore}</span>
                                    <span className="text-xs">/</span>
                                    <span className="text-xs text-zinc-400">1000</span>
                                    <span className="text-xs ml-1"><ScoreTier score={sliderScore} /></span>
                                </div>
                            </div>
                            <input
                                type="range" min="0" max="1000" value={sliderScore}
                                onChange={(e) => setSliderScore(Number(e.target.value))}
                                className="score-slider w-full cursor-pointer"
                                style={{ '--thumb-color': sliderColour }}
                            />
                            <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
                                <span>0 — High Risk</span><span>1000 — Elite</span>
                            </div>
                        </div>

                        {/* Comparison table */}
                        <div className="space-y-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-zinc-500">Standard (no identity)</span>
                                <span className="font-bold line-through opacity-50 text-zinc-900 dark:text-zinc-100 mono">{standard}%</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-zinc-500">Your discounted ratio</span>
                                <span className="font-black mono transition-all duration-300" style={{ color: sliderColour }}>{required}%</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-zinc-500">Capital freed</span>
                                <span className="font-bold text-emerald-500 mono">
                                    {savings > 0 ? `-${savings}pp (${savingsPct}% less locked)` : 'No benefit yet'}
                                </span>
                            </div>
                        </div>

                        {/* Savings highlight bar */}
                        <div className="rounded-lg p-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                            <p className="text-[10px] text-zinc-500 uppercase font-bold mb-1.5">Capital Efficiency vs Standard</p>
                            <div className="w-full bg-zinc-200 dark:bg-zinc-700 h-2 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{ width: `${savingsPct}%`, backgroundColor: sliderColour }}
                                ></div>
                            </div>
                            <p className="text-right text-[10px] font-bold mt-1" style={{ color: sliderColour }}>{savingsPct}% saved</p>
                        </div>

                        <button 
                            onClick={() => navigate('/markets')}
                            className="w-full py-3.5 bg-zinc-900 dark:bg-primary text-white font-bold rounded-xl hover:shadow-lg hover:shadow-primary/20 transition-all text-sm">
                            Open Optimized Vault @ {required}%
                        </button>
                    </div>

                    {/* Yield bonus badge */}
                    <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 flex items-center gap-4">
                        <div className="size-10 bg-primary/20 rounded-full flex items-center justify-center text-primary shrink-0">
                            <span className="material-symbols-outlined text-xl">bolt</span>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-primary uppercase">Identity Yield Bonus</p>
                            <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                                +{yieldBonus}% APY Earned
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
