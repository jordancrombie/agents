# Payment-Bootstrapped OAuth

**Unified Purchase, Consent, and Delegation Model for MCP + WSIM**

**Owner**: WSIM Team + mwsim Team + Agents Team (Joint)
**Date**: 2026-02-01 (Updated)
**Status**: Design Approved - OpenAI Requirements Confirmed
**Related**: [ChatGPT OAuth Integration Plan](./PROJECT_PLAN_CHATGPT_OAUTH_INTEGRATION.md), [MCP Team Implementation Guide](./MCP_TEAM_IMPLEMENTATION_GUIDE.md)

---

## Executive Summary

We are implementing a **payment-bootstrapped OAuth model** where:

1. **The first purchase doubles as:**
   - A one-time payment approval, AND
   - An optional grant of ongoing purchase permissions (OAuth delegation) with user-defined limits

2. **Subsequent purchases** may execute automatically using the OAuth token as long as they remain within limits

3. **Any purchase that exceeds granted limits** triggers a WSIM step-up authorization (QR / push / link)

4. **OAuth is not required upfront** - it is earned at the moment of first real value (the first purchase)

This produces better UX, clearer consent, and a safer delegation model than "OAuth first, then buy."

---

## Core Principles

### 1. OAuth ≠ Payment Approval

| Concept | Meaning |
|---------|---------|
| **OAuth** | Standing delegation - "This AI can act on my behalf within limits" |
| **WSIM Authorization** | Transaction consent - "I approve THIS specific payment" |

### 2. Delegation Is Optional and Contextual

- Users are asked for ongoing permission **only after seeing a real purchase**
- Limits are explicit and user-controlled
- Users can always decline delegation and still complete the payment

### 3. Server-Enforced Policy

- MCP enforces limits and decides when step-up is required
- ChatGPT simply calls tools with or without tokens
- WSIM is the source of truth for limits and authorization

### 4. Runtime, Tool-Level Authentication

- Authentication is triggered at **tool execution time**, not connector setup
- Only sensitive tools (e.g., `checkout`) require OAuth
- Non-sensitive tools (e.g., `browse_products`) work without auth

---

## High-Level Flow

### 1️⃣ First Purchase (No OAuth Token)

```
User: "Buy me that backpack"
    ↓
ChatGPT calls checkout tool (NO OAuth token)
    ↓
MCP creates WSIM authorization request (device auth flow)
    ↓
User sees WSIM Consent UI in browser/app
    ↓
User approves payment + optionally grants delegation
    ↓
Payment completes
    ↓
If delegation granted:
    → MCP triggers OAuth challenge
    → ChatGPT initiates OAuth flow
    → User sees one-tap consent (already authenticated)
    → OAuth token issued to ChatGPT
```

#### WSIM Consent UI (Combined Flow)

The WSIM authorization page shows:

```
┌─────────────────────────────────────────────────────┐
│                   WSIM Wallet                        │
├─────────────────────────────────────────────────────┤
│                                                      │
│  SACP Demo Store wants to charge $49.99             │
│  for: Backpack                                       │
│                                                      │
│  [Passkey / Face ID to approve]                     │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ☐ Allow future purchases from this store           │
│     (You can revoke this anytime)                   │
│                                                      │
│     Per-transaction limit: [$ 25.00 ▼]              │
│     Daily limit:           [$ 100.00 ▼]             │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**If user checks the delegation box:**
- Payment completes
- WSIM records delegation intent
- MCP triggers OAuth challenge (ChatGPT initiates OAuth flow)
- User sees one-tap consent (already authenticated)
- ChatGPT stores OAuth token

**If user leaves it unchecked:**
- Payment completes normally
- No token is issued
- Next purchase will require authorization again

> **Note**: Due to PKCE constraints, OAuth must be a two-step process. See Q1 in Implementation Clarifications for details.

### 2️⃣ Subsequent Purchase (OAuth Token Present, Within Limits)

```
User: "Buy me socks" ($15)
    ↓
ChatGPT calls checkout WITH OAuth token
    ↓
MCP validates token + checks limits with WSIM
    ↓
Within limits → auto-approve
    ↓
Payment completes (no user interaction needed!)
```

### 3️⃣ Over-Limit Purchase (Step-Up Required)

```
User: "Buy me that laptop" ($899)
    ↓
ChatGPT calls checkout WITH OAuth token
    ↓
MCP checks limits → exceeds per-transaction cap ($25)
    ↓
WSIM step-up triggered (QR / push / link)
    ↓
User approves THIS specific transaction
    ↓
Payment completes
```

**Important:** This is NOT an OAuth scope expansion. It is a transaction-specific WSIM authorization. The OAuth token and its limits remain unchanged.

---

## Detailed Flow Diagrams

### Flow A: First Purchase (No Token)

This is the initial purchase flow when the user has no existing delegation.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    ChatGPT      │     │   MCP Server    │     │      WSIM       │     │     mwsim       │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │                       │
         │ "Buy this backpack"   │                       │                       │
         │ ───────────────────▶  │                       │                       │
         │                       │                       │                       │
         │                       │ checkout(item, $49.99)│                       │
         │                       │ (no Bearer token)     │                       │
         │                       │ ──────────────────────│──▶                    │
         │                       │                       │                       │
         │                       │                       │ Create access request │
         │                       │                       │ with payment_context  │
         │                       │                       │                       │
         │                       │                       │ Send push notification│
         │                       │                       │ ─────────────────────────────────▶
         │                       │                       │                       │
         │                       │ Return device_code    │                       │
         │                       │ + QR code URL         │                       │
         │                       │ ◀──────────────────── │                       │
         │                       │                       │                       │
         │ Show QR code widget   │                       │                       │
         │ (fallback if no push) │                       │                       │
         │ ◀───────────────────  │                       │                       │
         │                       │                       │                       │
         │                       │                       │                       │ User sees push:
         │                       │                       │                       │ "SACP wants to
         │                       │                       │                       │  charge $49.99"
         │                       │                       │                       │
         │                       │                       │                       │ User opens app
         │                       │                       │                       │
         │                       │                       │                       │ Shows payment UI:
         │                       │                       │                       │ • Amount: $49.99
         │                       │                       │                       │ • Item: Backpack
         │                       │                       │                       │ • ☐ Allow future
         │                       │                       │                       │     purchases
         │                       │                       │                       │
         │                       │                       │                       │ User approves
         │                       │                       │                       │ (with or without
         │                       │                       │                       │  delegation)
         │                       │                       │                       │
         │                       │                       │ ◀─────────────────────────────────
         │                       │                       │ POST approve with     │
         │                       │                       │ grant_delegation +    │
         │                       │                       │ delegation_limits     │
         │                       │                       │                       │
         │                       │ Poll: approved!       │                       │
         │                       │ + delegation_pending  │                       │
         │                       │ ◀──────────────────── │                       │
         │                       │                       │                       │
         │ "Payment complete!    │                       │                       │
         │ Link wallet for       │                       │                       │
         │ auto-payments."       │                       │                       │
         │ + OAuth challenge     │                       │                       │
         │ ◀───────────────────  │                       │
         │                       │                       │                       │
         │ (If delegation_pending)                       │                       │
         │ ChatGPT triggers OAuth│                       │                       │
         │ ───────────────────────────────────────────▶ │                       │
         │                       │                       │                       │
         │ User sees one-tap     │                       │                       │
         │ consent (already      │                       │                       │
         │ authenticated)        │                       │                       │
         │ ◀───────────────────────────────────────────  │                       │                       │
         │                       │                       │                       │
```

