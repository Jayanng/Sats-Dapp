;; mock-sbtc
;; A SIP-010 compliant fungible token used as mock sBTC for testing.

(impl-trait .traits-demo.sip-010-trait)

(define-fungible-token mock-sbtc)

;; SIP-010 Functions
(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) (err u100))
    ;; #[allow(unchecked_data)]
    (try! (ft-transfer? mock-sbtc amount sender recipient))
    (match memo to-print (print to-print) 0x)
    (ok true)
  )
)

(define-read-only (get-name)
  (ok "Mock sBTC")
)

(define-read-only (get-symbol)
  (ok "sBTC")
)

(define-read-only (get-decimals)
  (ok u8)
)

(define-read-only (get-balance (account principal))
  (ok (ft-get-balance mock-sbtc account))
)

(define-read-only (get-total-supply)
  (ok (ft-get-supply mock-sbtc))
)

(define-read-only (get-token-uri)
  (ok none)
)

;; Minting function for testing
(define-public (mint (amount uint) (recipient principal))
  ;; #[allow(unchecked_data)]
  (ft-mint? mock-sbtc amount recipient)
)
