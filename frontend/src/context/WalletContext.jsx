import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
    connect as stacksConnect,
    disconnect as stacksDisconnect,
    isConnected,
    getLocalStorage,
} from '@stacks/connect'

// ── Context ───────────────────────────────────────────────────
const WalletContext = createContext(null)

function readAddress() {
    // E2E Test Mock Override
    const mockAddr = typeof window !== 'undefined' ? window.localStorage.getItem('testing-mock-address') : null;
    if (mockAddr) return mockAddr;

    const data = getLocalStorage()
    const stxAddrs = data?.addresses?.stx ?? []
    // Testnet addresses start with 'ST', mainnet with 'SP'
    // Doc reference: connectionResponse.addresses[2].address (testnet slot)
    const testnet = stxAddrs.find(a => a.address?.startsWith('ST'))
    return testnet?.address ?? stxAddrs[0]?.address ?? null
}

async function lookupBns(stxAddress) {
    try {
        // BNS v2 testnet lookup — per Stacks Quickstart docs
        const res = await fetch(`https://api.bnsv2.com/testnet/names/address/${stxAddress}/valid`)
        const data = await res.json()
        return data?.names?.[0]?.full_name ?? null
    } catch {
        return null
    }
}

export function WalletProvider({ children }) {
    const isMock = typeof window !== 'undefined' && !!window.localStorage.getItem('testing-mock-address');
    const [connected, setConnected] = useState(() => isMock || isConnected())
    const [address, setAddress] = useState(() => readAddress())
    const [bns, setBns] = useState(null)
    const [stxBalance, setStxBalance] = useState(null) // NEW

    // Helper: fetch BNS + STX balance in parallel
    const hydrateAccount = useCallback(async (addr) => {
        if (!addr) return
        try {
            const [bnsRes, balRes] = await Promise.all([
                fetch(`https://api.bnsv2.com/testnet/names/address/${addr}/valid`).catch(() => null),
                fetch(`https://api.testnet.hiro.so/extended/v1/address/${addr}/balances`).catch(() => null)
            ])

            if (bnsRes?.ok) {
                const bnsData = await bnsRes.json()
                setBns(bnsData?.names?.[0]?.full_name ?? null)
            }

            if (balRes?.ok) {
                const balData = await balRes.json()
                // Convert microSTX to STX
                const amountStx = Number(balData.stx.balance) / 1000000
                setStxBalance(amountStx)
            }
        } catch (e) {
            console.error('Account hydration failed', e)
        }
    }, [])

    // Sync state on mount (handles page refresh)
    useEffect(() => {
        const addr = readAddress()
        const isMock = !!window.localStorage.getItem('testing-mock-address')
        setConnected(isMock || isConnected())
        setAddress(addr)
        if (addr) hydrateAccount(addr)
    }, [hydrateAccount])

    const connect = useCallback(async () => {
        // Wait briefly for browser extensions (Leather, Xverse) to inject their
        // window.LeatherProvider / window.BitcoinProvider before the modal opens.
        // Without this, Leather may show "Install" instead of "Connect".
        await new Promise(resolve => setTimeout(resolve, 200))
        try {
            const result = await stacksConnect({
                appDetails: {
                    name: 'Satoshi Vaults',
                    icon: typeof window !== 'undefined'
                        ? `${window.location.origin}/favicon.ico`
                        : '/favicon.ico',
                },
            })

            const addrs = result?.addresses ?? []
            const stxAddrs = addrs.filter(a => a.address?.startsWith('ST') || a.address?.startsWith('SP'))
            const addr = addrs[2]?.address ?? stxAddrs[0]?.address ?? readAddress()

            setConnected(true)
            setAddress(addr)
            if (addr) hydrateAccount(addr)
        } catch (err) {
            console.error('Wallet connection failed:', err)
        }
    }, [hydrateAccount])

    const disconnect = useCallback(() => {
        stacksDisconnect()
        setConnected(false)
        setAddress(null)
        setBns(null)
        setStxBalance(null)
    }, [])

    // Display: BNS name if available, else abbreviated address
    const shortAddress = address
        ? `${address.slice(0, 6)}…${address.slice(-4)}`
        : null

    const displayName = bns ?? shortAddress

    return (
        <WalletContext.Provider value={{
            isConnected: connected,
            address,
            shortAddress,
            bns,
            displayName,
            stxBalance,
            connect,
            disconnect,
            refreshBalance: () => hydrateAccount(readAddress()),
        }}>
            {children}
        </WalletContext.Provider>
    )
}

export function useWallet() {
    const ctx = useContext(WalletContext)
    if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>')
    return ctx
}
