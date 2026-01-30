# Design Document: MCP-UI Embedded OAuth with Passkeys

**Author**: WSIM Team / Gateway Team
**Date**: 2026-01-30
**Status**: Draft - Design Phase (Updated with OpenAI Feedback)
**Related**: [WSIM Push Notification Enhancement](./WSIM_PUSH_NOTIFICATION_ENHANCEMENT.md), [Gateway v1.4 Guest Checkout](./GATEWAY_V1.4_GUEST_CHECKOUT.md)

---

## Executive Summary

This document proposes adding **MCP-UI Embedded OAuth** as an **additional authorization method** specifically for **in-browser/desktop users**. This pattern keeps authentication "in-flow" within the chat interface while preserving **passkey support**.

**Key Insight (from OpenAI)**: ChatGPT should be the OAuth client, not the widget. ChatGPT has built-in OAuth support via the `_meta["mcp/www_authenticate"]` pattern. When a tool needs authentication, it returns metadata that triggers ChatGPT's native OAuth flow.

**Important**: This does NOT replace existing flows:
- **Push notifications** → Remain for mobile users (tap notification → approve in mwsim)
- **QR codes** → Remain for cross-device scenarios (scan with phone → approve in mwsim)
- **Device Authorization Grant** → Remains for CLI/IoT and as fallback

The embedded OAuth flow is optimized for the common case: **desktop browser users who have passkeys registered with WSIM**.

---

## OpenAI/ChatGPT Feedback (2026-01-30)

Direct answers from OpenAI about implementation approach:

### 1. Widget Popups (window.open) - DON'T RELY ON IT

> Our SDK widgets run in a sandboxed iframe. We explicitly document that arbitrary DOM access like `window.open` is not supported. Popup windows from the widget are not reliable.

**Implication**: Our original popup-based approach won't work reliably.

### 2. MCP OAuth Support - YES, USE THIS

> Yes, we support MCP OAuth. When your tool needs authorization, return the `_meta["mcp/www_authenticate"]` metadata. ChatGPT will handle the OAuth flow natively.

**Pattern**:
```json
{
  "content": [{ "type": "text", "text": "Authorization required" }],
  "_meta": {
    "mcp/www_authenticate": {
      "resource": "https://wsim.banksim.ca",
      "scope": "purchase"
    }
  }
}
```

### 3. PostMessage - FRAGILE, AVOID

> Cross-window messaging between popup and widget is fragile. We don't guarantee the sandbox policy allows it. Use host-driven OAuth instead.

### 4. Token Management - CHATGPT HANDLES IT

> Once OAuth completes, ChatGPT stores the token and attaches it as `Authorization: Bearer <token>` to subsequent MCP requests. Your server receives the token automatically.

### 5. Session Affinity - DESIGN STATELESS

> No guarantee of session affinity across tool calls. Design your authorization to be stateless - validate the Bearer token on each request.

### 6. Widget-to-Host Communication

> Widgets can use `sendFollowUpMessage()` to send messages to the chat and `callTool()` to invoke other tools. These are the supported communication patterns.

---

## Revised Architecture: ChatGPT-Hosted OAuth

Based on OpenAI feedback, the architecture changes significantly:

### Before (Widget-Controlled - NOT RECOMMENDED)
```
Widget opens popup → User authenticates → PostMessage to widget → Widget retries
```

### After (ChatGPT-Hosted - RECOMMENDED)
```
Tool returns _meta → ChatGPT opens OAuth → User authenticates → ChatGPT retries with token
```

---

## Hard Requirements

| # | Requirement | Rationale |
|---|-------------|-----------|
| 1 | **Passkey support** | Users have passkeys registered with WSIM (`wsim.banksim.ca`). These must continue to work for authentication. |
| 2 | **In-flow experience** | Authentication should happen without forcing users to a new browser tab. The flow should feel integrated with the chat experience. |
| 3 | **OAuth 2.1 compliance** | Follow MCP OAuth specification including PKCE for all public clients. |
| 4 | **Fallback support** | If OAuth fails or passkeys unavailable, users can still authenticate via password or push notification. |

---

## The Passkey Constraint

**Critical**: Passkeys are bound to the **Relying Party ID** (RP ID), which is the domain where they were registered.

