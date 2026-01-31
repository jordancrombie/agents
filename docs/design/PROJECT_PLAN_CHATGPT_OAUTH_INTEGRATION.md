# Project Plan: ChatGPT OAuth Integration for Payment Authorization

**Owner**: WSIM Team (Wallet)
**Date**: 2026-01-30
**Status**: ✅ Phase 2 Complete - Ready for Phase 3 Testing
**Related**: [MCP-UI Embedded OAuth with Passkeys](./MCP_UI_EMBEDDED_OAUTH_WITH_PASSKEYS.md)

---

## Strategic Vision

### Why We're Doing This

**Phase 1 Goal (This Project)**: Enable users to authorize individual payments directly within ChatGPT using their WSIM passkeys - no QR codes, no new tabs, no friction.

**Phase 2 Goal (Future)**: Once the user has authenticated and approved a payment, grant the AI agent **scoped permissions** to make future payments autonomously within user-defined limits (e.g., "up to $50/day for groceries").

### The Two-Step Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PAYMENT AUTHORIZATION                              │
│                                                                              │
│  Step 1: Authenticate User (OAuth)                                          │
│  ─────────────────────────────────                                          │
│  "Who is this person?"                                                      │
│  - ChatGPT redirects to wsim.banksim.ca                                     │
│  - User authenticates with passkey (Face ID / Touch ID)                    │
│  - WSIM issues token identifying the user                                   │
│                                                                              │
│  Step 2: Authorize Payment (Consent)                                        │
│  ───────────────────────────────────                                        │
│  "Do they approve this specific action?"                                    │
│  - User sees payment details (merchant, amount)                             │
│  - User clicks "Approve"                                                    │
│  - WSIM records consent, payment proceeds                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                     FUTURE: DELEGATED AGENT PERMISSIONS                      │
│                                                                              │
│  Step 3: Grant Standing Permissions (Future)                                │
│  ──────────────────────────────────────────                                 │
│  "Can the AI act on my behalf within limits?"                              │
│  - After first payment, user can optionally grant agent permissions        │
│  - "Allow this AI to spend up to $50/day on my behalf"                     │
│  - Agent gets credentials (client_id/client_secret) for autonomous calls   │
│  - WSIM enforces limits on every future request                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### WSIM's Role

WSIM is the **wallet** and **orchestrator**:
- **Identity owner**: Users register passkeys with us
- **Consent authority**: We record and enforce user approvals
- **Payment orchestrator**: We coordinate with BSIM/TransferSim
- **Permission enforcer**: We validate agent permissions on every call

---

## Team Responsibilities

| Team | Responsibility | Systems |
|------|----------------|---------|
| **WSIM** (us) | OAuth server, user auth, consent, permissions | wsim backend |
| **Agents/MCP** | MCP server, tool handlers, token validation | ../agents |
| **ChatGPT** (OpenAI) | OAuth client, token storage, UI | N/A (their system) |
| **mwsim** | Mobile fallback (push notifications, QR) | mwsim app |

---

## Implementation Phases

### Phase 1: WSIM OAuth Foundation ✅ COMPLETE

**Owner**: WSIM Team
**Dependency**: None
**Deliverable**: Standards-compliant OAuth server that ChatGPT can use
**Deployed**: v1.2.18 (2026-01-31)

| # | Task | Description | Status |
|---|------|-------------|--------|
| 1.1 | Add `/.well-known/oauth-protected-resource` | RFC 9728 discovery endpoint | ✅ Deployed |
| 1.2 | Add `/.well-known/jwks.json` | RSA public keys for JWT verification (RFC 7517) | ✅ Deployed |
| 1.3 | Verify `/.well-known/oauth-authorization-server` | Added `jwks_uri` field | ✅ Deployed |
| 1.4 | Register ChatGPT OAuth client | `chatgpt-mcp` - public client with PKCE | ✅ Deployed |
| 1.5 | Verify passkey auth on `/oauth/authorize` | Existing flow works | ✅ Verified |
| 1.6 | Token claims for Gateway | RS256 signing, includes `sub`, `scope`, `aud`, `exp`, `iss`, `iat` | ✅ Deployed |
| 1.7 | Token introspection endpoint | Already exists at `/api/agent/v1/oauth/introspect` | ✅ Exists |

