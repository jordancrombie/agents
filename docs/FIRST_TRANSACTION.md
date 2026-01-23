# SACP Agent Transaction Flow - First Successful Transaction

**Date**: 2026-01-23 ~03:09 UTC
**Transaction Type**: Step-Up Authorization (Amount exceeds limit)
**Amount**: $79.99 CAD
**Merchant**: SSIM Dev Store
**Agent**: SACP Test Agent - StepUp (`agent_itRVZSQhSWgb` / `7fcb3a5c-4336-46c2-bc24-03d9ce6a1fb5`)
**User/Owner**: `28bc31c8-3a5b-4ea0-98bf-dddc9a0e1a8e`

---

## Transaction Flow (Chronological)

### 1️⃣ SSIM → WSIM: Agent Session & Token Validation
```
[SSIM] [WSIM Agent] Token validated for agent: 7fcb3a5c-4336-46c2-bc24-03d9ce6a1fb5
[SSIM] [Agent Auth] Request from agent 7fcb3a5c-4336-46c2-bc24-03d9ce6a1fb5 (owner: 28bc31c8-3a5b-4ea0-98bf-dddc9a0e1a8e)
[SSIM] [Agent API] Session created: cmkqaev9c0005ktfsyftatevk by agent 7fcb3a5c-4336-46c2-bc24-03d9ce6a1fb5
```

### 2️⃣ WSIM: Spending Limit Check → Step-Up Required
```
[WSIM] [Agent Payments] Step-up required for agent agent_itRVZSQhSWgb: Amount $79.99 exceeds per-transaction limit of $50.00
```

### 3️⃣ WSIM → Mobile: Push Notification Sent
```
[WSIM] [Notification] userId: 28bc31c8-3a5b-4ea0-98bf-dddc9a0e1a8e
[WSIM] [Notification] type: agent.step_up
[WSIM] [Notification] Found 1 active device(s): iPhone (apns)
[WSIM] [APNs] Alert: "SACP Test Agent - StepUp wants to make a purchase" / "$79.99 at SSIM Dev Store"
[WSIM] [APNs] Payload: {
         step_up_id: "53552fba-1135-4ad4-9d97-fcb62df8d09c",
         agent_id: "7fcb3a5c-4336-46c2-bc24-03d9ce6a1fb5",
         reason: "Amount $79.99 exceeds per-transaction limit of $50.00",
         expires_at: "2026-01-23T03:09:08.101Z"
       }
[WSIM] [APNs] Response: sent=1, failed=0 (31ms)
```

### 4️⃣ Mobile → WSIM: User Approves Step-Up
```
[WSIM] [Step-Up] Approved step-up 53552fba-1135-4ad4-9d97-fcb62df8d09c for agent SACP Test Agent - StepUp
```

### 5️⃣ WSIM → BSIM: Request Card Token (Q30 Fix)
```
[WSIM] [Agent Payments] Requesting card token from https://dev.banksim.ca/api/wallet/tokens
[BSIM] [Wallet] Generated payment token for card 177c1c12...
[WSIM] [Agent Payments] Got card token from BSIM: ac6b9fc7...
```

### 6️⃣ SSIM → NSIM: Payment Authorization
```
[BSIM] [PaymentNetwork] Authorization request: { cardToken: 'eyJhbGciOi...' }
[BSIM] [SimNetHandler] Detected JWT token, attempting to decode wallet_payment_token
[BSIM] [SimNetHandler] Wallet token decoded successfully: {
         tokenId: 'ac6b9fc7...',
         cardId: '177c1c12...'
       }
[BSIM] [SimNetHandler] Found consent: { ... }
[BSIM] [SimNetHandler] Wallet payment: merchant IDs differ (allowed)
[BSIM] [PaymentNetwork] Authorization result: { ... }
```

### 7️⃣ NSIM → SSIM: Webhook Delivery
```
[NSIM] [WebhookWorker] Delivering webhook to https://ssim-dev.banksim.ca/webhooks/payment
[NSIM] [WebhookWorker] Webhook delivered successfully (200)
[SSIM] [Webhook] Signature verified successfully
[SSIM] [Webhook] Received event: payment.authorized
[SSIM] [Webhook] Payment authorized: f09e6ef2-4401-4615-8369-0b793b8762e8
```