```
Passkeys registered with: wsim.banksim.ca
RP ID: wsim.banksim.ca
```

This means passkeys can **only** be used when the WebAuthn ceremony happens on `wsim.banksim.ca`. The OAuth flow handles this correctly - when ChatGPT redirects the user to `wsim.banksim.ca/oauth/authorize`, passkeys work because we're on the correct domain.

### What This Rules Out

| Approach | Why It Doesn't Work |
|----------|---------------------|
| Rendering auth form in MCP-UI directly | Wrong domain - passkeys won't trigger |
| Cross-origin iframe without proper setup | CSP blocks it; passkeys need `publickey-credentials-get` permission |
| Proxying WebAuthn through MCP server | RP ID mismatch; WebAuthn is domain-bound |
| Widget-controlled popups | Sandboxed iframe, unreliable `window.open` |

### What Works

| Approach | Why It Works |
|----------|--------------|
| ChatGPT-hosted OAuth redirect | Auth happens on correct domain (`wsim.banksim.ca`) |
| Push notification → mobile app | mwsim uses device passkey/biometric |

---

## Revised Sequence Diagram

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ ChatGPT │     │ Gateway │     │  WSIM   │     │  WSIM   │
│  Host   │     │  (MCP)  │     │  OAuth  │     │   API   │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │
     │ User: "Buy this item"         │               │
     │               │               │               │
     │ tools/call: checkout()        │               │
     │──────────────>│               │               │
     │               │               │               │
     │               │ No Bearer token - auth needed │
     │               │               │               │
     │  Tool result + _meta["mcp/www_authenticate"]  │
     │<──────────────│               │               │
     │               │               │               │
     │ ChatGPT discovers OAuth server│               │
     │─────────────────────────────>│               │
     │  GET /.well-known/oauth-protected-resource   │
     │<─────────────────────────────│               │
     │               │               │               │
     │ ChatGPT starts OAuth (PKCE)  │               │
     │─────────────────────────────>│               │
     │  GET /oauth/authorize?...    │               │
     │               │               │               │
     │     User sees consent page   │               │
     │     (on wsim.banksim.ca)     │               │
     │               │               │               │
     │  [Passkey Auth - Face ID/Touch ID]           │
     │─────────────────────────────>│               │
     │               │               │               │
     │     Redirect with auth code  │               │
     │<─────────────────────────────│               │
     │               │               │               │
     │ ChatGPT exchanges code       │               │
     │─────────────────────────────>│               │
     │  POST /oauth/token           │               │
     │     access_token             │               │
     │<─────────────────────────────│               │
     │               │               │               │
     │ ChatGPT stores token, retries│               │
     │               │               │               │
     │ tools/call: checkout()       │               │
     │ Authorization: Bearer <token>│               │
     │──────────────>│               │               │
     │               │               │               │
     │               │ Validate token│               │
     │               │──────────────────────────────>│
     │               │               │               │
     │               │     Token valid + user info  │
     │               │<──────────────────────────────│
     │               │               │               │
     │               │ Process payment              │
     │               │               │               │
     │  Payment complete            │               │
     │<──────────────│               │               │
     │               │               │               │
     │ "Order placed! Here's your confirmation..."  │
     │               │               │               │
