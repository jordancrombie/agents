# User-Agent Credential Flow & Message Center Proposal

**Author**: mwsim Team
**Date**: 2026-01-21
**Status**: Draft - Awaiting Team Review
**Affects**: WSIM, mwsim, (SSIM for QR flow reference)

---

## Executive Summary

This proposal introduces two design changes to the SACP implementation:

1. **Agent-Initiated Credential Flow** - Instead of displaying credentials in the mobile UI for users to copy, agents request access and receive credentials directly through an approval flow.

2. **Message Center** - A centralized notification hub in mwsim for all actionable items (step-ups, agent requests, contracts, transfers).

These changes improve security, user experience, and architectural consistency across the platform.

---

## Part 1: Agent-Initiated Credential Flow

### Problem with Current Design

The WSIM requirements doc specifies that after agent registration, credentials are displayed in the UI:

```
Step 5: Credentials
┌────────────────────────────────────┐
│  Agent Created! 🎉                 │
│                                    │
│  Copy these credentials to your    │
│  AI agent configuration:           │
│                                    │
│  Client ID:                        │
│  ┌────────────────────────────┐   │
│  │ agent_abc123def456         │ 📋│
│  └────────────────────────────┘   │
│                                    │
│  Client Secret:                    │
│  ┌────────────────────────────┐   │
│  │ ••••••••••••••••••••••••• │ 👁️│
│  └────────────────────────────┘   │
│  ⚠️ This won't be shown again!    │
└────────────────────────────────────┘
```

**Issues**:
1. **Security** - Secret is visible on screen, could be photographed/shoulder-surfed
2. **UX Friction** - User must manually copy credentials to their AI agent
3. **Error Prone** - Copy/paste mistakes, partial copies, lost credentials
4. **No Audit Trail** - Can't track which agent instance received credentials

### Proposed Solution: Agent-Initiated Flow

Flip the model: Instead of user copying credentials TO the agent, the agent REQUESTS credentials FROM the user.

#### Flow Option A: Push Notification Approval

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    AI Agent     │     │      WSIM       │     │     mwsim       │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ 1. POST /agent/v1/access-request              │
         │    { user_email, agent_name, permissions }    │
         │ ──────────────────►  │                       │
         │                       │                       │
         │ 2. Returns request_id │                       │
         │ ◄────────────────────│                       │
         │                       │                       │
         │                       │ 3. Push notification  │
         │                       │    "Agent wants access"│
         │                       │ ─────────────────────►│
         │                       │                       │
         │                       │                       │ 4. User reviews
         │                       │                       │    & approves
         │                       │                       │
         │                       │ 5. POST /mobile/access-request/:id/approve
         │                       │ ◄─────────────────────│
         │                       │                       │
         │ 6. Poll or webhook    │                       │
         │    returns credentials│                       │
         │ ◄────────────────────│                       │
         │                       │                       │
```

**Agent receives**:
```json
{
  "status": "approved",
  "credentials": {
    "client_id": "agent_abc123def456",
    "client_secret": "sk_agent_xxxxxxxxxxxx",
    "token_endpoint": "https://wsim.banksim.ca/api/agent/v1/oauth/token"
  },
  "agent_id": "550e8400-e29b-41d4-a716-446655440000",
  "permissions": ["browse", "cart", "purchase"],
  "spending_limits": {
    "per_transaction": 50.00,
    "daily": 200.00,
    "monthly": 500.00,
    "currency": "CAD"
  }
}
```

#### Flow Option B: QR Code Scan (In-Person Setup)

For users setting up agents on their own devices:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    AI Agent     │     │      WSIM       │     │     mwsim       │
│   (on laptop)   │     │                 │     │   (on phone)    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ 1. POST /agent/v1/access-request              │
         │    { agent_name, permissions, delivery: "qr" }│
         │ ──────────────────►  │                       │
         │                       │                       │
         │ 2. Returns request_id + QR data              │
         │ ◄────────────────────│                       │
         │                       │                       │
         │ 3. Display QR code   │                       │
         │    ┌──────────┐      │                       │
         │    │ ▄▄▄▄▄▄▄▄ │      │                       │
         │    │ ▄▄▄▄▄▄▄▄ │      │                       │
         │    │ ▄▄▄▄▄▄▄▄ │      │                       │
         │    └──────────┘      │                       │
         │                       │                       │
         │                       │ 4. User scans QR     │
         │                       │ ◄─────────────────────│
         │                       │                       │
         │                       │ 5. Show approval UI  │
         │                       │ ─────────────────────►│
         │                       │                       │
         │                       │ 6. User approves     │
         │                       │ ◄─────────────────────│
         │                       │                       │
         │ 7. Credentials delivered                      │
         │    (poll or websocket)│                       │
         │ ◄────────────────────│                       │
```