### Flow B: Delegated Purchase (Within Limits)

User has previously granted delegation. This purchase is within their limits.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    ChatGPT      │     │   MCP Server    │     │      WSIM       │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ "Buy me socks"        │                       │
         │ ───────────────────▶  │                       │
         │                       │                       │
         │                       │ checkout(item, $15)   │
         │                       │ + Bearer token        │
         │                       │ ─────────────────────▶│
         │                       │                       │
         │                       │                       │ Validate token (JWKS)
         │                       │                       │ Check limits:
         │                       │                       │ • $15 < $25 per-txn ✓
         │                       │                       │ • Daily spend OK ✓
         │                       │                       │
         │                       │ Auto-approved         │
         │                       │ ◀─────────────────────│
         │                       │                       │
         │ "Payment complete!"   │                       │
         │ (no user interaction) │                       │
         │ ◀───────────────────  │                       │
         │                       │                       │

                    ⚡ NO USER INTERACTION REQUIRED ⚡
```

### Flow C: Step-Up Authorization (Over Limit)

User has delegation but this purchase exceeds their limits. Uses same infrastructure as Flow A but with different messaging.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    ChatGPT      │     │   MCP Server    │     │      WSIM       │     │     mwsim       │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │                       │
         │ "Buy this laptop"     │                       │                       │
         │ ───────────────────▶  │                       │                       │
         │                       │                       │                       │
         │                       │ checkout(item, $899)  │                       │
         │                       │ + Bearer token        │                       │
         │                       │ ─────────────────────▶│                       │
         │                       │                       │                       │
         │                       │                       │ Validate token ✓      │
         │                       │                       │ Check limits:         │
         │                       │                       │ • $899 > $25 limit ❌ │
         │                       │                       │                       │
         │                       │                       │ Create STEP-UP request│
         │                       │                       │ (different from       │
         │                       │                       │  first-purchase)      │
         │                       │                       │                       │
         │                       │                       │ Send push notification│
         │                       │                       │ ─────────────────────────────────▶
         │                       │                       │                       │
         │                       │ Return device_code    │                       │ Push message:
         │                       │ + QR code (step-up)   │                       │ "SACP wants to
         │                       │ ◀──────────────────── │                       │  charge $899.00
         │                       │                       │                       │  (exceeds limit)"
         │                       │                       │                       │
         │ "This exceeds your    │                       │                       │
         │ limit. Approve in     │                       │                       │
         │ your wallet app."     │                       │                       │
         │ ◀───────────────────  │                       │                       │
         │                       │                       │                       │
         │                       │                       │                       │ Shows STEP-UP UI:
         │                       │                       │                       │ ┌─────────────────┐
         │                       │                       │                       │ │ Approve Payment │
         │                       │                       │                       │ │                 │
         │                       │                       │                       │ │ SACP: $899.00   │
         │                       │                       │                       │ │ Gaming Laptop   │
         │                       │                       │                       │ │                 │
         │                       │                       │                       │ │ ⚠️ Exceeds your │
         │                       │                       │                       │ │ $25 limit       │
         │                       │                       │                       │ │                 │
         │                       │                       │                       │ │ [Approve][Deny] │
         │                       │                       │                       │ └─────────────────┘
         │                       │                       │                       │
         │                       │                       │                       │ User approves
         │                       │                       │ ◀─────────────────────────────────
         │                       │                       │                       │
         │                       │ Poll: approved!       │                       │
         │                       │ ◀──────────────────── │                       │
         │                       │                       │                       │
         │ "Payment complete!"   │                       │                       │
         │ ◀───────────────────  │                       │                       │
         │                       │                       │                       │

                    ⚠️ ONE-TIME APPROVAL - LIMITS UNCHANGED ⚠️
```

### Flow D: Token Expired

User's OAuth token has expired. Must re-authenticate.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    ChatGPT      │     │   MCP Server    │     │      WSIM       │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ "Buy me coffee"       │                       │
         │ ───────────────────▶  │                       │
         │                       │                       │
         │                       │ checkout(item, $5)    │
         │                       │ + Bearer token        │
         │                       │ ─────────────────────▶│
         │                       │                       │
         │                       │                       │ Validate token:
         │                       │                       │ • exp < now ❌
         │                       │                       │
         │                       │ 401 + OAuth challenge │
         │                       │ ◀─────────────────────│
         │                       │                       │
         │ OAuth popup           │                       │
         │ (re-authenticate)     │                       │
         │ ◀───────────────────  │                       │
         │                       │                       │
         │ ... User re-auths ... │                       │
         │ ... New token ...     │                       │
         │                       │                       │
         │ Retry with new token  │                       │
         │ ───────────────────▶  │                       │
         │                       │ (continues as Flow B) │
```

---

## Step-Up vs First-Purchase: Key Differences

| Aspect | First Purchase (Flow A) | Step-Up (Flow C) |
|--------|------------------------|------------------|
| **OAuth token present?** | No | Yes |
| **Shows delegation option?** | Yes (checkbox) | No (already have delegation) |
| **Shows limit controls?** | Yes (user sets limits) | No (limits unchanged) |
| **Push notification text** | "wants to charge $X for Y" | "wants to charge $X (exceeds your $Y limit)" |
| **Screen title** | "Approve Payment" | "Approve Payment" |
| **Warning message** | None | "⚠️ This exceeds your per-transaction limit" |
| **After approval** | May issue OAuth token | Payment only, no token change |
| **Access request type** | `first_purchase` | `step_up` |

### API Field: `request_type`

To differentiate these flows, the AccessRequest should include a `request_type` field:

```typescript
interface AccessRequest {
  // ... existing fields ...

  // NEW: Distinguishes first-purchase from step-up
  request_type: 'first_purchase' | 'step_up' | 'permission_only';

