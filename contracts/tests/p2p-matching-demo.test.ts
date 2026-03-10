import { describe, expect, it } from "vitest";
import { Cl, cvToJSON } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const lender = accounts.get("wallet_1")!;
const borrower = accounts.get("wallet_2")!;
const liquidator = accounts.get("wallet_3")!;

const vusd = `${deployer}.vault-usd-demo`;
const sbtc = `${deployer}.mock-sbtc-demo`;
const p2p = `${deployer}.p2p-matching-demo`;

function mintVusd(amount: number, recipient: string) {
    return simnet.callPublicFn(vusd, "mint", [Cl.uint(amount), Cl.principal(recipient)], deployer);
}

function mintSbtc(amount: number, recipient: string) {
    return simnet.callPublicFn(sbtc, "mint", [Cl.uint(amount), Cl.principal(recipient)], deployer);
}

describe("P2P Matching Tests", () => {
    describe("Test 1: post-offer", () => {
        it("Lender posts a valid offer and receives offer ID 1", () => {
            const VUSD_AMOUNT = 5_000_000; // 5 VUSD
            mintVusd(VUSD_AMOUNT, lender);

            const result = simnet.callPublicFn(
                p2p, "post-offer",
                [
                    Cl.uint(VUSD_AMOUNT),
                    Cl.uint(500), // 5% APR
                    Cl.uint(144), // 1 day min
                    Cl.contractPrincipal(deployer, "vault-usd-demo"),
                ],
                lender
            );
            expect(result.result).toBeOk(Cl.uint(1));
        });

        it("Rejects zero-amount offer", () => {
            mintVusd(100, lender);
            const result = simnet.callPublicFn(
                p2p, "post-offer",
                [Cl.uint(0), Cl.uint(500), Cl.uint(144), Cl.contractPrincipal(deployer, "vault-usd-demo")],
                lender
            );
            expect(result.result).toBeErr(Cl.uint(3001)); // ERR-ZERO-AMOUNT
        });
    });

    describe("Test 2: fill-offer", () => {
        it("Borrower fills an offer and receives VUSD", () => {
            const VUSD_AMOUNT = 5_000_000;
            const SBTC_COLLATERAL = 1_000_000; // 0.01 sBTC

            mintVusd(VUSD_AMOUNT, lender);
            mintSbtc(SBTC_COLLATERAL, borrower);

            // Lender posts offer
            simnet.callPublicFn(
                p2p, "post-offer",
                [Cl.uint(VUSD_AMOUNT), Cl.uint(500), Cl.uint(144), Cl.contractPrincipal(deployer, "vault-usd-demo")],
                lender
            );

            // Borrower fills offer (offer-id = 1)
            const fill = simnet.callPublicFn(
                p2p, "fill-offer",
                [
                    Cl.uint(1),
                    Cl.uint(144),
                    Cl.contractPrincipal(deployer, "mock-sbtc-demo"),
                    Cl.contractPrincipal(deployer, "vault-usd-demo"),
                    Cl.contractPrincipal(deployer, "mock-reputation-engine-demo"),
                    Cl.contractPrincipal(deployer, "mock-oracle-demo"),
                ],
                borrower
            );
            expect(fill.result).toBeOk(Cl.uint(1)); // loan-id = 1
        });
    });

    describe("Test 3: repay-loan", () => {
        it("Borrower repays and gets sBTC collateral back", () => {
            const VUSD_AMOUNT = 5_000_000;
            const SBTC_COLLATERAL = 2_000_000;

            mintVusd(VUSD_AMOUNT, lender);
            mintSbtc(SBTC_COLLATERAL, borrower);

            // Post + fill
            simnet.callPublicFn(
                p2p, "post-offer",
                [Cl.uint(VUSD_AMOUNT), Cl.uint(500), Cl.uint(144), Cl.contractPrincipal(deployer, "vault-usd-demo")],
                lender
            );
            simnet.callPublicFn(
                p2p, "fill-offer",
                [Cl.uint(1), Cl.uint(144), Cl.contractPrincipal(deployer, "mock-sbtc-demo"), Cl.contractPrincipal(deployer, "vault-usd-demo"), Cl.contractPrincipal(deployer, "mock-reputation-engine-demo"), Cl.contractPrincipal(deployer, "mock-oracle-demo")],
                borrower
            );

            // Borrower needs VUSD to repay (principal + interest)
            mintVusd(10_000_000, borrower); // top up for interest

            // Repay
            const repay = simnet.callPublicFn(
                p2p, "repay-loan",
                [
                    Cl.uint(1),
                    Cl.contractPrincipal(deployer, "vault-usd-demo"),
                    Cl.contractPrincipal(deployer, "mock-sbtc-demo"),
                ],
                borrower
            );
            expect(repay.result).toBeOk(expect.anything());

            // Loan should be marked repaid
            // Use cvToJSON for reliable Clarity value decoding
            const loan = simnet.callReadOnlyFn(p2p, "get-loan", [Cl.uint(1)], deployer);
            const loanJson = cvToJSON(loan.result);
            console.log("LOAN JSON:", JSON.stringify(loanJson, null, 2));
            // loanJson.value.value = { amount, borrower, ..., repaid: { value: true } }
            const repaid = loanJson?.value?.value?.repaid?.value;
            expect(repaid).toBe(true);
        });
    });

    describe("Test 4: liquidate overdue loan", () => {
        it("Liquidator seizes collateral after loan expires", () => {
            const VUSD_AMOUNT = 5_000_000;
            const SBTC_COLLATERAL = 2_000_000;

            mintVusd(VUSD_AMOUNT, lender);
            mintSbtc(SBTC_COLLATERAL, borrower);

            simnet.callPublicFn(
                p2p, "post-offer",
                [Cl.uint(VUSD_AMOUNT), Cl.uint(500), Cl.uint(144), Cl.contractPrincipal(deployer, "vault-usd-demo")],
                lender
            );
            simnet.callPublicFn(
                p2p, "fill-offer",
                [Cl.uint(1), Cl.uint(144), Cl.contractPrincipal(deployer, "mock-sbtc-demo"), Cl.contractPrincipal(deployer, "vault-usd-demo"), Cl.contractPrincipal(deployer, "mock-reputation-engine-demo"), Cl.contractPrincipal(deployer, "mock-oracle-demo")],
                borrower
            );

            // Advance past due-block
            simnet.mineEmptyBlocks(145);

            const liquidate = simnet.callPublicFn(
                p2p, "liquidate-loan",
                [
                    Cl.uint(1),
                    Cl.contractPrincipal(deployer, "mock-sbtc-demo"),
                    Cl.contractPrincipal(deployer, "mock-oracle-demo"),
                ],
                liquidator
            );
            expect(liquidate.result).toBeOk(expect.anything());
        });
    });

    describe("Test 5: cancel-offer", () => {
        it("Lender gets VUSD back when cancelling unfilled offer", () => {
            const VUSD_AMOUNT = 3_000_000;
            mintVusd(VUSD_AMOUNT, lender);

            simnet.callPublicFn(
                p2p, "post-offer",
                [Cl.uint(VUSD_AMOUNT), Cl.uint(500), Cl.uint(144), Cl.contractPrincipal(deployer, "vault-usd-demo")],
                lender
            );

            const cancel = simnet.callPublicFn(
                p2p, "cancel-offer",
                [Cl.uint(1), Cl.contractPrincipal(deployer, "vault-usd-demo")],
                lender
            );
            expect(cancel.result).toBeOk(Cl.bool(true));
        });

        it("Non-lender cannot cancel offer", () => {
            const VUSD_AMOUNT = 3_000_000;
            mintVusd(VUSD_AMOUNT, lender);

            simnet.callPublicFn(
                p2p, "post-offer",
                [Cl.uint(VUSD_AMOUNT), Cl.uint(500), Cl.uint(144), Cl.contractPrincipal(deployer, "vault-usd-demo")],
                lender
            );

            const cancel = simnet.callPublicFn(
                p2p, "cancel-offer",
                [Cl.uint(1), Cl.contractPrincipal(deployer, "vault-usd-demo")],
                borrower // wrong caller
            );
            expect(cancel.result).toBeErr(Cl.uint(3000)); // ERR-NOT-AUTHORIZED
        });
    });
});