This is similar to the existing SSIM payment QR flow.

#### Flow Option C: OAuth Web Flow

Standard OAuth authorization code flow:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    AI Agent     │     │   WSIM (Web)    │     │     mwsim       │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ 1. Redirect user to   │                       │
         │    /oauth/authorize?  │                       │
         │    client_id=...&     │                       │
         │    scope=agent:setup  │                       │
         │ ──────────────────►  │                       │
         │                       │                       │
         │                       │ 2. User logs in      │
         │                       │    (web or deep link │
         │                       │     to mwsim)        │
         │                       │                       │
         │                       │ 3. Approve agent     │
         │                       │    permissions/limits│
         │                       │                       │
         │ 4. Redirect back with │                       │
         │    authorization_code │                       │
         │ ◄────────────────────│                       │
         │                       │                       │
         │ 5. Exchange code for  │                       │
         │    credentials        │                       │
         │ ──────────────────►  │                       │
         │                       │                       │
         │ 6. client_id + secret │                       │
         │ ◄────────────────────│                       │
```

### Recommendation

Support all three flows, with **Push Notification (Option A)** as primary:

| Flow | Use Case | Priority |
|------|----------|----------|
| Push Notification | Remote agent setup, most common | P0 |
| QR Code Scan | In-person setup, demo scenarios | P1 |
| OAuth Web | Desktop-first users, enterprise | P2 |

### User Approval Screen (mwsim)

```
┌────────────────────────────────────┐
│  Agent Access Request              │
│                                    │
│  ┌────────────────────────────┐   │
│  │  🤖 "Claude Shopping"       │   │
│  │                            │   │
│  │  wants to connect to your  │   │
│  │  wallet                    │   │
│  └────────────────────────────┘   │
│                                    │
│  REQUESTED PERMISSIONS             │
│  ───────────────────────────────  │
│  ☑️ Browse products at stores     │
│  ☑️ Create shopping carts         │
│  ☑️ Complete purchases            │
│  ☐ View order history             │
│                                    │
│  SPENDING LIMITS                   │
│  ───────────────────────────────  │
│  Per transaction: $50.00 CAD      │
│  Daily limit: $200.00 CAD         │
│  Monthly limit: $500.00 CAD       │
│                                    │
│  ⚠️ You can modify these limits   │
│     before approving              │
│                                    │
│  ⏱️ Request expires in 14:32      │
│                                    │
│  ┌─────────┐  ┌──────────────┐   │
│  │ Reject  │  │   Approve    │   │
│  └─────────┘  └──────────────┘   │
│               (requires Face ID)  │
└────────────────────────────────────┘
```

**Key UX Features**:
- User can **modify** limits before approving
- Biometric required to approve
- Expiration countdown (15 min default)
- Clear permission display

### Benefits

| Aspect | Current (Copy) | Proposed (Agent-Initiated) |
|--------|---------------|---------------------------|
| Security | Secret visible on screen | Never displayed |
| UX | Manual copy/paste | One-tap approval |
| Errors | Copy mistakes possible | Credentials delivered directly |
| Audit | No delivery tracking | Full audit trail |
| Revocation | Must rotate if compromised | Clear agent identity |

---

## Part 2: Message Center

### Problem

Currently, mwsim handles notifications in isolation:
- Transfer notifications go to transfer history
- Contract notifications go to contracts
- Agent step-ups would need a new home
- No unified view of "things needing attention"

### Proposed Solution

A **Message Center** tab/screen that aggregates all actionable notifications:

```
┌────────────────────────────────────┐
│  Message Center              ← ⚙️  │
│                                    │
│  NEEDS YOUR ATTENTION (3)          │
│  ───────────────────────────────  │
│                                    │
│  ┌────────────────────────────┐   │
│  │ 🔔 Purchase approval        │   │
│  │ My Shopping Assistant       │   │
│  │ $156.48 at Regal Moose     │   │
│  │ ⏱️ 12 min remaining         │   │
│  │              [View] [Quick ✓]  │
│  └────────────────────────────┘   │
│                                    │
│  ┌────────────────────────────┐   │
│  │ 🤖 Agent access request     │   │
│  │ "Claude Shopping" wants     │   │
│  │ wallet access               │   │
│  │ ⏱️ 8 min remaining          │   │
│  │              [View] [Quick ✓]  │
│  └────────────────────────────┘   │
│                                    │
│  ┌────────────────────────────┐   │
│  │ 📄 Contract ready           │   │
│  │ "Hockey Bet" with @mike     │   │
│  │ Ready to fund: $20.00       │   │
│  │              [View] [Fund]    │
│  └────────────────────────────┘   │
│                                    │
│  TODAY                             │
│  ───────────────────────────────  │
│                                    │
│  ┌────────────────────────────┐   │
│  │ ✅ Purchase approved        │   │
│  │ Coffee subscription         │   │
│  │ $24.99 • Auto-approved      │   │
│  │ 2 hours ago                 │   │
│  └────────────────────────────┘   │
│                                    │
│  ┌────────────────────────────┐   │
│  │ 💸 Transfer received        │   │
│  │ $50.00 from @sarah          │   │
│  │ 3 hours ago                 │   │
│  └────────────────────────────┘   │
│                                    │
│  YESTERDAY                         │
│  ───────────────────────────────  │
│  ...                               │
└────────────────────────────────────┘
```

### Message Types

| Type | Icon | Actionable | Source |
|------|------|------------|--------|
| `agent.step_up` | 🔔 | Yes - Approve/Reject | WSIM |
| `agent.access_request` | 🤖 | Yes - Approve/Reject | WSIM |
| `agent.transaction` | 💳 | No | WSIM |
| `agent.limit_warning` | ⚠️ | No | WSIM |
| `agent.suspended` | 🚫 | Yes - Review | WSIM |
| `contract.funding_ready` | 📄 | Yes - Fund | ContractSim |
| `contract.accepted` | 📄 | Yes - Fund | ContractSim |
| `contract.resolved` | 🏆 | No | ContractSim |
| `transfer.received` | 💸 | No | TransferSim |
| `transfer.failed` | ❌ | Yes - Retry? | TransferSim |

### Architecture Options

#### Option A: WSIM Aggregated API

WSIM provides a unified `/api/mobile/messages` endpoint that aggregates from all services:

```typescript
GET /api/mobile/messages?status=pending&limit=20

