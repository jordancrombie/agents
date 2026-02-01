# MCP Team Implementation Guide: Payment-Bootstrapped OAuth

**Date**: 2026-02-01 (Updated)
**From**: WSIM Team
**To**: Agents/MCP Team
**Status**: ACTION REQUIRED

---

## 🚨 TL;DR - EXACTLY WHAT YOU NEED TO DO

### Step 1: Add This Endpoint to Your MCP Server (BLOCKING)

Your MCP server at `sacp-mcp.banksim.ca` must serve this endpoint:

```typescript
// ADD THIS TO YOUR MCP SERVER - NOT WSIM
app.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json({
    resource: 'https://sacp-mcp.banksim.ca',
    authorization_servers: ['https://wsim-auth-dev.banksim.ca'],
    scopes_supported: ['purchase'],
    bearer_methods_supported: ['header']
  });
});
```

**Test it works:**
```bash
curl https://sacp-mcp.banksim.ca/.well-known/oauth-protected-resource
# Must return JSON, not 404
```

### Step 2: Configure Connector as "Mixed" in OpenAI Platform

When creating/editing the connector in the OpenAI Apps platform:
- **Select "Mixed" authentication** (NOT "OAuth Required", NOT "None")

### Step 3: Add `securitySchemes` to Your Tool Definitions

```javascript
// Browse/search tools - NO auth required
{ name: 'browse_products', securitySchemes: [{ type: 'noauth' }] }
{ name: 'search', securitySchemes: [{ type: 'noauth' }] }

// Checkout tool - works with OR without token
{ name: 'checkout', securitySchemes: [{ type: 'noauth' }, { type: 'oauth2', scopes: ['purchase'] }] }
```

### Step 4: Implement Checkout Handler Logic

See detailed code below in "Checkout Handler Logic" section.

---

## What This Achieves

| User Action | What Happens |
|-------------|--------------|
| Adds connector | No OAuth prompt (Mixed + noauth tools) |
| Browses products | Works immediately (noauth) |
| First purchase | Device auth flow (QR/push) - can grant delegation |
| Second purchase (if delegation granted + within limits) | **Auto-approves, no user interaction** |
| Over-limit purchase | Step-up auth (device auth with limit warning) |

---

## What We're Building

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PAYMENT-BOOTSTRAPPED OAUTH FLOW                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. USER ADDS CONNECTOR                                                     │
│     └─ No OAuth required                                                    │
│     └─ User can immediately browse products, search, etc.                   │
│                                                                             │
│  2. FIRST PURCHASE (no token)                                               │
│     └─ MCP calls WSIM /device_authorization                                 │
│     └─ User gets push notification / sees QR code                           │
│     └─ User approves payment + optionally checks "Allow future payments"    │
│     └─ Poll returns { delegation_granted: true, delegation_pending: true }  │
│                                                                             │
│  3. OAUTH LINKING (if delegation granted)                                   │
│     └─ MCP returns OAuth challenge with mcp/www_authenticate                │
│     └─ ChatGPT shows OAuth popup                                            │
│     └─ User one-tap consents (already authenticated)                        │
│     └─ Token stored in ChatGPT                                              │
│                                                                             │
│  4. SUBSEQUENT PURCHASES (token present)                                    │
│     └─ ChatGPT automatically includes Authorization: Bearer <token>         │
│     └─ MCP validates token, checks limits                                   │
│     └─ Within limits → Auto-approve (NO user interaction)                   │
│     └─ Over limits → Step-up auth (device auth with exceeded_limit)         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ⚠️ CRITICAL: OAuth Discovery on MCP Server (BLOCKING ISSUE)

**This is the root cause of the "MCP server does not implement OAuth" error.**

When you configure the connector as "Mixed" auth, ChatGPT validates that OAuth infrastructure exists **at connector setup time**. This validation happens even though users won't be prompted for OAuth until later.

### The Problem

ChatGPT tried to fetch OAuth discovery from your MCP server:
```
GET https://sacp-mcp.banksim.ca/.well-known/oauth-protected-resource
```

This returned 404 → ChatGPT rejected the connector with "does not implement OAuth".

### The Fix

**The MCP server must serve this endpoint** (not WSIM - the MCP server itself):

