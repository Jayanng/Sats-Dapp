;; mock-reputation-engine
;; A mock risk engine that simulates a user with high reputation.
;; Requires only 90% collateralization (undercollateralized loan).

(impl-trait .traits-demo.risk-engine-trait)

(define-constant ERR-COLLATERAL-CALC-FAILED (err u500))

;; Returns the required collateralization ratio in basis points (e.g., u9000 for 90%)
(define-read-only (get-required-collateral (user principal))
  (begin
    ;; evaluate user to avoid unused-parameter warning
    (asserts! (is-eq user user) (err u0))
    (ok u9000)
  )
)

;; Calculates the maximum borrowable amount based on collateral and user
;; max-borrow = (collateral-usd-value * 10000) / required-collateral
(define-read-only (calculate-borrow-limit
    (collateral-usd-value uint)
    (user principal)
  )
  (ok (/ (* collateral-usd-value u10000)
    (unwrap! (get-required-collateral user) ERR-COLLATERAL-CALC-FAILED)
  ))
)