{
  "messages": [
    {
      "id": "msg_123",
      "type": "agent.step_up",
      "title": "Purchase approval needed",
      "body": "My Shopping Assistant wants to spend $156.48",
      "data": { "step_up_id": "stepup_xyz" },
      "status": "pending",
      "expires_at": "2026-01-21T15:15:00Z",
      "created_at": "2026-01-21T15:00:00Z"
    },
    // ...
  ],
  "unread_count": 3
}
```

**Pros**: Single API call, consistent format, server-side filtering
**Cons**: WSIM becomes aggregation point, needs webhooks from ContractSim/TransferSim

#### Option B: Client-Side Aggregation

mwsim fetches from multiple endpoints and merges:

```typescript
const [stepUps, accessRequests, contracts, transfers] = await Promise.all([
  api.get('/api/mobile/step-up/pending'),
  api.get('/api/mobile/access-requests/pending'),
  api.get('/api/mobile/contracts?status=funding'),
  api.get('/api/mobile/transfers/recent'),
]);
```

**Pros**: No new WSIM work, each service owns its data
**Cons**: Multiple API calls, client complexity, inconsistent formats

#### Recommendation

**Option A (WSIM Aggregated)** for better UX and consistency. WSIM already receives webhooks from other services and can maintain a unified message store.

### Badge & Notifications

- **Tab Bar Badge**: Show count of pending actionable items
- **Home Screen**: Optional "X items need attention" banner
- **Push Notifications**: Continue to deliver, tapping opens Message Center

---

## Required API Changes

### New WSIM Endpoints

```yaml
# Agent Access Request Flow
POST /api/agent/v1/access-request
  # Agent requests access (returns request_id)

GET /api/agent/v1/access-request/{id}
  # Agent polls for approval status

GET /api/agent/v1/access-request/{id}/qr
  # Get QR code data for display