```
GET https://sacp-mcp.banksim.ca/.well-known/oauth-protected-resource
```

Return this JSON:
```json
{
  "resource": "https://sacp-mcp.banksim.ca",
  "authorization_servers": ["https://wsim-auth-dev.banksim.ca"],
  "scopes_supported": ["purchase"],
  "bearer_methods_supported": ["header"],
  "resource_documentation": "https://docs.banksim.ca/sacp"
}
```

### Implementation (Express.js example)

```typescript
// Add this route to your MCP server
app.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json({
    resource: 'https://sacp-mcp.banksim.ca',
    authorization_servers: ['https://wsim-auth-dev.banksim.ca'],
    scopes_supported: ['purchase'],
    bearer_methods_supported: ['header'],
    resource_documentation: 'https://docs.banksim.ca/sacp'
  });
});
```

### Why This Is Needed

| Endpoint | Hosted By | Purpose |
|----------|-----------|---------|
| `/.well-known/oauth-protected-resource` | **MCP Server** (sacp-mcp.banksim.ca) | Tells ChatGPT "I'm a protected resource, here's my auth server" |
| `/.well-known/oauth-authorization-server` | WSIM (wsim-auth-dev.banksim.ca) | OAuth server metadata (authorization, token endpoints, **registration_endpoint**) |
| `/.well-known/jwks.json` | WSIM (wsim-auth-dev.banksim.ca) | Public keys for token validation |

**Key insight**: "Mixed" auth means "some tools need OAuth" - ChatGPT still validates OAuth exists at setup, but won't prompt users until a protected tool returns an OAuth challenge.

### Connector Configuration (OpenAI Platform)

When configuring the connector in the OpenAI Apps/Connector platform:

1. **Select "Mixed" authentication** (not "OAuth required" or "None")
2. This tells ChatGPT: "Some tools need auth, some don't"

| Config Option | Behavior |
|---------------|----------|
| **None** | No OAuth at all - can't do OAuth challenges later |
| **OAuth Required** | Prompts user for OAuth at connector setup |
| **Mixed** ✅ | Validates OAuth exists, but prompt depends on tool `securitySchemes` |

With "Mixed" configured:
- ChatGPT validates DCR + PKCE exist (at setup)
- Users are **NOT prompted** for OAuth at setup
- OAuth only triggers when a tool returns `mcp/www_authenticate` challenge

### Verification

After adding the endpoint, test it:
```bash
curl https://sacp-mcp.banksim.ca/.well-known/oauth-protected-resource
```

Must return:
- HTTP 200
- `Content-Type: application/json`
- JSON with `resource` and `authorization_servers`

---

## What MCP Team Needs to Implement

### 0. OAuth Protected Resource Metadata (REQUIRED FIRST)

Add the `/.well-known/oauth-protected-resource` endpoint as described above. **This must be done before the connector can be created.**

### 1. Tool Security Schemes

OpenAI confirmed: Use per-tool `securitySchemes` to control which tools need auth.

```javascript
// Tool definitions in your MCP server

// Public tools - no auth needed
const browseProductsTool = {
  name: 'browse_products',
  description: 'Browse available products',
  inputSchema: { /* ... */ },
  securitySchemes: [{ type: 'noauth' }]
};

const searchTool = {
  name: 'search',
  description: 'Search for products',
  inputSchema: { /* ... */ },
  securitySchemes: [{ type: 'noauth' }]
};

// Checkout tool - mixed auth (works with OR without token)
const checkoutTool = {
  name: 'checkout',
  description: 'Complete a purchase',
  inputSchema: { /* ... */ },
  securitySchemes: [
    { type: 'noauth' },  // First purchase - no token
    { type: 'oauth2', scopes: ['purchase'] }  // Delegated purchase - with token
  ]
};
```

### 2. Two Checkout Flows: User's Choice

WSIM supports two checkout flows. **This is about user choice and privacy**, not just whether the AI knows the email. Some users prefer to share their email with the AI for convenience; others prefer to only share sensitive information directly with WSIM.