  // For step-up: which limit was exceeded
  exceeded_limit?: {
    type: 'per_transaction' | 'daily' | 'monthly';
    limit: string;
    requested: string;
    currency: string;
  };
}
```

**mwsim UI logic:**
```typescript
if (request.request_type === 'step_up') {
  // Show step-up UI (no delegation checkbox)
  return <StepUpApprovalScreen
    request={request}
    exceededLimit={request.exceeded_limit}
  />;
} else if (request.payment_context) {
  // Show first-purchase UI (with delegation checkbox)
  return <PaymentApprovalScreen request={request} />;
} else {
  // Show permission-only UI (existing behavior)
  return <PermissionApprovalScreen request={request} />;
}
```

---

## Checkout Tool Behavior Matrix

| State | Action |
|-------|--------|
| No token | Run WSIM first-purchase flow (device auth + optional delegation) |
| Token + within limits | Auto-approve payment |
| Token + exceeds limits | Trigger WSIM step-up authorization |
| Token invalid/expired | Return 401 + OAuth challenge |

---

## Technical Implementation

### MCP Team Responsibilities

#### 1. Support Per-Tool Security Schemes (OpenAI Confirmed)

Use `securitySchemes` on each tool to control authentication requirements:

```typescript
// Public tools - no auth needed (user can browse without linking)
{
  name: 'browse_products',
  description: 'Browse available products',
  inputSchema: { ... },
  securitySchemes: [{ type: 'noauth' }]
}

{
  name: 'search',
  description: 'Search for products',
  inputSchema: { ... },
  securitySchemes: [{ type: 'noauth' }]
}

// Checkout tool - works with OR without OAuth token (mixed auth)
{
  name: 'checkout',
  description: 'Complete a purchase',
  inputSchema: { ... },
  securitySchemes: [
    { type: 'noauth' },  // First purchase - no token required
    { type: 'oauth2', scopes: ['purchase'] }  // Delegated purchase - with token
  ]
}
```

> **OpenAI Confirmed**: Per-tool `securitySchemes` is fully supported. This allows browse/search to work immediately while checkout handles both first-purchase (no token) and delegated (with token) flows.

#### 2. Checkout Handler Logic

```typescript
async function handleCheckout(args, authToken) {
  if (!authToken) {
    // FIRST PURCHASE: Trigger WSIM device auth flow
    // User will see combined payment + delegation UI
    return initiateDeviceAuthFlow(args);
  }

  // DELEGATED PURCHASE: Validate token and check limits
  const validation = await validateTokenAndLimits(authToken, args.amount);

  if (!validation.valid) {
    // Token expired/invalid - return OAuth challenge
    // NOTE: error + error_description REQUIRED for ChatGPT to process
    return {
      isError: true,  // ← REQUIRED for ChatGPT to show OAuth UI
      content: [{ type: 'text', text: 'Session expired. Please re-authenticate.' }],
      _meta: {
        'mcp/www_authenticate': [
          'Bearer resource_metadata="https://wsim-auth-dev.banksim.ca/.well-known/oauth-protected-resource", error="invalid_token", error_description="Token expired or invalid"'
        ]
      }
    };
  }

  if (!validation.withinLimits) {
    // OVER-LIMIT: Trigger step-up authorization
    return initiateStepUpAuth(args, authToken);
  }

  // WITHIN LIMITS: Auto-approve
  return processPayment(args, authToken);
}
```

#### 3. Enforce Limits (Even With Token)

```typescript
async function validateTokenAndLimits(token, amount) {
  // Validate token signature
  const payload = await verifyToken(token);
  if (!payload) return { valid: false };

  // Check limits (either from token claims or WSIM lookup)
  const limits = await getAgentLimits(payload.sub);

  return {
    valid: true,
    withinLimits: amount <= limits.perTransaction &&
                  (await getDailySpend(payload.sub)) + amount <= limits.daily
  };
}
```

### WSIM Team Responsibilities

#### 1. Update Authorization Consent UI

Modify the device authorization approval page to include optional delegation:

**Current flow:**
- Show payment details
- User approves with passkey
- Return to ChatGPT

**New flow:**
- Show payment details
- Show optional "Allow future purchases" checkbox with limit controls
- User approves with passkey
- If delegation opted-in: Redirect with OAuth authorization code
- Return to ChatGPT

#### 2. Combined Payment + OAuth Endpoint

The existing `/api/agent/v1/oauth/authorize` can be extended, or create a new endpoint:

```
GET /api/agent/v1/oauth/authorize
  ?client_id=chatgpt-mcp
  &redirect_uri=https://chatgpt.com/connector_platform_oauth_redirect
  &response_type=code
  &code_challenge=xxx
  &state=xxx
  &scope=purchase
  &payment_context=base64({"amount":"49.99","item":"Backpack","merchant":"SACP"})
```

The `payment_context` parameter allows showing the actual transaction being approved.

#### 3. Token Claims / Server-Side Limits

Option A: **Claims in Token**
```json
{
  "sub": "user_123",
  "client_id": "chatgpt-mcp",
  "scope": "purchase",
  "limits": {
    "per_transaction": 25.00,
    "daily": 100.00,
    "currency": "CAD"
  }
}
```

Option B: **Server-Side Lookup** (Recommended)
```json
{
  "sub": "user_123",
  "client_id": "chatgpt-mcp",
  "scope": "purchase",
  "agent_id": "agent_abc123"  // Links to Agent record with limits
}
```

Server-side is better because limits can be modified without reissuing tokens.

#### 4. Step-Up Authorization Endpoint

Existing infrastructure supports this:
- Push notification to mwsim
- QR code / device code flow
- Web-based approval

No changes needed - just ensure MCP calls this when limits are exceeded.

### mwsim Team Responsibilities

The mobile wallet app (mwsim) is a primary approval surface for the first purchase and step-up flows. When users receive push notifications or scan QR codes, they see the approval screen in mwsim.

#### 1. Update AccessRequestApproval Screen

The existing approval screen needs to support the combined payment + delegation flow:

**Current screen:**
```
┌─────────────────────────────────────────────────────┐
│              Access Request                          │
├─────────────────────────────────────────────────────┤
│                                                      │
│  SACP Demo Store                                    │
│  wants access to your wallet                        │
│                                                      │
│  Requested permissions:                             │
│  • Make purchases on your behalf                   │
│                                                      │
│  Limits:                                            │
│  • Per transaction: $100.00                        │
│  • Daily: $500.00                                  │
│                                                      │
│  [Approve]              [Reject]                   │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**New screen (with payment context):**
```
┌─────────────────────────────────────────────────────┐
│              Approve Payment                         │
├─────────────────────────────────────────────────────┤
│                                                      │
│  SACP Demo Store                                    │
│  wants to charge $49.99                             │
│  for: Backpack                                       │
│                                                      │
│  [Face ID to Approve]                               │
│                                                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ☐ Allow future purchases from this store           │
│     (You can revoke this anytime in Settings)       │
│                                                      │
│     Per-transaction limit: [$ 25.00 ▼]              │
│     Daily limit:           [$ 100.00 ▼]             │
│                                                      │
│  [Approve]              [Reject]                   │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Key differences:**
- Payment amount and item shown prominently at top
- Delegation is optional (checkbox, not required)
- Limit controls only appear when delegation is checked
- Primary action is approving THIS payment, not granting access

#### 2. Handle `payment_context` in Access Requests

The WSIM API will include payment context when the request originates from a checkout:

```typescript
// AccessRequest model (existing)
interface AccessRequest {
  id: string;
  agent_name: string;
  agent_description: string;
  requested_permissions: string[];
  requested_limits: {
    per_transaction: string;
    daily: string;
    monthly: string;
    currency: string;
  };
  status: string;
  expires_at: string;