# Mobile Approval
GET /api/mobile/access-requests/pending
  # List pending access requests

GET /api/mobile/access-requests/{id}
  # Get access request details

POST /api/mobile/access-requests/{id}/approve
  # Approve with optional limit modifications

POST /api/mobile/access-requests/{id}/reject
  # Reject request

# Message Center
GET /api/mobile/messages
  # List all messages (with filters)

PATCH /api/mobile/messages/{id}
  # Mark as read/dismissed

GET /api/mobile/messages/unread-count
  # Quick badge count check
```

### New Notification Types

```typescript
// Push notification payloads

interface AccessRequestNotification {
  type: 'agent.access_request';
  request_id: string;
  agent_name: string;
  requested_permissions: string[];
  requested_limits: SpendingLimits;
  expires_at: string;
}
```

---

## Migration Path

### Phase 1: Parallel Support
- Implement agent-initiated flow alongside existing registration
- Users can still create agents in-app (old flow) OR approve agent requests (new flow)
- Message Center shows both step-ups and access requests

### Phase 2: Deprecate In-App Creation
- Remove credential display from in-app registration
- All agents must request access
- Credential rotation also uses request flow

---

## Open Questions

1. **Request Expiration**: Same 15 minutes as step-up, or longer for agent setup?
2. **Limit Modification**: Should user be able to INCREASE limits beyond what agent requested?
3. **Multiple Agents**: Can same agent name be registered multiple times (different instances)?
4. **Message Retention**: How long to keep historical messages?

---

## Team Impact

| Team | Work Required | Priority |
|------|--------------|----------|
| **WSIM** | Access request endpoints, message aggregation API | P0 |
| **mwsim** | Access request approval UI, message center | P0 |
| **SSIM** | None (QR flow reference only) | - |
| **Agents (AI)** | Implement access request flow in agent SDK | P1 |

---

## Next Steps

1. [ ] Teams review this proposal
2. [ ] Resolve open questions
3. [ ] WSIM adds access request endpoints to OpenAPI spec
4. [ ] mwsim begins Message Center implementation
5. [ ] Integration testing with sample agent

---

## Appendix: Comparison with Industry

| Platform | Agent Credential Flow |
|----------|----------------------|
| **Stripe Connect** | OAuth redirect flow |
| **Plaid** | OAuth + Link SDK |
| **Google Assistant** | Account linking via OAuth |
| **Alexa Skills** | Account linking via OAuth |
| **Proposed SACP** | Push approval + QR + OAuth (all three) |

Our approach is more flexible than industry standard (OAuth only) while being more secure than credential display.

---

## WSIM Team Review

**Reviewer**: WSIM Team
**Date**: 2026-01-21
**Status**: ✅ AGREEMENT

### Overall Assessment

WSIM supports both proposals (Agent-Initiated Flow and Message Center) with modifications. The security improvements over credential display are compelling, and the Message Center provides a better UX than scattered notifications.

### Questions & Concerns

#### Q1: User Identification (Critical)

The proposal shows `user_email` in the access request:
```json
POST /api/agent/v1/access-request
{ "user_email": "user@example.com", ... }
```

**Concern**: If agents can request access by email, this creates:
- **Email harvesting risk** - Agents could enumerate valid emails by observing response patterns
- **Spam/harassment vector** - Bad actors could flood users with access requests
- **Privacy leak** - Agents learn which emails have wallet accounts

**WSIM Recommendation**: Use a **user-generated pairing code** instead:
1. User opens mwsim → Settings → "Add Agent" → "Generate Pairing Code"
2. mwsim shows: `WSIM-ABC123-XYZ789` (expires in 24h)
3. User gives code to their agent
4. Agent calls `POST /api/agent/v1/access-request { pairing_code: "WSIM-ABC123-XYZ789", ... }`
5. WSIM resolves code to user, sends push notification

This keeps user identity private until they explicitly share a code.

**Alternative**: QR-only flow (Option B) for Phase 1, email-based for Phase 2 with rate limiting.

#### Q2: Request Expiration

**Document proposes**: 15 minutes (same as step-up)

**WSIM Concern**: Agent setup is not time-critical like a checkout. User might:
- Be away from phone
- Need time to review permissions
- Want to discuss with family/partner

**WSIM Recommendation**:
- **Access requests**: 24-48 hours expiration
- **Step-up requests**: Keep 15 minutes (time-critical)

#### Q3: Limit Modification Direction

**Document asks**: "Should user be able to INCREASE limits beyond what agent requested?"

**WSIM Recommendation**: **No** - User should only be able to:
- **Decrease** limits below agent's request
- **Reject** specific permissions

Rationale: Agent requests what it needs. User granting MORE than requested suggests social engineering. The agent should re-request if it needs higher limits.

#### Q4: Multiple Agent Instances

**Document asks**: "Can same agent name be registered multiple times?"

**WSIM Response**: Yes, this is supported. Each registration creates a unique:
- `agent_id` (UUID)
- `client_id` (`agent_{nanoid}`)
- `client_secret`

Same user can have multiple "Claude Shopping" agents (e.g., work laptop, home laptop). They appear as separate entries in the agent list.

#### Q5: Message Center Architecture

**Document recommends**: Option A (WSIM Aggregated API)

**WSIM Concern**: This makes WSIM the aggregation point for ContractSim and TransferSim messages. We currently:
- Receive webhooks FROM these services
- Do NOT store/aggregate their messages

**WSIM Recommendation**:
- **Phase 1**: Option B (client-side aggregation) - mwsim fetches from multiple endpoints
- **Phase 2**: Evaluate Option A based on performance/complexity learnings

This defers the aggregation work and lets each service own its message format.

#### Q6: Message Retention

**Document asks**: "How long to keep historical messages?"

**WSIM Recommendation**:
- **Actionable messages** (pending step-ups, access requests): Until resolved or expired
- **Informational messages** (transaction completed): 30 days in database, indefinite in archive
- **User can dismiss** messages from the UI, which soft-deletes them

#### Q7: New Notification Type

The proposal adds `agent.access_request` notification type.

**WSIM Confirms**: We will add this to our notification service:
```typescript
type NotificationType =
  // ... existing types
  | 'agent.access_request'  // New: Agent requesting wallet access
