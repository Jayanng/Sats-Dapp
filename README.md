# Satoshi Vaults

The first modular, Morpho-inspired lending protocol on Bitcoin L2, built on Stacks with sBTC and PoX integration.

🌐 **Live Demo:** [https://satso-dapp.vercel.app](https://satso-dapp.vercel.app)  
📦 **Contracts:** Stacks Testnet | **Deployer:** `ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV`  
🔗 **GitHub:** [https://github.com/Jayanng/Sats-Dapp](https://github.com/Jayanng/Sats-Dapp)

---

## The Problem
Stacks DeFi is growing rapidly with sBTC enabling real Bitcoin-backed finance, but lending remains primitive. Existing protocols (Arkadiko, Zest, Granite, Hermetica) require 150–200% overcollateralization, offer no yield optimization, and lack the modularity needed for advanced use cases. Bitcoin holders are forced to lock up excessive collateral or leave yields on the table.

**Satoshi Vaults fills this gap.**

---

## What is Satoshi Vaults?
Satoshi Vaults is a modular lending protocol on Stacks L2, inspired by Morpho on Ethereum. It introduces four core innovations to Bitcoin DeFi:

### 1. Modular Risk Engines
Pluggable risk modules that assess collateral requirements dynamically. Users with strong on-chain reputation (PoX stacking history, repayment track record, wallet age) unlock undercollateralized loans, reducing ratios as low as 65% vs the industry standard 175%.

### 2. Optimizer Vaults
Auto-compounding smart contract vaults that blend sBTC deposits with Stacks' Proof-of-Transfer (PoX) mechanism. Users deposit sBTC, earn native Bitcoin yields, and watch their position compound automatically every harvest cycle, turning idle BTC into productive DeFi assets without leaving the Bitcoin ecosystem.

### 3. Peer-to-Peer Loan Market
A Morpho-style order book where lenders post VUSD offers at their desired APR and borrowers fill them directly. No intermediary pools, no spread, just direct, trustless, on-chain credit matching with minimal fees.

### 4. On-Chain Credit Scoring
The first credit primitive native to Stacks. Users build a reputation score (0–1000) through:
- PoX stacking history (+200 pts)
- Repayment track record (+10 pts per repayment)
- Wallet age (+320 pts)
- Cross-protocol signals (Arkadiko, etc.)

**Higher score = lower collateral requirement = more capital efficiency.**

---

## How It Works
1. **User deposits sBTC as collateral**
2. **Reputation Engine calculates required collateral ratio**
   - (175% standard → as low as 65% for Elite users)
3. **User borrows VUSD (Vault USD) against their sBTC**
4. **VUSD can be:**
   - Used in P2P market to lend and earn APR
   - Deposited back to repay debt
   - Traded freely
5. **Optimizer Vault compounds sBTC yield via PoX every cycle**
6. **Repayments boost reputation score for future lower-cost loans**

---

## Live Contract Addresses (Stacks Testnet)

| Contract | Address |
| :--- | :--- |
| **lending-protocol-v3** | `ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV.lending-protocol-v3` |
| **vault-usd-final** | `ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV.vault-usd-final` |
| **optimizer-vault-v2** | `ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV.optimizer-vault-v2` |
| **p2p-matching-demo** | `ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV.p2p-matching-demo` |
| **mock-sbtc-demo** | `ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV.mock-sbtc-demo` |
| **mock-oracle-demo** | `ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV.mock-oracle-demo` |
| **reputation-score-demo** | `ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV.reputation-score-demo` |
| **mock-reputation-engine-demo** | `ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV.mock-reputation-engine-demo` |

---

## Features

### ✅ Fully Working On-Chain Flows
- **Faucet** — Mint testnet sBTC and STX to get started
- **Supply** — Deposit sBTC as collateral into the lending protocol
- **Borrow** — Borrow VUSD against sBTC with reputation-adjusted collateral ratios
- **Repay** — Repay VUSD debt (boosts reputation score on-chain)
- **Redeem** — Burn VUSD to unlock sBTC collateral
- **Optimizer Vault** — Deposit sBTC, withdraw, and harvest compounded PoX yield
- **P2P Market** — Post lending offers and fill borrower requests directly on-chain
- **PoX Delegation** — Delegate STX to stacking pools for BTC yield

### ✅ Live Data Integration
- Real-time BTC price via on-chain oracle (live feed)
- Live vault positions (collateral, debt, health factor)
- Live P2P offer book from chain
- Live reputation score from `reputation-score-demo` contract
- Live PoX cycle data (cycle #, blocks remaining, APY)
- Live transaction history feed

### ✅ Premium UX
- Transaction Pending modal with real-time status
- Transaction Success modal with explorer link
- Transaction Failed modal with error reason
- Harvest countdown timer (blocks until next harvest)
- Health factor gauge with liquidation simulation
- Collateral efficiency calculator with interactive slider

---

## Architecture

```text
satoshi-vaults/
├── contracts/                    # Clarity 3 smart contracts
│   ├── lending-protocol-v3.clar  # Core lending engine
│   ├── vault-usd-final.clar      # VUSD stablecoin (SIP-010)
│   ├── optimizer-vault-v2.clar   # Auto-compounding PoX vault
│   ├── p2p-matching-demo.clar    # P2P order book
│   ├── reputation-score-demo.clar # On-chain credit score registry
│   ├── mock-reputation-engine-demo.clar # Risk engine (pluggable)
│   ├── mock-oracle-demo.clar     # BTC price oracle
│   └── mock-sbtc-demo.clar       # Mock sBTC (SIP-010)
├── frontend/                     # React + Vite frontend
│   └── src/
│       ├── pages/
│       │   ├── Dashboard.jsx     # Portfolio + PoX stacking
│       │   ├── Markets.jsx       # Supply/Borrow/Repay/Redeem
│       │   ├── OptimizerVaults.jsx # Vault deposit/withdraw/harvest
│       │   ├── P2PMarket.jsx     # Offer book + loan matching
│       │   ├── RiskModules.jsx   # Credit score + collateral calc
│       │   └── Faucet.jsx        # Testnet token minting
│       ├── components/
│       │   ├── TxPendingModal.jsx
│       │   ├── TxSuccessModal.jsx
│       │   └── TxFailedModal.jsx
│       └── lib/
│           ├── stacks.js         # Contract interaction helpers
│           └── pollTx.jsx        # Transaction polling utility
└── scripts/                      # Deployment & admin scripts
```

---

## What Makes Satoshi Vaults Different?

| Feature | Satoshi Vaults | Zest | Arkadiko | Granite |
| :--- | :---: | :---: | :---: | :---: |
| Modular risk engines | ✅ | ❌ | ❌ | ❌ |
| Undercollateralized loans | ✅ | ❌ | ❌ | ❌ |
| On-chain credit scoring | ✅ | ❌ | ❌ | ❌ |
| PoX yield optimization | ✅ | ❌ | ❌ | ❌ |
| P2P order book | ✅ | ❌ | ❌ | ❌ |
| Auto-compounding vaults | ✅ | ❌ | ❌ | ❌ |
| sBTC-first design | ✅ | Partial | ❌ | Partial |
| Composable/pluggable | ✅ | ❌ | ❌ | ❌ |

---

## Getting Started (Local Development)

### Prerequisites
- Node.js 18+
- Clarinet for contract development
- Leather Wallet browser extension

### Installation
1. **Clone the repo**
   ```bash
   git clone https://github.com/Jayanng/Sats-Dapp.git
   cd Sats-Dapp
   ```
2. **Install frontend dependencies**
   ```bash
   cd frontend
   npm install
   ```
3. **Start development server**
   ```bash
   npm run dev
   ```
4. **Open [http://localhost:5173](http://localhost:5173) in your browser.**

### Testing the Protocol
1. **Connect your Leather wallet** (set to Stacks Testnet)
2. **Faucet** — Mint testnet sBTC and STX
3. **Markets** → Supply sBTC as collateral
4. **Markets** → Borrow VUSD (notice reduced collateral vs 175% standard)
5. **P2P Market** → Post a lending offer or fill an existing one
6. **Optimizer Vaults** → Deposit sBTC and watch yield compound
7. **Risk Modules** → Check your on-chain reputation score
8. **Markets** → Repay debt and watch your score increase

---

## Tech Stack
- **Smart Contracts:** Clarity 3 on Stacks L2
- **Frontend:** React 18 + Vite + Tailwind CSS
- **Wallet:** Leather Wallet via `@stacks/connect`
- **Blockchain:** Stacks Testnet ([https://api.testnet.hiro.so](https://api.testnet.hiro.so)) · Explorer: [https://explorer.hiro.so/testnet](https://explorer.hiro.so/testnet)
- **Oracle:** On-chain BTC price feed
- **Deployment:** Vercel

---

## The Vision
Satoshi Vaults is the first step toward making Bitcoin DeFi as powerful as Ethereum DeFi, but natively on BTC, without bridges, without wrapped tokens, without Ethereum's trade-offs.

With sBTC enabling trustless Bitcoin collateral and PoX providing native Bitcoin yields, Satoshi Vaults creates a credit primitive that only Stacks can offer:

> "The first modular lending protocol on Bitcoin L2 that uses on-chain PoX history to offer undercollateralized loans, a credit primitive that only exists on Stacks."

---

## 🏆 Hackathon Alignment
- **Problem Solved:** Addresses the lack of advanced lending on Stacks, unlocking sBTC capital efficiency for Bitcoin holders
- **Milestones Achieved:** Core contracts deployed on testnet · Frontend MVP with live transaction flows · All major protocol flows verified onchain
- **Impact:** Composable primitive for ecosystem builders · Targets 5-10% early sBTC TVL · Fully open-source
- **Uniqueness:** First protocol on Stacks combining modular risk engines + P2P matching + PoX optimizer vaults in one protocol

---

## Roadmap
- [x] Core lending contracts (supply, borrow, repay, redeem)
- [x] VUSD stablecoin (SIP-010)
- [x] On-chain reputation scoring
- [x] Optimizer vault with PoX compounding
- [x] P2P matching demo (order book + direct fill)
- [x] React frontend with live contract integration
- [x] Testnet deployment
- [ ] Mainnet deployment with real sBTC
- [ ] Governance token
- [ ] Multi-collateral support (STX, xBTC)
- [ ] Cross-protocol reputation aggregation
- [ ] Mobile app

---

## Built By
**Jayanng** — Solo builder passionate about Bitcoin DeFi and making Stacks the home of advanced Bitcoin finance.

---

## License
MIT License — Open source and free to build on.

⚠️ **Disclaimer:** Satoshi Vaults is a testnet proof-of-concept. Smart contracts are unaudited. Do not use with real funds.

*Built for the Stacks ecosystem. Powered by sBTC and PoX.*
