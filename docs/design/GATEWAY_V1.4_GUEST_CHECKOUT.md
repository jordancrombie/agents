# Design Document: SACP Gateway v1.4.0 - Guest Checkout Flow

**Author**: PM
**Date**: 2026-01-25
**Status**: 🟡 DRAFT - Awaiting Team Review
**Target Release**: Gateway v1.4.0

---

## Executive Summary

This document proposes changes to the SACP Gateway to support a "guest checkout" flow that mirrors standard e-commerce patterns. Currently, the Gateway requires OAuth authentication before users can create a checkout session. This proposal moves authentication to **payment time only**, allowing users to browse and build carts without upfront authorization.

---

## Problem Statement

### Current Flow (Gateway v1.3.x)
```
1. User asks AI to shop           → AI calls GET /products (no auth) ✓
2. User wants to add to cart      → AI calls POST /checkout
                                    → BLOCKED: Requires OAuth token ✗
3. User must authenticate first   → OAuth redirect to WSIM
4. After auth, checkout proceeds  → Flow continues
```

**Issues:**
1. **Unnatural UX**: Real e-commerce sites don't require login to browse or add to cart
2. **ChatGPT friction**: ChatGPT's OAuth Actions require upfront authentication before ANY protected endpoint
3. **Conceptual confusion**: We're conflating store authentication (optional) with wallet authorization (required for payment)

### Desired Flow (Guest Checkout)
```
1. User asks AI to shop           → AI calls GET /products (no auth) ✓
2. User wants to add to cart      → AI calls POST /checkout (no auth) ✓
3. User provides buyer info       → AI calls PATCH /checkout/:id (no auth) ✓
4. User completes purchase        → AI calls POST /checkout/:id/complete
                                    → Returns: authorization_required + auth_url
5. User authorizes payment        → Clicks link / scans QR / approves in wallet app
6. AI polls for completion        → GET /checkout/:id/payment-status/:request_id
7. Order confirmed                → AI displays confirmation
```

---

## Proposed Solution

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           AI Agent (ChatGPT)                            │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ HTTP REST API
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        SACP Gateway v1.4.0                               │
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐   │
│  │  Product API     │  │  Checkout API    │  │  Payment Auth API    │   │
│  │  (No auth)       │  │  (No auth)       │  │  (Initiates wallet   │   │
│  │                  │  │                  │  │   authorization)     │   │
│  └────────┬─────────┘  └────────┬─────────┘  └──────────┬───────────┘   │
│           │                     │                       │               │
│           │     ┌───────────────┴───────────────┐       │               │
│           │     │   Gateway Service Account     │       │               │
│           │     │   (Pre-registered agent)      │       │               │
│           │     └───────────────┬───────────────┘       │               │
└───────────┼─────────────────────┼───────────────────────┼───────────────┘
            │                     │                       │
            ▼                     ▼                       ▼
     ┌─────────────┐       ┌─────────────┐        ┌─────────────┐
     │    SSIM     │       │    SSIM     │        │    WSIM     │
     │  Products   │       │  Checkout   │        │   Device    │
     │    API      │       │    API      │        │    Auth     │
     └─────────────┘       └─────────────┘        └─────────────┘
                                                         │
                                                         ▼
                                                  ┌─────────────┐
                                                  │   mwsim     │
                                                  │  (Mobile)   │
                                                  │  Approval   │
                                                  └─────────────┘