**Acceptance Criteria**:
- [x] `GET /.well-known/oauth-protected-resource` returns valid JSON
- [x] `GET /.well-known/jwks.json` returns valid JWKS with RSA public keys
- [x] Tokens are valid JWTs with correct claims (`sub`, `scope`, `aud`, `exp`, `iss`)
- [x] Tokens signed with RS256 (verifiable via JWKS)
- [ ] ChatGPT can complete OAuth flow (requires Phase 2 + 3)
- [ ] Passkey auth works on authorize page (manual test pending)

---

### Phase 2: Agents/MCP Integration ✅ COMPLETE

**Owner**: Agents Team
**Dependency**: ✅ Phase 1 complete
**Deliverable**: MCP server returns auth challenges and accepts Bearer tokens
**Deployed**: v1.5.24 (2026-01-31)

| # | Task | Description | Status |
|---|------|-------------|--------|
| 2.1 | Fetch and cache JWKS | Load RSA public keys from `https://wsim.banksim.ca/.well-known/jwks.json` | ✅ Deployed |
| 2.2 | Accept `Authorization: Bearer` header | Parse token from incoming MCP requests | ✅ Deployed |
| 2.3 | Validate Bearer tokens locally | Verify RS256 signature using JWKS, check `iss`, `aud`, `exp` | ✅ Deployed |
| 2.4 | Extract user identity from token | Get `sub` (WalletUser ID) for payment processing | ✅ Deployed |
| 2.5 | Return `_meta["mcp/www_authenticate"]` | When checkout called without valid token | ✅ Deployed |
| 2.6 | Update checkout tool flow | If valid token → skip device auth → process payment directly | ✅ Deployed |

**Implementation Notes**:
- JWT validation using `jose` library with remote JWKS
- Hybrid response: OAuth challenge (`_meta`) + device auth fallback (`structuredContent`)
- QR code flow continues to work as fallback when OAuth not supported

---

## 🚀 Agents Team: Getting Started

### Prerequisites (All Deployed)

| Resource | URL | Notes |
|----------|-----|-------|
| JWKS Endpoint | `https://wsim.banksim.ca/.well-known/jwks.json` | RSA public keys for token verification |
| OAuth Metadata | `https://wsim.banksim.ca/.well-known/oauth-authorization-server` | Server capabilities |
| Protected Resource | `https://wsim.banksim.ca/.well-known/oauth-protected-resource` | MCP discovery |

### Token Validation Checklist

When you receive a Bearer token, validate:

1. **Signature**: Verify RS256 signature using public key from JWKS
2. **Issuer**: `iss` must equal `https://wsim.banksim.ca`
3. **Audience**: `aud` must equal `chatgpt-mcp`
4. **Expiration**: `exp` must be in the future
5. **Scope**: `scope` should include `purchase` for payment operations

### Example Token Payload

```json
{
  "sub": "clm1abc123def456ghi789",  // WalletUser ID - use for payment
  "client_id": "oauth_chatgpt-mcp_clm1abc1",
  "owner_id": "clm1abc123def456ghi789",
  "permissions": ["purchase"],
  "scope": "purchase",
  "aud": "chatgpt-mcp",
  "iat": 1706647500,
  "exp": 1706648400,
  "iss": "https://wsim.banksim.ca"
}
```

### Payment Flow with OAuth

```
User: "Buy this item for $25"
    ↓
MCP Server receives checkout tool call
    ↓
Check for Authorization: Bearer <token>
    ↓
┌─ No token or invalid token ──────────────────────────────────┐
│  Return:                                                      │
│  {                                                           │
│    content: [{ type: 'text', text: 'Authorize payment...' }],│
│    _meta: {                                                  │
│      'mcp/www_authenticate': {                               │
│        resource: 'https://wsim.banksim.ca',                  │
│        scope: 'purchase'                                     │
│      }                                                       │
│    }                                                         │
│  }                                                           │
│  → ChatGPT handles OAuth popup → User authenticates with     │
│    passkey → Token returned → ChatGPT retries with token     │
└──────────────────────────────────────────────────────────────┘
    ↓
┌─ Valid token ────────────────────────────────────────────────┐
│  1. Extract user_id from token.sub                           │
│  2. Skip device authorization (no QR code needed)            │
│  3. Process payment directly with SSIM using user_id         │
│  4. Return success response                                  │
└──────────────────────────────────────────────────────────────┘
```

### Sample JWT Validation Code (TypeScript)

