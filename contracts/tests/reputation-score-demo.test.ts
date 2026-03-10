import { describe, it, expect } from 'vitest'
import { Cl } from '@stacks/transactions'
import { initSimnet } from '@hirosystems/clarinet-sdk'

const simnet = await initSimnet()
const accounts = simnet.getAccounts()
const deployer = accounts.get('deployer')!
const wallet1 = accounts.get('wallet_1')!
const wallet2 = accounts.get('wallet_2')!

describe('reputation-score-demo', () => {

    it('returns default score 500 for unseen user', () => {
        const result = simnet.callReadOnlyFn(
            'reputation-score-demo',
            'get-score',
            [Cl.principal(wallet1)],
            deployer
        )
        expect(result.result).toBeOk(Cl.uint(500))
    })

    it('admin can whitelist an updater', () => {
        const result = simnet.callPublicFn(
            'reputation-score-demo',
            'set-updater',
            [Cl.principal(deployer), Cl.bool(true)],
            deployer
        )
        expect(result.result).toBeOk(Cl.bool(true))
    })

    it('whitelisted updater can increase score', () => {
        // First whitelist deployer
        simnet.callPublicFn(
            'reputation-score-demo',
            'set-updater',
            [Cl.principal(deployer), Cl.bool(true)],
            deployer
        )
        // Update score +100
        const result = simnet.callPublicFn(
            'reputation-score-demo',
            'update-score',
            [Cl.principal(wallet1), Cl.int(100)],
            deployer
        )
        expect(result.result).toBeOk(Cl.uint(600)) // 500 default + 100
    })

    it('whitelisted updater can decrease score', () => {
        // Whitelist deployer
        simnet.callPublicFn(
            'reputation-score-demo',
            'set-updater',
            [Cl.principal(deployer), Cl.bool(true)],
            deployer
        )
        // Decrease by 50
        const result = simnet.callPublicFn(
            'reputation-score-demo',
            'update-score',
            [Cl.principal(wallet1), Cl.int(-50)],
            deployer
        )
        // 500 - 50 = 450 (fresh simnet state: default 500)
        expect(result.result).toBeOk(Cl.uint(450))
    })

    it('score cannot go below 0', () => {
        simnet.callPublicFn(
            'reputation-score-demo',
            'set-updater',
            [Cl.principal(deployer), Cl.bool(true)],
            deployer
        )
        // wallet2 has default score 500; subtract 999 -> should clamp to 0
        const result = simnet.callPublicFn(
            'reputation-score-demo',
            'update-score',
            [Cl.principal(wallet2), Cl.int(-999)],
            deployer
        )
        expect(result.result).toBeOk(Cl.uint(0))
    })

    it('score cannot exceed 1000', () => {
        simnet.callPublicFn(
            'reputation-score-demo',
            'set-updater',
            [Cl.principal(deployer), Cl.bool(true)],
            deployer
        )
        // wallet2 has default score 500; add 999 -> should clamp to 1000
        const result = simnet.callPublicFn(
            'reputation-score-demo',
            'update-score',
            [Cl.principal(wallet2), Cl.int(999)],
            deployer
        )
        expect(result.result).toBeOk(Cl.uint(1000))
    })

    it('non-updater cannot update score', () => {
        const result = simnet.callPublicFn(
            'reputation-score-demo',
            'update-score',
            [Cl.principal(wallet1), Cl.int(50)],
            wallet2 // wallet2 is NOT whitelisted
        )
        expect(result.result).toBeErr(Cl.uint(6001)) // ERR-NOT-AUTHORIZED
    })

    it('get-full-profile returns all fields', () => {
        const result = simnet.callReadOnlyFn(
            'reputation-score-demo',
            'get-full-profile',
            [Cl.principal(wallet1)],
            deployer
        )
        expect(result.result).toBeOk(
            Cl.tuple({
                score: Cl.uint(500),
                'last-updated': Cl.uint(0),
                'repay-count': Cl.uint(0),
                'liquidation-count': Cl.uint(0),
            })
        )
    })
})

describe('reputation-engine-demo', () => {

    it('score 0-499 maps to 150% ratio (u15000)', () => {
        const result = simnet.callReadOnlyFn(
            'reputation-engine-demo',
            'score-to-ratio',
            [Cl.uint(400)],
            deployer
        )
        expect(result.result).toEqual(Cl.uint(15000))
    })

    it('score 500-699 maps to 120% ratio (u12000)', () => {
        const result = simnet.callReadOnlyFn(
            'reputation-engine-demo',
            'score-to-ratio',
            [Cl.uint(600)],
            deployer
        )
        expect(result.result).toEqual(Cl.uint(12000))
    })

    it('score 700-849 maps to 100% ratio (u10000)', () => {
        const result = simnet.callReadOnlyFn(
            'reputation-engine-demo',
            'score-to-ratio',
            [Cl.uint(750)],
            deployer
        )
        expect(result.result).toEqual(Cl.uint(10000))
    })

    it('score 850-999 maps to 90% ratio (u9000)', () => {
        const result = simnet.callReadOnlyFn(
            'reputation-engine-demo',
            'score-to-ratio',
            [Cl.uint(900)],
            deployer
        )
        expect(result.result).toEqual(Cl.uint(9000))
    })

    it('score 1000 maps to 85% ratio (u8500)', () => {
        const result = simnet.callReadOnlyFn(
            'reputation-engine-demo',
            'score-to-ratio',
            [Cl.uint(1000)],
            deployer
        )
        expect(result.result).toEqual(Cl.uint(8500))
    })

    it('get-required-collateral returns ok with ratio', () => {
        const result = simnet.callReadOnlyFn(
            'reputation-engine-demo',
            'get-required-collateral',
            [Cl.principal(wallet1)],
            deployer
        )
        // wallet1 default score 500 -> 120% (u12000)
        expect(result.result).toBeOk(Cl.uint(12000))
    })

    it('calculate-borrow-limit uses reputation ratio', () => {
        // wallet1 default score=500, ratio=12000 (120%)
        // collateral = $10,000 USD
        // max-borrow = (10000 * 10000) / 12000 = 8333
        const result = simnet.callReadOnlyFn(
            'reputation-engine-demo',
            'calculate-borrow-limit',
            [Cl.uint(10000), Cl.principal(wallet1)],
            deployer
        )
        expect(result.result).toBeOk(Cl.uint(8333))
    })
})