```

### Required API Changes (WSIM)

Based on the proposal, WSIM commits to implementing:

| Endpoint | Priority | Notes |
|----------|----------|-------|
| `POST /api/agent/v1/access-request` | P0 | With pairing code (not email) |
| `GET /api/agent/v1/access-request/{id}` | P0 | Agent polling |
| `GET /api/mobile/access-requests/pending` | P0 | Mobile list |
| `GET /api/mobile/access-requests/{id}` | P0 | Mobile details |
| `POST /api/mobile/access-requests/{id}/approve` | P0 | With limit modification |
| `POST /api/mobile/access-requests/{id}/reject` | P0 | |
| `POST /api/mobile/pairing-codes` | P0 | Generate pairing code |
| `GET /api/agent/v1/access-request/{id}/qr` | P1 | QR flow |
| `GET /api/mobile/messages` | P2 | Deferred to Phase 2 |
| `PATCH /api/mobile/messages/{id}` | P2 | Deferred to Phase 2 |

### OpenAPI Spec Update

Upon acceptance of these modifications, WSIM will update `docs/sacp/openapi-agent.yaml` to include:
- Access request endpoints (agent-facing)
- Access request approval endpoints (mobile-facing)
- Pairing code endpoint
- New notification schemas

### Conditional Sign-Off

WSIM agrees to implement the Agent-Initiated Credential Flow with the following conditions:

1. **User identification via pairing code** (not email) for Phase 1
2. **24-hour expiration** for access requests (not 15 minutes)
3. **Limit modification restricted to decreases only**
4. **Message Center deferred to Phase 2** (use client-side aggregation for Phase 1)

If these conditions are accepted, WSIM will:
1. Update our OpenAPI spec with new access-request endpoints
2. Add `AccessRequest` and `PairingCode` models to Prisma schema
3. Implement pairing code generation and validation
4. Target completion: 1-2 weeks after agreement

---

**Sign-Off Statement**:

```
I, on behalf of the WSIM team, have reviewed the User-Agent Credential Flow
& Message Center Proposal dated 2026-01-21.

All WSIM conditions have been accepted by mwsim team:
✅ Pairing codes for Phase 1 (alias-based deferred to Phase 2)
✅ 24-hour expiration for access requests
✅ Limit modification restricted to decreases only
✅ Client-side Message Center aggregation for Phase 1