```typescript
import * as jose from 'jose';

// Cache JWKS at startup
let jwks: jose.JWTVerifyGetKey;

async function initJWKS() {
  jwks = jose.createRemoteJWKSet(
    new URL('https://wsim.banksim.ca/.well-known/jwks.json')
  );
}

async function validateToken(token: string): Promise<{
  valid: boolean;
  userId?: string;
  error?: string;
}> {
  try {
    const { payload } = await jose.jwtVerify(token, jwks, {
      issuer: 'https://wsim.banksim.ca',
      audience: 'chatgpt-mcp',
    });

    return {
      valid: true,
      userId: payload.sub as string,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Token validation failed',
    };
  }
}
```

---

**Key Code Changes** (in `../agents`):

```typescript
// In tools/call handler for checkout
function handleCheckout(request: MCPRequest): MCPResponse {
  const token = extractBearerToken(request);

  if (!token || !isValidToken(token)) {
    // Return auth challenge - ChatGPT will handle OAuth
    return {
      content: [{ type: 'text', text: 'Please authorize to complete this payment.' }],
      _meta: {
        'mcp/www_authenticate': {
          resource: 'https://wsim.banksim.ca',
          scope: 'purchase'
        }
      }
    };
  }

  // Token valid - proceed with payment using user identity from token
  const userId = decodeToken(token).sub;
  return processPayment(request, userId);
}
```

**Acceptance Criteria**:
- [ ] Calling checkout without token returns `_meta["mcp/www_authenticate"]`
- [ ] Calling checkout with valid token processes payment
- [ ] Invalid/expired tokens trigger re-authentication

---

### Phase 3: End-to-End Testing

**Owner**: WSIM + Agents (joint)
**Dependency**: Phase 1 + 2 complete
**Deliverable**: Working payment flow in ChatGPT

| # | Task | Description | Effort |
|---|------|-------------|--------|
| 3.1 | Test OAuth flow in ChatGPT | Verify ChatGPT handles `_meta` correctly | Medium |
| 3.2 | Test passkey auth in redirect | Confirm Face ID/Touch ID works | Small |
| 3.3 | Test payment completion | End-to-end payment with OAuth | Medium |
| 3.4 | Test fallback flows | Push notification, QR code still work | Small |
| 3.5 | Document integration | Update ChatGPT Actions setup guide | Small |

**Test Scenarios**:

1. **Happy Path**: User says "buy this" → OAuth redirect → passkey auth → payment approved
2. **No Passkey**: User authenticates with password instead
3. **Token Expired**: User's token expires mid-conversation → re-auth triggered
4. **Fallback**: OAuth fails → widget shows QR code → user scans with mwsim

---

### Phase 4: Agent Permissions (Future)

**Owner**: WSIM + Agents (joint)
**Dependency**: Phase 3 complete, user feedback
**Deliverable**: Agents can make autonomous payments within limits

| # | Task | Description | Effort |
|---|------|-------------|--------|
| 4.1 | Post-approval permission prompt | "Allow this AI to spend up to $X/day?" | Medium |
| 4.2 | Agent credential issuance | Generate `client_id`/`client_secret` for agent | Medium |
| 4.3 | Spending limit enforcement | WSIM validates every agent request against limits | Large |
| 4.4 | Permission management UI | Users can view/revoke agent permissions in mwsim | Large |
| 4.5 | Audit logging | Track all agent-initiated payments | Medium |

**Future Architecture**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AGENT AUTONOMOUS PAYMENT                             │
│                                                                              │
│  1. Agent calls WSIM with its credentials:                                  │
│     POST /api/agent/v1/payments                                             │
│     Authorization: Basic base64(client_id:client_secret)                    │
│     { "amount": 15.99, "merchant": "...", "user_id": "..." }               │
│                                                                              │
│  2. WSIM validates:                                                         │
│     - Agent has permission for this user                                    │
│     - Amount within per-transaction limit                                   │
│     - Daily/monthly totals not exceeded                                     │
│     - Merchant category allowed (if restricted)                             │
│                                                                              │
│  3. If valid, WSIM processes payment                                        │
│     - No user interaction required                                          │
│     - User gets notification: "AI spent $15.99 at Grocery Store"           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Timeline