  // NEW: Payment context (optional, present for first-purchase flows)
  payment_context?: {
    amount: string;
    currency: string;
    item_description: string;
    merchant_name: string;
    merchant_id: string;
  };
}
```

**UI Logic:**
```typescript
// In AccessRequestApprovalScreen
if (request.payment_context) {
  // Show payment-first UI (amount, item, optional delegation)
  return <PaymentApprovalScreen request={request} />;
} else {
  // Show permission-first UI (existing behavior for non-payment flows)
  return <PermissionApprovalScreen request={request} />;
}
```

#### 3. Update Approval API Call

When user approves with delegation opted-in:

```typescript
// Existing approve call
POST /api/mobile/access-requests/{id}/approve
{
  "consent": true
}

// NEW: Include delegation preference
POST /api/mobile/access-requests/{id}/approve
{
  "consent": true,
  "grant_delegation": true,  // User checked the box
  "delegation_limits": {
    "per_transaction": "25.00",
    "daily": "100.00"
  }
}
```

**When `grant_delegation: false` (or omitted):**
- Payment completes
- No OAuth token issued
- Next purchase requires approval again

**When `grant_delegation: true`:**
- Payment completes
- WSIM records delegation intent
- Poll returns `delegation_pending: true`
- MCP triggers OAuth challenge (see Q1)
- mwsim may show browser handoff screen for smoother UX
- ChatGPT initiates OAuth, user sees one-tap consent
- Future purchases within limits auto-approve

#### 4. Step-Up Approval Screen

For over-limit purchases (user already has delegation but this purchase exceeds limits):

```
┌─────────────────────────────────────────────────────┐
│              Approve Payment                         │
├─────────────────────────────────────────────────────┤
│                                                      │
│  SACP Demo Store                                    │
│  wants to charge $899.00                            │
│  for: Gaming Laptop                                  │
│                                                      │
│  ⚠️ This exceeds your $25 per-transaction limit     │
│                                                      │
│  [Face ID to Approve]                               │
│                                                      │
│  [Approve]              [Reject]                   │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Key points:**
- No delegation checkbox (user already has delegation)
- Clear message about why approval is needed
- This is a one-time approval, not a limit change

#### 5. Push Notification Updates

Update push notification content to reflect payment context:

**Current:**
```
SACP Demo Store is requesting access to your wallet
```

**New (first purchase):**
```
SACP Demo Store wants to charge $49.99 for Backpack
```

**New (step-up):**
```
SACP Demo Store wants to charge $899.00 (exceeds your limit)
```

#### 6. Settings: Manage Delegations

Add a new section in Settings to view/revoke agent delegations:

```
┌─────────────────────────────────────────────────────┐
│              Agent Permissions                       │
├─────────────────────────────────────────────────────┤
│                                                      │
│  SACP Demo Store                                    │
│  Connected via ChatGPT                               │
│  Per-transaction: $25 | Daily: $100                 │
│  Last used: Today                                   │
│                                    [Revoke Access]   │
│                                                      │
│  ─────────────────────────────────────────────────  │
│                                                      │
│  Grocery AI                                         │
│  Connected via Claude                                │
│  Per-transaction: $50 | Daily: $200                 │
│  Last used: Yesterday                               │
│                                    [Revoke Access]   │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## OAuth Flow Details

### Two-Step Delegation Process (PKCE Constraint)

Due to PKCE requirements, delegation requires a **two-step flow**:

**Step 1: Payment Approval**
1. User completes first purchase via device auth (push/QR)
2. User checks "Allow future purchases" checkbox
3. WSIM records delegation intent
4. Poll returns `delegation_pending: true`

**Step 2: OAuth Linking**
1. MCP triggers OAuth challenge (`mcp/www_authenticate` header)
2. ChatGPT initiates OAuth flow (generates `code_verifier`)
3. User sees WSIM consent page (already authenticated from Step 1)
4. One-tap consent → redirect back to ChatGPT with code
5. ChatGPT exchanges code for token (using its `code_verifier`)

### OAuth Does NOT Happen

- At connector setup time
- When user declines delegation
- On subsequent within-limit purchases

### Key Technical Constraint

> **⚠️ CRITICAL**: ChatGPT cannot accept authorization codes via tool output or `_meta` fields. The OAuth flow **must** be initiated by ChatGPT because it needs the PKCE `code_verifier` it generated at flow start.

This means:
- MCP cannot pass auth codes back in poll response
- MCP must trigger OAuth challenge to prompt ChatGPT to initiate OAuth
- The browser handoff pattern (mwsim → browser → WSIM → ChatGPT) is recommended for smooth UX

---

## OpenAI/ChatGPT Technical Requirements (Confirmed 2026-02-01)

The following requirements have been confirmed directly with the OpenAI team. These are **critical** for the integration to work.

### 1. Per-Tool Security Schemes

OpenAI supports per-tool authentication control. Use `securitySchemes` on tool definitions:

```javascript
// Public tools - no auth needed
const browseProductsTool = {
  name: 'browse_products',
  description: 'Browse available products',
  inputSchema: { /* ... */ },
  securitySchemes: [{ type: 'noauth' }]
};

// Checkout tool - works WITH or WITHOUT OAuth token
const checkoutTool = {
  name: 'checkout',
  description: 'Complete a purchase',
  inputSchema: { /* ... */ },
  securitySchemes: [
    { type: 'noauth' },  // First purchase - no token
    { type: 'oauth2', scopes: ['purchase'] }  // Delegated - with token
  ]
};
```

### 2. OAuth Challenge Format (CRITICAL)

The `mcp/www_authenticate` challenge **MUST** include `error` and `error_description` parameters for ChatGPT to recognize and process it:

```javascript
// ❌ WRONG - ChatGPT ignores this
'Bearer resource_metadata="https://wsim.banksim.ca/.well-known/oauth-protected-resource"'

// ✅ CORRECT - ChatGPT processes this and shows OAuth UI
'Bearer resource_metadata="https://wsim-auth-dev.banksim.ca/.well-known/oauth-protected-resource", error="insufficient_scope", error_description="Wallet linking required for automatic payments"'
```

### 3. isError Flag Required for OAuth Challenge

When returning an OAuth challenge (even after a successful payment), set `isError: true`. This is **required** for ChatGPT to process the `mcp/www_authenticate` header:

```javascript
// After payment completes, trigger OAuth linking
return {
  isError: true,  // ← REQUIRED for ChatGPT to show OAuth UI
  content: [{
    type: 'text',
    text: 'Payment complete! Link your wallet for automatic payments.'
  }],
  structuredContent: {
    status: 'approved',  // ← Payment DID succeed
    delegation_pending: true
  },
  _meta: {
    'mcp/www_authenticate': [
      'Bearer resource_metadata="https://wsim-auth-dev.banksim.ca/.well-known/oauth-protected-resource", error="insufficient_scope", error_description="Wallet linking required for automatic payments"'
    ]
  }
};
```

### 4. Token Auto-Inclusion

After OAuth completes, ChatGPT automatically includes `Authorization: Bearer <token>` on subsequent tool calls. MCP does not need to do anything special - just handle the token when it arrives.

### 5. JWKS Token Validation

MCP should validate tokens via WSIM's JWKS endpoint:

```
GET https://wsim-auth-dev.banksim.ca/.well-known/jwks.json
```

Example validation:
```typescript
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const wsimJwksClient = jwksClient({
  jwksUri: 'https://wsim-auth-dev.banksim.ca/.well-known/jwks.json',
  cache: true,
  cacheMaxAge: 600000, // 10 minutes
});

