;; vault-usd-final
;; Uses mutable authorized contract - updatable by owner

(define-constant CONTRACT-OWNER tx-sender)
(define-constant ERR-NOT-AUTHORIZED (err u1001))

(define-fungible-token vault-usd)
(define-data-var token-uri (optional (string-utf8 256)) none)
(define-data-var authorized-contract principal CONTRACT-OWNER)

(define-public (set-authorized-contract (new-contract principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (var-set authorized-contract new-contract)
    (ok true)
  )
)

(define-private (is-authorized)
  (or (is-eq tx-sender CONTRACT-OWNER)
      (is-eq tx-sender (var-get authorized-contract)))
)

(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (is-authorized) ERR-NOT-AUTHORIZED)
    (ft-mint? vault-usd amount recipient)
  )
)

(define-public (burn (amount uint) (sender principal))
  (begin
    (asserts! (is-authorized) ERR-NOT-AUTHORIZED)
    (ft-burn? vault-usd amount sender)
  )
)

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
    (try! (ft-transfer? vault-usd amount sender recipient))
    (match memo val (print val) 0x)
    (ok true)
  )
)

(define-public (set-token-uri (new-uri (optional (string-utf8 256))))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (var-set token-uri new-uri)
    (ok true)
  )
)

(define-read-only (get-balance (account principal))
  (ok (ft-get-balance vault-usd account))
)
(define-read-only (get-name) (ok "Vault USD"))
(define-read-only (get-symbol) (ok "VUSD"))
(define-read-only (get-decimals) (ok u6))
(define-read-only (get-total-supply) (ok (ft-get-supply vault-usd)))
(define-read-only (get-token-uri) (ok (var-get token-uri)))
(define-read-only (get-authorized-contract) 
  (ok (var-get authorized-contract)))