```
Week 1-2: Phase 1 (WSIM OAuth Foundation)
├── WSIM adds /.well-known/oauth-protected-resource
├── WSIM verifies OAuth server metadata
├── WSIM registers ChatGPT client
└── WSIM verifies token claims

Week 3-4: Phase 2 (Agents/MCP Integration)
├── Agents add _meta["mcp/www_authenticate"] response
├── Agents accept Bearer tokens
├── Agents validate tokens with WSIM
└── Agents integrate OAuth into checkout flow

Week 5: Phase 3 (Testing)
├── End-to-end testing in ChatGPT
├── Passkey auth testing
├── Fallback testing
└── Documentation

Future: Phase 4 (Agent Permissions)
├── Design permission model
├── Implement credential issuance
├── Build enforcement layer
└── Add management UI
```

---

## Dependencies & Blockers

### External Dependencies

| Dependency | Owner | Status | Notes |
|------------|-------|--------|-------|
| ChatGPT MCP OAuth support | OpenAI | ✅ Confirmed | Uses `_meta["mcp/www_authenticate"]` |
| ChatGPT redirect URIs | OpenAI | ⚠️ Need to confirm | Pattern: `https://chatgpt.com/aip/*/oauth/callback` |

### Internal Dependencies

| Dependency | Owner | Status | Notes |
|------------|-------|--------|-------|
| WSIM OAuth infrastructure | WSIM | ✅ Deployed | Used by ChatGPT Connectors |
| Passkey auth on authorize page | WSIM | ✅ Exists | Works today |
| JWKS endpoint | WSIM | ✅ Deployed | `/.well-known/jwks.json` - v1.2.18 |
| RS256 token signing | WSIM | ✅ Deployed | Tokens verifiable via JWKS |
| `chatgpt-mcp` client | WSIM | ✅ Deployed | Public client with PKCE |

### Potential Blockers

1. **ChatGPT redirect URI format**: We need to confirm exact URI patterns OpenAI uses
2. **Token validation performance**: If Gateway calls WSIM for every request, latency may be an issue → prefer JWT validation
3. **Scope design**: Need to finalize what `purchase` scope actually allows

---

## Questions for Other Teams

### For Agents Team

1. **How does the MCP server currently handle auth?** Does it have a session concept, or is it stateless?

   > **Agents Team Response (2026-01-30)**: The MCP server is **stateless**. Each tool call is independent. We maintain SSE sessions for the transport layer, but no auth state is stored server-side. This aligns perfectly with the ChatGPT-hosted OAuth pattern - we'll validate the Bearer token on every request.

2. **Where should token validation happen?** Options:
   - Call WSIM introspection endpoint (adds latency)
   - Verify JWT locally (needs WSIM public key)
   - Cache validation results (balance of both)

   > **Agents Team Response (2026-01-30)**: We recommend **JWT verification locally** with WSIM's public key. This avoids an extra network call per request. We can fetch the JWKS from `/.well-known/jwks.json` at startup and cache it. For token revocation scenarios, we could add short-lived tokens (15 min) so revocation is eventually consistent.

3. **What's the current checkout flow?** Need to understand where OAuth challenge fits in.

   > **Agents Team Response (2026-01-30)**: Current flow in `mcp-apps-server.ts`:
   >
   > ```
   > checkout tool called
   >   → Create session (SSIM)
   >   → Update buyer info (SSIM)
   >   → Initiate device auth (WSIM) ← Returns QR code + device_code
   >   → Return widget with QR code
   > ```
   >
   > With OAuth, the flow becomes:
   >
   > ```
   > checkout tool called
   >   → Check for Bearer token
   >   → If no token: return _meta["mcp/www_authenticate"] ← ChatGPT handles OAuth
   >   → If valid token: extract user_id, skip device auth, process payment directly
   > ```
   >
   > The widget/QR flow remains as **fallback** when OAuth isn't available or fails.

### For OpenAI (if we can ask)

1. **Exact redirect URI pattern**: What URI(s) should we register for the ChatGPT OAuth client?

2. **Token refresh handling**: Does ChatGPT automatically refresh tokens, or do we need long-lived access tokens?

3. **Scope parameter**: Does ChatGPT pass requested scopes to the authorization endpoint?

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ChatGPT OAuth doesn't work as expected | Low | High | Early testing in Phase 1; fallback to QR code |
| Passkeys fail in OAuth redirect | Low | High | Password fallback always available |
| Token validation latency | Medium | Medium | Use JWT verification, not introspection |
| User confusion about OAuth flow | Medium | Low | Clear consent UI; messaging in chat |

---

## Success Metrics

### Phase 1-3 (Payment Authorization)