async function validateTokenViaJWKS(token: string): Promise<TokenPayload | null> {
  try {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header.kid) return null;

    const key = await wsimJwksClient.getSigningKey(decoded.header.kid);
    const publicKey = key.getPublicKey();

    return jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: 'https://wsim-auth-dev.banksim.ca'
    }) as TokenPayload;
  } catch {
    return null;
  }
}
```

---

## Configuration

### Token Lifetimes

| Token Type | Lifetime | Notes |
|------------|----------|-------|
| Access Token | **1 hour** | Short-lived, verified via JWKS |
| Refresh Token | **30 days** | Used to obtain new access tokens without user interaction |
| Device Code | **15 minutes** | For QR code / push approval flow |
| Authorization Code | **10 minutes** | For OAuth redirect flow |

### Limit Caching (MCP)

| Setting | Value | Notes |
|---------|-------|-------|
| Cache TTL | **5 minutes** | Balance between latency and freshness |
| Cache Key | `{userId}:{agentId}` | Per-user, per-agent limits |

### Delegation Decline Tracking (WSIM)

| Setting | Value | Notes |
|---------|-------|-------|
| Suppress After | **3 declines** | Per user + merchant combination |
| Reset On | Successful delegation grant | Counter resets to 0 |
| User Override | Settings page | User can always re-enable prompt |

---

## Implementation Clarifications

*These answers address questions raised during design review.*

### Q1: OAuth Token Delivery After Device Auth Approval

**Question**: Device auth uses polling. How does OAuth redirect get triggered after approval?

**Answer (Updated 2026-01-31 after OpenAI clarification)**:

> **⚠️ CRITICAL CONSTRAINT FROM OPENAI**: ChatGPT cannot accept authorization codes via tool output or `_meta` fields. OAuth completion **must** happen through a browser redirect that ChatGPT initiated (because ChatGPT needs the PKCE `code_verifier` it generated at flow start).

This means **delegation requires a two-step flow**:

#### Step 1: Payment Approval (Device Auth)

```
User approves payment via push/QR (existing RFC 8628 flow)
    ↓
Payment completes
    ↓
If user checked "Allow future purchases":
    → Record delegation intent (but don't issue token yet)
    → Poll returns: { "status": "approved", "delegation_pending": true }
```

#### Step 2: OAuth Linking (ChatGPT-Initiated)

```
MCP receives delegation_pending: true
    ↓
MCP returns to ChatGPT:
    {
      "content": [{ "text": "Payment complete! To enable automatic payments, please link your WSIM Wallet." }],
      "isError": true,  // ← REQUIRED for ChatGPT to process challenge
      "structuredContent": { "status": "approved", "delegation_pending": true },
      "_meta": {
        "mcp/www_authenticate": [
          "Bearer resource_metadata=\"https://wsim-auth-dev.banksim.ca/.well-known/oauth-protected-resource\", error=\"insufficient_scope\", error_description=\"Wallet linking required for automatic payments\""
        ]
      }
    }
    ↓
ChatGPT shows OAuth popup
    ↓
User sees WSIM consent page (already authenticated, one-tap consent)
    ↓
OAuth redirect completes to ChatGPT
    ↓
Token stored, delegation active
```

#### Why This Works

1. **PKCE integrity preserved** - ChatGPT generates `code_verifier` when it initiates OAuth
2. **Frictionless consent** - User is already authenticated via passkey from payment approval
3. **Explicit delegation** - User consciously completes the "link account" step

#### mwsim Browser Handoff Pattern

For push notification approvals, mwsim should offer a smooth handoff:

```
After user approves + checks delegation:
    ↓
Show screen: "Almost done! Tap to link WSIM to ChatGPT"
    ↓
User taps button
    ↓
mwsim opens ASWebAuthenticationSession / Safari:
    https://wsim.banksim.ca/oauth/authorize?...
    (This is the URL ChatGPT will redirect to when OAuth triggers)
    ↓
User sees one-tap consent (already authenticated)
    ↓
Redirect to ChatGPT completes
```

**Note**: This handoff works because we're opening the same authorize URL that ChatGPT's OAuth flow will use. WSIM recognizes the user is already authenticated and shows a minimal consent screen.

#### What Does NOT Work

| Approach | Why It Fails |
|----------|--------------|
| Return auth code in `_meta` | No documented field; ChatGPT ignores it |
| Return redirect URI in tool output | ChatGPT won't follow it; needs PKCE verifier |
| Widget navigation to OAuth callback | Sandboxed; can't navigate parent frame |
| Passing code via poll response | MCP can't make ChatGPT exchange it |

### Q2: Limit Checking Latency

**Question**: Should MCP cache limits to reduce latency?

**Answer**: **Yes, cache limits with a 5-minute TTL**. Here's the recommended approach:

```typescript
// In MCP server
const limitsCache = new Map<string, { limits: Limits; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getAgentLimits(userId: string, agentId: string): Promise<Limits> {
  const cacheKey = `${userId}:${agentId}`;
  const cached = limitsCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.limits;
  }

  // Fetch from WSIM (introspection or dedicated endpoint)
  const limits = await wsimClient.getLimits(userId, agentId);

  limitsCache.set(cacheKey, {
    limits,
    expiresAt: Date.now() + CACHE_TTL_MS
  });

  return limits;
}
```

**Trade-off**:
- Limit changes take up to 5 minutes to propagate
- Acceptable because limit changes are rare and step-up still protects large purchases
- Reduces latency from ~100ms (network) to ~0ms for cached lookups

**Alternative**: Encode limits in JWT claims (Option A in doc). Eliminates network call entirely, but limits can't be changed without reissuing token.

### Q3: Step-Up Parameter Passing

**Question**: How does MCP tell WSIM this is a step-up request?

**Answer**: **New parameter to `/device_authorization`**:

```typescript
// MCP calls WSIM device_authorization with step-up context
POST /api/agent/v1/oauth/device_authorization
{
  "client_id": "chatgpt-mcp",
  "scope": "purchase",
  "request_type": "step_up",           // NEW: "first_purchase" | "step_up"
  "existing_agent_id": "agent_abc123", // NEW: The agent that has delegation
  "payment_context": {
    "amount": "899.00",
    "currency": "CAD",
    "item_description": "Gaming Laptop",
    "merchant_name": "SACP Demo Store"
  },
  "exceeded_limit": {                   // NEW: Which limit was exceeded
    "type": "per_transaction",
    "limit": "25.00",
    "requested": "899.00",
    "currency": "CAD"
  }
}
```

**WSIM behavior**:
- If `request_type: "step_up"`:
  - Look up existing agent by `existing_agent_id`
  - Verify agent belongs to user (via token validation)
  - Create access request with `request_type: "step_up"` and `exceeded_limit`
  - Push notification says "exceeds your limit"
  - Approval UI shows warning, no delegation checkbox

### Q4: Repeated Delegation Prompts

**Question**: If user declines delegation, should we keep asking on every purchase?

**Answer**: **Track declines and suppress after 3 consecutive declines for same merchant**.

```typescript
// WSIM tracks delegation decline count per user+agent combination
model AgentDelegationPreference {
  id            String   @id @default(cuid())
  userId        String
  agentClientId String   // e.g., "chatgpt-mcp"
  merchantId    String   // e.g., "sacp-demo-store"
  declineCount  Int      @default(0)
  lastDeclinedAt DateTime?
  suppressUntil DateTime? // If set, don't show delegation option

  @@unique([userId, agentClientId, merchantId])
}
```

**Logic**:
```typescript
// In WSIM when creating access request
if (declineCount >= 3) {
  // Don't include delegation option in UI
  // User explicitly declined 3 times - respect their preference
  request.show_delegation_option = false;
} else {
  request.show_delegation_option = true;
}

// Reset on successful delegation grant
if (grant_delegation) {
  preference.declineCount = 0;
}

// User can always re-enable in Settings
```

**UX consideration**: Add small link "Why am I not seeing the delegation option?" that explains and allows re-enabling.

### Q5: Refresh Tokens

**Question**: Should WSIM issue refresh tokens?

**Answer**: **Yes, issue refresh tokens with 30-day lifetime**.

```typescript
// Token configuration
const TOKEN_CONFIG = {
  accessTokenLifetime: 60 * 60,           // 1 hour
  refreshTokenLifetime: 30 * 24 * 60 * 60, // 30 days
};

// Token response includes refresh_token
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "rt_abc123...",  // NEW
  "scope": "purchase"
}
```

**Flow when access token expires**:

```
MCP: checkout with expired access token
    ↓
