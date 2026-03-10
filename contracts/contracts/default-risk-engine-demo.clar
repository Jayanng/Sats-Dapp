;; default-risk-engine
;; A fallback risk engine requiring 150% overcollateralization.

(impl-trait .traits-demo.risk-engine-trait)

(define-constant ERR-COLLATERAL-CALC-FAILED (err u500))

;; Returns the required collateralization ratio in basis points (e.g., u15000 for 150%)
(define-read-only (get-required-collateral (user principal))
  (begin
    ;; evaluate user to avoid unused-parameter warning
    (asserts! (is-eq user user) (err u0))
    (ok u15000)
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