```

### Key Design Decisions

1. **Gateway Service Account**: The Gateway operates as a pre-registered agent (`sacp-gateway`) with WSIM/SSIM, allowing it to create checkouts on behalf of users without per-user OAuth.

2. **Payment-Time Authorization**: When `POST /checkout/:id/complete` is called without a user token, the Gateway initiates WSIM Device Authorization flow and returns the auth URL/QR code for the user.

3. **Polling Model**: The AI polls a new endpoint to detect when the user has approved payment in their wallet app.

---

## API Changes

### Endpoints with Security Changes

| Endpoint | Current | Proposed | Rationale |
|----------|---------|----------|-----------|
| `GET /products` | No auth | No auth | No change |
| `POST /checkout` | OAuth required | **No auth** | Creates session only |
| `PATCH /checkout/:id` | OAuth required | **No auth** | Updates buyer info only |
| `GET /checkout/:id` | OAuth required | **No auth** | View cart/status |
| `POST /checkout/:id/complete` | OAuth required | **No auth*** | *Returns auth URL if no token |
| `GET /checkout/:id/payment-status/:id` | N/A | **New endpoint** | Poll for payment approval |
| `GET /orders/:id` | OAuth required | OAuth required | Order history requires auth |

### New Endpoint: Payment Status Polling

```
GET /checkout/{session_id}/payment-status/{request_id}

Response (pending):
{
  "status": "pending",
  "message": "Waiting for payment authorization...",
  "expires_in": 850
}

Response (approved):
{
  "status": "completed",
  "order_id": "ord_abc123",
  "transaction_id": "txn_xyz789",
  "message": "Payment approved! Order confirmed."
}

Response (rejected/expired):
{
  "status": "rejected" | "expired",
  "message": "Payment was rejected by user" | "Authorization request expired"
}
```

### Modified Endpoint: Complete Checkout

```
POST /checkout/{session_id}/complete

# If user has Bearer token (from prior OAuth):
→ Proceeds with payment using token
→ Returns order confirmation or step_up_required

# If NO Bearer token:
Response (202 Accepted):
{
  "status": "authorization_required",
  "authorization_url": "https://wsim.banksim.ca/api/agent/v1/oauth/authorize?...",
  "qr_code_url": "https://wsim.banksim.ca/m/device?code=WSIM-A3J2K9-B4X8L2",
  "user_code": "WSIM-A3J2K9-B4X8L2",
  "verification_uri": "https://wsim.banksim.ca/m/device",
  "poll_endpoint": "/checkout/{session_id}/payment-status/{request_id}",
  "expires_in": 900,
  "message": "Please authorize the payment by clicking the link or entering code WSIM-A3J2K9-B4X8L2 in your wallet app."
}
```

---

## OpenAPI Specification Changes

```yaml
# Remove security from these endpoints:
/checkout:
  post:
    security: []  # Was: [{ oauth2: ['shopping'] }]

/checkout/{session_id}:
  patch:
    security: []  # Was: [{ oauth2: ['shopping'] }]
  get:
    security: []  # Was: [{ oauth2: ['shopping'] }]

/checkout/{session_id}/complete:
  post:
    security: []  # No upfront auth; returns auth_url if needed
    responses:
      '200':
        description: Payment completed (user already authorized)
      '202':
        description: Authorization required
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/AuthorizationRequired'

# New endpoint:
/checkout/{session_id}/payment-status/{request_id}:
  get:
    security: []
    summary: Poll for payment authorization status
    responses:
      '200':
        description: Current authorization status
```

---

## Implementation Details

### Gateway Configuration

New environment variables required:

```env
# Gateway's own agent credentials (registered with WSIM)
GATEWAY_CLIENT_ID=sacp-gateway
GATEWAY_CLIENT_SECRET=<secret>

# Used for talking to SSIM on behalf of anonymous users
GATEWAY_SSIM_TOKEN=<service-token>
```

### Checkout Session Storage

Extend session storage to track payment authorization requests:

```typescript
interface CheckoutSession {
  id: string;
  ssim_session_id: string;  // SSIM checkout session
  items: CartItem[];
  buyer?: BuyerInfo;
  fulfillment?: FulfillmentInfo;
  status: 'cart' | 'ready_for_payment' | 'authorizing' | 'completed';