WSIM commits to:
1. Update OpenAPI spec with access-request endpoints
2. Add AccessRequest and PairingCode models to Prisma schema
3. Implement pairing code generation and validation
4. Add agent.access_request notification type

Team: WSIM
Date: 2026-01-21
Status: ✅ AGREEMENT
```

---

## mwsim Team Response

**Reviewer**: mwsim Team
**Date**: 2026-01-21
**Status**: Agreement with Discussion on Q1

### Response to WSIM Modifications

mwsim accepts WSIM's modifications with the following notes:

| # | WSIM Modification | mwsim Response |
|---|-------------------|----------------|
| Q1 | Pairing codes (not email) | **Partial agree** - See discussion below |
| Q2 | 24-hour expiration | **Agree** |
| Q3 | Decrease limits only | **Agree** |
| Q4 | Multiple agents supported | **Acknowledged** |
| Q5 | Client-side aggregation Phase 1 | **Agree** |
| Q6 | 30-day retention | **Agree** |
| Q7 | New notification type | **Acknowledged** |

### Discussion: Q1 - User Identification

mwsim agrees that email-based identification has security concerns. However, we want to ensure the final solution supports **push-to-authenticate**, not just pairing codes.

**Why push-to-authenticate matters:**
1. We already have push notification infrastructure
2. Better UX for users who are already in their agent environment
3. Pairing codes add friction (copy/paste, expiration management)
4. Industry trend toward "passwordless" / push-based auth

**Proposed hybrid approach:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                     USER IDENTIFICATION OPTIONS                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Option A: Pairing Code (User-Initiated)                            │
│  ─────────────────────────────────────────                          │
│  1. User generates code in mwsim                                    │
│  2. User gives code to agent                                        │
│  3. Agent submits code → Push notification → Approve                │
│                                                                      │
│  Option B: User Alias (Agent-Initiated)                             │
│  ─────────────────────────────────────────                          │
│  1. Agent requests by @alias (already public for transfers)         │
│  2. WSIM sends push notification to user                            │
│  3. User approves in mwsim                                          │
│                                                                      │
│  Option C: QR Code (In-Person)                                      │
│  ─────────────────────────────────────────                          │
│  1. Agent displays QR                                               │
│  2. User scans with mwsim                                           │
│  3. User approves in mwsim                                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Re: Option B (User Alias)**

User aliases (e.g., `@jordan`) are already semi-public - they're used for P2P transfers and visible to counterparties. Using alias for agent requests:

- **Pros**: No new identifier to manage, natural extension of existing system
- **Cons**: Enumeration risk (but already exists for transfers)

**Mitigation for alias-based requests:**
1. **Rate limiting**: Max 3 agent requests per alias per hour
2. **User controls**: "Allow agent requests" toggle in settings (default: ON)
3. **Notification-only**: Request doesn't confirm alias exists until user acts
4. **Blocklist**: Users can block specific agent sources

**mwsim Recommendation:**

| Phase | Primary Flow | Fallback |
|-------|--------------|----------|
| Phase 1 | Pairing code | QR code |
| Phase 2 | Add alias-based with rate limiting | Pairing code |

We can START with pairing codes as WSIM suggests, but the architecture should support alias-based push authentication in Phase 2.

### Implementation Impact

With the agreed modifications, mwsim's implementation plan updates:

**New screen needed**: "Generate Pairing Code"
```
Settings > AI Agents > [+] Add Agent > Generate Pairing Code
```

**Updated flow**:
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     mwsim       │     │      WSIM       │     │    AI Agent     │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ 1. Generate code      │                       │
         │ ─────────────────────►│                       │
         │                       │                       │
         │ 2. WSIM-ABC123-XYZ789 │                       │
         │ ◄─────────────────────│                       │
         │                       │                       │
         │ 3. User gives code    │                       │
         │   to agent            │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─►│
         │                       │                       │
         │                       │ 4. POST /access-request
         │                       │    { pairing_code }   │
         │                       │ ◄─────────────────────│
         │                       │                       │
         │ 5. Push notification  │                       │
         │ ◄─────────────────────│                       │
         │                       │                       │
         │ 6. User reviews &     │                       │
         │    approves           │                       │
         │ ─────────────────────►│                       │
         │                       │                       │
         │                       │ 7. Credentials        │
         │                       │ ─────────────────────►│
```

### Sign-Off