| Flow | When to Use | What Happens | User Experience |
|------|-------------|--------------|-----------------|
| **A: Share with AI** | User **chooses** to provide their email to the AI | WSIM finds user, links to pairing code, sends push immediately | User clicks web link → goes directly to auth page (no email prompt) |
| **B: Share with WSIM only** | User **declines** to share email with AI | WSIM creates pairing code without user link, no push sent | User clicks web link → enters email on WSIM site → push sent |

**⚠️ CRITICAL: This is about user choice, not AI capability**

The AI should:
1. **Offer** to collect the email for a faster experience
2. **Clearly explain** the user can decline and enter it on the WSIM website instead
3. **Respect the user's choice** without pressure

**When to use each flow**:

```typescript
// Flow A: User chose to share email with AI
const deviceAuth = await wsimClient.post('/device_authorization', {
  agent_name: 'SACP Shopping Assistant',
  buyer_email: 'user@example.com',  // ← User provided this
  buyer_name: 'John Doe',           // ← Optional
  request_type: 'first_purchase',
  payment_context: { ... }
});

// Flow B: User chose NOT to share email with AI
const deviceAuth = await wsimClient.post('/device_authorization', {
  agent_name: 'SACP Shopping Assistant',
  // buyer_email omitted - user will enter it directly on WSIM site
  request_type: 'first_purchase',
  payment_context: { ... }
});
```

**AI Assistant Guidance - IMPORTANT**:

Your AI MUST present this as a **choice**, not assume the user wants to share their email:

```
AI: "Great! To complete your $25.99 purchase, I'll send a payment authorization
    to your WSIM wallet.

    I can send the notification now if you share your WSIM wallet email with me,
    or you can enter it directly on the WSIM website if you prefer not to share
    it here.

    Would you like to:
    1. Share your email with me for faster checkout
    2. Enter it on the WSIM website instead"

User Option 1: "My email is user@example.com"
→ AI uses Flow A with buyer_email

User Option 2: "I'll enter it on the website"
→ AI uses Flow B without buyer_email
```

**Privacy Note**: Some users may not want to share their payment-related email with AI assistants. By offering both flows, you respect user privacy preferences while still providing a smooth checkout experience.

### 3. Checkout Handler Logic

