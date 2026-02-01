# MCP Team Implementation Guide: Payment-Bootstrapped OAuth

**Date**: 2026-02-01
**From**: WSIM Team
**To**: Agents/MCP Team
**Status**: ACTION REQUIRED

---

## Executive Summary

OpenAI has confirmed that our Payment-Bootstrapped OAuth design is fully supported. The MCP server needs specific changes to complete the integration. This document provides exact implementation details.

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

## What MCP Team Needs to Implement

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

### 2. Checkout Handler Logic

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

  // Call WSIM device authorization
  const deviceAuth = await wsimClient.post('/api/agent/v1/oauth/device_authorization', {
    agent_name: 'SACP Shopping Assistant',
    buyer_email: args.buyer_email,
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
  });

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
  "buyer_email": "user@example.com",
  "request_type": "first_purchase",  // or "step_up"
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
  "notification_sent": true,
  "notification_user_id": "user_xxx"
}
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

## Summary: What You Need to Do

| # | Task | Status |
|---|------|--------|
| 1 | Add `securitySchemes` to tool definitions (`noauth` for browse, mixed for checkout) | ⬜ TODO |
| 2 | Handle checkout WITHOUT token → call WSIM device_authorization | ⬜ TODO |
| 3 | When `delegation_pending: true` → return OAuth challenge with proper format | ⬜ TODO |
| 4 | Handle checkout WITH token → validate via JWKS, check limits | ⬜ TODO |
| 5 | Within limits → auto-approve (no user interaction) | ⬜ TODO |
| 6 | Over limits → call WSIM device_authorization with `request_type: 'step_up'` | ⬜ TODO |

---

## Questions?

The WSIM backend is complete and ready. If you have questions about:
- WSIM endpoints or responses
- Token validation
- The delegation flow

Contact the WSIM team.
