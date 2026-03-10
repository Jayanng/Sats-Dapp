import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet_1 = accounts.get("wallet_1")!;
const wallet_2 = accounts.get("wallet_2")!;

const mockSbtc = `${deployer}.mock-sbtc-demo`;
const optimizerVault = `${deployer}.optimizer-vault-demo`;

// Helper: mint sBTC to an address
function mintSbtc(amount: number, recipient: string) {
    return simnet.callPublicFn(
        mockSbtc,
        "mint",
        [Cl.uint(amount), Cl.principal(recipient)],
        deployer
    );
}

describe("Optimizer Vault Tests", () => {
    beforeEach(() => {
        // Advance past minimum harvest interval so harvest is always callable
        simnet.mineEmptyBlocks(145);
    });

    it("Test 1: First depositor receives SHARE-SCALE shares per satoshi", () => {
        const SHARE_SCALE = 1_000_000;
        const depositAmount = 1_000_000; // 0.01 sBTC

        // Mint sBTC to wallet_1
        const mint = mintSbtc(depositAmount, wallet_1);
        expect(mint.result).toBeOk(Cl.bool(true));

        // Deposit into optimizer vault
        const deposit = simnet.callPublicFn(
            optimizerVault,
            "deposit",
            [
                Cl.uint(depositAmount),
                Cl.contractPrincipal(deployer, "mock-sbtc-demo"),
            ],
            wallet_1
        );
        expect(deposit.result).toBeOk(Cl.uint(depositAmount * SHARE_SCALE));
    });

    it("Test 2: Second depositor receives proportional shares", () => {
        const SHARE_SCALE = 1_000_000;
        const deposit1Amount = 1_000_000; // 0.01 sBTC
        const deposit2Amount = 2_000_000; // 0.02 sBTC

        mintSbtc(deposit1Amount, wallet_1);
        mintSbtc(deposit2Amount, wallet_2);

        // First deposit
        simnet.callPublicFn(
            optimizerVault,
            "deposit",
            [Cl.uint(deposit1Amount), Cl.contractPrincipal(deployer, "mock-sbtc-demo")],
            wallet_1
        );

        // Second deposit — should receive 2x as many shares (ratio is 1:SHARE_SCALE still)
        const deposit2 = simnet.callPublicFn(
            optimizerVault,
            "deposit",
            [Cl.uint(deposit2Amount), Cl.contractPrincipal(deployer, "mock-sbtc-demo")],
            wallet_2
        );
        expect(deposit2.result).toBeOk(Cl.uint(deposit2Amount * SHARE_SCALE));
    });

    it("Test 3: Harvest accrues yield to the vault", () => {
        const depositAmount = 10_000_000; // 0.1 sBTC

        mintSbtc(depositAmount, wallet_1);
        simnet.callPublicFn(
            optimizerVault,
            "deposit",
            [Cl.uint(depositAmount), Cl.contractPrincipal(deployer, "mock-sbtc-demo")],
            wallet_1
        );

        // Read stats before harvest
        const statsBefore = simnet.callReadOnlyFn(
            optimizerVault,
            "get-vault-stats",
            [],
            deployer
        );
        const assetsBefore = Number(
            (statsBefore.result as any).value["total-assets"].value
        );

        // Harvest
        const harvest = simnet.callPublicFn(optimizerVault, "harvest", [], deployer);
        expect(harvest.result).toBeOk(expect.anything());

        // Stats after harvest should show more assets
        const statsAfter = simnet.callReadOnlyFn(
            optimizerVault,
            "get-vault-stats",
            [],
            deployer
        );
        const assetsAfter = Number(
            (statsAfter.result as any).value["total-assets"].value
        );
        expect(assetsAfter).toBeGreaterThan(assetsBefore);
    });

    it("Test 4: Harvest too soon is rejected", () => {
        const depositAmount = 10_000_000;
        mintSbtc(depositAmount, wallet_1);

        simnet.callPublicFn(
            optimizerVault,
            "deposit",
            [Cl.uint(depositAmount), Cl.contractPrincipal(deployer, "mock-sbtc-demo")],
            wallet_1
        );

        // First harvest succeeds (we mined 145 blocks in beforeEach)
        simnet.callPublicFn(optimizerVault, "harvest", [], deployer);

        // Second harvest immediately should fail
        const harvest2 = simnet.callPublicFn(optimizerVault, "harvest", [], deployer);
        expect(harvest2.result).toBeErr(Cl.uint(2006)); // ERR-HARVEST-TOO-SOON
    });

    it("Test 5: Full deposit → harvest → withdraw round-trip", () => {
        const depositAmount = 5_000_000; // 0.05 sBTC

        mintSbtc(depositAmount, wallet_1);

        // Deposit
        const deposit = simnet.callPublicFn(
            optimizerVault,
            "deposit",
            [Cl.uint(depositAmount), Cl.contractPrincipal(deployer, "mock-sbtc-demo")],
            wallet_1
        );
        const sharesMinted = (deposit.result as any).value;
        expect(deposit.result).toBeOk(expect.anything());

        // Harvest
        simnet.callPublicFn(optimizerVault, "harvest", [], deployer);

        // The mock harvest increments total-assets but doesn't actually swap STX for sBTC.
        // To make the simulated withdrawal work, we must mint the yielded sBTC directly to the vault.
        // Gross yield = (5_000_000 * 50) / 10000 = 25_000.
        mintSbtc(25_000, optimizerVault);

        // Withdraw all shares
        const withdraw = simnet.callPublicFn(
            optimizerVault,
            "withdraw",
            [sharesMinted, Cl.contractPrincipal(deployer, "mock-sbtc-demo")],
            wallet_1
        );
        // Should succeed and return sBTC (slightly more due to yield)
        expect(withdraw.result).toBeOk(expect.anything());

        // Verify user position is cleared
        const info = simnet.callReadOnlyFn(
            optimizerVault,
            "get-vault-info",
            [Cl.principal(wallet_1)],
            wallet_1
        );
        const shares = Number((info.result as any).value.shares.value);
        expect(shares).toBe(0);
    });

    it("Test 6: Withdraw fails with insufficient shares", () => {
        const depositAmount = 1_000_000;
        const SHARE_SCALE = 1_000_000;

        mintSbtc(depositAmount, wallet_1);
        simnet.callPublicFn(
            optimizerVault,
            "deposit",
            [Cl.uint(depositAmount), Cl.contractPrincipal(deployer, "mock-sbtc-demo")],
            wallet_1
        );

        const tooManyShares = depositAmount * SHARE_SCALE + 1;
        const withdraw = simnet.callPublicFn(
            optimizerVault,
            "withdraw",
            [Cl.uint(tooManyShares), Cl.contractPrincipal(deployer, "mock-sbtc-demo")],
            wallet_1
        );
        expect(withdraw.result).toBeErr(Cl.uint(2003)); // ERR-INSUFFICIENT-SHARES
    });

    it("Test 7: Zero deposit is rejected", () => {
        const deposit = simnet.callPublicFn(
            optimizerVault,
            "deposit",
            [Cl.uint(0), Cl.contractPrincipal(deployer, "mock-sbtc-demo")],
            wallet_1
        );
        expect(deposit.result).toBeErr(Cl.uint(2001)); // ERR-ZERO-AMOUNT
    });
});
