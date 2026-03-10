;; mock-pyth-oracle-v4.clar
;; Simnet stub for pyth-oracle-v4. Used only in tests.
;; On testnet, SP1CGXWEAMG6P6FT04W66NVGJ7PQWMDAC19R7PJ0Y.pyth-oracle-v4 is used.

;; Fixed BTC price: $64,000 scaled to int with expo -9
;; pyth-wrapper normalise-pyth-price: (/ (* price 10) 100000000)
;; So price-raw should be 64000 * 1e8 = 6400000000000
(define-constant STUB-PRICE 6400000000000)

;; Mimics pyth-oracle-v4 get-price interface
;; Returns (ok { price: int, conf: uint, expo: int, publish-time: uint })
(define-read-only (get-price
    (feed-id (buff 32))
    (pyth-storage principal)
  )
  (begin
    ;; suppress unused warnings by evaluating and ignoring
    (asserts! (is-eq feed-id feed-id) (err u0))
    (asserts! (is-eq pyth-storage pyth-storage) (err u0))
    (ok {
      price: STUB-PRICE,
      conf: u100000000,
      expo: -9,
      publish-time: u0,
    })
  )
)

;; Mimics verify-and-update-price-feeds
;; Called from pyth-wrapper with (list price-feed-bytes) and fee-info tuple
(define-read-only (verify-and-update-price-feeds
    (vaas (list 5 (buff 8192)))
    (fee-info {
      amount: uint,
      asset: principal,
    })
  )
  (begin
    (asserts! (is-eq vaas vaas) (err u0))
    (asserts! (is-eq fee-info fee-info) (err u0))
    (ok true)
  )
)
