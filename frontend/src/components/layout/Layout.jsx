import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Wallet } from 'lucide-react'
import Sidebar from './Sidebar'
import { useWallet } from '../../context/WalletContext'

const PAGE_TITLES = {
    '/': 'Dashboard',
    '/markets': 'Markets',
    '/optimizer': 'Optimizer Vaults',
    '/p2p': 'P2P Market',
    '/risk': 'Risk Engine & Identity',
    '/faucet': 'Faucet & Setup',
}

export default function Layout() {
    const [isDarkMode, setIsDarkMode] = useState(true)
    const [showMenu, setShowMenu] = useState(false)
    const location = useLocation()
    const { isConnected, shortAddress, displayName, bns, stxBalance, connect, disconnect } = useWallet()

    const toggleTheme = () => setIsDarkMode((prev) => !prev)
    const pageTitle = PAGE_TITLES[location.pathname] ?? 'Satoshi Vaults'

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark')
        } else {
            document.documentElement.classList.remove('dark')
        }
    }, [isDarkMode])

    // Close dropdown on outside click
    useEffect(() => {
        if (!showMenu) return
        const handler = () => setShowMenu(false)
        window.addEventListener('click', handler)
        return () => window.removeEventListener('click', handler)
    }, [showMenu])

    return (
        <div className="flex min-h-screen">
            <Sidebar isDarkMode={isDarkMode} toggleTheme={toggleTheme} />

            <div className="ml-64 flex flex-1 flex-col bg-[#FAFAF9] dark:bg-background-dark">

                {/* ── Shared sticky page header ── */}
                <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-[#FAFAF9]/90 dark:bg-background-dark/90 px-8 py-4 backdrop-blur-md">
                    <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{pageTitle}</h2>

                    {/* ── Wallet button ── */}
                    {isConnected ? (
                        <div className="relative" onClick={e => e.stopPropagation()}>
                            <button
                                onClick={() => setShowMenu(v => !v)}
                                className="flex items-center gap-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 shadow-sm hover:border-primary/40 hover:text-primary transition-all">
                                <Wallet className="h-4 w-4 shrink-0 text-primary" />
                                <span className={bns ? 'text-xs font-bold' : 'font-mono text-xs'}>{displayName}</span>
                                {bns && <span className="text-[9px] font-black bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">BNS</span>}
                                {stxBalance !== null && (
                                    <span className="text-xs font-bold text-zinc-900 dark:text-white px-2 border-l border-zinc-200 dark:border-zinc-800 ml-1">
                                        {stxBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} STX
                                    </span>
                                )}
                                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse ml-1" />
                            </button>

                            {showMenu && (
                                <div className="absolute right-0 mt-2 w-48 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl overflow-hidden z-50">
                                    <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
                                        <p className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">Connected wallet</p>
                                        {bns && <p className="text-sm font-bold text-primary mt-0.5">{bns}</p>}
                                        <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400 mt-0.5">{shortAddress}</p>

                                        {stxBalance !== null && (
                                            <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                                                <p className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">Balance</p>
                                                <p className="text-sm font-bold text-zinc-900 dark:text-white">{stxBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} STX</p>
                                            </div>
                                        )}

                                        <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-amber-500">
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                            Testnet
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => { disconnect(); setShowMenu(false) }}
                                        className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors font-medium">
                                        <span className="material-symbols-outlined text-[16px]">logout</span>
                                        Disconnect
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <button
                            onClick={connect}
                            className="flex items-center gap-2.5 rounded-lg bg-primary hover:bg-primary/90 px-4 py-2 text-sm font-bold text-black shadow-md shadow-primary/20 transition-all">
                            <Wallet className="h-4 w-4 shrink-0" />
                            Connect Wallet
                        </button>
                    )}
                </header>

                <main className="flex-1 text-zinc-900 dark:text-zinc-100">
                    <Outlet context={{ isDarkMode, toggleTheme }} />
                </main>
            </div>
        </div>
    )
}