  // Payment authorization tracking (new)
  payment_request_id?: string;  // WSIM device_code / request_id
  payment_user_code?: string;   // WSIM-XXXXXX-XXXXXX
  payment_expires_at?: Date;
  user_access_token?: string;   // After authorization approved
}
```

### Complete Checkout Flow (Pseudocode)

```typescript
app.post('/checkout/:session_id/complete', async (req, res) => {
  const session = getCheckoutSession(req.params.session_id);

  // Check if user already has auth token
  const userToken = extractBearerToken(req);

  if (userToken) {
    // User is authenticated - proceed with payment
    const paymentToken = await wsim.requestPaymentToken(userToken, session);
    const order = await ssim.completeCheckout(session, paymentToken);
    return res.json({ status: 'completed', order_id: order.id });
  }

  // No auth token - initiate device authorization
  const deviceAuth = await wsim.startDeviceAuthorization({
    scope: 'purchase',
    agent_name: 'SACP Gateway',
    spending_limits: {
      per_transaction: session.cart.total,
      currency: session.cart.currency
    }
  });

  // Store the authorization request
  session.payment_request_id = deviceAuth.device_code;
  session.payment_user_code = deviceAuth.user_code;
  session.payment_expires_at = new Date(Date.now() + deviceAuth.expires_in * 1000);
  session.status = 'authorizing';

  return res.status(202).json({
    status: 'authorization_required',
    authorization_url: buildAuthUrl(deviceAuth),
    qr_code_url: deviceAuth.verification_uri_complete,
    user_code: deviceAuth.user_code,
    verification_uri: deviceAuth.verification_uri,
    poll_endpoint: `/checkout/${session.id}/payment-status/${deviceAuth.device_code}`,
    expires_in: deviceAuth.expires_in,
    message: `Please authorize the payment by clicking the link or entering code ${deviceAuth.user_code} in your wallet app.`
  });
});
```

---

## Team Dependencies

### Gateway (This Repo) - Owner: PM

| Task | Effort | Status |
|------|--------|--------|
| Remove OAuth security from checkout endpoints | Low | ⬜ TODO |
| Implement device auth flow in completeCheckout | Medium | ⬜ TODO |
| Add payment-status polling endpoint | Low | ⬜ TODO |
| Update OpenAPI spec | Low | ⬜ TODO |
| Register Gateway service account with WSIM | Config | ⬜ TODO |
| Update CHANGELOG and version to 1.4.0 | Low | ⬜ TODO |

### WSIM - Owner: WSIM Team

| Task | Effort | Status |
|------|--------|--------|
| **Review**: Confirm device_authorization works for this use case | Review | ⬜ PENDING |
| **Config**: Register `sacp-gateway` as trusted client | Config | ⬜ TODO |
| **Clarify**: Document any spending limit requirements for gateway agent | Docs | ⬜ TODO |

### SSIM - Owner: SSIM Team

| Task | Effort | Status |
|------|--------|--------|
| **Review**: Confirm agent API allows gateway service token for checkout creation | Review | ⬜ PENDING |
| **Clarify**: Document authentication requirements for agent API | Docs | ⬜ TODO |
| **Optional**: Allow checkout creation without Bearer token (if Option B needed) | Medium | ⬜ DEFER |

### NSIM - Owner: NSIM Team

| Task | Effort | Status |
|------|--------|--------|
| **Review**: Confirm no changes needed | Review | ⬜ PENDING |

### BSIM - Owner: BSIM Team

| Task | Effort | Status |
|------|--------|--------|
| **Review**: Confirm no changes needed | Review | ⬜ PENDING |

### mwsim - Owner: mwsim Team

| Task | Effort | Status |
|------|--------|--------|
| **Review**: Confirm push notification flow works for device auth | Review | ⬜ PENDING |

---

## Sign-Off Tracker

| Team | Reviewer | Status | Date | Notes |
|------|----------|--------|------|-------|
| Gateway | PM | ✅ Author | 2026-01-25 | |
| WSIM | TBD | ⬜ Pending | | |
| SSIM | TBD | ⬜ Pending | | |
| NSIM | TBD | ⬜ Pending | | |
| BSIM | TBD | ⬜ Pending | | |
| mwsim | TBD | ⬜ Pending | | |

---

## Questions for Teams

### For WSIM Team

1. **Device Authorization**: The `POST /api/agent/v1/oauth/device_authorization` endpoint - can it be called by a "gateway" agent without a specific user context? We want the Gateway to initiate auth on behalf of anonymous users.

2. **Spending Limits**: When the gateway initiates device auth, should we pass the checkout total as the spending limit, or use a higher limit?

3. **Client Registration**: What's the process to register `sacp-gateway` as a trusted client?

### For SSIM Team

4. **Checkout Without User Token**: Looking at your agent API, can the Gateway create checkout sessions using its own service credentials (like `ssim-merchant` WSIM client) rather than per-user tokens?

5. **Token Introspection**: When the user eventually authorizes payment, the Gateway will have a WSIM token. Does SSIM need to introspect this, or can the Gateway just pass the payment token to complete?

### For All Teams

6. **Testing**: Can we schedule a cross-team integration test once the Gateway changes are ready?

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SSIM requires per-user auth for checkout | Medium | High | Option B: Add anonymous checkout to SSIM |
| Device auth flow has unexpected limitations | Low | Medium | Early testing with WSIM team |
| ChatGPT doesn't handle 202 responses well | Low | Medium | Also support query parameter for auth token |

---

## Success Criteria

1. ChatGPT can browse products and create checkout without OAuth prompt
2. User sees auth URL/QR code at payment time
3. After wallet app approval, order completes automatically
4. Full flow works end-to-end in production

---

## Timeline

| Phase | Target Date | Activities |
|-------|-------------|------------|
| Design Review | 2026-01-26 | Teams review this document, provide feedback |
| Sign-Off | 2026-01-27 | All teams approve or raise blockers |
| Implementation | 2026-01-28 | Gateway v1.4.0 development |
| Integration Test | 2026-01-29 | Cross-team testing in dev environment |
| Production | 2026-01-30 | Deploy and verify with ChatGPT |

---

## Appendix: Example ChatGPT Conversation

```
User: I want to buy some coffee from the store

