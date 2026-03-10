import React from 'react'

/**
 * Standardized Failure Modal for transactions
 */
export default function TxFailedModal({ 
    isOpen, 
    onClose, 
    txId, 
    title = "Transaction Failed", 
    error = "Unknown error occurred.", 
    explorerUrl 
}) {
    if (!isOpen) return null

    const url = explorerUrl || (txId ? `https://explorer.hiro.so/txid/${txId}?chain=testnet` : null)

    return (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            {/* Panel */}
            <div className="relative w-full max-w-md card p-0 overflow-hidden shadow-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
                onClick={(e) => e.stopPropagation()}>
                
                <div className="flex flex-col items-center justify-center px-8 py-12 text-center gap-5">
                    {/* Failure icon */}
                    <div className="w-20 h-20 rounded-full bg-red-500/10 border-2 border-red-500 flex items-center justify-center">
                        <span className="material-symbols-outlined text-red-500 text-4xl">cancel</span>
                    </div>

                    <div>
                        <h2 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">{title}</h2>
                        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">Something went wrong with your transaction.</p>
                    </div>

                    {/* Error details */}
                    <div className="w-full rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 p-4 text-left">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-red-400 mb-1">Error Reason</p>
                        <p className="font-mono text-sm text-red-600 dark:text-red-400 break-all">{error}</p>
                    </div>

                    {/* Explorer link */}
                    {url && (
                        <a
                            href={url}
                            target="_blank" rel="noreferrer"
                            className="flex items-center gap-2 text-sm font-bold text-primary hover:underline">
                            <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                            View on Explorer
                        </a>
                    )}

                    <button
                        onClick={onClose}
                        className="w-full py-3 bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 text-white font-black rounded-xl transition-all shadow-lg">
                        Close
                    </button>
                </div>
            </div>
        </div>
    )
}