```

---

## Technical Requirements

### WSIM Requirements

#### 1. OAuth Protected Resource Discovery (NEW)

Add endpoint: `GET /.well-known/oauth-protected-resource`

```json
{
  "resource": "https://wsim.banksim.ca",
  "authorization_servers": ["https://wsim.banksim.ca"],
  "scopes_supported": ["purchase", "read:wallet", "manage:agents"]
}
```

This allows ChatGPT to discover where to authenticate.

#### 2. OAuth Authorization Server Metadata

Existing endpoint: `GET /.well-known/oauth-authorization-server`

```json
{
  "issuer": "https://wsim.banksim.ca",
  "authorization_endpoint": "https://wsim.banksim.ca/oauth/authorize",
  "token_endpoint": "https://wsim.banksim.ca/oauth/token",
  "response_types_supported": ["code"],
  "code_challenge_methods_supported": ["S256"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "scopes_supported": ["purchase", "read:wallet", "manage:agents"]
}
```

#### 3. Token Introspection/Validation

Gateway needs to validate Bearer tokens. Options:
- **Token introspection endpoint**: `POST /oauth/introspect`
- **JWT validation**: If tokens are signed JWTs, validate locally
- **Internal API**: `GET /api/internal/token/validate?token=...`

Recommendation: Use signed JWTs so Gateway can validate without calling WSIM.

### Gateway/MCP Server Requirements

#### 1. Return Auth Challenge When Needed

When a tool requires authentication and no valid Bearer token is present:

```typescript
// In tools/call handler
function handleCheckout(request: MCPRequest): MCPResponse {
  const authHeader = request.headers?.['authorization'];

  if (!authHeader || !isValidToken(authHeader)) {
    return {
      content: [{
        type: 'text',
        text: 'Please authorize to complete this payment.'
      }],
      _meta: {
        'mcp/www_authenticate': {
          resource: 'https://wsim.banksim.ca',
          scope: 'purchase'
        }
      }
    };
  }

  // Token valid - proceed with payment
  return processPayment(request);
}
```

#### 2. Accept Bearer Token on Requests

ChatGPT will send `Authorization: Bearer <token>` header after OAuth completes.

#### 3. Design Stateless

Don't rely on session affinity. Validate the Bearer token on every request.

### OAuth Client Registration

Register ChatGPT as an OAuth client with WSIM:

```json
{
  "client_id": "chatgpt-mcp",
  "client_name": "ChatGPT MCP Integration",
  "redirect_uris": [
    "https://chatgpt.com/aip/*/oauth/callback",
    "https://chat.openai.com/aip/*/oauth/callback"
  ],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none",
  "scope": "purchase read:wallet"
}
```

Note: ChatGPT is a public client (no client_secret), so PKCE is required.

---

## Authorization Flow Matrix

The system supports **three parallel authorization paths**:

| Flow | Target Users | Trigger | Auth Location | Status |
|------|--------------|---------|---------------|--------|
| **Push Notification** | Mobile users with mwsim | `buyer_email` provided | mwsim app | ✅ Exists (v1.2.5) |
| **QR Code / Device Auth** | Cross-device, CLI, IoT | Always available | WSIM web or mwsim | ✅ Exists |
| **ChatGPT OAuth (NEW)** | Desktop browser users | `_meta["mcp/www_authenticate"]` | WSIM OAuth (ChatGPT-driven) | 🆕 Proposed |

### When to Use Each Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Authorization Decision Tree                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Is this a ChatGPT MCP request?                                          │
│       │                                                                  │
│       ├── YES → Return _meta["mcp/www_authenticate"]                     │
│       │         (ChatGPT handles OAuth, user sees passkey prompt)       │
│       │                                                                  │
│       └── NO → Is buyer_email known?                                    │
│                    │                                                     │
│                    ├── YES → Send push notification to mwsim             │
│                    │         (User approves on phone with biometric)    │
│                    │                                                     │
│                    └── NO → Fall back to QR code / Device Auth          │
│                              (User scans with phone or enters code)      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Comparison: Flow Characteristics

| Aspect | Push Notification | QR Code / Device Auth | ChatGPT OAuth (NEW) |
|--------|-------------------|----------------------|----------------------|
| **Best for** | Mobile users | Cross-device | Desktop browser (ChatGPT) |
| **User action** | Tap notification | Scan QR / enter code | Consent in redirect |
| **Auth method** | mwsim biometric | mwsim or WSIM web | WSIM passkey |
| **Requires** | Email known | Nothing | ChatGPT MCP client |
| **Network calls** | Push + polling | Polling | Callback (no polling) |
| **Passkey support** | ✅ mwsim | ✅ WSIM web | ✅ WSIM OAuth |
| **Token management** | N/A | N/A | ChatGPT handles |

---

## Implementation Plan

### Phase 1: WSIM Changes

| Task | Description | Priority |
|------|-------------|----------|
| 1.1 | Add `/.well-known/oauth-protected-resource` endpoint | High |
| 1.2 | Ensure `/.well-known/oauth-authorization-server` is complete | High |
| 1.3 | Register ChatGPT as OAuth client (public client, PKCE required) | High |
| 1.4 | Verify passkey auth works on `/oauth/authorize` page | Medium |
| 1.5 | Ensure token response includes necessary claims (user_id, scope) | Medium |
| 1.6 | (Optional) Add token introspection endpoint | Low |

### Phase 2: Gateway/MCP Server Changes

| Task | Description | Priority |
|------|-------------|----------|
| 2.1 | Return `_meta["mcp/www_authenticate"]` when auth required | High |
| 2.2 | Accept `Authorization: Bearer` header on tool calls | High |
| 2.3 | Validate Bearer tokens (call WSIM or verify JWT locally) | High |
| 2.4 | Extract user identity from token for payment processing | Medium |
| 2.5 | Update checkout tool to work with OAuth flow | Medium |

### Phase 3: Testing & Integration

| Task | Description | Priority |
|------|-------------|----------|
| 3.1 | Test OAuth flow end-to-end in ChatGPT | High |
| 3.2 | Verify passkey auth works in ChatGPT's OAuth redirect | High |
| 3.3 | Test fallback to password auth | Medium |
| 3.4 | Verify push notifications still work alongside OAuth | Medium |
| 3.5 | Document integration for ChatGPT Actions setup | Low |

---

## WSIM Existing OAuth Infrastructure

WSIM already has OAuth 2.1 infrastructure (used for ChatGPT Connectors):

| Component | Status | Notes |
|-----------|--------|-------|
| `/oauth/authorize` | ✅ Exists | Works as-is |
| `/oauth/token` | ✅ Exists | Works as-is |
| PKCE support | ✅ Exists | Required for public clients |
| Client registration | ✅ Exists | Need to register ChatGPT MCP client |
| Passkey auth | ✅ Exists | Works on authorize page |
| Password auth | ✅ Exists | Fallback option |
| `/.well-known/oauth-authorization-server` | ✅ Exists | May need updates |
| `/.well-known/oauth-protected-resource` | ❌ Missing | **NEW - Required** |

---

## Security Considerations

### OAuth 2.1 Compliance

- [x] PKCE required for public clients (ChatGPT is public)
- [x] State parameter for CSRF protection
- [x] Short-lived authorization codes (10 min max)
- [x] Redirect URI validation (exact match)
- [x] No implicit grant

### Passkey Security

- WebAuthn ceremony on correct RP ID (`wsim.banksim.ca`)
- User presence required (biometric)
- Credential bound to device
- Phishing resistant

### Token Security

- Bearer tokens should be JWTs with short expiry (5-15 min)
- Include `aud` claim for Gateway validation
- Refresh tokens for longer sessions (if needed)
- Tokens scoped to specific permissions (`purchase`)

---

## API Changes Summary

### WSIM

**New Endpoint**:

```yaml
GET /.well-known/oauth-protected-resource:
  description: OAuth Protected Resource Metadata
  response:
    content:
      application/json:
        schema:
          type: object
          properties:
            resource:
              type: string
              example: "https://wsim.banksim.ca"
            authorization_servers:
              type: array
              items:
                type: string
              example: ["https://wsim.banksim.ca"]
            scopes_supported:
              type: array
              items:
                type: string
              example: ["purchase", "read:wallet"]
```

### Gateway/MCP Server

**Tool Response with Auth Challenge**:

```yaml
# When tool needs authentication
ToolResult:
  content:
    - type: text
      text: "Please authorize to complete this payment."
  _meta:
    mcp/www_authenticate:
      resource: "https://wsim.banksim.ca"
      scope: "purchase"
```

**Tool Request with Token**:

```yaml
# ChatGPT sends after OAuth
ToolRequest:
  headers:
    authorization: "Bearer eyJhbGciOiJSUzI1NiIs..."
```

---

## Addressing Review Comments

The MCP Apps Server team raised several concerns. Here's how the ChatGPT-hosted OAuth approach addresses them:

### 1. Widget Sandbox Constraints ✅ RESOLVED

> "Can widgets call `window.open()`?"

**Answer**: We no longer rely on widget popups. ChatGPT's native OAuth handles the redirect.

### 2. MCP Protocol 401 Pattern ✅ RESOLVED

> "How does ChatGPT's MCP client know to intercept a 401?"

**Answer**: Use `_meta["mcp/www_authenticate"]` in the tool response. This is the documented MCP pattern that ChatGPT supports.

### 3. Token Storage Ownership ✅ RESOLVED

> "MCP Client stores access tokens - but we don't control ChatGPT."

**Answer**: Correct - ChatGPT handles token storage. After OAuth completes, ChatGPT stores the token and attaches it as `Authorization: Bearer` to subsequent requests. We just need to validate tokens.

### 4. Session Affinity ✅ RESOLVED

> "How do we associate tokens with sessions?"

**Answer**: Design stateless. The Bearer token contains the user identity. Validate token on each request. No server-side session needed.

### 5. Fallback UX ✅ SIMPLIFIED

> "Widget needs to detect popup failure and re-render with QR code."

**Answer**: No popup to fail. If ChatGPT OAuth fails, we can show a widget with QR code as fallback. But this should be rare since ChatGPT OAuth is reliable.

### 6. PKCE Code Verifier Storage ✅ RESOLVED

> "Who generates and stores the PKCE code_verifier?"

**Answer**: ChatGPT handles this entirely. We just need a standards-compliant OAuth server.

---

## Testing Checklist

### WSIM

- [ ] `/.well-known/oauth-protected-resource` returns correct metadata
- [ ] `/.well-known/oauth-authorization-server` is complete
- [ ] ChatGPT MCP client registered with correct redirect URIs
- [ ] Passkey auth works on `/oauth/authorize` page
- [ ] Password auth works as fallback
- [ ] Token endpoint issues valid JWTs
- [ ] Tokens include correct claims (sub, scope, aud, exp)

### Gateway/MCP Server

- [ ] Returns `_meta["mcp/www_authenticate"]` when no Bearer token
- [ ] Accepts `Authorization: Bearer` header
- [ ] Validates tokens correctly
- [ ] Extracts user identity from token
- [ ] Processes payment with authenticated user
- [ ] Falls back to Device Auth if needed

### End-to-End (ChatGPT)

- [ ] User says "Buy this item"
- [ ] ChatGPT redirects to WSIM OAuth
- [ ] User authenticates with passkey
- [ ] User approves consent
- [ ] ChatGPT receives token
- [ ] ChatGPT retries checkout with token
- [ ] Payment completes successfully

---

## Open Questions

1. **Token expiry**: How long should access tokens live?
   - Recommendation: 15 minutes (payment is usually quick)
   - Refresh tokens: Issue if needed for long conversations

2. **Scope design**: What scopes do we need?
   - `purchase` - Make payments
   - `read:wallet` - View wallet info
   - `manage:agents` - Manage agent connections (future)

3. **Error handling**: What happens if OAuth fails mid-flow?
   - ChatGPT should show error message
   - Widget can offer QR code as fallback

4. **Multi-turn conversations**: Does the token persist?
   - Yes, ChatGPT stores it for the session
   - Token refresh needed for long conversations

---

## Sign-Off

| Team | Reviewer | Status | Date | Notes |
|------|----------|--------|------|-------|
| WSIM | | ⬜ Pending | | |
| Gateway | | ⬜ Pending | | |
| MCP Apps Server | Claude (AI) | ✅ Reviewed | 2026-01-30 | Updated approach based on OpenAI feedback |
| OpenAI | (Feedback) | ✅ Provided | 2026-01-30 | Use `_meta["mcp/www_authenticate"]` pattern |

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-30 | 1.0 | Initial draft |
| 2026-01-30 | 1.1 | Added MCP Apps Server team review comments |
| 2026-01-30 | 2.0 | **Major revision**: Updated to ChatGPT-hosted OAuth based on OpenAI feedback. Removed widget popup approach. Added `_meta["mcp/www_authenticate"]` pattern. Added `/.well-known/oauth-protected-resource` requirement. |

---

## References

- [OAuth 2.1 Draft Specification](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-07)
- [RFC 7636 - PKCE](https://datatracker.ietf.org/doc/html/rfc7636)
- [RFC 9728 - OAuth Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
- [WebAuthn Level 2](https://www.w3.org/TR/webauthn-2/)
- [MCP OAuth Specification](https://modelcontextprotocol.io/docs/concepts/oauth)
- [WSIM OAuth Implementation](../../wsim/backend/src/routes/oauth.ts)
- [Current Device Auth Flow](../../wsim/backend/src/routes/agent-oauth.ts)