```typescript
async function handleCheckout(args: CheckoutArgs, authToken?: string): Promise<ToolResult> {

  // ═══════════════════════════════════════════════════════════════════════════
  // CASE A: TOKEN PRESENT → Validate and check limits
  // ═══════════════════════════════════════════════════════════════════════════
  if (authToken) {
    // Validate token via WSIM JWKS
    const tokenPayload = await validateTokenViaJWKS(authToken);

    if (!tokenPayload) {
      // Token invalid/expired → Return OAuth challenge
      return {
        isError: true,
        content: [{ type: 'text', text: 'Session expired. Please re-authenticate.' }],
        _meta: {
          'mcp/www_authenticate': [
            'Bearer resource_metadata="https://wsim-auth-dev.banksim.ca/.well-known/oauth-protected-resource", error="invalid_token", error_description="Token expired or invalid"'
          ]
        }
      };
    }

    // Get user's limits (from token claims or WSIM lookup)
    const limits = await getAgentLimits(tokenPayload.owner_id, tokenPayload.client_id);
    const amount = parseFloat(args.amount);

    // Check if within limits
    if (amount <= limits.perTransaction && await isDailyLimitOk(tokenPayload.owner_id, amount)) {
      // ✅ WITHIN LIMITS → Auto-approve, process payment directly
      const payment = await processPaymentWithSSIM(args, tokenPayload);
      return {
        content: [{ type: 'text', text: `Payment of $${args.amount} completed automatically!` }],
        structuredContent: { status: 'completed', orderId: payment.orderId }
      };
    }

    // ❌ OVER LIMITS → Trigger step-up authorization
    return await initiateStepUpAuth(args, tokenPayload, limits);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CASE B: NO TOKEN → First purchase, use device auth
  // ═══════════════════════════════════════════════════════════════════════════

  // Build device authorization request
  // Include buyer_email if available (Flow A: Known User) for better UX
  // Omit it if not available (Flow B: Unknown User) - user enters in web flow
  const deviceAuthRequest: DeviceAuthRequest = {
    agent_name: 'SACP Shopping Assistant',
    request_type: 'first_purchase',
    payment_context: {
      amount: args.amount,
      currency: 'CAD',
      item_description: args.item_name,
      merchant_name: 'SACP Demo Store',
      merchant_id: 'sacp-demo-store'
    },
    spending_limits: {
      per_transaction: 100,
      daily: 500,
      monthly: 2000,
      currency: 'CAD'
    }
  };

  // IMPORTANT: Include buyer_email if known for better UX
  // - With buyer_email: WSIM sends push immediately, web flow skips email prompt
  // - Without buyer_email: No push sent, user enters email in web flow
  if (args.buyer_email) {
    deviceAuthRequest.buyer_email = args.buyer_email;
  }
  if (args.buyer_name) {
    deviceAuthRequest.buyer_name = args.buyer_name;
  }

  // Call WSIM device authorization
  const deviceAuth = await wsimClient.post('/api/agent/v1/oauth/device_authorization', deviceAuthRequest);

  // Show QR code / waiting UI to user
  // Then poll for approval...
  const pollResult = await pollForApproval(deviceAuth.device_code);

  if (pollResult.status === 'approved') {
    // Payment was approved!

    // Check if user granted delegation
    if (pollResult.delegation_granted && pollResult.delegation_pending) {
      // ═══════════════════════════════════════════════════════════════════════
      // USER GRANTED DELEGATION → Trigger OAuth challenge
      // ═══════════════════════════════════════════════════════════════════════
      return {
        isError: true,  // Required for ChatGPT to process the challenge
        content: [{
          type: 'text',
          text: 'Payment complete! Link your wallet to enable automatic payments for future purchases.'
        }],
        structuredContent: {
          status: 'approved',
          delegation_pending: true,
          message: 'Wallet linking required for automatic payments'
        },
        _meta: {
          'mcp/www_authenticate': [
            'Bearer resource_metadata="https://wsim-auth-dev.banksim.ca/.well-known/oauth-protected-resource", error="insufficient_scope", error_description="Wallet linking required for automatic payments"'
          ]
        }
      };
    }

    // User declined delegation - payment still completed
    return {
      content: [{
        type: 'text',
        text: `Payment of $${args.amount} completed! Note: Future purchases will require approval each time.`
      }],
      structuredContent: { status: 'approved', delegation_granted: false }
    };
  }

  // Handle other statuses (denied, expired, etc.)
  return {
    isError: true,
    content: [{ type: 'text', text: `Payment ${pollResult.status}` }]
  };
}
```

### 3. Step-Up Authorization (Over-Limit Purchases)

When a user has delegation but the purchase exceeds their limits:

```typescript
async function initiateStepUpAuth(
  args: CheckoutArgs,
  tokenPayload: TokenPayload,
  limits: Limits
): Promise<ToolResult> {

  const amount = parseFloat(args.amount);

  // Determine which limit was exceeded
  const exceededLimit = {
    type: amount > limits.perTransaction ? 'per_transaction' : 'daily',
    limit: amount > limits.perTransaction ? limits.perTransaction.toString() : limits.daily.toString(),
    requested: args.amount,
    currency: 'CAD'
  };

  // Call WSIM device authorization with step-up context
  const deviceAuth = await wsimClient.post('/api/agent/v1/oauth/device_authorization', {
    agent_name: 'SACP Shopping Assistant',
    buyer_email: args.buyer_email,
    request_type: 'step_up',  // ← Important: tells WSIM this is a step-up
    existing_agent_id: tokenPayload.sub,
    payment_context: {
      amount: args.amount,
      currency: 'CAD',
      item_description: args.item_name,
      merchant_name: 'SACP Demo Store',
      merchant_id: 'sacp-demo-store'
    },
    exceeded_limit: exceededLimit  // ← Tells WSIM which limit was exceeded
  });

  // Show step-up UI (QR code / push notification)
  // User sees: "SACP wants to charge $899.00 (exceeds your $100 per-transaction limit)"

  const pollResult = await pollForApproval(deviceAuth.device_code);

  if (pollResult.status === 'approved') {
    // One-time approval - process the payment
    // Note: No delegation option for step-up (user already has delegation)
    const payment = await processPaymentWithSSIM(args, tokenPayload);
    return {
      content: [{ type: 'text', text: `Payment of $${args.amount} approved and completed!` }],
      structuredContent: { status: 'completed', orderId: payment.orderId }
    };
  }

  return {
    isError: true,
    content: [{ type: 'text', text: `Payment ${pollResult.status}` }]
  };
}
```

