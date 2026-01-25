# Design Document: SACP Gateway v1.4.0 - Guest Checkout Flow

**Author**: PM
**Date**: 2026-01-25
**Status**: 🟢 IMPLEMENTED - Phase 1 Complete, Ready for Testing
**Target Release**: Gateway v1.4.0
**Last Updated**: 2026-01-25 (WSIM Q#1-7 answered; credential provisioning next)

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

## SSIM Team Analysis (2026-01-25)

### Decision: Option A Confirmed

The SSIM team has reviewed this proposal and **confirmed Option A (Gateway has its own agent credentials)** is the correct approach.

| Criteria | Option A: Gateway Credentials | Option B: Anonymous Checkout |
|----------|------------------------------|------------------------------|
| Security Model | ✅ Maintains authenticated actor principle | ❌ Creates anonymous attack surface |
| SACP Philosophy | ✅ Gateway is a first-class agent | ❌ Violates agent identity model |
| Multi-tenant Safety | ✅ Credentials scoped by storeId | ❌ Requires additional abuse prevention |
| Audit Trail | ✅ Every action tied to agent identity | ❌ No attribution for session creation |
| Future Extensibility | ✅ Pattern scales to more agents | ❌ Sets bad precedent |
| SSIM Changes | ✅ None required | ❌ Invasive changes needed |

**Recommendation: Option A**

### Token Introspection Architecture (RFC 7662)

SSIM uses token introspection - the industry-standard approach for financial APIs:

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Gateway   │         │    SSIM     │         │    WSIM     │
└──────┬──────┘         └──────┬──────┘         └──────┬──────┘
       │                       │                       │
       │ 1. Bearer <jwt>       │                       │
       │──────────────────────>│                       │
       │                       │ 2. Introspect token   │
       │                       │──────────────────────>│
       │                       │ 3. { active: true,    │
       │                       │      agent_id, perms }│
       │                       │<──────────────────────│
       │ 4. Response           │                       │
       │<──────────────────────│                       │
```

**Why Introspection (not direct JWT validation)?**

| Approach | Pros | Cons |
|----------|------|------|
| Introspection (SSIM uses this) | Real-time revocation, live spending limits, single source of truth | Extra network hop |
| Direct JWT | Faster (no network call) | Stale data, can't revoke until expiry |

For financial transactions, introspection is correct. SSIM's 60s TTL cache balances performance with freshness.

### Current State: What's Already Implemented

| Component | Status | Location |
|-----------|--------|----------|
| Agent token validation middleware | ✅ Done | ssim/src/services/wsim-agent.ts |
| Token caching (60s TTL) | ✅ Done | ssim/src/services/wsim-agent.ts |
| Introspection client config | ✅ Done | ssim/src/config/env.ts |
| Agent API routes | ✅ Done | ssim/src/routes/agent.ts |
| NSIM accepts agentContext | ✅ Done (v1.2.0) | NSIM payment API |

### Identified Gap: Agent Context in Payment Flow

The full agent payment flow should be:

```
Gateway → SSIM → WSIM (introspect) ✅ Working
               → NSIM (authorize with agentContext) ⚠️ Needs verification
```

**Gap:** When a request originates from an authenticated agent session, does SSIM's payment service pass `agentContext` to NSIM?

- NSIM v1.2.0 now accepts `agentContext` for agent-initiated payments
- SSIM validates the agent token via WSIM introspection
- **Action needed:** Verify SSIM includes agent context when calling NSIM's payment API

This is likely a small code enhancement if not already present - passing the agent metadata through to NSIM.

### Address/Fulfillment Data Handling

**Clarification (2026-01-25):** SSIM currently accepts `fulfillment.address` data in checkout sessions but **does not** pass this to the payment network (NSIM/BSIM) as part of the transaction. The address is stored with the order for merchant reference only.

| Data Field | Accepted | Stored | Passed to NSIM |
|------------|----------|--------|----------------|
| `buyer.name` | ✅ | ✅ | ❌ |
| `buyer.email` | ✅ | ✅ | ❌ |
| `fulfillment.address` | ✅ | ✅ | ❌ |
| `fulfillment.type` | ✅ | ✅ | ❌ |

**If required:** SSIM can be updated to pass address data to NSIM for:
- Address Verification System (AVS) checks
- Fraud prevention transaction details
- Compliance/audit requirements

This would be a small enhancement. Please confirm if this is a requirement for v1.4.0.

### Bottom Line

The infrastructure exists. This sprint is about:

1. **Configuration**: Registering Gateway credentials with WSIM
2. **Verification**: Ensuring agentContext flows through SSIM → NSIM payment calls

No new foundations needed - just wiring the existing pieces together.

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
  "qr_code_url": "https://wsim.banksim.ca/m/device?code=WSIM-A3J2K9",
  "user_code": "WSIM-A3J2K9",
  "verification_uri": "https://wsim.banksim.ca/m/device",
  "poll_endpoint": "/checkout/{session_id}/payment-status/{request_id}",
  "expires_in": 900,
  "message": "Please authorize the payment by clicking the link or entering code WSIM-A3J2K9 in your wallet app."
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
  payment_user_code?: string;   // WSIM-XXXXXX (shortened per RFC 8628)
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

### Gateway (This Repo) - Owner: Agents Team

| Task | Effort | Status |
|------|--------|--------|
| Remove OAuth security from checkout endpoints | Low | ✅ DONE |
| Implement device auth flow in completeCheckout | Medium | ✅ DONE |
| Add payment-status polling endpoint | Low | ✅ DONE |
| Update OpenAPI spec | Low | ✅ DONE |
| Configure `GATEWAY_CLIENT_ID`, `GATEWAY_CLIENT_SECRET` | Config | ✅ DONE |
| Update CHANGELOG and version to 1.4.0 | Low | ✅ DONE |

### WSIM - Owner: WSIM Team

| Task | Effort | Status |
|------|--------|--------|
| **Review**: Confirm device_authorization works for this use case | Review | ✅ CONFIRMED |
| **Config**: Register `sacp-gateway` as agent | Config | ✅ DONE |
| **Config**: Provide client credentials to Gateway team | Config | ✅ DONE |
| **Config**: Confirm `ssim-merchant` in production `INTROSPECTION_CLIENTS` | Config | ⬜ TODO (DevOps) |
| **Clarify**: Document spending limit requirements for gateway agent | Docs | ✅ DONE |
| **Enhancement**: Shorten user codes to `WSIM-XXXXXX` | Low | ✅ DONE |

**WSIM Implementation (2026-01-25):**

1. **Client Registration**: `sacp-gateway` added to `KNOWN_OAUTH_CLIENTS` in [agent-oauth.ts](wsim/backend/src/routes/agent-oauth.ts)
2. **User Codes**: Shortened from `WSIM-XXXXXX-XXXXXX` (18 chars) to `WSIM-XXXXXX` (11 chars) per RFC 8628 Section 6.1
3. **Environment Variable**: `OAUTH_CLIENT_SECRET_SACP_GATEWAY`

**Credentials for Agents Team:**
```
GATEWAY_CLIENT_ID=sacp-gateway
GATEWAY_CLIENT_SECRET=<provided-via-secure-channel>
```
⚠️ **Note**: Secrets are provided via secure channel (not stored in repo). Contact WSIM team for credentials.

### SSIM - Owner: SSIM Team

| Task | Effort | Status |
|------|--------|--------|
| **Review**: Confirm agent API allows gateway service token | Review | ✅ CONFIRMED |
| **Review**: Option A (Gateway credentials) approved | Review | ✅ CONFIRMED |
| **Verify**: Ensure `agentContext` passed to NSIM in payment calls | Code Review | ✅ VERIFIED |

**SSIM Verification (2026-01-25):**

`agentContext` is **already implemented** and passed to NSIM. No code changes required.

| Component | Status | Location |
|-----------|--------|----------|
| `AgentContext` interface | ✅ Defined | [payment.ts:7-13](ssim/src/services/payment.ts#L7-L13) |
| `AuthorizeParams.agentContext` | ✅ Defined | [payment.ts:22](ssim/src/services/payment.ts#L22) |
| Payment service → NSIM | ✅ Sends agentContext | [payment.ts:119-123](ssim/src/services/payment.ts#L119-L123) |
| Agent API builds context | ✅ From session | [agent-api.ts:1049-1056](ssim/src/routes/agent-api.ts#L1049-L1056) |
| Agent API → authorizePayment | ✅ Passes context | [agent-api.ts:1123](ssim/src/routes/agent-api.ts#L1123) |

**Data passed to NSIM:**
```typescript
agentContext: {
  agentId: session.agentId,      // Gateway's agent ID
  ownerId: session.ownerId,      // User who approved payment
  humanPresent: false,           // Agent-initiated
  mandateId: string | undefined, // If using mandate
  mandateType: 'cart'            // Transaction type
}
```

### NSIM - Owner: NSIM Team

| Task | Effort | Status |
|------|--------|--------|
| **Review**: Confirm no changes needed | Review | ⬜ PENDING |
| **Verify**: `agentContext` parameter accepted in payment API (v1.2.0) | Review | ✅ CONFIRMED |

### BSIM - Owner: BSIM Team

| Task | Effort | Status |
|------|--------|--------|
| **Review**: Confirm no changes needed | Review | ⬜ PENDING |

### mwsim - Owner: mwsim Team

| Task | Effort | Status |
|------|--------|--------|
| **Review**: ~~Confirm push notification flow works for device auth~~ | Review | ✅ CLARIFIED |
| **New**: Ensure "Enter Code" screen accessible for Device Authorization | Low | ✅ DONE |

**mwsim v2.2.0 Analysis (2026-01-25):**

**Important Clarification:** Device Authorization (RFC 8628) does **NOT** use push notifications. This is a different flow from the Authorization Code flow. See Question #6 answer for details.

| Feature | mwsim Support | Notes |
|---------|---------------|-------|
| Device Code Entry Screen | ✅ **Implemented** | Settings → "Link Device" screen for manual code entry |
| Display client name | ✅ Available | `client_name` field from WSIM |
| Show requested scopes | ✅ Available | Scopes with descriptions |
| Biometric-protected approval | ✅ Available | Face ID/Touch ID required |
| Countdown timer | ✅ Available | 15-minute expiration (per RFC 8628) |
| Reject option | ✅ Available | Available without biometric |
| Spending limits display | ✅ Available | Shows per-transaction, daily, monthly limits |

**mwsim Implementation (Updated 2026-01-25):**

**Screen: DeviceCodeEntryScreen** (Settings → "Link Device")

| Feature | Requirement | Status |
|---------|-------------|--------|
| Code input | Accept `WSIM-XXXXXX` or `XXXXXX` (case insensitive) | ✅ Done |
| Agent name | Display `agent_name` from claim response | ✅ Done |
| Permissions list | Show `requested_permissions` with descriptions | ✅ Done |
| Spending limits | Show per-transaction, daily, monthly limits | ✅ Done |
| Countdown timer | Show `time_remaining_seconds` with live countdown | ✅ Done |
| Approve button | Requires biometric auth, calls approve endpoint | ✅ Done |
| Reject button | No biometric required, calls reject endpoint | ✅ Done |

**Files Created/Modified:**
- `app/src/screens/DeviceCodeEntry.tsx` - New screen
- `app/src/types/agent.ts` - Added `DeviceCodeClaimRequest`, `DeviceCodeClaimResponse`
- `app/src/services/agent-api.ts` - Added `claimDeviceCode()` method
- `app/src/screens/Settings.tsx` - Added "Link Device" option
- `app/App.tsx` - Added `deviceCodeEntry` screen routing

**⚠️ API Correction - Actual WSIM Endpoints:**

```typescript
// 1. Claim/lookup device code (NOT a GET - it's a POST)
POST /api/mobile/device-codes/claim
Body: { user_code: "WSIM-A3J2K9" }  // or just "A3J2K9"
Response: {
  access_request: {
    id: "req_xxx",
    agent_name: "SACP Gateway Checkout",
    agent_description: "...",
    requested_permissions: ["browse", "cart", "purchase"],
    requested_limits: {
      per_transaction: "21.46",
      daily: "21.46",
      monthly: "21.46",
      currency: "CAD"
    },
    expires_at: "2026-01-25T12:15:00Z",
    time_remaining_seconds: 850
  }
}

// 2. Approve (requires biometric)
POST /api/mobile/access-requests/:requestId/approve
Body: { consent: true }

// 3. Reject
POST /api/mobile/access-requests/:requestId/reject
Body: { reason?: "User declined" }
```

**User Flow:**
1. User navigates to Settings → Link Device
2. User enters code shown by ChatGPT (e.g., `WSIM-A3J2K9`)
3. mwsim calls `POST /device-codes/claim` → returns access request details
4. User reviews agent name, permissions, and spending limits
5. User approves (biometric) or rejects
6. Gateway's polling detects approval → checkout completes

---

## Sign-Off Tracker

| Team | Reviewer | Status | Date | Notes |
|------|----------|--------|------|-------|
| Gateway | PM | ✅ Author | 2026-01-25 | |
| WSIM | WSIM Team | ✅ Approved | 2026-01-25 | Q#1-7 answered; ready for credential provisioning |
| SSIM | SSIM Team | ✅ Approved | 2026-01-25 | All tasks complete; agentContext verified |
| NSIM | TBD | ⬜ Pending | | agentContext support confirmed (v1.2.0) |
| BSIM | TBD | ⬜ Pending | | |
| mwsim | mwsim Team | ✅ Approved | 2026-01-25 | Q#6 clarified: Device auth doesn't use push; needs "Enter Code" screen |

---

## Questions for Teams

### For WSIM Team (Priority)

1. **Agent Registration**: What's the process to register `sacp-gateway` as a new agent? (API, admin UI, or DB seed?)

   **WSIM Answer (2026-01-25):** Three options available:

   | Method | Use Case | Process |
   |--------|----------|---------|
   | **DB Seed** (Recommended for Gateway) | Pre-registered service accounts | Add to database migration or seed script |
   | Mobile API | User-registered agents | `POST /api/mobile/agents` via mwsim |
   | Device Authorization | Agent-initiated with user approval | `POST /device_authorization` + user enters code |

   **For `sacp-gateway`:** Use DB seed or add to `KNOWN_OAUTH_CLIENTS` in [agent-oauth.ts](backend/src/routes/agent-oauth.ts:193) similar to how `chatgpt`, `claude-mcp`, and `gemini` are pre-registered. This gives the Gateway a known `client_id` and configured `client_secret` via environment variable (`OAUTH_CLIENT_SECRET_SACP_GATEWAY`).

2. **Permission Scoping**: Can `sacp-gateway` credentials be scoped to specific permissions? (e.g., `checkout:create` only, no `payment:execute`)

   **WSIM Answer (2026-01-25):** Yes. Valid permissions are: `browse`, `cart`, `purchase`, `history`.

   | Permission | Description | Gateway Needs? |
   |------------|-------------|----------------|
   | `browse` | View products/catalog | ✅ Yes |
   | `cart` | Create/manage carts | ✅ Yes |
   | `purchase` | Execute payments | ✅ Yes |
   | `history` | View transaction history | ❌ No |

   **Note:** There's no separate `checkout:create` vs `payment:execute` split. The `purchase` permission allows payment token requests. For Gateway guest checkout, the user approves each transaction via Device Authorization, so permissions are scoped to that single session.

3. **Production Config**: Is `ssim-merchant` already configured in production's `INTROSPECTION_CLIENTS`?

   **WSIM Answer (2026-01-25):** Check your production environment. The `INTROSPECTION_CLIENTS` env var accepts a JSON array:

   ```json
   [{"clientId":"ssim-merchant","clientSecret":"<secret>"},{"clientId":"sacp-gateway","clientSecret":"<secret>"}]
   ```

   Default development fallback: `ssim_introspect` (see [env.ts:53-56](backend/src/config/env.ts#L53-L56))

   **Action Required:** Gateway team should confirm with DevOps that `ssim-merchant` is in production config. If not, add it along with `sacp-gateway`.

4. **Device Authorization**: The `POST /api/agent/v1/oauth/device_authorization` endpoint - can it be called by the gateway agent without a specific user context? We want the Gateway to initiate auth on behalf of anonymous users.

   **WSIM Answer (2026-01-25):** ✅ **YES - This is exactly how it works!**

   The endpoint requires **no authentication** - it's designed for this use case. See [agent-oauth.ts:62-169](backend/src/routes/agent-oauth.ts#L62-L169):

   1. Gateway calls `POST /device_authorization` with `agent_name`, `scope`, and `spending_limits`
   2. WSIM returns `device_code` + `user_code` (no user context yet)
   3. User claims the code by entering it in mwsim (this associates the request with a user)
   4. Gateway polls token endpoint until approved
   5. On approval, Gateway receives credentials for that user's session

   **This is RFC 8628 Device Authorization Grant** - the user is anonymous until they claim the code.

5. **Spending Limits**: When the gateway initiates device auth, should we pass the checkout total as the spending limit, or use a higher limit?

   **WSIM Answer (2026-01-25):** **Pass the exact checkout total** as `per_transaction` limit.

   ```json
   {
     "agent_name": "SACP Gateway Checkout",
     "scope": "purchase",
     "spending_limits": {
       "per_transaction": 21.46,
       "daily": 21.46,
       "monthly": 21.46,
       "currency": "CAD"
     }
   }
   ```

   **Rationale:**
   - Each guest checkout is a single-use authorization
   - Setting all limits to the checkout total ensures the user approves exactly what they're buying
   - No risk of the credentials being reused for unauthorized purchases
   - User sees the exact amount during approval in mwsim

6. **Notification Type Alignment (from mwsim)**: Will `POST /api/agent/v1/oauth/device_authorization` trigger an `oauth.authorization` push notification to mwsim? mwsim v2.2.0 handles this notification type and routes to the `OAuthAuthorization` approval screen. If device auth uses a different notification type, please confirm so mwsim can add handling.

   **WSIM Answer (2026-01-25):** No, Device Authorization (RFC 8628) does **NOT** send push notifications. This is intentional per the RFC specification - the flow is designed for devices with limited input capabilities where the user is already aware they need to authenticate.

   **How Device Authorization Works:**
   1. Gateway calls `POST /device_authorization` → receives `user_code` + `verification_uri`
   2. AI shows user the code (e.g., `WSIM-A3J2K9`) and/or verification URL
   3. User **manually** opens mwsim and navigates to "Enter Code" screen (or visits `verification_uri_complete`)
   4. User enters the code and approves the request directly in the app
   5. Gateway polls until approval is detected

   **Key Difference from Authorization Code Flow:**
   | Flow | Push Notification | User Action |
   |------|-------------------|-------------|
   | Authorization Code (OAuth 2.0) | ✅ Yes - `oauth.authorization` | User receives push, taps to open approval screen |
   | Device Authorization (RFC 8628) | ❌ No | User manually enters code in app or visits URL |

   **mwsim Impact:** No new notification handling needed. mwsim should ensure there's an "Enter Code" screen accessible from the app (already exists at `/m/device` web endpoint - mobile equivalent needed if not present).

7. **User Code Format (WSIM Suggestion)**: The current user code format `WSIM-XXXXXX-XXXXXX` (18 characters) exceeds RFC 8628 Section 6.1 recommendations. We propose shortening to improve usability:

   | Format | Length | Example | RFC 8628 Compliance |
   |--------|--------|---------|---------------------|
   | Current | 18 chars | `WSIM-A3J2K9-B4X8L2` | ⚠️ Longer than recommended |
   | Proposed | 11 chars | `WSIM-A3J2K9` | ✅ Acceptable |
   | Minimal | 8 chars | `A3J2K9B4` | ✅ Optimal per RFC |

   **RFC 8628 Section 6.1 User Code Recommendations:**
   - Should be ~8 characters for easy entry
   - Case-insensitive (WSIM uses uppercase only ✅)
   - Avoid ambiguous characters like I, O, 0, 1, L (WSIM excludes these ✅)
   - Easy to type on limited input devices

   **WSIM Recommendation:** Shorten to `WSIM-XXXXXX` (11 chars) to retain branding while improving usability. The 6-character random portion (using 32-character alphabet: A-Z excluding I,O + 2-9 excluding 0,1) provides ~1 billion combinations - sufficient for 15-minute validity windows.

### For SSIM Team (Resolved)

~~6. **Checkout Without User Token**: Can the Gateway create checkout sessions using its own service credentials?~~
   - **Answer**: ✅ Yes - Option A confirmed. Gateway acts as a first-class agent with its own credentials.

~~7. **Token Introspection**: Does SSIM introspect Gateway tokens?~~
   - **Answer**: ✅ Yes - SSIM uses RFC 7662 token introspection with WSIM, with 60s TTL cache.

~~8. **Agent Context Flow**: Does SSIM pass `agentContext` to NSIM when processing payments from authenticated agents?~~
   - **Answer**: ✅ Yes - Already implemented. See SSIM Verification section above for code locations.

9. **Address Data in Transactions**: Does the payment flow require address data (AVS, fraud prevention)?
   - **Clarification**: SSIM accepts and stores `fulfillment.address` but does not currently pass it to NSIM. Can add this if required - please confirm.

### For All Teams

10. **Testing**: Can we schedule a cross-team integration test once the Gateway changes are ready?

---

## Consolidated Action Items

**✅ COMPLETED:**

| # | Owner | Task | Type | Status |
|---|-------|------|------|--------|
| 1 | WSIM Team | Answer Q#1-5 (registration process, permissions, device auth) | Response | ✅ Done |
| 2 | WSIM Team | Register `sacp-gateway` in `KNOWN_OAUTH_CLIENTS` | Config | ✅ Done |
| 3 | WSIM Team | Set `OAUTH_CLIENT_SECRET_SACP_GATEWAY` env var | Config | ✅ Done (dev) |
| 6 | SSIM Team | Verify `agentContext` passed to NSIM | Code Review | ✅ Done (already implemented) |
| 7 | mwsim Team | Ensure "Enter Code" screen accessible | Code/Config | ✅ Done |
| 9 | WSIM Team | Shorten user codes to `WSIM-XXXXXX` | Enhancement | ✅ Done |

**✅ PHASE 1 COMPLETE (2026-01-25):**

| # | Owner | Task | Type | Status |
|---|-------|------|------|--------|
| 4 | Agents Team | Add `sacp-gateway` client_id/secret to Gateway config | Config | ✅ Done |
| 5 | Agents Team | Implement guest checkout (Phase 1 tasks) | Code | ✅ Done |

**🟡 Remaining Work:**

| # | Owner | Task | Type |
|---|-------|------|------|
| 8 | DevOps | Confirm `ssim-merchant` + `sacp-gateway` in prod `INTROSPECTION_CLIENTS` | Config |

**🟢 Nice-to-Have:**

| # | Owner | Task | Type | Status |
|---|-------|------|------|--------|
| 9 | WSIM Team | Shorten user codes to `WSIM-XXXXXX` | Enhancement | ✅ Done |

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ~~SSIM requires per-user auth for checkout~~ | ~~Medium~~ | ~~High~~ | ✅ **Resolved**: Option A confirmed - Gateway uses own agent credentials |
| ~~agentContext not passed through SSIM → NSIM~~ | ~~Low~~ | ~~Medium~~ | ✅ **Resolved**: Already implemented in SSIM payment service |
| Device auth flow has unexpected limitations | Low | Medium | Early testing with WSIM team |
| ChatGPT doesn't handle 202 responses well | Low | Medium | Also support query parameter for auth token |
| ~~WSIM agent registration process unclear~~ | ~~Low~~ | ~~Medium~~ | ✅ **Resolved**: `sacp-gateway` registered, credentials provided |

---

## Success Criteria

1. ChatGPT can browse products and create checkout without OAuth prompt
2. User sees auth URL/QR code at payment time
3. After wallet app approval, order completes automatically
4. Full flow works end-to-end in production

---

## Project Plan

### Phase 0: Unblock (2026-01-25 → 2026-01-26)

**Goal:** Get WSIM answers and credentials to unblock development.

| # | Task | Owner | Blocker? | Status |
|---|------|-------|----------|--------|
| 0.1 | WSIM: Answer Q#1-7 (agent registration, permissions, device auth) | WSIM Team | 🔴 Yes | ✅ Done |
| 0.2 | WSIM: Register `sacp-gateway` in `KNOWN_OAUTH_CLIENTS` | WSIM Team | 🔴 Yes | ✅ Done |
| 0.3 | WSIM: Set `OAUTH_CLIENT_SECRET_SACP_GATEWAY` env var (dev + prod) | WSIM Team | 🔴 Yes | ✅ Done (dev) |
| 0.4 | WSIM: Implement shorter user codes (`WSIM-XXXXXX`) | WSIM Team | ❌ No | ✅ Done |
| 0.5 | NSIM/BSIM: Review and confirm no changes needed | NSIM/BSIM | ❌ No | ⬜ TODO |

### Phase 1: Gateway Implementation (2026-01-27 → 2026-01-28)

**Goal:** Implement guest checkout flow in Gateway v1.4.0.

| # | Task | Owner | Depends On | Status |
|---|------|-------|------------|--------|
| 1.1 | Remove OAuth security from checkout endpoints | Agents Team | - | ✅ DONE |
| 1.2 | Add `AuthorizationRequired` and `PaymentStatus` schemas to OpenAPI | Agents Team | - | ✅ DONE |
| 1.3 | Implement device auth initiation in `completeCheckout` | Agents Team | 0.1-0.3 | ✅ DONE |
| 1.4 | Add `/checkout/:id/payment-status/:id` polling endpoint | Agents Team | 1.3 | ✅ DONE |
| 1.5 | Configure `GATEWAY_CLIENT_ID`, `GATEWAY_CLIENT_SECRET` | Agents Team | 0.3 | ✅ DONE |
| 1.6 | Update CHANGELOG and bump to v1.4.0 | Agents Team | 1.1-1.5 | ✅ DONE |

### Phase 2: Parallel Verification (2026-01-27 → 2026-01-28)

**Goal:** Verify supporting systems work correctly.

| # | Task | Owner | Depends On | Status |
|---|------|-------|------------|--------|
| 2.1 | SSIM: Verify `agentContext` passed to NSIM in payments | SSIM Team | - | ✅ DONE |
| 2.2 | mwsim: Ensure "Enter Code" screen accessible in app | mwsim Team | - | ✅ DONE |
| 2.3 | WSIM: Confirm `ssim-merchant` in prod `INTROSPECTION_CLIENTS` | WSIM Team | - | ⬜ TODO |

### Phase 3: Integration Testing (2026-01-29)

**Goal:** End-to-end testing across all systems.

| # | Task | Owner | Depends On | Status |
|---|------|-------|------------|--------|
| 3.1 | Deploy Gateway v1.4.0 to dev environment | Agents Team | Phase 1 | ⬜ TODO |
| 3.2 | Test: Browse → Cart → Checkout → Device Auth → Poll → Complete | All Teams | 3.1, Phase 2 | ⬜ TODO |
| 3.3 | Test: User enters code manually in mwsim | mwsim Team | 3.1 | ⬜ TODO |
| 3.4 | Test: User clicks verification URL | Agents Team | 3.1 | ⬜ TODO |
| 3.5 | Test: Authorization timeout/rejection | Agents Team | 3.1 | ⬜ TODO |

### Phase 4: Production (2026-01-30)

| # | Task | Owner | Depends On | Status |
|---|------|-------|------------|--------|
| 4.1 | Deploy Gateway v1.4.0 to production | Agents Team | Phase 3 | ⬜ TODO |
| 4.2 | Update ChatGPT Action with new OpenAPI spec | Agents Team | 4.1 | ⬜ TODO |
| 4.3 | Verify end-to-end with ChatGPT | Agents Team | 4.2 | ⬜ TODO |
| 4.4 | Monitor for issues (24h) | All Teams | 4.3 | ⬜ TODO |

---

## Team Assignments Summary

### Agents Team (us - owns Gateway)
- **Phase 1**: All implementation tasks (1.1-1.6)
- **Phase 3-4**: Deployment and ChatGPT integration

### WSIM Team (Wallet)
- **Phase 0** (BLOCKING): Client registration, credentials
- **Phase 2**: Production config verification
- **Nice-to-have**: Shorter user codes

### SSIM Team (Store)
- **Phase 2**: Verify agentContext flow to NSIM
- ✅ Already approved design

### mwsim Team (Mobile App)
- **Phase 2**: Ensure "Enter Code" screen accessible ✅ COMPLETE
- **Phase 3**: Test manual code entry flow (pending Gateway deployment)
- ✅ Already approved design
- ✅ Implementation complete (DeviceCodeEntryScreen)

### NSIM Team (Network) / BSIM Team (Bank)
- **Phase 0**: Review and confirm no changes needed

---

## Deferred to v1.4.1

| Item | Reason |
|------|--------|
| Address data to NSIM (AVS/fraud) | Not required for MVP; can add later |
| QR code generation | URL is sufficient; QR is nice-to-have |

---

## Timeline

| Phase | Target Date | Activities |
|-------|-------------|------------|
| Phase 0: Unblock | 2026-01-25 → 01-26 | WSIM answers + credentials |
| Phase 1: Implementation | 2026-01-27 → 01-28 | Gateway v1.4.0 development |
| Phase 2: Verification | 2026-01-27 → 01-28 | SSIM/mwsim parallel work |
| Phase 3: Integration Test | 2026-01-29 | Cross-team testing |
| Phase 4: Production | 2026-01-30 | Deploy and verify |

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
Or enter code **WSIM-A3J2K9** in your WSIM wallet app.

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
