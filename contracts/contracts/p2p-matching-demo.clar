;; p2p-matching
;; Morpho-style peer-to-peer loan order book for Satoshi Vaults.
;; Lenders post VUSD offers; borrowers fill them by locking sBTC collateral.
;; Fully trustless: liquidation is permissionless, repayment unlocks collateral.

(use-trait sip-010-trait .traits-demo.sip-010-trait)
(use-trait oracle-trait .traits-demo.oracle-trait)
(use-trait risk-engine-trait .traits-demo.risk-engine-trait)

;; ---- Error constants ------------------------------------------------

(define-constant ERR-NOT-AUTHORIZED      (err u3000))
(define-constant ERR-ZERO-AMOUNT         (err u3001))
(define-constant ERR-OFFER-NOT-FOUND     (err u3002))
(define-constant ERR-OFFER-INACTIVE      (err u3003))
(define-constant ERR-OFFER-FILLED        (err u3004))
(define-constant ERR-LOAN-NOT-FOUND      (err u3005))
(define-constant ERR-LOAN-NOT-DUE        (err u3007))
(define-constant ERR-ALREADY-REPAID      (err u3010))
(define-constant ERR-BORROW-LIMIT        (err u3011))

;; ---- Protocol parameters --------------------------------------------

;; Minimum loan duration: 144 blocks (~1 day)
(define-constant MIN-DURATION u144)
;; Maximum loan duration: 52560 blocks (~1 year)
(define-constant MAX-DURATION u52560)
;; Liquidation bonus: 5% to liquidator (500 bps)
(define-constant LIQUIDATION-BONUS-BPS u500)
;; Interest precision scale (basis points, 1 bps = 0.01%)
(define-constant BPS-SCALE u10000)

;; ---- State ----------------------------------------------------------

(define-data-var next-offer-id uint u1)
(define-data-var next-loan-id  uint u1)

;; Lender offer book
(define-map LoanOffers
  { offer-id: uint }
  {
    lender: principal,
    amount: uint,
    rate-bps: uint,
    min-duration: uint,
    filled: bool,
    active: bool,
  }
)

;; Active loan book
(define-map ActiveLoans
  { loan-id: uint }
  {
    lender: principal,
    borrower: principal,
    amount: uint,
    collateral: uint,
    rate-bps: uint,
    start-block: uint,
    due-block: uint,
    repaid: bool,
  }
)

;; ---- Read-only views ------------------------------------------------

(define-read-only (get-offer (offer-id uint))
  (map-get? LoanOffers { offer-id: offer-id })
)

(define-read-only (get-loan (loan-id uint))
  (map-get? ActiveLoans { loan-id: loan-id })
)

(define-read-only (get-next-offer-id)
  (var-get next-offer-id)
)

(define-read-only (get-next-loan-id)
  (var-get next-loan-id)
)

;; Calculate interest owed: principal * rate-bps * blocks / (BPS-SCALE * blocks-per-year)
(define-read-only (calculate-interest (principal uint) (rate-bps uint) (blocks uint))
  (/ (* (* principal rate-bps) blocks) (* BPS-SCALE u52560))
)

;; ---- Public functions -----------------------------------------------

;; Lender posts a VUSD offer at a given annual rate.
;; Locks lender VUSD into this contract until filled or cancelled.
;; #[allow(unchecked_data)]
(define-public (post-offer
    (amount uint)
    (rate-bps uint)
    (min-duration uint)
    (vusd <sip-010-trait>))
  (let (
      (caller tx-sender)
      (offer-id (var-get next-offer-id))
    )
    (asserts! (> amount u0) ERR-ZERO-AMOUNT)
    (asserts! (>= min-duration MIN-DURATION) ERR-ZERO-AMOUNT)
    (asserts! (<= min-duration MAX-DURATION) ERR-ZERO-AMOUNT)
    (asserts! (> rate-bps u0) ERR-ZERO-AMOUNT)
    ;; #[allow(unchecked_data)]
    (try! (contract-call? vusd transfer amount caller (as-contract tx-sender) none))
    (map-set LoanOffers { offer-id: offer-id }
      {
        lender: caller,
        amount: amount,
        rate-bps: rate-bps,
        min-duration: min-duration,
        filled: false,
        active: true,
      }
    )
    (var-set next-offer-id (+ offer-id u1))
    (print {
      event: "p2p-offer-posted",
      offer-id: offer-id,
      lender: caller,
      amount: amount,
      rate-bps: rate-bps,
      min-duration: min-duration,
      block: stacks-block-height,
    })
    (ok offer-id)
  )
)