```
mwsim team accepts WSIM's modifications:
- Pairing codes for Phase 1 (with alias-based push in Phase 2 roadmap)
- 24-hour expiration for access requests
- Limit modification restricted to decreases
- Client-side Message Center aggregation for Phase 1

Team: mwsim
Date: 2026-01-21
Status: AGREEMENT
```

---

## Architectural Clarification: Binding vs Authorization

**Important distinction** raised during review:

### 1. Initial Binding (One-Time Setup)

How the agent first connects to a user's wallet and receives credentials.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      INITIAL BINDING OPTIONS                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Phase 1:                                                           │
│  ┌──────────────────┐  ┌──────────────────┐                        │
│  │  Pairing Code    │  │    QR Scan       │                        │
│  │  User generates  │  │  Agent displays  │                        │
│  │  code, gives to  │  │  QR, user scans  │                        │
│  │  agent           │  │  with mwsim      │                        │
│  └──────────────────┘  └──────────────────┘                        │
│                                                                      │
│  Phase 2 (Future):                                                  │
│  ┌──────────────────┐                                              │
│  │  Alias-based     │                                              │
│  │  Agent requests  │                                              │
│  │  by @alias       │                                              │
│  └──────────────────┘                                              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Result**: Agent receives `client_id` + `client_secret` for OAuth token requests.

### 2. Follow-on Authorization (Ongoing)

After initial binding, how the agent requests approvals for actions (step-ups, limit increases, etc.)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FOLLOW-ON AUTHORIZATION                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  All Phases:                                                        │
│  ┌──────────────────┐  ┌──────────────────┐                        │
│  │ Push Notification│  │  Message Center  │                        │
│  │ (Mobile)         │  │  (Web Wallet)    │                        │
│  │                  │  │                  │                        │
│  │ • Step-up        │  │ • Step-up        │                        │
│  │ • Limit warning  │  │ • Limit warning  │                        │
│  │ • Transactions   │  │ • Transactions   │                        │
│  └──────────────────┘  └──────────────────┘                        │
│                                                                      │
│  Agent already has credentials - just needs approval for actions    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Summary

| Concern | Method | When |
|---------|--------|------|
| **Who is this agent connecting to?** | Pairing code, QR, (future: alias) | Initial binding only |
| **Can this agent do X?** | Push notification, Message Center | Every step-up/authorization |

This separation means:
- Initial binding methods can evolve independently
- Authorization UX is consistent regardless of how agent was bound
- Web wallet users get Message Center, mobile users get push + Message Center

---

## Resolution Summary

| Question | Resolution | Owner |
|----------|------------|-------|
| Initial binding (Phase 1) | Pairing codes + QR scan | WSIM/mwsim |
| Initial binding (Phase 2) | Add alias-based | WSIM |
| Follow-on authorization | Push notification + Message Center | WSIM/mwsim |
| Request expiration | 24 hours for binding, 15 min for step-up | WSIM |
| Limit modification | Decrease only | WSIM/mwsim |
| Multiple agents | Supported, unique IDs per registration | WSIM |
| Message Center | Client-side aggregation Phase 1 | mwsim |
| Message retention | 30 days active, archive indefinite | WSIM |

**Status: APPROVED** - Both teams agree. WSIM to update OpenAPI spec, mwsim to begin implementation.

---

## Phase 1 Implementation Scope

### mwsim Deliverables

| Feature | Description | Priority |
|---------|-------------|----------|
| Generate Pairing Code | Settings > AI Agents > Add Agent | P0 |
| QR Scanner for Agent Binding | Scan agent-displayed QR | P0 |
| Access Request Approval | Review & approve agent binding | P0 |
| Agent List | View all connected agents | P0 |
| Agent Detail | View agent info, spending, activity | P1 |
| Step-Up Approval | Approve/reject purchase requests | P0 |
| Push Notification Handler | Handle agent notifications | P0 |
| Message Center (basic) | Client-side aggregation | P1 |

### WSIM Deliverables

| Feature | Description | Priority |
|---------|-------------|----------|
| Pairing Code Generation | `POST /api/mobile/pairing-codes` | P0 |
| Access Request Endpoints | Agent-facing + mobile-facing | P0 |
| Agent Management APIs | Already implemented | ✅ |
| Step-Up APIs | Already implemented | ✅ |
| Push Notifications | Add `agent.access_request` type | P0 |