- **Conversion rate**: % of payment attempts that complete successfully
- **Auth method distribution**: Passkey vs password vs QR code fallback
- **Time to complete**: Seconds from "buy" intent to payment confirmation
- **Error rate**: % of OAuth flows that fail

### Phase 4 (Agent Permissions)

- **Opt-in rate**: % of users who grant standing permissions
- **Autonomous payment volume**: # of payments without user interaction
- **Limit utilization**: How close to limits agents typically operate
- **Revocation rate**: % of users who revoke agent permissions

---

## Appendix: Existing Infrastructure

### WSIM OAuth Endpoints

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /api/agent/v1/oauth/authorize` | ✅ | Consent page with passkey auth |
| `POST /api/agent/v1/oauth/token` | ✅ | Token exchange (PKCE supported) |
| `GET /.well-known/oauth-authorization-server` | ✅ | Server metadata (includes `jwks_uri`) |
| `GET /.well-known/oauth-protected-resource` | ✅ **NEW** | Protected resource metadata (RFC 9728) |
| `GET /.well-known/jwks.json` | ✅ **NEW** | RSA public keys for JWT verification (RFC 7517) |
| `POST /api/agent/v1/oauth/introspect` | ✅ | Token introspection (optional - prefer JWKS) |

### WSIM Agent Infrastructure (Already Exists)

| Component | Status | Notes |
|-----------|--------|-------|
| Agent registration | ✅ | `AgentClient` model in Prisma |
| Agent credentials | ✅ | `client_id`/`client_secret` generation |
| Spending limits | ✅ | Per-transaction, daily, monthly |
| Access requests | ✅ | `/api/mobile/access-requests/*` |
| Step-up approval | ✅ | `/api/mobile/step-up/*` |

### Parallel Auth Flows (Continue to Work)

| Flow | Status | Use Case |
|------|--------|----------|
| Push notification | ✅ | Mobile users with mwsim |
| QR code / Device Auth | ✅ | Cross-device, CLI, IoT |
| ChatGPT OAuth (NEW) | 🆕 | Desktop browser in ChatGPT |

---

## Sign-Off

| Team | Reviewer | Status | Date | Notes |
|------|----------|--------|------|-------|
| **WSIM** | | ✅ Phase 1 Complete | 2026-01-31 | v1.2.18 deployed; JWKS, RS256 tokens, chatgpt-mcp client |
| **Agents/MCP** | Claude (AI) | ✅ Phase 2 Complete | 2026-01-31 | v1.5.24 deployed; JWT validation, OAuth challenge, device auth fallback |
| **mwsim** | | ⬜ Pending | | Fallback flows continue to work |

---

## Agents Team Implementation Notes

### What We're Keeping (Unchanged)

The existing authorization flows remain **fully functional**:

- **Push notification**: When `buyer_email` is provided, WSIM sends push to mwsim
- **QR code**: Widget displays QR code for scanning with mwsim
- **Device code**: Manual entry for CLI/IoT scenarios
- **Polling**: Widget polls `device_authorize_status` for approval

### What We're Adding

A new code path when Bearer token is present:

```typescript
// Pseudo-code for Phase 2 implementation
case 'checkout': {
  const bearerToken = extractBearerToken(request);

  if (bearerToken) {
    // NEW: OAuth path - user already authenticated via ChatGPT
    const tokenInfo = validateJWT(bearerToken, wsimPublicKey);
    if (tokenInfo.valid) {
      // Skip device auth entirely - process payment directly
      return processAuthenticatedPayment(args, tokenInfo.sub);
    }
  }

  // EXISTING: No token or invalid token
  // Check if this is a ChatGPT MCP request
  if (isChatGPTRequest(request)) {
    // Return auth challenge for ChatGPT to handle
    return {
      content: [{ type: 'text', text: 'Please authorize to complete this payment.' }],
      _meta: { 'mcp/www_authenticate': { resource: 'https://wsim.banksim.ca', scope: 'purchase' } }
    };
  }

  // EXISTING: Non-ChatGPT request - use device auth with QR/push
  return initiateDeviceAuth(args);
}
```

### Dependencies on WSIM ✅ ALL RESOLVED

All WSIM dependencies are now deployed (v1.2.18):

1. **JWKS endpoint**: ✅ `https://wsim.banksim.ca/.well-known/jwks.json`
2. **Token claims**: ✅ RS256 tokens include `sub`, `scope`, `aud`, `exp`, `iss`, `iat`
3. **Scope semantics**: ✅ `purchase` scope allows multiple payments within token lifetime (1 hour)

### Questions for WSIM

1. **User ID format**: What's in the `sub` claim? UUID? Email? Account number?

   > **WSIM Response (2026-01-30)**: The `sub` claim contains the **WalletUser ID** - a CUID like `clm1abc123def456ghi789`. This is the primary key in our `WalletUser` table. We don't use email (PII concerns) or account numbers (we don't have them). The Agents team can use this ID to identify the user for payment processing.

2. **Token audience**: Should we validate `aud` claim? What value?

   > **WSIM Response (2026-01-30)**: **Yes, validate the `aud` claim.** The value will be the registered OAuth client_id - for ChatGPT this will be `chatgpt-mcp`. This prevents tokens issued to one client from being used by another. WSIM will include `aud` in all tokens.

3. **Payment processing**: Once we have user ID from token, do we call existing WSIM payment API? Or is there a new "authenticated payment" endpoint?

   > **WSIM Response (2026-01-30)**: For Phase 1, we recommend this approach:
   >
   > **Option A (Simpler)**: Gateway skips WSIM entirely for the auth step
   > - Token provides user identity (`sub` = WalletUser ID)
   > - Gateway validates token locally via JWKS
   > - Gateway processes payment directly with SSIM
   > - No WSIM call needed during checkout (token is proof of auth)
   >
   > **Option B (If consent recording needed)**: Call WSIM to record consent
   > - `POST /api/oauth/consent` with Bearer token + payment details
   > - WSIM records user's consent for audit trail
   > - Returns confirmation, Gateway proceeds with SSIM
   >
   > **Recommendation**: Start with Option A. The OAuth consent screen already captures user intent. We can add explicit consent recording in Phase 4 when we add spending limits.

### WSIM Answers to Dependencies

1. **JWKS endpoint**: ✅ Will add `/.well-known/jwks.json` in Phase 1
   - Contains RSA public keys for JWT verification
   - Standard JWKS format per RFC 7517
   - Agents should cache and refresh periodically (every 24h or on signature failure)

2. **Token claims**: ✅ Confirmed. Tokens will include:
   | Claim | Value | Example |
   |-------|-------|---------|
   | `sub` | WalletUser ID | `clm1abc123def456` |
   | `scope` | Granted scopes | `purchase` |
   | `aud` | Client ID | `chatgpt-mcp` |
   | `exp` | Expiration (Unix) | `1706648400` |
   | `iat` | Issued at (Unix) | `1706647500` |
   | `iss` | Issuer | `https://wsim.banksim.ca` |

3. **Scope semantics**:
   - `purchase` scope authorizes the user to make payments via this client
   - Token is valid for **multiple payments** within its lifetime (15 min default)
   - Each payment doesn't require re-authentication (unlike Device Auth flow)
   - For Phase 4 (spending limits), we'll add limit checks on each payment

### Agents Team Confirmation (2026-01-30)

✅ **We're aligned with Option A** - the simpler approach:

1. **Token validation**: We'll fetch JWKS from `/.well-known/jwks.json` at startup, cache it, and validate JWTs locally
2. **Claims validation**: We'll verify `iss`, `aud`, `exp`, and extract `sub` for user identity
3. **Payment flow**: Valid token → extract `sub` (WalletUser ID) → process with SSIM directly
4. **No WSIM call**: Token is proof of authentication; OAuth consent screen captures user intent

**✅ Phase 2 Implementation Complete** - Agents v1.5.24 deployed with full OAuth support. Ready for Phase 3 testing with ChatGPT.

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-30 | 1.0 | Initial project plan |
| 2026-01-30 | 1.1 | Added Agents team responses and sign-off |
| 2026-01-30 | 1.2 | WSIM answers to Agents questions: `sub` = WalletUser ID, validate `aud`, added JWKS requirement |
| 2026-01-30 | 1.3 | Agents team confirmed alignment with Option A (local JWT validation, direct SSIM payment) |
| 2026-01-31 | 1.4 | **Phase 1 Complete**: WSIM v1.2.18 deployed with JWKS, oauth-protected-resource, RS256 tokens, chatgpt-mcp client |
| 2026-01-31 | 1.5 | Added detailed Phase 2 implementation guide for Agents team (JWT validation code, flow diagrams) |
| 2026-01-31 | 1.6 | **Phase 2 Complete**: Agents v1.5.24 deployed with JWT validation, Bearer token support, OAuth challenge + device auth fallback |
