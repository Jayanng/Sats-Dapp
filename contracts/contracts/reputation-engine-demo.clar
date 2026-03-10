;; reputation-engine.clar
;; Live risk engine that reads reputation-score.clar to dynamically set
;; per-user collateral requirements. Replaces mock-reputation-engine.
;;
;; Collateral ratio tiers (basis points):
;;   Score 0-499   -> u15000  (150%)
;;   Score 500-699 -> u12000  (120%)
;;   Score 700-849 -> u10000  (100%)
;;   Score 850-999 -> u9000   (90%)
;;   Score 1000    -> u8500   (85%)

(impl-trait .traits-demo.risk-engine-trait)

;; ---- Score -> collateral ratio lookup ------------------------------

(define-read-only (score-to-ratio (score uint))
  (if (>= score u1000)
    u8500
    (if (>= score u850)
      u9000
      (if (>= score u700)
        u10000
        (if (>= score u500)
          u12000
          u15000
        )
      )
    )
  )
)

;; ---- Internal helper: returns score as uint, defaults 500 on error -

;; get-score returns (response uint uint). We extract the ok value.
;; In a read-only context, calling another read-only is fine.
(define-read-only (read-score (user principal))
  (let ((res (contract-call? .reputation-score-demo get-score user)))
    (if (is-ok res)
      ;; the outer if(is-ok) ensures we only unwrap success, but unwrap! is 
      ;; preferred over unwrap-panic to avoid transaction aborts.
      (unwrap! res u500)
      u500
    )
  )
)

;; ---- risk-engine-trait implementation ------------------------------

(define-read-only (get-required-collateral (user principal))
  (ok (score-to-ratio (read-score user)))
)

(define-read-only (calculate-borrow-limit
    (collateral-usd-value uint)
    (user principal)
  )
  (ok (/ (* collateral-usd-value u10000) (score-to-ratio (read-score user))))
)

;; ---- Convenience read-only ----------------------------------------

(define-read-only (get-user-risk-profile (user principal))
  (let ((score (read-score user)))
    (ok {
      score: score,
      ratio-bps: (score-to-ratio score),
    })
  )
)
