;; reputation-score.clar
;; On-chain reputation score registry for Satoshi Vaults.
;;
;; Scores range 0-1000 (uint).
;; Only whitelisted updater principals (lending-protocol) may call update-score.
;; Any principal may read scores.

;; ---- Error constants -----------------------------------------------

(define-constant ERR-NOT-AUTHORIZED (err u6001))

;; ---- Max score cap --------------------------------------------------

(define-constant MAX-SCORE u1000)

;; Deployer is the initial admin
(define-data-var admin principal tx-sender)

;; ---- Whitelisted updaters -------------------------------------------
;; A map of principals that are allowed to call update-score.
;; Managed by admin.

(define-map Updaters { updater: principal } { allowed: bool })

;; ---- Reputation data -----------------------------------------------

(define-map ReputationScores
  { owner: principal }
  {
    score: uint,
    last-updated: uint,
    repay-count: uint,
    liquidation-count: uint,
  }
)

;; ---- Admin functions -----------------------------------------------

;; #[allow(unchecked_data)]
(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR-NOT-AUTHORIZED)
    (ok (var-set admin new-admin))
  )
)

;; #[allow(unchecked_data)]
(define-public (set-updater (updater principal) (allowed bool))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR-NOT-AUTHORIZED)
    (ok (map-set Updaters { updater: updater } { allowed: allowed }))
  )
)

;; ---- Write functions (updater-only) --------------------------------

;; Update a user's score by a signed delta (positive = boost, negative = penalty).
;; Score is clamped to [0, MAX-SCORE].
;; Designed to be called by lending-protocol after repay (+10) or liquidation (-50).
;; #[allow(unchecked_data)]
(define-public (update-score (owner principal) (delta int))
  (begin
    (asserts!
      (default-to false (get allowed (map-get? Updaters { updater: tx-sender })))
      ERR-NOT-AUTHORIZED
    )
    (let (
        (current (default-to
          { score: u500, last-updated: u0, repay-count: u0, liquidation-count: u0 }
          (map-get? ReputationScores { owner: owner })
        ))
        (old-score (get score current))
        ;; Clamp: if delta is negative and bigger than score, floor at 0
        (new-score (if (< delta 0)
          (let ((penalty (to-uint (* delta -1))))
            (if (>= old-score penalty) (- old-score penalty) u0)
          )
          (let ((boost (to-uint delta)))
            (if (<= (+ old-score boost) MAX-SCORE)
              (+ old-score boost)
              MAX-SCORE
            )
          )
        ))
        (new-repay  (if (> delta 0) (+ (get repay-count current) u1) (get repay-count current)))
        (new-liq    (if (< delta 0) (+ (get liquidation-count current) u1) (get liquidation-count current)))
      )
      (map-set ReputationScores
        { owner: owner }
        {
          score: new-score,
          last-updated: stacks-block-height,
          repay-count: new-repay,
          liquidation-count: new-liq,
        }
      )
      (print {
        event: "score-updated",
        owner: owner,
        old-score: old-score,
        new-score: new-score,
        delta: delta,
        block: stacks-block-height,
      })
      (ok new-score)
    )
  )
)

;; ---- Read-only functions -------------------------------------------

(define-read-only (get-score (owner principal))
  (ok (get score
    (default-to
      { score: u500, last-updated: u0, repay-count: u0, liquidation-count: u0 }
      (map-get? ReputationScores { owner: owner })
    )
  ))
)

(define-read-only (get-full-profile (owner principal))
  (ok (default-to
    { score: u500, last-updated: u0, repay-count: u0, liquidation-count: u0 }
    (map-get? ReputationScores { owner: owner })
  ))
)

(define-read-only (is-updater (who principal))
  (default-to false (get allowed (map-get? Updaters { updater: who })))
)

(define-read-only (get-admin)
  (var-get admin)
)
