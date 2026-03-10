;; title: traits
;; version:
;; summary:
;; description:

;; traits

(define-trait sip-010-trait
  (
    ;; Transfer from the caller to a new principal
    (transfer (uint principal principal (optional (buff 34))) (response bool uint))
    ;; the human readable name of the token
    (get-name () (response (string-ascii 32) uint))
    ;; the ticker symbol, or empty if none
    (get-symbol () (response (string-ascii 32) uint))
    ;; the number of decimals used
    (get-decimals () (response uint uint))
    ;; the balance of the passed principal
    (get-balance (principal) (response uint uint))
    ;; the current total supply
    (get-total-supply () (response uint uint))
    ;; an optional URI that represents metadata of this token
    (get-token-uri () (response (optional (string-utf8 256)) uint))
  )
)

(define-trait risk-engine-trait
  (
    ;; Returns the required collateralization ratio for a given user (e.g., u150 for 150%)
    (get-required-collateral (principal) (response uint uint))
    
    ;; Calculates the maximum borrowable amount based on collateral and user
    (calculate-borrow-limit (uint principal) (response uint uint))
  )
)

(define-trait oracle-trait
  (
    ;; Returns the price of the given asset in USD, scaled by 10^8
    (get-price (principal) (response uint uint))
  )
)

(define-trait optimizer-vault-trait
  (
    ;; Deposit sBTC and receive vault shares
    (deposit (uint <sip-010-trait>) (response uint uint))
    ;; Burn shares and receive proportional sBTC back
    (withdraw (uint <sip-010-trait>) (response uint uint))
    ;; Harvest PoX yield and auto-compound into vault assets
    (harvest () (response { gross-yield: uint, net-yield: uint, protocol-fee: uint } uint))
  )
)