WSIM: Returns 401 with { "error": "invalid_token" }
    ↓
MCP: Returns OAuth challenge to ChatGPT
    ↓
ChatGPT: Uses refresh token to get new access token
    ↓
ChatGPT: Retries checkout with new token
    ↓
(No user interaction needed!)
```

**Benefits**:
- Users stay delegated for 30 days without re-authenticating
- Reduces OAuth popup fatigue
- If refresh token expires (30 days), user sees OAuth popup (rare)

**Security**: Refresh tokens are stored hashed in DB, can be revoked via Settings.

---

## mwsim Implementation Clarifications

*These answers address questions raised during mwsim team design review.*

### Q6: Delegation Checkbox Default State

**Question**: Should "Allow future purchases" be checked or unchecked by default?

**Answer**: **Unchecked by default**. Delegation should be explicit opt-in.

```
☐ Allow future purchases from this store    ← Default: unchecked
   (You can revoke this anytime in Settings)
```

**Rationale**: Unchecked by default because:
- Follows principle of least privilege
- Matches user expectations for payment flows
- Avoids accidental delegation grants
- More defensible from a security/compliance perspective

### Q7: Token Expiration vs Delegation Duration

**Question**: What's the relationship between token lifetime and delegation duration?

**Answer**: **Tokens expire. Delegations don't (until revoked).**

| Concept | Lifetime | What Happens When Expired |
|---------|----------|---------------------------|
| Access Token | 1 hour | Refresh token used to get new access token (no user interaction) |
| Refresh Token | 30 days | User sees OAuth popup to re-authenticate (rare) |
| Delegation | Indefinite | Only ends when user revokes in Settings |

**Key insight**: Token expiration ≠ delegation revocation.

```
Token expires (after 1 hour)
    ↓
ChatGPT uses refresh token
    ↓
WSIM issues new access token
    ↓
Delegation continues (no user interaction)
```

The delegation (agent's permission to make purchases within limits) persists until explicitly revoked. The OAuth token is just a temporary credential that proves the delegation exists.

**Exception**: If refresh token expires (after 30 days of no use), user must re-authenticate via OAuth popup. The delegation still exists - they just need to prove they're the owner again.

### Q8: Exceeded Limit Type Priority

**Question**: If a purchase exceeds multiple limits, which one does `exceeded_limit.type` report?

**Answer**: **Report the first exceeded limit in priority order**: `per_transaction` > `daily` > `monthly`.

```typescript
function getExceededLimit(amount: number, limits: Limits, usage: Usage): ExceededLimit | null {
  // Check in priority order
  if (amount > limits.perTransaction) {
    return {
      type: 'per_transaction',
      limit: limits.perTransaction,
      requested: amount,
      currency: limits.currency
    };
  }

  if (usage.daily + amount > limits.daily) {
    return {
      type: 'daily',
      limit: limits.daily,
      requested: amount,
      currency: limits.currency
    };
  }

  if (usage.monthly + amount > limits.monthly) {
    return {
      type: 'monthly',
      limit: limits.monthly,
      requested: amount,
      currency: limits.currency
    };
  }

  return null; // Within all limits
}
```

**Rationale**: Per-transaction is the most intuitive message ("$500 exceeds your $25 limit") vs daily/monthly which require more context.

### Q9: Agent Revocation State Machine

**Question**: When user revokes delegation in Settings, what happens?

**Answer**: **Immediate revocation with graceful handling.**

```
User clicks "Revoke Access" in Settings
    ↓
WSIM: Set agent.status = 'revoked', revokedAt = now()
    ↓
WSIM: Revoke all tokens (mark as revoked in DB)
    ↓
(Immediate effect)
```

**Behavior after revocation**:

| Scenario | Result |
|----------|--------|
| In-flight payment (polling) | Poll returns `{ "status": "revoked" }`, payment fails |
| Next checkout with old token | Token introspection returns `active: false`, MCP triggers first-purchase flow |
| ChatGPT's stored token | Becomes invalid (401 on use), triggers re-auth |

**API behavior**:
```typescript
// Token introspection after revocation
{
  "active": false  // That's it - token is dead
}
```

**mwsim Settings API** (already exists):
- `DELETE /api/mobile/agents/:id` - Revokes agent
- Response: `{ success: true }`

### Q10: First Purchase + Decline Delegation → What Does Agent See?

**Question**: If user declines delegation, does ChatGPT/MCP get any indicator?

**Answer**: **Yes, the poll response indicates delegation was declined (or granted and pending OAuth).**

```typescript
// Poll response when user approves payment WITHOUT delegation
{
  "status": "approved",
  "delegation_granted": false  // User declined ongoing delegation
}

