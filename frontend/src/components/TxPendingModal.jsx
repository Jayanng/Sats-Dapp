import React from 'react'

/**
 * Standardized High-Quality Pending Transaction Modal
 * Shows up after user signs in Leather/Xverse and before block confirmation.
 */
export default function TxPendingModal({ isOpen, title = "Transaction Pending" }) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Panel */}
            <div className="relative w-full max-w-md card p-0 overflow-hidden shadow-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 animate-in fade-in zoom-in duration-300">
                
                {/* Progress bar at the very top */}
                <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <div className="h-full bg-primary animate-progress-loading w-1/3 rounded-full" />
                </div>

                <div className="flex flex-col items-center justify-center px-8 py-12 text-center gap-6">
                    {/* Spinning Hourglass Icon */}
                    <div className="relative">
                        <div className="w-24 h-24 rounded-full border-4 border-primary/20 flex items-center justify-center">
                            <span className="material-symbols-outlined text-primary text-5xl animate-pulse">hourglass_empty</span>
                        </div>
                        <div className="absolute inset-0 border-4 border-transparent border-t-primary rounded-full animate-spin" />
                    </div>

                    <div className="space-y-2">
                        <h2 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">
                            {title}
                        </h2>
                        <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed max-w-[280px] mx-auto">
                            Waiting for the Stacks network to confirm your transaction on the blockchain.
                        </p>
                    </div>

                    {/* Simple Status Row */}
                    <div className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 p-4">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-zinc-500 dark:text-zinc-400">Network</span>
                            <span className="font-black mono text-zinc-900 dark:text-zinc-100">Stacks Testnet</span>
                        </div>
                    </div>

                    <p className="text-[10px] text-zinc-400 font-medium">
                        It usually takes 3-10 minutes for block confirmation. <br/>
                        You can safely stay on this page.
                    </p>
                </div>
            </div>
        </div>
    )
}