ChatGPT: Let me check what's available...
[calls GET /products?q=coffee]

I found these coffee options:
1. Ethiopian Yirgacheffe - $18.99
2. Colombian Medium Roast - $14.99
3. Espresso Blend - $16.99

Which would you like?

User: I'll take the Ethiopian

ChatGPT: Great choice! Let me add that to your cart.
[calls POST /checkout {items: [{product_id: "eth-yirga", quantity: 1}]}]

I've created a checkout with:
- Ethiopian Yirgacheffe x1: $18.99
- Tax: $2.47
- Total: $21.46

I'll need your shipping info. What's your name and email?

User: John Doe, john@example.com

ChatGPT: [calls PATCH /checkout/sess_123 {buyer: {name: "John Doe", email: "john@example.com"}}]

Got it! Where should I ship this?

User: 123 Main St, Toronto, ON M5V 1A1

ChatGPT: [calls PATCH /checkout/sess_123 {fulfillment: {type: "shipping", address: {...}}}]

Your order is ready! Total: $21.46

[calls POST /checkout/sess_123/complete]
→ Response: authorization_required

To complete your purchase, please authorize the payment:
**Click here to authorize**: [link]
Or enter code **WSIM-A3J2K9-B4X8L2** in your WSIM wallet app.

User: *clicks link, approves in wallet app*

ChatGPT: [polling /checkout/sess_123/payment-status/req_xyz]
→ Response: completed, order_id: ord_12345

Your order #12345 is confirmed! You'll receive a confirmation email at john@example.com.
```

---

## References

- [WSIM Device Authorization (RFC 8628)](../teams/WSIM_OPENAPI_SPEC.md)
- [SSIM Agent API](../teams/SSIM_OPENAPI_SPEC.md)
- [Payment Network Integration](../../bsim/docs/PAYMENT_NETWORK_PLAN.md)
- [Merchant Integration Guide](../../nsim/docs/MERCHANT_INTEGRATION_GUIDE.md)
