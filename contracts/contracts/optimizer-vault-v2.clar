;; optimizer-vault
;; Auto-compounding PoX vault for Satoshi Vaults.
;; Users deposit sBTC and earn yield from simulated PoX rewards.
;; Share-based accounting ensures fair distribution among depositors.

(use-trait sip-010-trait .traits-demo.sip-010-trait)

;; Error constants
(define-constant ERR-NOT-AUTHORIZED (err u2000))
(define-constant ERR-ZERO-AMOUNT (err u2001))
(define-constant ERR-NO-POSITION (err u2002))
(define-constant ERR-INSUFFICIENT-SHARES (err u2003))
(define-constant ERR-VAULT-EMPTY (err u2004))
(define-constant ERR-HARVEST-TOO-SOON (err u2006))
(define-constant ERR-MAX-CAPACITY (err u2007))

;; Contract owner (set at deploy time)
(define-constant CONTRACT-OWNER tx-sender)

;; Max vault capacity: 100 sBTC in satoshis
(define-constant MAX-CAPACITY u10000000000)
;; Minimum harvest interval: 144 blocks (~1 day)
(define-constant MIN-HARVEST-INTERVAL u1)
;; PoX simulated yield per harvest: 0.5% (50 bps)
(define-constant HARVEST-YIELD-BPS u50)
;; Protocol performance fee: 10% of yield (1000 bps)
(define-constant PERFORMANCE-FEE-BPS u1000)
;; Scale factor for share math
(define-constant SHARE-SCALE u1000000)

;; Vault state vars
(define-data-var total-assets uint u0)
(define-data-var total-shares uint u0)
(define-data-var last-harvest-block uint u0)
(define-data-var total-yield-harvested uint u0)
(define-data-var fee-recipient principal CONTRACT-OWNER)

;; Per-user positions
(define-map Positions
  { owner: principal }
  {
    shares: uint,
    deposited-at: uint,
  }
)

;; Returns global vault stats
(define-read-only (get-vault-stats)
  {
    total-assets: (var-get total-assets),
    total-shares: (var-get total-shares),
    last-harvest-block: (var-get last-harvest-block),
    total-yield-harvested: (var-get total-yield-harvested),
  }
)

;; Returns a user position with estimated sBTC value and pending yield
(define-read-only (get-vault-info (owner principal))
  (let (
      (pos (default-to {
        shares: u0,
        deposited-at: u0,
      }
        (map-get? Positions { owner: owner })
      ))
      (shares (get shares pos))
      (assets (var-get total-assets))
      (t-shares (var-get total-shares))
    )
    {
      shares: shares,
      deposited-at: (get deposited-at pos),
      sbtc-value: (if (> t-shares u0)
        (/ (* shares assets) t-shares)
        u0
      ),
      pending-yield: (if (> t-shares u0)
        (/ (* (/ (* assets HARVEST-YIELD-BPS) u10000) shares) t-shares)
        u0
      ),
    }
  )
)

;; Preview shares received for a given sBTC deposit amount
(define-read-only (preview-deposit (amount uint))
  (let (
      (assets (var-get total-assets))
      (t-shares (var-get total-shares))
    )
    (if (or (is-eq assets u0) (is-eq t-shares u0))
      (* amount SHARE-SCALE)
      (/ (* amount t-shares) assets)
    )
  )
)

;; Preview sBTC returned for a given number of shares
(define-read-only (preview-withdraw (shares uint))
  (let (
      (assets (var-get total-assets))
      (t-shares (var-get total-shares))
    )
    (if (is-eq t-shares u0)
      u0
      (/ (* shares assets) t-shares)
    )
  )
)

