(impl-trait .traits-demo.oracle-trait)

;; pyth-wrapper: BTC/USD oracle wrapper for Satoshi Vaults.
;; Simnet/test: PYTH-ORACLE -> local .mock-pyth-oracle-v4-demo
;; Testnet: change PYTH-ORACLE to SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-oracle-v4

(define-constant PYTH-ORACLE .mock-pyth-oracle-v4-demo)
(define-constant PYTH-STORAGE (as-contract tx-sender))
(define-constant BTC-USD-FEED-ID 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43)
(define-constant FALLBACK-PRICE u64000000000)

(define-data-var cached-price uint FALLBACK-PRICE)

(define-read-only (get-cached-price)
  (var-get cached-price)
)

(define-read-only (normalise-pyth-price (price-raw int))
  (/ (* (to-uint price-raw) u10) u100000000)
)

;; oracle-trait: returns the last cached BTC/USD price.
(define-read-only (get-price (asset principal))
  (begin
    (asserts! (is-eq asset asset) (err u0))
    (ok (var-get cached-price))
  )
)

;; Submit a Hermes VAA to refresh the cached BTC/USD price.
;; #[allow(unchecked_data)]
(define-public (update-price (price-feed-bytes (buff 8192)))
  (let (
      ;; Step 1: submit VAA (ignore result - mock/oracle may not update)
      (vaa-res (contract-call? PYTH-ORACLE verify-and-update-price-feeds
        (list price-feed-bytes) {
        amount: u1,
        asset: tx-sender,
      }))
      ;; Step 2: read price from oracle
      (price-res (contract-call? PYTH-ORACLE get-price BTC-USD-FEED-ID PYTH-STORAGE))
    )
    (asserts! (is-eq vaa-res vaa-res) (err u0))
    (if (is-ok price-res)
      (let (
          (data (unwrap! price-res (err u0)))
          (normalised (normalise-pyth-price (get price data)))
        )
        (var-set cached-price normalised)
        (ok normalised)
      )
      (ok (var-get cached-price))
    )
  )
)
