# STREET CULTURE — Consignment & Authentication Workflow

```mermaid
stateDiagram-v2
    [*] --> DRAFT : Seller initiates intake
    DRAFT --> SUBMITTED : Photos & details uploaded
    SUBMITTED --> UNDER_REVIEW : Staff triage
    UNDER_REVIEW --> MORE_INFORMATION_REQUIRED : Questions on provenance
    MORE_INFORMATION_REQUIRED --> SUBMITTED : Seller responds
    UNDER_REVIEW --> REJECTED : Out of scope / unviable
    UNDER_REVIEW --> APPROVED_FOR_DELIVERY : Initial check passed
    APPROVED_FOR_DELIVERY --> IN_TRANSIT : Seller ships to Vault
    IN_TRANSIT --> RECEIVED : Vault intake logging
    RECEIVED --> AUTHENTICATION_IN_PROGRESS : Specialist inspection
    AUTHENTICATION_IN_PROGRESS --> AUTHENTICATION_FAILED : Failed authenticity
    AUTHENTICATION_FAILED --> RETURNED : Sent back to seller
    AUTHENTICATION_IN_PROGRESS --> AUTHENTICATED : Passed physical multi-point inspection
    AUTHENTICATED --> PHOTOGRAPHY : Studio photography
    PHOTOGRAPHY --> PRICING : Market appraisal
    PRICING --> READY_TO_LIST : Packaging & tagging
    READY_TO_LIST --> LISTED : Live on marketplace
    LISTED --> RESERVED : Buyer begins checkout
    RESERVED --> LISTED : Checkout expired/cancelled
    RESERVED --> SOLD : Payment confirmed
    SOLD --> PAYOUT_PENDING : Escrow hold period
    PAYOUT_PENDING --> PAID : Consignor net disbursed
    PAID --> [*]
```

## Security Constraints
- All status transitions beyond `DRAFT` and `SUBMITTED` require authenticated staff/authenticator authorization (`public.is_authenticator()`).
- Sellers can never transition their own consignment to `AUTHENTICATED`, `SOLD`, or `PAID`.
- Every physical verification generates an immutable `authentication_records` entry linking the specialist ID, timestamp, and verification notes.
