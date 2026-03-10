;; vault-usd
;; A SIP-010 compliant fungible token used as the stablecoin for Satoshi Vaults.
;; Minting/burning is restricted to the lending-protocol contract.

(impl-trait .traits-demo.sip-010-trait)

(define-fungible-token vault-usd)

(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-MAX-SUPPLY-REACHED (err u101))

;; 100 Million VUSD max supply (with 6 decimals)
(define-constant MAX-SUPPLY u100000000000000)

(define-data-var token-uri (optional (string-utf8 256)) none)
(define-constant CONTRACT-OWNER tx-sender)

;; Admin setter for token-uri
(define-public (set-token-uri (new-uri (optional (string-utf8 256))))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    ;; #[allow(unchecked_data)]
    (ok (var-set token-uri new-uri))
  )
)

;; Only the lending protocol can mint/burn. (or the owner for testing/setup)
(define-read-only (is-authorized)
  (ok (or
    (is-eq contract-caller CONTRACT-OWNER)
    (is-eq contract-caller .lending-protocol-demo)
    (is-eq contract-caller .lending-protocol-demo)
  ))
)

;; SIP-010 Functions
(define-public (transfer
    (amount uint)
    (sender principal)
    (recipient principal)
    (memo (optional (buff 34)))
  )
  (begin
    (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
    ;; #[allow(unchecked_data)]
    (try! (ft-transfer? vault-usd amount sender recipient))
    (match memo
      to-print (print to-print)
      0x
    )
    (ok true)
  )
)

(define-read-only (get-name)
  (ok "Vault USD")
)

(define-read-only (get-symbol)
  (ok "VUSD")
)

(define-read-only (get-decimals)
  (ok u6)
)

(define-read-only (get-balance (account principal))
  (ok (ft-get-balance vault-usd account))
)

(define-read-only (get-total-supply)
  (ok (ft-get-supply vault-usd))
)

(define-read-only (get-token-uri)
  (ok (var-get token-uri))
)

;; Protocol Functions
(define-public (mint
    (amount uint)
    (recipient principal)
  )
  (begin
    (asserts! (unwrap! (is-authorized) ERR-NOT-AUTHORIZED) ERR-NOT-AUTHORIZED)
    (asserts! (<= (+ (ft-get-supply vault-usd) amount) MAX-SUPPLY)
      ERR-MAX-SUPPLY-REACHED
    )
    (let ((mint-recipient recipient))
      ;; explicit assignment helps with unchecked data lint occasionally
      ;; #[allow(unchecked_data)]
      (ft-mint? vault-usd amount mint-recipient)
    )
  )
)

(define-public (burn
    (amount uint)
    (sender principal)
  )
  (begin
    (asserts! (unwrap! (is-authorized) ERR-NOT-AUTHORIZED) ERR-NOT-AUTHORIZED)
    (let ((burn-sender sender))
      ;; #[allow(unchecked_data)]
      (ft-burn? vault-usd amount burn-sender)
    )
  )
)
