
export async function pollTx(txId, { onConfirmed, onFailed, onTimeout, setIsTxPending }) {
    let attempts = 0
    const MAX = 30
    const interval = setInterval(async () => {
        attempts++
        try {
            const res = await fetch(`https://api.testnet.hiro.so/extended/v1/tx/${txId}`)
            if (!res.ok) return
            const tx = await res.json()
            const status = tx.tx_status
            const repr = tx.tx_result?.repr ?? ''

            if (status === 'success' || repr.startsWith('(ok')) {
                clearInterval(interval)
                if (setIsTxPending) setIsTxPending(false)
                if (onConfirmed) onConfirmed(txId)
            } else if (status === 'abort_by_response' || status === 'abort_by_post_condition' || repr.startsWith('(err')) {
                clearInterval(interval)
                if (setIsTxPending) setIsTxPending(false)
                const reason = repr || 'Transaction failed'
                if (onFailed) onFailed(txId, reason)
            } else if (attempts >= MAX) {
                clearInterval(interval)
                if (setIsTxPending) setIsTxPending(false)
                if (onTimeout) onTimeout(txId)
            }
        } catch {
            // Network error — keep polling
        }
    }, 10000)
}