### 4. Token Validation via WSIM JWKS

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
    // Decode header to get key ID
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header.kid) return null;

    // Fetch signing key from WSIM JWKS
    const key = await wsimJwksClient.getSigningKey(decoded.header.kid);
    const publicKey = key.getPublicKey();

    // Verify token
    const payload = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: 'https://wsim-auth-dev.banksim.ca'
    }) as TokenPayload;

    return payload;
  } catch (error) {
    console.error('Token validation failed:', error);
    return null;
  }
}
```

---

## Critical Details from OpenAI

### OAuth Challenge Format

OpenAI confirmed the challenge MUST include `error` and `error_description`:

```javascript
// ❌ WRONG - Missing error params
'Bearer resource_metadata="https://wsim.banksim.ca/.well-known/oauth-protected-resource"'

// ✅ CORRECT - Includes error and error_description
'Bearer resource_metadata="https://wsim-auth-dev.banksim.ca/.well-known/oauth-protected-resource", error="insufficient_scope", error_description="Wallet linking required for automatic payments"'
```

### isError Flag

OpenAI confirmed: `isError: true` is REQUIRED for ChatGPT to process the OAuth challenge, even though the payment succeeded:

```javascript
// When returning OAuth challenge after successful payment
return {
  isError: true,  // ← Required for ChatGPT to show OAuth UI
  content: [{ type: 'text', text: 'Payment complete! Link wallet...' }],
  structuredContent: { status: 'approved' },  // ← Payment status is still success
  _meta: { 'mcp/www_authenticate': [...] }
};
```

### Token Auto-Inclusion

OpenAI confirmed: After OAuth completes, ChatGPT automatically includes `Authorization: Bearer <token>` on subsequent requests. You don't need to do anything special - just handle the token when it arrives.

---

## WSIM Endpoints Reference

| Endpoint | Purpose |
|----------|---------|
| `POST /api/agent/v1/oauth/device_authorization` | Start device auth flow |
| `POST /api/agent/v1/oauth/token` | Poll for approval / exchange codes |
| `GET /.well-known/oauth-protected-resource` | Protected resource metadata |
| `GET /.well-known/oauth-authorization-server` | OAuth server metadata |
| `GET /.well-known/jwks.json` | Public keys for token verification |
| `POST /api/agent/v1/oauth/introspect` | Token introspection |

### Device Authorization Request

```bash
POST https://wsim-auth-dev.banksim.ca/api/agent/v1/oauth/device_authorization

{
  "agent_name": "SACP Shopping Assistant",
  "buyer_email": "user@example.com",  // OPTIONAL - include for better UX (see "Two Checkout Flows")
  "buyer_name": "John Doe",           // OPTIONAL - shown in push notification
  "request_type": "first_purchase",   // or "step_up"
  "payment_context": {
    "amount": "59.99",
    "currency": "CAD",
    "item_description": "Backpack",
    "merchant_name": "SACP Demo Store",
    "merchant_id": "sacp-demo-store"
  },
  "spending_limits": {
    "per_transaction": 100,
    "daily": 500,
    "monthly": 2000,
    "currency": "CAD"
  },
  // Only for step_up:
  "existing_agent_id": "agent_xxx",
  "exceeded_limit": {
    "type": "per_transaction",
    "limit": "100.00",
    "requested": "899.00",
    "currency": "CAD"
  }
}
```

### Device Authorization Response

```json
{
  "device_code": "ar_xxx",
  "user_code": "WSIM-ABC123-DEF456",
  "verification_uri": "https://wsim-auth-dev.banksim.ca/api/m/device",
  "verification_uri_complete": "https://wsim-auth-dev.banksim.ca/api/m/device?code=WSIM-ABC123-DEF456",
  "expires_in": 900,
  "interval": 5,
  "notification_sent": true,      // true if buyer_email was provided and user found
  "notification_user_id": "user_xxx"  // only present if notification was sent
}
```

**Note on `notification_sent`**:
- `true` → WSIM found the user (via `buyer_email`) and sent a push notification. The web flow will skip email prompt.
- `false` or absent → No user linked. Web flow will ask for email, then send push.
```

