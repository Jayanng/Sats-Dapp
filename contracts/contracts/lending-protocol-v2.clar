;; lending-protocol-demo
;; Core primitive for Satoshi Vaults
;; TESTNET VERSION - all principals fully qualified for ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV

(use-trait sip-010-trait 'ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV.traits-demo.sip-010-trait)
(use-trait risk-engine-trait 'ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV.traits-demo.risk-engine-trait)
(use-trait oracle-trait 'ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV.traits-demo.oracle-trait)

(define-constant ERR-INSUFFICIENT-COLLATERAL (err u1002))
(define-constant ERR-VAULT-HEALTHY (err u1003))
(define-constant ERR-RISK-ENGINE-MISMATCH (err u1005))
(define-constant ERR-NO-VAULT (err u1006))
(define-constant ERR-ORACLE-FAILED (err u1007))
(define-constant ERR-BORROW-LIMIT-CALC (err u1008))

(define-map Vaults
  { owner: principal }
  { collateral: uint, debt: uint, risk-engine: principal }
)

(define-read-only (get-vault (owner principal))
  (map-get? Vaults { owner: owner })
)

(define-public (get-health-factor
    (owner principal)
    (sbtc <sip-010-trait>)
    (risk-engine <risk-engine-trait>)
    (oracle <oracle-trait>)
  )
  (let (
      (vault (unwrap! (map-get? Vaults { owner: owner }) ERR-NO-VAULT))
      (sbtc-price (unwrap! (contract-call? oracle get-price (contract-of sbtc)) ERR-ORACLE-FAILED))
      (collateral-usd (/ (* (get collateral vault) sbtc-price) u100000000))
      (max-borrow (unwrap! (contract-call? risk-engine calculate-borrow-limit collateral-usd owner) ERR-BORROW-LIMIT-CALC))
      (debt (get debt vault))
    )
    (if (is-eq debt u0)
      (ok u999999)
      (ok (/ (* max-borrow u100) debt))
    )
  )
)

(define-public (supply
    (amount uint)
    (sbtc <sip-010-trait>)
    (risk-engine <risk-engine-trait>)
  )
  (let (
      (vault (default-to { collateral: u0, debt: u0, risk-engine: (contract-of risk-engine) }
        (map-get? Vaults { owner: tx-sender })))
      (new-collateral (+ (get collateral vault) amount))
    )
    (asserts! (is-eq (get risk-engine vault) (contract-of risk-engine)) ERR-RISK-ENGINE-MISMATCH)
    ;; #[allow(unchecked_data)]
    (try! (contract-call? sbtc transfer amount tx-sender (as-contract tx-sender) none))
    (map-set Vaults { owner: tx-sender } (merge vault { collateral: new-collateral }))
    (print { event: "supply", owner: tx-sender, amount: amount, new-collateral: new-collateral, block: stacks-block-height })
    (ok new-collateral)
  )
)

(define-public (withdraw
    (amount uint)
    (sbtc <sip-010-trait>)
    (risk-engine <risk-engine-trait>)
    (oracle <oracle-trait>)
  )
  (let (
      (vault (unwrap! (map-get? Vaults { owner: tx-sender }) ERR-NO-VAULT))
      (new-collateral (- (get collateral vault) amount))
      (sbtc-price (unwrap! (contract-call? oracle get-price (contract-of sbtc)) ERR-ORACLE-FAILED))
      (collateral-usd (/ (* new-collateral sbtc-price) u100000000))
      (max-borrow (unwrap! (contract-call? risk-engine calculate-borrow-limit collateral-usd tx-sender) ERR-BORROW-LIMIT-CALC))
      (caller tx-sender)
    )
    (asserts! (is-eq (get risk-engine vault) (contract-of risk-engine)) ERR-RISK-ENGINE-MISMATCH)
    (asserts! (<= (get debt vault) max-borrow) ERR-INSUFFICIENT-COLLATERAL)
    (map-set Vaults { owner: tx-sender } (merge vault { collateral: new-collateral }))
    ;; #[allow(unchecked_data)]
    (try! (as-contract (contract-call? sbtc transfer amount tx-sender caller none)))
    (print { event: "withdraw", owner: caller, amount: amount, new-collateral: new-collateral, block: stacks-block-height })
    (ok amount)
  )
)

(define-public (borrow
    (amount uint)
    (sbtc <sip-010-trait>)
    (risk-engine <risk-engine-trait>)
    (oracle <oracle-trait>)
  )
  (let (
      (vault (unwrap! (map-get? Vaults { owner: tx-sender }) ERR-NO-VAULT))
      (sbtc-price (unwrap! (contract-call? oracle get-price (contract-of sbtc)) ERR-ORACLE-FAILED))
      (collateral-usd (/ (* (get collateral vault) sbtc-price) u100000000))
      (max-borrow (unwrap! (contract-call? risk-engine calculate-borrow-limit collateral-usd tx-sender) ERR-BORROW-LIMIT-CALC))
      (new-debt (+ (get debt vault) amount))
      (recipient tx-sender)
    )
    (asserts! (is-eq (get risk-engine vault) (contract-of risk-engine)) ERR-RISK-ENGINE-MISMATCH)
    (asserts! (<= new-debt max-borrow) ERR-INSUFFICIENT-COLLATERAL)
    (map-set Vaults { owner: tx-sender } (merge vault { debt: new-debt }))
    (try! (as-contract (contract-call? 'ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV.vault-usd-final mint amount recipient)))
    (print { event: "borrow", owner: recipient, amount: amount, new-debt: new-debt, block: stacks-block-height })
    (ok amount)
  )
)

(define-public (repay (amount uint))
  (let (
      (vault (unwrap! (map-get? Vaults { owner: tx-sender }) ERR-NO-VAULT))
      (repay-amount (if (> amount (get debt vault)) (get debt vault) amount))
      (new-debt (- (get debt vault) repay-amount))
      (borrower tx-sender)
      (caller tx-sender)
    )
    (try! (as-contract (contract-call? 'ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV.vault-usd-final burn repay-amount caller)))
    (map-set Vaults { owner: tx-sender } (merge vault { debt: new-debt }))
    (match (contract-call? 'ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV.reputation-score-demo update-score borrower 10)
      success true
      err-val true
    )
    (print { event: "repay", owner: borrower, repay-amount: repay-amount, new-debt: new-debt, block: stacks-block-height })
    (ok repay-amount)
  )
)

(define-public (redeem
    (vusd-amount uint)
    (sbtc <sip-010-trait>)
    (risk-engine <risk-engine-trait>)
    (oracle <oracle-trait>)
  )
  (let (
      (vault (unwrap! (map-get? Vaults { owner: tx-sender }) ERR-NO-VAULT))
      (repay-amount (if (> vusd-amount (get debt vault)) (get debt vault) vusd-amount))
      (sbtc-price (unwrap! (contract-call? oracle get-price (contract-of sbtc)) ERR-ORACLE-FAILED))
      (sbtc-unlocked (/ (* repay-amount u100000000) sbtc-price))
      (new-debt (- (get debt vault) repay-amount))
      (new-collateral (- (get collateral vault) sbtc-unlocked))
      (caller tx-sender)
    )
    (asserts! (is-eq (get risk-engine vault) (contract-of risk-engine)) ERR-RISK-ENGINE-MISMATCH)
    (try! (as-contract (contract-call? 'ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV.vault-usd-final burn repay-amount caller)))
    (map-set Vaults { owner: tx-sender } (merge vault { debt: new-debt, collateral: new-collateral }))
    ;; #[allow(unchecked_data)]
    (try! (as-contract (contract-call? sbtc transfer sbtc-unlocked tx-sender caller none)))
    (print { event: "redeem", owner: caller, vusd-burned: repay-amount, sbtc-returned: sbtc-unlocked, block: stacks-block-height })
    (ok sbtc-unlocked)
  )
)

(define-public (liquidate
    (target principal)
    (amount uint)
    (sbtc <sip-010-trait>)
    (risk-engine <risk-engine-trait>)
    (oracle <oracle-trait>)
  )
  (let (
      (vault (unwrap! (map-get? Vaults { owner: target }) ERR-NO-VAULT))
      (sbtc-price (unwrap! (contract-call? oracle get-price (contract-of sbtc)) ERR-ORACLE-FAILED))
      (collateral-usd (/ (* (get collateral vault) sbtc-price) u100000000))
      (max-borrow (unwrap! (contract-call? risk-engine calculate-borrow-limit collateral-usd target) ERR-BORROW-LIMIT-CALC))
      (caller tx-sender)
      (repay-amount (if (> amount (get debt vault)) (get debt vault) amount))
      (sbtc-value-nominal (/ (* repay-amount u100000000) sbtc-price))
      (sbtc-seize-intended (/ (* sbtc-value-nominal u105) u100))
      (sbtc-to-seize (if (> sbtc-seize-intended (get collateral vault)) (get collateral vault) sbtc-seize-intended))
    )
    (asserts! (is-eq (get risk-engine vault) (contract-of risk-engine)) ERR-RISK-ENGINE-MISMATCH)
    (asserts! (> (get debt vault) max-borrow) ERR-VAULT-HEALTHY)
    (try! (contract-call? 'ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV.vault-usd-final burn repay-amount caller))
    (map-set Vaults { owner: target }
      (merge vault { collateral: (- (get collateral vault) sbtc-to-seize), debt: (- (get debt vault) repay-amount) })
    )
    ;; #[allow(unchecked_data)]
    (try! (as-contract (contract-call? sbtc transfer sbtc-to-seize tx-sender caller none)))
    (match (contract-call? 'ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV.reputation-score-demo update-score target -50)
      success true
      err-val true
    )
    (print { event: "liquidate", liquidator: caller, target: target, repay-amount: repay-amount, sbtc-seized: sbtc-to-seize, block: stacks-block-height })
    (ok sbtc-to-seize)
  )
)

(define-map Delegations
  { owner: principal }
  { pool: principal, amount: uint, delegated-at: uint }
)

;; #[allow(unchecked_data)]
(define-public (delegate-to-pox
    (amount uint)
    (pool principal)
    (until-burn-ht (optional uint))
  )
  (begin
    (asserts! (> amount u0) ERR-INSUFFICIENT-COLLATERAL)
    (match (contract-call? 'ST000000000000000000002AMW42H.pox-4 delegate-stx amount pool until-burn-ht none)
      ok-val (begin
        (map-set Delegations { owner: tx-sender } { pool: pool, amount: amount, delegated-at: stacks-block-height })
        (print { event: "pox-delegated", owner: tx-sender, pool: pool, amount: amount, block: stacks-block-height })
        (ok true)
      )
      err-val (err u401)
    )
  )
)

(define-public (revoke-delegate-stx)
  (begin
    (match (contract-call? 'ST000000000000000000002AMW42H.pox-4 revoke-delegate-stx)
      ok-val (begin
        (map-delete Delegations { owner: tx-sender })
        (print { event: "pox-revoked", owner: tx-sender, block: stacks-block-height })
        (ok true)
      )
      err-val (err (to-uint (* err-val -1)))
    )
  )
)

(define-read-only (get-delegation (owner principal))
  (map-get? Delegations { owner: owner })
)