/**
 * Central Stacks testnet configuration for Satoshi Vaults.
 * All network calls, contract addresses, and API endpoints live here.
 * Everything targets TESTNET — no mainnet usage.
 */
import { STACKS_TESTNET } from '@stacks/network'
import { validateStacksAddress, fetchCallReadOnlyFunction, cvToJSON, Cl } from '@stacks/transactions'

// ── Network ──────────────────────────────────────────────────
export const NETWORK = STACKS_TESTNET
export const NETWORK_STRING = 'testnet'                     // pass to request() / contract calls
export const HIRO_API = STACKS_TESTNET.client.baseUrl // https://api.testnet.hiro.so

/**
 * Validate a Stacks testnet address (must start with 'ST').
 * Per Stacks docs — testnet addresses start with 'ST', mainnet with 'SP'.
 */
export function validateTestnetAddress(address) {
    if (!address?.startsWith('ST')) return false
    try { return validateStacksAddress(address) }
    catch { return false }
}

// ── sBTC (testnet) ────────────────────────────────────────────
// Official sBTC contract on testnet
export const SBTC_CONTRACT_ADDRESS = 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4'
export const SBTC_TOKEN_CONTRACT = `${SBTC_CONTRACT_ADDRESS}.sbtc-token`
export const SBTC_DEPOSIT_CONTRACT = `${SBTC_CONTRACT_ADDRESS}.sbtc-deposit`

// ── Satoshi Vaults lending contract (fill after testnet deploy) ─
export const LENDING_CONTRACT_ADDRESS = 'ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV'   // Deployer address
export const LENDING_CONTRACT_NAME = 'lending-protocol-v3'
export const LENDING_CONTRACT = LENDING_CONTRACT_ADDRESS
    ? `${LENDING_CONTRACT_ADDRESS}.${LENDING_CONTRACT_NAME}`
    : null

// ── Read-only helper ──────────────────────────────────────────
/**
 * Call a read-only function on a testnet contract and return the parsed JSON value.
 * Per Stacks docs: fetchCallReadOnlyFunction + cvToJSON pattern.
 *
 * @example
 * const supply = await readContract(LENDING_CONTRACT_ADDRESS, LENDING_CONTRACT_NAME, 'get-supply', [Cl.principal(address)], address)
 */
export async function readContract(contractAddress, contractName, functionName, functionArgs = [], senderAddress) {
    const result = await fetchCallReadOnlyFunction({
        contractAddress,
        contractName,
        functionName,
        functionArgs,
        senderAddress,
        network: NETWORK_STRING,
    })
    return cvToJSON(result)
}

// ── Transaction confirmation helper ──────────────────────────
/**
 * Poll the Hiro testnet API until a transaction confirms or fails.
 * Per Stacks docs: poll /extended/v1/tx/{txId} every 10s.
 *
 * @returns {Promise<object>} txInfo object with tx_status, tx_result, etc.
 */
export async function waitForTransaction(txId, { maxAttempts = 30, intervalMs = 10_000 } = {}) {
    for (let i = 0; i < maxAttempts; i++) {
        const res = await fetch(`${HIRO_API}/extended/v1/tx/${txId}`)
        const txInfo = await res.json()

        if (txInfo.tx_status === 'success' || txInfo.tx_status === 'abort_by_response') {
            return txInfo
        }

        await new Promise(resolve => setTimeout(resolve, intervalMs))
    }
    throw new Error(`Transaction ${txId} not confirmed after ${maxAttempts} attempts`)
}

// ── Live BTC/USD price via pyth-wrapper ──────────────────────────
/**
 * Fetch the live BTC/USD price from the deployed oracle contract.
 * Returns price in USD (e.g. 85000.123456).
 * Falls back to FALLBACK_BTC_PRICE if the contract is unreachable or not yet deployed.
 *
 * The oracle now returns prices with 6 decimal places:
 *   u85000000000 = $85,000.00
 */
export const FALLBACK_BTC_PRICE = 85000

export async function fetchBtcPrice(senderAddress) {
    try {
        const result = await fetchCallReadOnlyFunction({
            network: 'testnet',
            contractAddress: 'ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV',
            contractName: 'mock-oracle-demo',
            functionName: 'get-price',
            functionArgs: [
                Cl.contractPrincipal(
                    'ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV',
                    'mock-sbtc-demo'
                )
            ],
            senderAddress: senderAddress || 'ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV',
        })
        const json = cvToJSON(result)
        const raw = Number(json?.value?.value ?? json?.value ?? 0)
        if (!raw || raw === 0) return FALLBACK_BTC_PRICE
        return raw / 1_000_000
    } catch (e) {
        console.error('fetchBtcPrice error:', e)
        return FALLBACK_BTC_PRICE
    }
}

// ── PoX Integration helpers ───────────────────────────────────────
// Default Satoshi Vaults PoX pool on testnet (update after pool deployment)
export const POX_POOL_ADDRESS = 'ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV'

/**
 * Delegate STX to a PoX pool via lending-protocol.delegate-to-pox.
 * amount: micro-STX (1 STX = 1_000_000)
 * poolAddress: Stacks principal of the pool operator
 * untilBurnHt: optional burn-block height to expire delegation (null = indefinite)
 */
export async function delegateToPoX(amount, poolAddress = POX_POOL_ADDRESS, untilBurnHt = null) {
    const { openContractCall } = await import('@stacks/connect')
    const { Cl, PostConditionMode } = await import('@stacks/transactions')

    return new Promise((resolve, reject) => {
        openContractCall({
            network: NETWORK_STRING,
            contractAddress: LENDING_CONTRACT_ADDRESS,
            contractName: LENDING_CONTRACT_NAME,
            functionName: 'delegate-to-pox',
            functionArgs: [
                Cl.uint(amount),
                Cl.principal(poolAddress),
                untilBurnHt ? Cl.some(Cl.uint(untilBurnHt)) : Cl.none(),
            ],
            postConditionMode: PostConditionMode.Allow,
            postConditions: [],
            onFinish: (data) => resolve(data),
            onCancel: () => reject(new Error('User cancelled')),
        })
    })
}

/**
 * Revoke an active PoX delegation via lending-protocol.revoke-delegate-stx.
 */
export async function revokePoX() {
    const { openContractCall } = await import('@stacks/connect')
    const { PostConditionMode } = await import('@stacks/transactions')

    return new Promise((resolve, reject) => {
        openContractCall({
            network: NETWORK_STRING,
            contractAddress: LENDING_CONTRACT_ADDRESS,
            contractName: LENDING_CONTRACT_NAME,
            functionName: 'revoke-delegate-stx',
            functionArgs: [],
            postConditionMode: PostConditionMode.Deny,
            postConditions: [],
            onFinish: (data) => resolve(data),
            onCancel: () => reject(new Error('User cancelled')),
        })
    })
}

/**
 * Read the delegation record for a given address from the on-chain Delegations map.
 * Returns { pool, amount, delegatedAt } or null if no active delegation.
 */
export async function getStackingStatus(address) {
    try {
        const { Cl } = await import('@stacks/transactions')
        const result = await readContract(
            LENDING_CONTRACT_ADDRESS,
            LENDING_CONTRACT_NAME,
            'get-delegation',
            [Cl.principal(address)],
            address
        )
        // result.type === 'none' means no delegation
        if (result?.type === 'none' || !result?.value) return null
        const val = result.value
        return {
            pool: val?.pool?.value ?? null,
            amount: Number(val?.amount?.value ?? 0),
            delegatedAt: Number(val?.['delegated-at']?.value ?? 0),
        }
    } catch {
        return null
    }
}