### Poll Response (Approved with Delegation)

```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "purchase",
  "delegation_granted": true,
  "delegation_pending": true
}
```

---

## Who Does What (Responsibility Matrix)

### ✅ WSIM Team (DONE - No Action Needed)

| What | Status | Endpoint |
|------|--------|----------|
| OAuth Authorization Server Metadata | ✅ Done | `https://wsim-auth-dev.banksim.ca/.well-known/oauth-authorization-server` |
| Dynamic Client Registration (RFC 7591) | ✅ Done | `https://wsim-auth-dev.banksim.ca/api/agent/v1/oauth/register` |
| Device Authorization (RFC 8628) | ✅ Done | `https://wsim-auth-dev.banksim.ca/api/agent/v1/oauth/device_authorization` |
| Token Endpoint | ✅ Done | `https://wsim-auth-dev.banksim.ca/api/agent/v1/oauth/token` |
| JWKS for Token Validation | ✅ Done | `https://wsim-auth-dev.banksim.ca/.well-known/jwks.json` |
| Authorization Endpoint | ✅ Done | `https://wsim-auth-dev.banksim.ca/api/agent/v1/oauth/authorize` |
| Payment-Bootstrapped OAuth fields | ✅ Done | `delegation_granted`, `delegation_pending` in responses |

### ⬜ MCP Team (ACTION REQUIRED)

| What | Status | Where |
|------|--------|-------|
| **`/.well-known/oauth-protected-resource` endpoint** | ⬜ TODO | `https://sacp-mcp.banksim.ca/.well-known/oauth-protected-resource` |
| **Connector configured as "Mixed" auth** | ⬜ TODO | OpenAI Platform connector settings |
| **Tool `securitySchemes`** | ⬜ TODO | Tool definitions in MCP server code |
| **Checkout handler logic** | ⬜ TODO | MCP server checkout tool implementation |
| **Token validation via JWKS** | ⬜ TODO | MCP server (call WSIM JWKS) |
| **OAuth challenge return format** | ⬜ TODO | MCP server (when `delegation_pending: true`) |
| **Support both checkout flows (user's choice)** | ⬜ TODO | AI must offer choice: share email with AI for faster checkout, OR enter on WSIM site for privacy |

---

## Summary: What MCP Team Needs to Do

| # | Task | Status | Blocking? |
|---|------|--------|-----------|
| **0** | **Add `/.well-known/oauth-protected-resource` endpoint to MCP server** | ⬜ TODO | **YES - Connector creation fails without this** |
| **0.5** | **Configure connector as "Mixed" in OpenAI Platform** | ⬜ TODO | **YES - Required for no-prompt setup** |
| 1 | Add `securitySchemes` to tool definitions (`noauth` for browse, mixed for checkout) | ⬜ TODO | No |
| 2 | Handle checkout WITHOUT token → call WSIM device_authorization | ⬜ TODO | No |
| **2.5** | **Support both checkout flows (user's choice)** - AI MUST offer user the choice to share email OR enter on WSIM site (see "Two Checkout Flows: User's Choice") | ⬜ TODO | No |
| 3 | When `delegation_pending: true` → return OAuth challenge with proper format | ⬜ TODO | No |
| 4 | Handle checkout WITH token → validate via JWKS, check limits | ⬜ TODO | No |
| 5 | Within limits → auto-approve (no user interaction) | ⬜ TODO | No |
| 6 | Over limits → call WSIM device_authorization with `request_type: 'step_up'` | ⬜ TODO | No |

### Quick Copy-Paste for Task #0

```typescript
// Add to your MCP server routes
app.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json({
    resource: 'https://sacp-mcp.banksim.ca',
    authorization_servers: ['https://wsim-auth-dev.banksim.ca'],
    scopes_supported: ['purchase'],
    bearer_methods_supported: ['header']
  });
});
```

---

## Questions?

The WSIM backend is complete and ready. If you have questions about:
- WSIM endpoints or responses
- Token validation
- The delegation flow

Contact the WSIM team.