// Poll response when user approves payment WITH delegation checked
{
  "status": "approved",
  "delegation_granted": true,
  "delegation_pending": true   // OAuth linking still required (see Q1)
}
```

**MCP behavior**:
- `delegation_granted: false` → Complete payment, next purchase requires approval
- `delegation_granted: true, delegation_pending: true` → Complete payment, then trigger OAuth challenge so ChatGPT initiates OAuth flow (see Q1 two-step process)

**User experience**:
- If declined: "Payment complete! Note: You'll need to approve future purchases individually."
- If granted + pending: "Payment complete! To enable automatic payments, please link your WSIM Wallet." (followed by OAuth popup)

> **Note**: Due to PKCE constraints (see Q1), we cannot return an OAuth authorization code in the poll response. ChatGPT must initiate the OAuth flow itself.

---

## mwsim Implementation Guidelines

### Screen Component Strategy

**Recommendation**: Use a single `AccessRequestApprovalScreen` with conditional rendering:

```typescript
function AccessRequestApprovalScreen({ request }) {
  // Determine mode based on request_type with fallback inference
  const mode = request.request_type
    ?? (request.exceeded_limit ? 'step_up'
       : request.payment_context ? 'first_purchase'
       : 'permission_only');

  return (
    <View>
      {/* Header - varies by mode */}
      {mode === 'step_up' && <StepUpHeader request={request} />}
      {mode === 'first_purchase' && <PaymentHeader request={request} />}
      {mode === 'permission_only' && <PermissionHeader request={request} />}

      {/* Delegation section - only for first_purchase */}
      {mode === 'first_purchase' && (
        <DelegationSection
          showOption={request.show_delegation_option !== false}
          onDelegationChange={setGrantDelegation}
          onLimitsChange={setDelegationLimits}
        />
      )}

      {/* Approve/Reject buttons */}
      <ApprovalButtons onApprove={handleApprove} onReject={handleReject} />
    </View>
  );
}
```

### Delegation Limits UI

**Use preset dropdowns**, not free text:

```typescript
const PER_TRANSACTION_PRESETS = [
  { label: '$10', value: '10.00' },
  { label: '$25', value: '25.00' },   // Default
  { label: '$50', value: '50.00' },
  { label: '$100', value: '100.00' },
  { label: '$250', value: '250.00' },
];

const DAILY_PRESETS = [
  { label: '$50', value: '50.00' },
  { label: '$100', value: '100.00' },  // Default
  { label: '$200', value: '200.00' },
  { label: '$500', value: '500.00' },
  { label: '$1000', value: '1000.00' },
];
```

### Payment Request Expiration

**Payment requests expire faster than permission requests**:

| Request Type | Expiration |
|--------------|------------|
| `permission_only` | 10 minutes (existing) |
| `first_purchase` | 5 minutes |
| `step_up` | 5 minutes |

WSIM will set `expires_at` accordingly. mwsim should show countdown timer.

### Push Notification Payload

**Payload includes `request_type` for routing**:

```typescript
// Push notification payload (APNs)
{
  "aps": {
    "alert": {
      "title": "Payment Request",
      "body": "SACP Demo Store wants to charge $49.99 for Backpack"
    },
    "sound": "default",
    "category": "ACCESS_REQUEST"
  },
  // Custom data at root level (per WSIM APNs pattern)
  "request_id": "ar_abc123",
  "request_type": "first_purchase",  // NEW: "first_purchase" | "step_up" | "permission_only"
  "deep_link": "wsim://access-request/ar_abc123"
}
```

**mwsim handling**:
```typescript
// Can use request_type from push for pre-fetching/UI hints
// But ALWAYS fetch full request from API for source of truth
onNotificationPress(notification) {
  const { request_id, request_type } = notification.data;

  // Optional: pre-configure UI based on request_type hint
  navigation.navigate('AccessRequestApproval', {
    requestId: request_id,
    requestTypeHint: request_type  // Used for loading state UI
  });

  // Screen fetches full request from API on mount
}
```

### Backward Compatibility for `request_type`

**Infer type if field is missing** (for older WSIM versions):

```typescript
function inferRequestType(request: AccessRequest): RequestType {
  // Explicit field takes precedence
  if (request.request_type) {
    return request.request_type;
  }

  // Infer from other fields
  if (request.exceeded_limit) {
    return 'step_up';
  }
  if (request.payment_context) {
    return 'first_purchase';
  }
  return 'permission_only';
}
```

---

## Migration Path

### Phase 1: Device Auth + Optional Delegation (WSIM Backend)
**Goal**: Enable first-purchase flow with optional delegation

1. Add `payment_context` to AccessRequest model and device auth response
2. Add `request_type` field (`first_purchase`, `step_up`, `permission_only`)
3. Update authorization consent UI (web) with delegation checkbox and limit controls
4. Update approve endpoint to accept `grant_delegation` and `delegation_limits`
5. Issue OAuth code when user opts in during approval
6. Ensure redirect flow works with ChatGPT Apps SDK URIs
7. Update push notification content: "wants to charge $X for Y"

### Phase 2: Step-Up Authorization (WSIM Backend)
**Goal**: Enable over-limit purchase approval

1. Add `exceeded_limit` field to AccessRequest (type, limit, requested, currency)
2. Create step-up consent UI (web) - shows warning, no delegation option
3. Update push notification for step-up: "wants to charge $X (exceeds your $Y limit)"
4. Step-up approve endpoint returns success (no OAuth code needed, token already exists)

### Phase 3: Mobile Approval Flow (mwsim)
**Goal**: Support both first-purchase and step-up in mobile app

1. Handle `request_type` field to determine which screen to show
2. Create **PaymentApprovalScreen** (first purchase):
   - Payment details + optional delegation checkbox + limit controls
3. Create **StepUpApprovalScreen** (over limit):
   - Payment details + "exceeds limit" warning + simple approve/reject
4. Keep existing PermissionApprovalScreen for non-payment flows
5. Update push notification handling for both message formats
6. Add "Agent Permissions" section in Settings

### Phase 4: Mixed Auth Checkout (MCP)
**Goal**: Route to correct flow based on token state

1. Update checkout tool to work with or without token
2. No token → initiate first-purchase flow (existing device auth)
3. Token present → validate signature and check limits
4. Within limits → auto-approve (no user interaction)
5. **Over limits → initiate step-up flow** (pass `request_type: 'step_up'` + `exceeded_limit`)
6. Token expired → return OAuth challenge

### Phase 5: Integration Testing
**Goal**: End-to-end validation of all flows

| Test Case | Flow | Approval Surface |
|-----------|------|------------------|
| First purchase, no delegation | A | mwsim push, mwsim QR, web |
| First purchase, with delegation | A | mwsim push, mwsim QR, web |
| Delegated purchase, within limits | B | None (auto-approve) |
| **Over-limit purchase (step-up)** | C | mwsim push, mwsim QR, web |
| Token expired | D | OAuth popup |
| Delegation revoked | A | mwsim push, mwsim QR, web |

---

## UX Summary

| Scenario | Flow | User Experience | Approval Surface |
|----------|------|-----------------|------------------|
| First purchase | A | See payment details, optionally grant delegation with limits | Push / QR / Web |
| Delegated (within limits) | B | **No interaction** - automatic approval | None |
| **Delegated (over limits)** | C | See payment + "exceeds limit" warning, one-time approval | Push / QR / Web |
| Token expired | D | Re-authenticate via OAuth popup | Browser |
| Delegation revoked | A | Treated as first purchase again | Push / QR / Web |

### Step-Up UX Principles

1. **Clear messaging**: User immediately understands WHY approval is needed ("$899 exceeds your $25 limit")
2. **One-time approval**: This doesn't change their limits - just approves this specific transaction
3. **Same infrastructure**: Uses existing push/QR/web flows - just different UI
4. **Quick approval**: User is already known, just need transaction consent

---

## Comparison with Old Model

| Aspect | Old Model | New Model |
|--------|-----------|-----------|
| When OAuth triggers | Connector setup | First purchase |
| User context | None ("Connect to WSIM") | Real payment ("Approve $49.99 for Backpack") |
| Limits | Set abstractly upfront | Set during first real purchase |
| Fallback | None (all-or-nothing) | Step-up for over-limit |
| Consent clarity | Low | High |

---

## Action Items

### MCP Team
- [ ] **Per-tool securitySchemes** (OpenAI Confirmed): `noauth` for browse/search, mixed for checkout
- [ ] **OAuth challenge format** (OpenAI Confirmed): MUST include `error` + `error_description` parameters
- [ ] **isError: true required** (OpenAI Confirmed): Set even when payment succeeds but OAuth linking needed
- [ ] **Validate tokens via JWKS**: Use `https://wsim-auth-dev.banksim.ca/.well-known/jwks.json`
- [ ] Enforce limits even when token exists (per-transaction AND daily)
- [ ] **Cache limits with 5-minute TTL** to reduce latency (see Q2)
- [ ] **Trigger WSIM step-up when limits exceeded** - pass `request_type: 'step_up'` + `exceeded_limit` to device_authorization (see Q3)
- [ ] Stop treating "token present" as "skip all authorization"
- [ ] Return appropriate message to user: "This exceeds your limit. Please approve in your wallet."
- [ ] **Handle `delegation_pending: true` in poll response** - trigger OAuth challenge via `mcp/www_authenticate` header so ChatGPT initiates OAuth flow (see Q1)
- [ ] See [MCP Team Implementation Guide](./MCP_TEAM_IMPLEMENTATION_GUIDE.md) for complete code examples

