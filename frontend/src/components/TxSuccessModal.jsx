import React from 'react'

/**
 * Standardized Success Modal for transactions
 */
export default function TxSuccessModal({ 
    isOpen, 
    onClose, 
    txId, 
    title = "Transaction Confirmed!", 
    subtitle = "Your transaction has been successfully confirmed on-chain.", 
    details = [], 
    explorerUrl 
}) {
    if (!isOpen) return null

    const url = explorerUrl || `https://explorer.hiro.so/txid/${txId}?chain=testnet`

    return (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            {/* Panel */}
            <div className="relative w-full max-w-md card p-0 overflow-hidden shadow-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
                onClick={(e) => e.stopPropagation()}>
                
                <div className="flex flex-col items-center justify-center px-8 py-12 text-center gap-5">
                    {/* Animated checkmark */}
                    <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500 flex items-center justify-center animate-bounce">
                        <span className="material-symbols-outlined text-emerald-500 text-4xl">check_circle</span>
                    </div>

                    <div>
                        <h2 className="text-2xl font-black text-zinc-900 dark:text-zinc-100">{title}</h2>
                        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">{subtitle}</p>
                    </div>

                    {/* Summary card */}
                    {details.length > 0 && (
                        <div className="w-full rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-4 space-y-2 text-left">
                            {details.map((detail, idx) => (
                                <div key={idx} className="flex justify-between text-sm">
                                    <span className="text-zinc-500 dark:text-zinc-400">{detail.label}</span>
                                    <span className="font-black mono text-zinc-900 dark:text-zinc-100">{detail.value}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Explorer link */}
                    <a
                        href={url}
                        target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 text-sm font-bold text-primary hover:underline">
                        <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                        View Transaction on Explorer
                    </a>

                    <button
                        onClick={onClose}
                        className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-black rounded-xl transition-all shadow-lg shadow-primary/20">
                        Done
                    </button>
                </div>
            </div>
        </div>
    )
}
