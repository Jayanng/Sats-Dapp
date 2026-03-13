import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { Sun, Moon, Bitcoin, LayoutDashboard, LineChart, Zap, Shield, Droplet, Handshake } from 'lucide-react'
import { HIRO_API } from '../../lib/stacks'

const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/markets', label: 'Markets', icon: LineChart },
    { to: '/optimizer', label: 'Optimizer Vaults', icon: Zap },
    { to: '/p2p', label: 'P2P Market', icon: Handshake },
    { to: '/risk', label: 'Risk Modules', icon: Shield },
    { to: '/faucet', label: 'Faucet', icon: Droplet },
]

async function fetchBlockHeight() {
    const res = await fetch(`${HIRO_API}/v2/info`, { headers: { 'x-api-key': 'd0a95c5d7d15cc7ad23d37ded6b5fd22' } })
    const data = await res.json()
    return data.stacks_tip_height ?? null
}

export default function Sidebar({ isDarkMode, toggleTheme }) {
    const [blockHeight, setBlockHeight] = useState(null)

    useEffect(() => {
        // Initial fetch
        fetchBlockHeight().then(setBlockHeight).catch(() => { })

        // Refresh every 30 s (new Stacks block ~every 10 min, but API updates more often)
        const id = setInterval(() => {
            fetchBlockHeight().then(setBlockHeight).catch(() => { })
        }, 30_000)

        return () => clearInterval(id)
    }, [])

    return (
        <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">

            {/* Logo */}
            <div className="flex items-center gap-3 px-5 py-6">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
                    <Bitcoin className="h-5 w-5 text-white" />
                </div>
                <span className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                    Satoshi Vaults
                </span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-0.5 px-3">
                {navItems.map(({ to, label, icon: Icon }) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={to === '/'}
                        className={({ isActive }) =>
                            [
                                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                                isActive
                                    ? 'bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary'
                                    : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100',
                            ].join(' ')
                        }
                    >
                        {({ isActive }) => (
                            <>
                                <Icon
                                    className={[
                                        'h-4 w-4 shrink-0 transition-colors',
                                        isActive
                                            ? 'text-primary'
                                            : 'text-zinc-400 group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-300',
                                    ].join(' ')}
                                />
                                {label}
                            </>
                        )}
                    </NavLink>
                ))}
            </nav>

            {/* Bottom controls */}
            <div className="border-t border-zinc-200 px-3 py-4 dark:border-zinc-800 space-y-2">
                {/* Block height — live from Hiro testnet */}
                <div className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2">
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <span className="text-xs font-medium text-zinc-600 dark:text-slate-400 truncate">
                        Stacks Block: {blockHeight != null ? blockHeight.toLocaleString() : '—'}
                    </span>
                </div>
                {/* Bell + Toggle */}
                <div className="flex gap-2">
                    <button className="flex-1 flex items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all">
                        <span className="material-symbols-outlined text-[18px] text-zinc-500 dark:text-slate-400">notifications</span>
                    </button>
                    <button
                        onClick={toggleTheme}
                        aria-label="Toggle dark mode"
                        className="flex-1 flex items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-300 transition-all"
                    >
                        {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    </button>
                </div>
            </div>
        </aside>
    )
}