;; Borrower fills an offer by depositing sBTC collateral.
;; Verifies the collateral meets requirements from the risk engine.
;; Transfers VUSD principal to the borrower.
;; #[allow(unchecked_data)]
(define-public (fill-offer
    (offer-id uint)
    (duration uint)
    (sbtc <sip-010-trait>)
    (vusd <sip-010-trait>)
    (risk-engine <risk-engine-trait>)
    (oracle <oracle-trait>))
  (let (
      (caller tx-sender)
      (offer (unwrap! (map-get? LoanOffers { offer-id: offer-id }) ERR-OFFER-NOT-FOUND))
      (lender (get lender offer))
      (amount (get amount offer))
      (rate-bps (get rate-bps offer))
      (loan-id (var-get next-loan-id))
    )
    (asserts! (get active offer) ERR-OFFER-INACTIVE)
    (asserts! (not (get filled offer)) ERR-OFFER-FILLED)
    (asserts! (>= duration (get min-duration offer)) ERR-ZERO-AMOUNT)
    (asserts! (<= duration MAX-DURATION) ERR-ZERO-AMOUNT)
    (let (
        (borrow-limit (unwrap! (contract-call? risk-engine calculate-borrow-limit amount caller) ERR-BORROW-LIMIT))
        (sbtc-price (unwrap! (contract-call? oracle get-price (as-contract tx-sender)) ERR-OFFER-NOT-FOUND))
      )
      (asserts! (>= borrow-limit amount) ERR-BORROW-LIMIT)
      (let (
          (required-collateral (/ (* (* amount u100000000) u150) (* sbtc-price u100)))
        )
        ;; #[allow(unchecked_data)]
        (try! (contract-call? sbtc transfer required-collateral caller (as-contract tx-sender) none))
        (map-set LoanOffers { offer-id: offer-id }
          (merge offer { filled: true, active: false })
        )
        (map-set ActiveLoans { loan-id: loan-id }
          {
            lender: lender,
            borrower: caller,
            amount: amount,
            collateral: required-collateral,
            rate-bps: rate-bps,
            start-block: stacks-block-height,
            due-block: (+ stacks-block-height duration),
            repaid: false,
          }
        )
        (var-set next-loan-id (+ loan-id u1))
        ;; #[allow(unchecked_data)]
        (try! (as-contract (contract-call? vusd transfer amount tx-sender caller none)))
        (print {
          event: "p2p-loan-created",
          loan-id: loan-id,
          offer-id: offer-id,
          lender: lender,
          borrower: caller,
          amount: amount,
          collateral: required-collateral,
          rate-bps: rate-bps,
          due-block: (+ stacks-block-height duration),
          block: stacks-block-height,
        })
        (ok loan-id)
      )
    )
  )
)

;; Borrower repays principal + accrued interest. sBTC collateral is returned.
;; #[allow(unchecked_data)]
(define-public (repay-loan
    (loan-id uint)
    (vusd <sip-010-trait>)
    (sbtc <sip-010-trait>))
  (let (
      (caller tx-sender)
      (loan (unwrap! (map-get? ActiveLoans { loan-id: loan-id }) ERR-LOAN-NOT-FOUND))
      (borrower (get borrower loan))
      (lender (get lender loan))
      (principal (get amount loan))
      (collateral (get collateral loan))
      (rate-bps (get rate-bps loan))
      (start-block (get start-block loan))
      (blocks-elapsed (- stacks-block-height start-block))
      (interest (calculate-interest principal rate-bps blocks-elapsed))
      (total-owed (+ principal interest))
    )
    (asserts! (is-eq caller borrower) ERR-NOT-AUTHORIZED)
    (asserts! (not (get repaid loan)) ERR-ALREADY-REPAID)
    ;; #[allow(unchecked_data)]
    (try! (contract-call? vusd transfer total-owed caller lender none))
    ;; #[allow(unchecked_data)]
    (try! (as-contract (contract-call? sbtc transfer collateral tx-sender borrower none)))
    (map-set ActiveLoans { loan-id: loan-id }
      (merge loan { repaid: true })
    )
    (print {
      event: "p2p-loan-repaid",
      loan-id: loan-id,
      borrower: caller,
      lender: lender,
      principal: principal,
      interest: interest,
      total-owed: total-owed,
      block: stacks-block-height,
    })
    (ok total-owed)
  )
)