### WSIM Team (Backend)
- [ ] Add `payment_context` to AccessRequest model and device auth response
- [ ] Add `request_type` field: `'first_purchase' | 'step_up' | 'permission_only'`
- [ ] Add `exceeded_limit` field for step-up requests (priority: per_transaction > daily > monthly, see Q8)
- [ ] Add `show_delegation_option` field (false after 3 declines, see Q4)
- [ ] **Accept step-up parameters in `/device_authorization`**: `request_type`, `existing_agent_id`, `exceeded_limit` (see Q3)
- [ ] Update authorization consent UI (web) to support payment + delegation in one flow
- [ ] **Create step-up consent UI (web)** - shows "exceeds limit" warning, no delegation option
- [ ] Add `payment_context` parameter to OAuth authorize endpoint
- [ ] Update approve endpoint to accept `grant_delegation` and `delegation_limits`
- [ ] **Return `delegation_granted` and `delegation_pending` in poll response** (see Q10)
- [ ] **Record delegation intent** when user grants via mwsim (for subsequent OAuth linking, see Q1)
- [ ] Ensure OAuth authorize page recognizes already-authenticated users for one-tap consent
- [ ] **Issue refresh tokens** with 30-day lifetime (see Q5)
- [ ] **Track delegation declines** per user+merchant, suppress prompt after 3 declines (see Q4)
- [ ] **Set shorter expiration for payment requests** (5 min vs 10 min)
- [ ] **Include `request_type` in push notification payload** for mwsim routing
- [ ] **Update push notification content for step-up**: "wants to charge $X (exceeds your $Y limit)"
- [ ] Update push notification content for first-purchase: "wants to charge $X for Y"
- [ ] **Handle revocation properly** - mark agent revoked, invalidate all tokens immediately (see Q9)

### mwsim Team (Mobile)
- [ ] Handle `request_type` field with fallback inference (see backward compatibility section)
- [ ] **Single AccessRequestApprovalScreen with conditional rendering** based on mode:
  - `step_up`: Payment + "exceeds limit" warning + approve/reject
  - `first_purchase`: Payment + unchecked delegation checkbox + limit dropdowns
  - `permission_only`: Existing permission UI (no changes)
- [ ] **Delegation checkbox defaults to unchecked** (explicit opt-in, see Q6)
- [ ] **Use preset dropdowns for limits** (not free text):
  - Per-transaction: $10, $25, $50, $100, $250
  - Daily: $50, $100, $200, $500, $1000
- [ ] Handle new API fields (`payment_context`, `exceeded_limit`, `grant_delegation`, `delegation_limits`)
- [ ] **Shorter countdown for payment requests** (5 min vs 10 min for permissions)
- [ ] Update push notification handling - use `request_type` from payload for routing
- [ ] Add "Agent Permissions" section in Settings using existing APIs:
  - `GET /api/mobile/agents` - List delegations
  - `DELETE /api/mobile/agents/:id` - Revoke delegation
- [ ] **Implement browser handoff for OAuth linking** (see Q1):
  - After user approves + checks delegation, show "Tap to link WSIM to ChatGPT" screen
  - Use `ASWebAuthenticationSession` (iOS) / Custom Tabs (Android) to open OAuth authorize URL
  - This allows ChatGPT's OAuth flow to complete with user already authenticated

### All Teams
- [ ] End-to-end testing of all scenarios:
  - First purchase via push notification (mwsim)
  - First purchase via QR code (mwsim)
  - First purchase via web (WSIM)
  - Delegated purchase within limits (MCP)
  - Over-limit step-up via push (mwsim)
  - Token expiration and re-auth (MCP + WSIM)
- [ ] Document the combined flow

---

## Sign-Off

| Team | Reviewer | Status | Date |
|------|----------|--------|------|
| WSIM (Backend) | | ⬜ Pending | |
| mwsim (Mobile) | Claude Opus 4.5 | ✅ Approved | 2026-01-31 |
| Agents/MCP | Claude Opus 4.5 | ✅ Approved | 2026-01-31 |

---

## References

- [MCP OAuth Specification](https://modelcontextprotocol.io/docs/concepts/authentication)
- [RFC 6749 - OAuth 2.0](https://datatracker.ietf.org/doc/html/rfc6749)
- [WSIM Device Authorization](../../../wsim/backend/src/routes/agent-oauth.ts)
- [mwsim Universal Links](./MWSIM_UNIVERSAL_LINKS.md) - QR code and deep link handling
- [WSIM Mobile Routes](../../../wsim/backend/src/routes/mobile.ts) - Access request endpoints
