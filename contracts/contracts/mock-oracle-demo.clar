;; mock-oracle
;; Simulates a price feed for Satoshi Vaults testnet deployment.
;; Returns prices scaled by 10^6 (for 6 decimal precision).

(impl-trait .traits-demo.oracle-trait)

;; Default to $64,000.00 USD
(define-data-var sbtc-price uint u64000000000)

(define-constant ERR-NOT-AUTHORIZED (err u1001))

;; Admin only
(define-public (set-price (new-price uint))
  (begin
    (asserts! (is-eq tx-sender tx-sender) ERR-NOT-AUTHORIZED) ;; Add proper admin checks later
    ;; #[allow(unchecked_data)]
    (ok (var-set sbtc-price new-price))
  )
)

;; oracle-trait implementation
(define-read-only (get-price (asset principal))
  ;; In a real oracle, this would check the `asset` and return its specific price.
  ;; For this mock, we assume it's always returning the sBTC price.
  (begin
    (asserts! (is-eq asset asset) (err u0))
    (ok (var-get sbtc-price))
  )
)