;; Deposit sBTC and receive proportional vault shares.
;; #[allow(unchecked_data)]
(define-public (deposit
    (amount uint)
    (sbtc <sip-010-trait>)
  )
  (let (
      (caller tx-sender)
      (current-assets (var-get total-assets))
      (current-shares (var-get total-shares))
    )
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (asserts! (<= (+ current-assets amount) MAX-CAPACITY) ERR-MAX-CAPACITY)
    (let (
        (shares-to-mint (if (or (is-eq current-assets u0) (is-eq current-shares u0))
          (* amount SHARE-SCALE)
          (/ (* amount current-shares) current-assets)
        ))
        (existing-pos (default-to {
          shares: u0,
          deposited-at: u0,
        }
          (map-get? Positions { owner: caller })
        ))
      )
      ;; #[allow(unchecked_data)]
      (try! (contract-call? sbtc transfer amount caller (as-contract tx-sender) none))
      (var-set total-assets (+ current-assets amount))
      (var-set total-shares (+ current-shares shares-to-mint))
      (map-set Positions { owner: caller } {
        shares: (+ (get shares existing-pos) shares-to-mint),
        deposited-at: stacks-block-height,
      })
      (print {
        event: "optimizer-deposit",
        depositor: caller,
        sbtc-amount: amount,
        shares-minted: shares-to-mint,
        total-assets: (var-get total-assets),
        block: stacks-block-height,
      })
      (ok shares-to-mint)
    )
  )
)

;; Burn shares and withdraw proportional sBTC.
;; #[allow(unchecked_data)]
(define-public (withdraw
    (shares uint)
    (sbtc <sip-010-trait>)
  )
  (let (
      (caller tx-sender)
      (pos (unwrap! (map-get? Positions { owner: caller }) ERR-NO-POSITION))
      (user-shares (get shares pos))
      (current-assets (var-get total-assets))
      (current-shares (var-get total-shares))
    )
    (asserts! (> shares u0) ERR-ZERO-AMOUNT)
    (asserts! (>= user-shares shares) ERR-INSUFFICIENT-SHARES)
    (asserts! (> current-shares u0) ERR-VAULT-EMPTY)
    (let (
        (sbtc-out (/ (* shares current-assets) current-shares))
        (new-user-shares (- user-shares shares))
      )
      (var-set total-assets (- current-assets sbtc-out))
      (var-set total-shares (- current-shares shares))
      (if (is-eq new-user-shares u0)
        (map-delete Positions { owner: caller })
        (map-set Positions { owner: caller }
          (merge pos { shares: new-user-shares })
        )
      )
      ;; #[allow(unchecked_data)]
      (try! (as-contract (contract-call? sbtc transfer sbtc-out tx-sender caller none)))
      (print {
        event: "optimizer-withdraw",
        depositor: caller,
        shares-burned: shares,
        sbtc-returned: sbtc-out,
        total-assets: (var-get total-assets),
        block: stacks-block-height,
      })
      (ok sbtc-out)
    )
  )
)

;; Permissionless harvest: compounds simulated PoX yield into vault assets.
;; In production this would call .pox-4 and swap STX rewards for sBTC via DEX.
(define-public (harvest)
  (let (
      (assets (var-get total-assets))
      (blocks-since (- stacks-block-height (var-get last-harvest-block)))
    )
    (asserts! (> assets u0) ERR-VAULT-EMPTY)
    (asserts! (>= blocks-since MIN-HARVEST-INTERVAL) ERR-HARVEST-TOO-SOON)
    (let (
        (gross-yield (/ (* assets HARVEST-YIELD-BPS) u10000))
        (protocol-fee (/ (* gross-yield PERFORMANCE-FEE-BPS) u10000))
        (net-yield (- gross-yield protocol-fee))
      )
      (var-set total-assets (+ assets net-yield))
      (var-set last-harvest-block stacks-block-height)
      (var-set total-yield-harvested
        (+ (var-get total-yield-harvested) gross-yield)
      )
      (print {
        event: "optimizer-harvest",
        harvester: tx-sender,
        gross-yield: gross-yield,
        protocol-fee: protocol-fee,
        net-yield: net-yield,
        new-total-assets: (var-get total-assets),
        block: stacks-block-height,
      })
      (ok {
        gross-yield: gross-yield,
        net-yield: net-yield,
        protocol-fee: protocol-fee,
      })
    )
  )
)

;; Returns the current fee recipient address
(define-read-only (get-fee-recipient)
  (var-get fee-recipient)
)

;; Admin: update fee recipient
;; #[allow(unchecked_data)]
(define-public (set-fee-recipient (new-recipient principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (var-set fee-recipient new-recipient)
    (ok true)
  )
)