;; Permissionless liquidation of overdue or undercollateralised loans.
;; Liquidator receives a 5% sBTC bonus; lender gets the rest.
;; #[allow(unchecked_data)]
(define-public (liquidate-loan
    (loan-id uint)
    (sbtc <sip-010-trait>)
    (oracle <oracle-trait>))
  (let (
      (liquidator tx-sender)
      (loan (unwrap! (map-get? ActiveLoans { loan-id: loan-id }) ERR-LOAN-NOT-FOUND))
      (lender (get lender loan))
      (borrower (get borrower loan))
      (collateral (get collateral loan))
      (due-block (get due-block loan))
      (sbtc-price (unwrap! (contract-call? oracle get-price (as-contract tx-sender)) ERR-OFFER-NOT-FOUND))
      (collateral-value (/ (* collateral sbtc-price) u100000000))
      (principal (get amount loan))
      (is-overdue (> stacks-block-height due-block))
      (is-undercollat (< (* collateral-value u100) (* principal u110)))
    )
    (asserts! (not (get repaid loan)) ERR-ALREADY-REPAID)
    (asserts! (or is-overdue is-undercollat) ERR-LOAN-NOT-DUE)
    (let (
        (liquidator-bonus (/ (* collateral LIQUIDATION-BONUS-BPS) BPS-SCALE))
        (lender-share (- collateral liquidator-bonus))
      )
      ;; #[allow(unchecked_data)]
      (try! (as-contract (contract-call? sbtc transfer lender-share tx-sender lender none)))
      ;; #[allow(unchecked_data)]
      (try! (as-contract (contract-call? sbtc transfer liquidator-bonus tx-sender liquidator none)))
      (map-set ActiveLoans { loan-id: loan-id }
        (merge loan { repaid: true })
      )
      (print {
        event: "p2p-loan-liquidated",
        loan-id: loan-id,
        liquidator: liquidator,
        lender: lender,
        borrower: borrower,
        collateral: collateral,
        liquidator-bonus: liquidator-bonus,
        lender-share: lender-share,
        block: stacks-block-height,
      })
      (ok { lender-share: lender-share, liquidator-bonus: liquidator-bonus })
    )
  )
)

;; Lender cancels an unfilled offer and reclaims their VUSD.
;; #[allow(unchecked_data)]
(define-public (cancel-offer
    (offer-id uint)
    (vusd <sip-010-trait>))
  (let (
      (caller tx-sender)
      (offer (unwrap! (map-get? LoanOffers { offer-id: offer-id }) ERR-OFFER-NOT-FOUND))
    )
    (asserts! (is-eq caller (get lender offer)) ERR-NOT-AUTHORIZED)
    (asserts! (get active offer) ERR-OFFER-INACTIVE)
    (asserts! (not (get filled offer)) ERR-OFFER-FILLED)
    ;; #[allow(unchecked_data)]
    (try! (as-contract (contract-call? vusd transfer (get amount offer) tx-sender caller none)))
    (map-set LoanOffers { offer-id: offer-id }
      (merge offer { active: false })
    )
    (print {
      event: "p2p-offer-cancelled",
      offer-id: offer-id,
      lender: caller,
      amount: (get amount offer),
      block: stacks-block-height,
    })
    (ok true)
  )
)