---

## Component Status

| Component | Status | Notes |
|-----------|--------|-------|
| **WSIM** | ✅ Working | Card token request to BSIM successful (`ac6b9fc7...`) |
| **BSIM** | ✅ Working | Token decoded successfully, consent found, authorization approved |
| **NSIM** | ✅ Working | Webhooks delivered to SSIM (200 OK) |
| **SSIM** | ✅ Working | Webhooks received and processed |

---

## Earlier Failures (Before Q30 Fix)

These were transactions using the old WSIM payment JWT that did NOT include the BSIM `card_token`:

```
[BSIM] [SimNetHandler] JWT verification failed: invalid signature
[BSIM] [SimNetHandler] No consent found for token: eyJhbGci...
[BSIM] [PaymentNetwork] declineReason: 'Invalid card token'
```

---

## Successful Transactions (After Q30 Fix)

The token `ac6b9fc7` was requested by WSIM from BSIM, then successfully decoded by BSIM during authorization:

```
[BSIM] [SimNetHandler] Wallet token decoded successfully: { tokenId: 'ac6b9fc7...', cardId: '177c1c12...' }
[BSIM] [SimNetHandler] Found consent
[BSIM] [PaymentNetwork] Authorization result: { success }
```

---

## Token Flow Diagram

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Agent   │    │   SSIM   │    │   WSIM   │    │   BSIM   │
│ (Claude) │    │ (Store)  │    │ (Wallet) │    │  (Bank)  │
└────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘
     │               │               │               │
     │ POST /checkout│               │               │
     │──────────────>│               │               │
     │               │ introspect    │               │
     │               │──────────────>│               │
     │               │   valid ✓     │               │
     │               │<──────────────│               │
     │               │               │               │
     │               │ POST /payments│               │
     │               │ {amount:79.99}│               │
     │               │──────────────>│               │
     │               │               │ GET /wallet/tokens
     │               │               │──────────────>│
     │               │               │  card_token   │
     │               │               │<──────────────│
     │               │               │  (ac6b9fc7)   │
     │               │ step_up_req   │               │
     │<──────────────│<──────────────│               │
     │               │               │               │
     │ [User approves on mobile]     │               │
     │               │               │               │
     │               │ GET /step-up  │               │
     │               │──────────────>│               │
     │               │ payment_token │               │
     │               │ (with card_   │               │
     │               │  token inside)│               │
     │               │<──────────────│               │
     │               │               │               │
     │               │ POST /authorize (to NSIM)     │
     │               │───────────────────────────────>
     │               │               │    decode JWT │
     │               │               │   find consent│
     │               │               │    authorize  │
     │               │ AUTH-xxxxxxxx │               │
     │               │<───────────────────────────────
     │   success     │               │               │
     │<──────────────│               │               │
```

---

## Key Identifiers

| Entity | ID |
|--------|-----|
| Agent ID | `7fcb3a5c-4336-46c2-bc24-03d9ce6a1fb5` |
| Agent Client ID | `agent_itRVZSQhSWgb` |
| Owner/User ID | `28bc31c8-3a5b-4ea0-98bf-dddc9a0e1a8e` |
| Step-Up ID | `53552fba-1135-4ad4-9d97-fcb62df8d09c` |
| SSIM Session ID | `cmkqaev9c0005ktfsyftatevk` |
| Card Token ID | `ac6b9fc7...` |
| Card ID | `177c1c12...` |
| Payment ID | `f09e6ef2-4401-4615-8369-0b793b8762e8` |

---

## Version Info

| Service | Version |
|---------|---------|
| WSIM | v1.0.6 (with Q30 fix) |
| SSIM | v2.1.1 (with Q30 fix) |
| NSIM | v1.2.0 |
| BSIM | v0.8.0 |

---

## Related Documentation

- [Q30 Resolution](PROJECT_QA.md#q30-agent-payment-token-missing-bsim-card_token)
- [Project Status](PROJECT_STATUS.md)
