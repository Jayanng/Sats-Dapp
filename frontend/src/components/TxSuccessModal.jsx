import React from 'react'

/**
 * Standardized Success Modal for transactions
 */
export default function TxSuccessModal({ 
    isOpen, 
    onClose, 
    txId, 
    title = "Transaction Confirmed", 
    description,
    subtitle,
    details = {}, 
    explorerUrl 
}) {
    if (!isOpen) return null

    const url = explorerUrl || `https://explorer.hiro.so/txid/${txId}?chain=testnet`
    const displayDescription = description || subtitle || "Your transaction has been successfully confirmed on-chain."

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
                        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">{displayDescription}</p>
                    </div>

                    {/* Summary card */}
                    {((Array.isArray(details) && details.length > 0) || (details && !Array.isArray(details) && Object.keys(details).length > 0)) && (
                        <div className="w-full bg-zinc-50 dark:bg-zinc-800/60 rounded-xl p-4 space-y-2 text-sm text-left border border-zinc-100 dark:border-zinc-700">
                            {Array.isArray(details) ? (
                                details.map((detail, idx) => (
                                    <div key={idx} className="flex justify-between">
                                        <span className="text-zinc-500 dark:text-zinc-400">{detail.label}</span>
                                        <span className="text-zinc-900 dark:text-white font-black mono text-right">
                                            {detail.value}
                                        </span>
                                    </div>
                                ))
                            ) : (
                                Object.entries(details).map(([key, value]) => (
                                    <div key={key} className="flex justify-between">
                                        <span className="text-zinc-500 dark:text-zinc-400">{key}</span>
                                        <span className="text-zinc-900 dark:text-white font-black mono text-right">
                                            {value}
                                        </span>
                                    </div>
                                ))
                            )}
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
