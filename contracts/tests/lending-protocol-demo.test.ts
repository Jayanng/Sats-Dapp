import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet_1 = accounts.get("wallet_1")!;
const wallet_2 = accounts.get("wallet_2")!;

const lendingProtocol = `${deployer}.lending-protocol-demo`;
const mockSbtc = `${deployer}.mock-sbtc-demo`;

describe("Satoshi Vaults Lending Protocol Tests", () => {
  it("Test 1: Basic Supply, Borrow (Overcollateralized), and Repay", () => {
    // 1. Setup: Mint 1 sBTC (100,000,000 sats) to wallet_1
    let mintAmount = Cl.uint(100000000); // 1 sBTC
    let mintResponse = simnet.callPublicFn(mockSbtc, "mint", [mintAmount, Cl.principal(wallet_1)], deployer);
    expect(mintResponse.result).toBeOk(Cl.bool(true));

    // 2. Supply 1 sBTC to lending protocol
    let supplyResponse = simnet.callPublicFn(lendingProtocol, "supply", [
      mintAmount,
      Cl.contractPrincipal(deployer, "mock-sbtc-demo"),
      Cl.contractPrincipal(deployer, "default-risk-engine-demo")
    ], wallet_1);
    expect(supplyResponse.result).toBeOk(mintAmount);

    // 3. Borrow $40k (VUSD) against the $64k collateral. (Max is ~$42,666 at 150%)
    let borrowAmount = Cl.uint(40000000000); // $40,000 * 10^6
    let borrowResponse = simnet.callPublicFn(lendingProtocol, "borrow", [
      borrowAmount,
      Cl.contractPrincipal(deployer, "mock-sbtc-demo"),
      Cl.contractPrincipal(deployer, "default-risk-engine-demo"),
      Cl.contractPrincipal(deployer, "mock-oracle-demo")
    ], wallet_1);
    expect(borrowResponse.result).toBeOk(borrowAmount);

    // 4. Repay the borrowed amount
    let repayResponse = simnet.callPublicFn(lendingProtocol, "repay", [borrowAmount], wallet_1);
    expect(repayResponse.result).toBeOk(borrowAmount);
  });

  it("Test 2: Undercollateralized Borrow with Mocked Reputation Engine", () => {
    // Setup
    let mintAmount = Cl.uint(100000000); // 1 sBTC
    simnet.callPublicFn(mockSbtc, "mint", [mintAmount, Cl.principal(wallet_2)], deployer);

    // Supply
    let supplyResponse = simnet.callPublicFn(lendingProtocol, "supply", [
      mintAmount,
      Cl.contractPrincipal(deployer, "mock-sbtc-demo"),
      Cl.contractPrincipal(deployer, "mock-reputation-engine-demo")
    ], wallet_2);
    expect(supplyResponse.result).toBeOk(mintAmount);

    // Borrow $70k (VUSD) against the $64k collateral. 
    // Wait, the oracle price is set to u64,000,000,000 which means $64,000 (with 6 decimals).
    // The required ratio is 90% (u9000). Max borrow = ($64,000 * 10000) / 9000 = $71,111
    let borrowAmount = Cl.uint(70000000000); // $70,000 * 10^6
    let borrowResponse = simnet.callPublicFn(lendingProtocol, "borrow", [
      borrowAmount,
      Cl.contractPrincipal(deployer, "mock-sbtc-demo"),
      Cl.contractPrincipal(deployer, "mock-reputation-engine-demo"),
      Cl.contractPrincipal(deployer, "mock-oracle-demo")
    ], wallet_2);

    // This should succeed because $70k < $71.1k max borrow
    expect(borrowResponse.result).toBeOk(borrowAmount);
  });
});
