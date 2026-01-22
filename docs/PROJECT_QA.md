# SACP - Questions & Answers Log

This document tracks questions raised by teams during design review and implementation, along with responses and decisions.

---

## How to Use This Document

1. **Teams**: Add questions under your team's section
2. **Format**: Use the template below for each question
3. **Status**: Update status as questions are answered
4. **Decisions**: Document final decisions for future reference

### Question Template
```markdown
### Q[number]: [Brief question title]
**Asked by**: [Name/Team]
**Date**: YYYY-MM-DD
**Status**: Open | Under Discussion | Resolved

**Question**:
[Full question text]

**Context**:
[Why this matters, what depends on the answer]

**Discussion**:
- [Date] [Name]: [Comment]
- [Date] [Name]: [Comment]

**Resolution**:
[Final decision and rationale]
**Resolved by**: [Name] | **Date**: YYYY-MM-DD
```

---

## Open Questions Summary

| ID | Team | Question | Status | Priority |
|----|------|----------|--------|----------|
| Q1 | SSIM | Session expiration configurability | ✅ Resolved | Medium |
| Q2 | SSIM | Multiple shipping options | ✅ Resolved | Low |
| Q3 | SSIM | Promo code support for agents | ✅ Resolved | Low |
| Q4 | SSIM | Partial fulfillment handling | ✅ Resolved | Medium |
| Q5 | WSIM | Agent secret rotation | ✅ Resolved | Medium |
| Q6 | WSIM | Step-up expiration time | ✅ Resolved | High |
| Q7 | WSIM | Multiple payment methods per agent | ✅ Resolved | Medium |
| Q8 | WSIM | Daily limit timezone handling | ✅ Resolved | Medium |
| Q9 | WSIM | mwsim agent management | ✅ Resolved | **High** |
| Q10 | NSIM | Agent context validation | ✅ Resolved | Medium |
| Q11 | NSIM | Risk scoring delegation | ✅ Resolved | Medium |
| Q12 | NSIM | Agent-specific webhook events | ✅ Resolved | Low |
| Q13 | BSIM | Agent badge opt-in | ✅ Resolved | Low |
| Q14 | BSIM | Agent ownership verification | ✅ Resolved | Medium |
| Q15 | BSIM | Agent transaction decline authority | ✅ Resolved | High |
| Q17 | SSIM | WSIM Mock Service Contract | ✅ In Progress | **Critical** |
| Q18 | SSIM | Token Caching Policy | ✅ Resolved | High |
| Q19 | SSIM | Agent vs Human Session Interaction | ✅ Resolved | High |
| Q20 | SSIM | Rate Limiting Requirements | ✅ Resolved | Medium |
| Q21 | SSIM | WSIM Unavailability Handling | ✅ Resolved | Medium |
| Q22 | mwsim | User identification for agent binding | ✅ Resolved | **High** |
| Q23 | mwsim | Access request expiration time | ✅ Resolved | Medium |
| Q24 | mwsim | Limit modification direction | ✅ Resolved | Medium |
| Q25 | mwsim | Multiple agent instances | ✅ Resolved | Low |
| Q26 | mwsim | Message Center architecture | ✅ Resolved | Medium |
| Q27 | mwsim | Message retention policy | ✅ Resolved | Low |
| Q28 | Cross-Team | Agent-initiated credential flow | ✅ Resolved | **High** |
| Q29 | Cross-Team | SSIM → NSIM payment processing integration | 🔴 Open | **Critical** |

---

## SSIM Team Questions

### Q1: Session expiration configurability
**Asked by**: SSIM Team
**Date**: 2026-01-21
**Status**: ✅ Resolved

**Question**:
Should checkout session expiration be configurable per store, or should we use a fixed system-wide default?

**Context**:
Different merchants may have different needs - some products require quick checkout (limited inventory), others may allow longer consideration.

**Discussion**:
- 2026-01-21 SSIM Team: **Recommend store-configurable expiration.**
  - Aligns with existing store-level configuration pattern in SSIM
  - Default: 30 minutes
  - Configurable range: 5-60 minutes
  - Stored in store settings, exposed in UCP profile
- 2026-01-21 PM: **Approved.**

**Resolution**:
✅ **RESOLVED**: Store-configurable expiration. Default 30 minutes, range 5-60 minutes.
**Resolved by**: PM | **Date**: 2026-01-21

---

### Q2: Multiple shipping options selection
**Asked by**: SSIM Team
**Date**: 2026-01-21
**Status**: ✅ Resolved

**Question**:
Do we need to support agents selecting from multiple shipping options (standard, express, overnight)?

**Context**:
Current spec shows single `fulfillment` object. Need to determine if agent should be able to compare/select shipping options.

**Discussion**:
- 2026-01-21 SSIM Team: **Recommend deferring to Phase 2.**
  - Current SSIM has single shipping calculation
  - Adding shipping option selection requires additional UI work
  - MVP recommendation: Use store's default/cheapest shipping
  - Phase 2: Add `GET /sessions/:id/shipping-options` endpoint and selection
- 2026-01-21 PM: **Approved.** Will add full shipping support later.

**Resolution**:
✅ **RESOLVED**: Defer to Phase 2. MVP uses default shipping. Full shipping options in Phase 2.
**Resolved by**: PM | **Date**: 2026-01-21

---

### Q3: Promo code support for agents
**Asked by**: SSIM Team
**Date**: 2026-01-21
**Status**: ✅ Resolved

**Question**:
Should agents be able to apply promotional codes during checkout?

**Context**:
This could be useful for agent-specific promotions or loyalty programs, but adds complexity.

**Discussion**:
- 2026-01-21 SSIM Team: **Recommend deferring to Phase 2.**
  - Adds complexity to session API
  - Promo validation logic exists in SSIM but not exposed via API
  - Not critical for MVP demo scenarios
  - Phase 2: Add `promoCode` field to session update endpoint
- 2026-01-21 PM: **Approved.** Same as Q2 - defer to Phase 2.

**Resolution**:
✅ **RESOLVED**: Defer to Phase 2. Not needed for MVP.
**Resolved by**: PM | **Date**: 2026-01-21

---

### Q4: Partial fulfillment handling
**Asked by**: SSIM Team
**Date**: 2026-01-21
**Status**: ✅ Resolved

**Question**:
How should we handle partial fulfillment scenarios (backordered items, split shipments)?

**Context**:
Current flow assumes all items are available. Need to define behavior when some items are out of stock.

**Discussion**:
- 2026-01-21 SSIM Team: **Recommend MVP rejects unavailable items.**
  - Partial fulfillment significantly complicates order management
  - Current SSIM doesn't support split orders
  - MVP: Return `item_unavailable` error with affected items
  - Agent can retry with modified cart
  - Phase 3: Consider backorder/split shipment support
- 2026-01-21 PM: **Approved.**

**Resolution**:
✅ **RESOLVED**: MVP rejects unavailable items with `item_unavailable` error. Agent retries with modified cart. Backorder support in Phase 3.
**Resolved by**: PM | **Date**: 2026-01-21

---

### Q17: WSIM Mock Service Contract
**Asked by**: SSIM Team
**Date**: 2026-01-21
**Status**: ✅ In Progress
**Priority**: **CRITICAL - Blocks SSIM Week 2 Start**

**Question**:
Can WSIM team provide an OpenAPI specification for agent endpoints by end of Week 1, to enable SSIM mock development?

**Context**:
SSIM is scheduled to start Week 2 with "mock WSIM". For this to work, we need exact API contracts for:
- `POST /api/agent/v1/token/introspect` - Token validation
- `POST /api/agent/v1/payments/token` - Payment token request
- Step-up webhook payload format

Without this contract, SSIM cannot build mocks and will be blocked.

**Discussion**:
- 2026-01-21 WSIM Team: **COMMITTED. OpenAPI spec in progress.**
  - Will create `docs/openapi-agent.yaml` in wsim repo
  - Covers all endpoints needed for SSIM mocks:
    - `POST /api/agent/v1/oauth/token` - Agent OAuth token
    - `POST /api/agent/v1/oauth/introspect` - Token validation
    - `POST /api/agent/v1/payments/token` - Payment token request
    - Step-up webhook payload format
  - SSIM can build mocks from this contract
  - Spec will be available in wsim repo `agentic-support` branch

**Resolution**:
✅ **IN PROGRESS**: WSIM drafting OpenAPI spec. Will be available in wsim repo for SSIM to use.
**Target**: End of Week 1

---

### Q18: Token Caching Policy
**Asked by**: SSIM Team
**Date**: 2026-01-21
**Status**: ✅ Resolved

**Question**:
Is SSIM permitted to cache token introspection results for short periods (30-60 seconds)?

**Context**:
The requirements specify calling WSIM for every authenticated request:
```typescript
const agentContext = await wsimClient.introspectToken(token);
```

This adds ~50-100ms latency per request. Caching valid tokens for 30-60 seconds would improve performance significantly.

Need WSIM team guidance on:
1. Is caching acceptable from a security perspective?
2. If yes, what TTL is recommended?
3. Should we invalidate cache on token revocation webhook?

**Discussion**:
- 2026-01-21 PM: **Approved token caching with 60-second TTL.**
  - Security trade-off acceptable for performance gain
  - 60 seconds is short enough to limit exposure
  - WSIM team should still confirm no objections
  - Cache invalidation on revocation webhook is recommended but not required for MVP

**Resolution**:
✅ **RESOLVED**: Token caching approved with 60-second TTL. WSIM team to confirm no security objections.
**Resolved by**: PM | **Date**: 2026-01-21

---

### Q19: Agent Session vs Human Session Interaction
**Asked by**: SSIM Team
**Date**: 2026-01-21
**Status**: ✅ Resolved

**Question**:
Can an agent session coexist with a human session for the same store? What happens if a human modifies their cart while an agent is building a session?

**Context**:
Current SSIM uses session-based (cookie) cart for human users. Agent sessions use the new `ssim_agent_sessions` table. Need to confirm:
1. Are these completely isolated? (Our assumption: YES)
2. Can an agent and human both have active sessions simultaneously?
3. Do agent sessions affect human cart/session state?

**Discussion**:
- 2026-01-21 SSIM Team: **Our assumption is complete isolation.** Agent sessions are:
  - Stored in separate table (`ssim_agent_sessions`)
  - Identified by `agentId`, not browser session
  - Do not affect human session state
  - Requesting confirmation this is correct interpretation
- 2026-01-21 PM: **Confirmed.** Start with complete isolation. In Phase 2, we will add session "sharing" capability (agent can access human's cart or vice versa). Design with this future capability in mind, but implement simple isolation for MVP.

**Resolution**:
✅ **RESOLVED**: Phase 1 = Complete isolation. Phase 2 = Session sharing capability. Design should anticipate future sharing but implement isolation for MVP.
**Resolved by**: PM | **Date**: 2026-01-21

---

### Q20: Rate Limiting Requirements
**Asked by**: SSIM Team
**Date**: 2026-01-21
**Status**: ✅ Resolved

**Question**:
What rate limits should apply to agent APIs? Per-agent? Per-owner? Per-store?

**Context**:
Not specified in requirements. Agents could potentially make many rapid requests (product search, session updates). Need to define:
1. Rate limit tiers (e.g., 100 req/min per agent)
2. What happens when limit exceeded (429 response)
3. Should limits be configurable per store?

**Discussion**:
- 2026-01-21 PM: Defined rate limiting policy:
  1. **Baseline**: 1000 requests per minute per agent
  2. **Exceeded response**: HTTP 429 Too Many Requests
  3. **Configurability**: Should be configurable per store

**Resolution**:
✅ **RESOLVED**: 1000 req/min baseline per agent. Return 429 when exceeded. Store-configurable limits.
**Resolved by**: PM | **Date**: 2026-01-21

---

### Q21: WSIM Unavailability Handling
**Asked by**: SSIM Team
**Date**: 2026-01-21
**Status**: ✅ Resolved

**Question**:
What should SSIM do if WSIM becomes unavailable during an active checkout session?

**Context**:
Several checkout steps require WSIM:
- Token introspection (every request)
- Payment token validation (checkout complete)
- Step-up flow (awaiting_authorization)

If WSIM goes down mid-checkout, options are:
1. Fail session immediately with error
2. Retry with exponential backoff
3. Hold session in `waiting` state, notify agent
4. Allow completion with cached token (if Q18 caching approved)

**Discussion**:
- 2026-01-21 PM: For MVP, use retry approach + token caching:
  1. Implement token cache with **60-second TTL** (approved - relates to Q18)
  2. On WSIM unavailability, **retry with exponential backoff**
  3. If cached token is valid, allow request to proceed
  4. If all retries fail and no cached token, return error to agent

**Resolution**:
✅ **RESOLVED**: Retry with exponential backoff. Token cache approved (60s TTL). If cached token valid, proceed. If all fails, return error.
**Resolved by**: PM | **Date**: 2026-01-21

---

## WSIM Team Questions

### Q5: Agent secret rotation
**Asked by**: WSIM Team
**Date**: 2026-01-21
**Status**: ✅ Resolved

**Question**:
Should agent client secrets be rotatable without requiring full re-registration?

**Context**:
Security best practice is to rotate secrets periodically. Need to decide if we support rotation or require new registration.

**Discussion**:
- 2026-01-21 PM: **Yes, support rotation with re-authorization flow.**
  - WSIM should track which agents have delegated access
  - Support prompting user to continue/renew access
  - If approved → automatic secret rotation
  - If not approved or timeout → kick back to full registration
  - Agent + WSIM/mwsim should support a flow to:
    1. Detect when delegation has expired
    2. Guide user through re-enrollment/approval
  - This maintains security while avoiding friction of full re-registration
- 2026-01-21 WSIM Team: **CONFIRMED.** Agreed with PM approach.
  - Will implement periodic expiry tracking for agent delegations
  - Support re-authorization flow when delegation expires
  - Add `POST /api/mobile/agents/:id/rotate-secret` endpoint
  - Agent will detect expired delegation via 401 response with `delegation_expired` error code
  - mwsim will handle re-authorization flow in-app

**Resolution**:
✅ **RESOLVED**: Support secret rotation with re-authorization flow. Agent delegations have periodic expiry. WSIM/mwsim guide user through renewal.
**Resolved by**: PM + WSIM | **Date**: 2026-01-21

---

### Q6: Step-up expiration time
**Asked by**: WSIM Team
**Date**: 2026-01-21
**Status**: ✅ Resolved

**Question**:
What should the default step-up request expiration time be?

**Context**:
Suggesting 15 minutes. Too short = user misses notification. Too long = stale carts, price changes.

**Discussion**:
- 2026-01-21 PM: **15 minutes is fine.**
  - Balances user availability with cart freshness
  - Aligns with WSIM's original suggestion
- 2026-01-21 WSIM Team: **CONFIRMED.** 15 minutes default.
  - Push notification should reach user within seconds
  - 15 minutes gives adequate response time
  - Cart prices/availability can change - shorter is better
  - Can be configurable per-merchant in Phase 2 if needed

**Resolution**:
✅ **RESOLVED**: 15-minute default step-up expiration. Configurable per-merchant in Phase 2.
**Resolved by**: PM + WSIM | **Date**: 2026-01-21

---

### Q7: Multiple payment methods per agent
**Asked by**: WSIM Team
**Date**: 2026-01-21
**Status**: ✅ Resolved

**Question**:
Should agents be able to select from multiple enrolled payment methods, or use a designated default?

**Context**:
Users may have multiple cards enrolled. Need to decide if agent can choose, or always uses owner's default.

**Discussion**:
- 2026-01-21 PM: **Agents can see all payment methods, but user has a default.**
  - Agent should be able to present all available payment methods to the user
  - User sets a default payment method in wallet settings
  - For auto-approved transactions (within limits): use default
  - For step-up transactions: user can select from available methods during approval
  - This provides flexibility while maintaining user control
- 2026-01-21 WSIM Team: **CONFIRMED.** Full payment method support.
  - All payment methods in user's wallet should be accessible to agents
  - User sets a default payment method for agent auto-approvals
  - Agent/user can select specific card for any transaction
  - Use cases:
    1. Auto-approve: Uses default card
    2. Step-up: User can select from available cards during approval
    3. Specific request: Agent can request specific card if user/agent prefers
  - Implementation: Payment token API accepts optional `paymentMethodId` parameter

**Resolution**:
✅ **RESOLVED**: Support all payment methods. User sets default for auto-approve. Agent/user can select specific card for any transaction.
**Resolved by**: PM + WSIM | **Date**: 2026-01-21

---

### Q8: Daily limit timezone handling
**Asked by**: WSIM Team
**Date**: 2026-01-21
**Status**: ✅ Resolved

**Question**:
How should we handle timezone for daily spending limits?

**Context**:
Need to define when the "day" resets - user's local timezone, UTC, or wallet server timezone?

**Discussion**:
- 2026-01-21 PM: **Day resets at midnight local time EST (for now).**
  - Use Eastern Standard Time as the reference timezone
  - Simplifies MVP implementation (single timezone)
  - Future consideration: User-configurable timezone in Phase 2
  - Note: EST = UTC-5 (or EDT = UTC-4 during daylight saving)
- 2026-01-21 WSIM Team: **CONFIRMED.** EST for MVP, user-definable long term.
  - MVP: Day resets at midnight America/Toronto (EST/EDT)
  - More user-friendly than UTC (matches local business day for majority of users)
  - Phase 2: Add user-configurable timezone in wallet settings
  - Implementation: Store transactions in UTC, calculate daily totals with timezone offset

**Resolution**:
✅ **RESOLVED**: MVP uses America/Toronto (EST/EDT). Phase 2 adds user-configurable timezone.
**Resolved by**: PM + WSIM | **Date**: 2026-01-21

---

### Q9: mwsim agent management
**Asked by**: WSIM Team
**Date**: 2026-01-21
**Status**: ✅ Resolved

**Question**:
Should mobile wallet (mwsim) users be able to register and manage agents from the mobile app?

**Context**:
Current design assumes web UI. Mobile support would expand access but increase scope.

**Discussion**:
- 2026-01-21 PM: **Yes - mobile support and feature parity is REQUIRED.**
  - mwsim must have full agent management capability
  - Mobile is likely to be the **primary user validation mechanism** for step-up flows
  - Push notifications for step-up approval will go to mwsim
  - Users should be able to:
    1. Register new agents from mobile
    2. View/manage existing agents
    3. Approve step-up requests via mobile
    4. Revoke agents from mobile
  - Feature parity between web (WSIM) and mobile (mwsim) is essential
  - This aligns with WSIM team's drafted MWSIM_REQUIREMENTS.md
- 2026-01-21 WSIM Team: **CONFIRMED.** Mobile support is critical.
  - Mobile-first users expect to manage everything from the app
  - Step-up approval is time-sensitive - in-app approval is faster than web redirect
  - Push notifications already go to mobile - natural to complete approval there
  - Full feature list in [MWSIM_REQUIREMENTS.md](https://github.com/jordancrombie/wsim/blob/agentic-support/docs/sacp/MWSIM_REQUIREMENTS.md)
  - **Timeline impact**: Adds ~3-4 weeks parallel mwsim effort
  - mwsim work can start once WSIM API contracts are defined (Q17)

**Resolution**:
✅ **RESOLVED**: mwsim full agent management required. Feature parity with web. Adds ~3-4 weeks parallel effort.
**Resolved by**: PM + WSIM | **Date**: 2026-01-21

---

## NSIM Team Questions

### Q10: Agent context validation
**Asked by**: NSIM Team
**Date**: 2026-01-21
**Status**: ✅ Resolved

**Question**:
Should NSIM validate agent context against WSIM, or trust the merchant-provided context?

**Context**:
Validation adds security but introduces latency and WSIM dependency. Trust simplifies but could allow spoofing.

**Discussion**:
- 2026-01-21 NSIM Team: **Recommend NO validation for MVP.** Rationale:
  1. Adds latency to every agent transaction (WSIM API call)
  2. Creates WSIM dependency - what if WSIM is down?
  3. SSIM received the token from WSIM - trust the chain
  4. Payment token is already validated by BSIM (who issued it)
  5. Alternative: Log agent context for auditing, flag anomalies in reporting (Phase 3)
- 2026-01-21 PM: **Approved NSIM recommendation.** No validation for MVP. Add agent context validation to project roadmap for future phases (Phase 3 - auditing/anomaly detection).

**Resolution**:
✅ **RESOLVED**: NO validation for MVP. Trust the chain (SSIM→WSIM token). Add to project roadmap: Phase 3 auditing/anomaly detection for agent context.
**Resolved by**: PM | **Date**: 2026-01-21

---

### Q11: Risk scoring delegation
**Asked by**: NSIM Team
**Date**: 2026-01-21
**Status**: Under Discussion

**Question**:
What level of agent risk scoring should NSIM perform vs. delegating entirely to BSIM?

**Context**:
NSIM could calculate risk signals (velocity, patterns) or simply pass agent flag to BSIM for all risk assessment.

**Discussion**:
- 2026-01-21 NSIM Team: **Recommend delegating entirely to BSIM.** Rationale:
  1. BSIM already has risk/fraud infrastructure
  2. BSIM has cardholder history and spending patterns
  3. NSIM is a routing layer - keep it simple
  4. Risk data (velocity, patterns) would require WSIM integration that adds complexity
  5. NSIM should pass agent context as-is; BSIM decides: approve, decline, or flag for review

  What NSIM provides to BSIM:
  ```json
  {
    "agentContext": {
      "agentId": "agent_abc123",
      "ownerId": "user_xyz789",
      "humanPresent": false,
      "mandateType": "cart"
    }
  }
  ```

- 2026-01-21 BSIM Team: **CONFIRMED - agree with NSIM recommendation.**
  1. BSIM accepts full responsibility for risk assessment on agent transactions
  2. Agent context passed from NSIM is sufficient for BSIM's risk engine
  3. BSIM will apply existing fraud rules + new agent-specific policies (see Q15)
  4. This keeps NSIM simple and avoids duplicating risk logic

**Resolution**:
✅ **RESOLVED** - NSIM passes agent context; BSIM handles all risk assessment.
**Resolved by**: BSIM Team | **Date**: 2026-01-21

---

### Q12: Agent-specific webhook events
**Asked by**: NSIM Team
**Date**: 2026-01-21
**Status**: ✅ Resolved

**Question**:
Should we add a specific `payment.agent_transaction` webhook event type?

**Context**:
Could help merchants who want to handle agent transactions differently. Alternative is to include agent context in existing events.

**Discussion**:
- 2026-01-21 NSIM Team: **Recommend NO new event type - include context in existing events.** Rationale:
  1. Simpler for merchants - one event type to handle
  2. Agent context is additive, not a different flow
  3. Merchants can filter by `agentContext` presence if needed
  4. Reduces webhook type proliferation

  Proposed approach:
  ```json
  {
    "type": "payment.captured",  // Existing event type
    "data": {
      "transactionId": "tx_...",
      "agentContext": { ... }    // Present if agent-initiated, null otherwise
    }
  }
  ```

- 2026-01-21 SSIM Team: **AGREE with NSIM recommendation.**
  - SSIM already handles `payment.captured`, `payment.failed` etc.
  - Adding `agentContext` to existing events is simpler
  - We can filter by `agentContext` presence if needed
  - Supports gradual adoption - existing handlers still work

**Resolution**:
✅ **RESOLVED**: Include `agentContext` in existing webhook events. No new event type.
**Resolved by**: NSIM + SSIM consensus | **Date**: 2026-01-21

---

## BSIM Team Questions

### Q13: Agent badge opt-in
**Asked by**: BSIM Team
**Date**: 2026-01-21
**Status**: ✅ Resolved

**Question**:
Should the agent transaction badge be always shown, or opt-in via user settings?

**Context**:
Some users may not want visual distinction. Others may want clear visibility of agent activity.

**Discussion**:
- 2026-01-21 BSIM Team: **Recommend ALWAYS SHOWN (no opt-out).** Rationale:
  1. Transparency is critical for AI agent transactions - users should always know when an agent acted on their behalf
  2. Regulatory direction suggests disclosure requirements for AI-initiated transactions
  3. Hiding agent activity could mask unauthorized or unexpected behavior
  4. If users don't want to see agent badges, they shouldn't be using agents
  5. Simpler implementation - no user preference to manage

  Proposed UI:
  - 🤖 badge always visible on agent transactions
  - Tooltip on hover: "This transaction was initiated by AI Agent: {agentId}"
  - Transaction detail view shows full agent context
- 2026-01-21 PM: **Approved.** Always shown. Transparency is critical.

**Resolution**:
✅ **RESOLVED**: Agent badge ALWAYS SHOWN (no opt-out). Transparency for AI-initiated transactions is critical.
**Resolved by**: PM | **Date**: 2026-01-21

---

### Q14: Agent ownership verification
**Asked by**: BSIM Team
**Date**: 2026-01-21
**Status**: ✅ Resolved

**Question**:
Should BSIM verify that the agent owner ID matches the cardholder?

**Context**:
Could prevent scenarios where Agent A (owned by User X) uses a card belonging to User Y.

**Discussion**:
- 2026-01-21 BSIM Team: **Recommend YES - verify ownership for P1.** Rationale:
  1. Prevents cross-user agent abuse (Agent A using User B's card)
  2. BSIM already has cardholder identity - simple comparison
  3. Aligns with card network rules (cardholder must authorize transactions)
  4. If agent owner ≠ cardholder, this is suspicious and should be declined

  Implementation approach:
  ```
  if (agentContext.ownerId !== cardTransaction.cardholderId) {
    return decline("AGENT_OWNER_MISMATCH");
  }
  ```

  Edge case consideration:
  - Family cards / authorized users: Could be handled by allowing "authorized agents" list per card
  - Corporate cards: May need different rules (P2 scope)

  **Dependency**: Need WSIM to confirm `ownerId` format matches BSIM's `cardholderId` format, or provide a mapping.

- 2026-01-21 WSIM Team: **CONFIRMED ID format compatibility.**
  - WSIM `ownerId` is the WSIM user ID (UUID format, e.g., `550e8400-e29b-41d4-a716-446655440000`)
  - BSIM can map this via the `BsimEnrollment` table which links WSIM user to BSIM cardholder
  - For verification: BSIM should call WSIM's introspection endpoint which returns `owner_id`
  - BSIM can then verify `owner_id` maps to the cardholder via enrollment lookup
  - Introspection response includes: `{ owner_id: "uuid", ... }`

**Resolution**:
✅ **RESOLVED**: YES - verify ownership. WSIM ownerId is UUID. BSIM maps via BsimEnrollment table.
**Resolved by**: BSIM + WSIM | **Date**: 2026-01-21

---

### Q15: Agent transaction decline authority
**Asked by**: BSIM Team
**Date**: 2026-01-21
**Status**: ✅ Resolved

**Question**:
Should BSIM have authority to decline agent transactions based on bank-level policy, independent of WSIM limits?

**Context**:
Bank may want additional controls (e.g., decline all agent transactions above $500 regardless of wallet limits).

**Discussion**:
- 2026-01-21 BSIM Team: **Recommend YES for P1, with minimal scope. Expand in P2.** Rationale:
  1. Banks are ultimately liable for fraud - need ability to control risk
  2. WSIM limits are user-controlled; bank may need stricter defaults
  3. Real banks would absolutely want this control
  4. Aligns with issuer authority in card network rules

  **P1 Scope (Minimal)**:
  - Single bank-wide toggle: `agentTransactionsEnabled: true/false`
  - Single bank-wide limit: `agentTransactionMaxAmount: number`
  - If `humanPresent: false` and amount > limit → decline with code `AGENT_LIMIT_EXCEEDED`

  **P2 Scope (Enhanced)**:
  - Per-MCC (merchant category) limits for agents
  - Velocity controls (max agent transactions per day)
  - Customer opt-in/opt-out for agent transactions on their cards
  - Alert thresholds (notify customer when agent spends > X)

  **Implementation Note**: BSIM policy check runs AFTER WSIM approval. Flow:
  ```
  WSIM approves (within user limits) → NSIM routes → BSIM checks bank policy → Approve/Decline
  ```

  This means BSIM can decline even if WSIM approved, but cannot approve if WSIM declined.

- 2026-01-21 PM: **Approved.** Aligned with BSIM recommendation. Start with P1 minimal scope, but architecture MUST support P2 enhanced capabilities long term.

**Resolution**:
✅ **RESOLVED**: YES - BSIM has decline authority. P1 = minimal scope (bank-wide toggle + limit). P2 = enhanced capabilities (per-MCC, velocity, opt-in/opt-out, alerts). Design must support P2 expansion.
**Resolved by**: PM | **Date**: 2026-01-21

---

## mwsim Team Questions

### Q22: User identification for agent binding
**Asked by**: WSIM Team (reviewing mwsim proposal)
**Date**: 2026-01-21
**Status**: ✅ Resolved

**Question**:
How should agents identify which user they want to connect to? Email-based identification has security concerns (enumeration, spam).

**Context**:
mwsim proposed `user_email` in the access request. WSIM raised concerns about email harvesting, spam vectors, and privacy leaks.

**Discussion**:
- 2026-01-21 WSIM Team: **Recommend pairing codes instead of email.**
  - User generates code in mwsim: `WSIM-ABC123-XYZ789` (expires 24h)
  - User gives code to agent
  - Agent submits code → WSIM resolves to user → Push notification
  - Keeps user identity private until explicitly shared
- 2026-01-21 mwsim Team: **Partial agree.** Accept pairing codes for Phase 1, but want alias-based push authentication in Phase 2 roadmap.

**Resolution**:
✅ **RESOLVED**: Pairing codes for Phase 1. Alias-based (@username) with rate limiting in Phase 2.
**Resolved by**: WSIM + mwsim | **Date**: 2026-01-21

---

### Q23: Access request expiration time
**Asked by**: mwsim Team
**Date**: 2026-01-21
**Status**: ✅ Resolved

**Question**:
What expiration time should access requests (agent binding) have? Same 15 minutes as step-up?

**Context**:
mwsim proposed 15 minutes. WSIM noted that agent setup is not time-critical like checkout.

**Discussion**:
- 2026-01-21 WSIM Team: **Recommend 24-48 hours.** Agent setup not time-critical. User may be away, need time to review, discuss with family.
- 2026-01-21 mwsim Team: **Agree with 24 hours.**

**Resolution**:
✅ **RESOLVED**: 24-hour expiration for access requests (agent binding). 15 minutes remains for step-up (time-critical).
**Resolved by**: WSIM + mwsim | **Date**: 2026-01-21

---

### Q24: Limit modification direction
**Asked by**: mwsim Team
**Date**: 2026-01-21
**Status**: ✅ Resolved

**Question**:
Should user be able to INCREASE limits beyond what agent requested?

**Context**:
Need to determine if approval UI allows only decreasing limits or both directions.

**Discussion**:
- 2026-01-21 WSIM Team: **Recommend NO - decrease only.** Agent requests what it needs. User granting MORE suggests social engineering. Agent should re-request if higher limits needed.
- 2026-01-21 mwsim Team: **Agree.**

**Resolution**:
✅ **RESOLVED**: Users can only DECREASE limits below agent's request or reject permissions. Cannot increase.
**Resolved by**: WSIM + mwsim | **Date**: 2026-01-21

---

### Q25: Multiple agent instances
**Asked by**: mwsim Team
**Date**: 2026-01-21
**Status**: ✅ Resolved

**Question**:
Can the same agent name be registered multiple times (different instances)?

**Context**:
User might have "Claude Shopping" on work laptop and home laptop.

**Discussion**:
- 2026-01-21 WSIM Team: **Yes, supported.** Each registration creates unique `agent_id` (UUID), `client_id` (`agent_{nanoid}`), `client_secret`. Same user can have multiple agents with same name.

**Resolution**:
✅ **RESOLVED**: Multiple instances with same name supported. Each gets unique credentials.
**Resolved by**: WSIM | **Date**: 2026-01-21

---

### Q26: Message Center architecture
**Asked by**: mwsim Team
**Date**: 2026-01-21
**Status**: ✅ Resolved

**Question**:
Should Message Center use WSIM-aggregated API (Option A) or client-side aggregation (Option B)?

**Context**:
Message Center aggregates notifications from WSIM, ContractSim, TransferSim.

**Discussion**:
- 2026-01-21 mwsim Team: **Recommend Option A (WSIM aggregated)** for better UX and consistency.
- 2026-01-21 WSIM Team: **Recommend Option B (client-side) for Phase 1.** WSIM doesn't currently aggregate ContractSim/TransferSim messages. Defer aggregation to Phase 2 based on learnings.
- 2026-01-21 mwsim Team: **Agree** to start with client-side.

**Resolution**:
✅ **RESOLVED**: Client-side aggregation for Phase 1. Re-evaluate WSIM aggregation for Phase 2.
**Resolved by**: WSIM + mwsim | **Date**: 2026-01-21

---

### Q27: Message retention policy
**Asked by**: mwsim Team
**Date**: 2026-01-21
**Status**: ✅ Resolved

**Question**:
How long to keep historical messages in Message Center?

**Context**:
Need to balance storage with user access to history.

**Discussion**:
- 2026-01-21 WSIM Team: Proposed policy:
  - **Actionable messages** (pending step-ups, access requests): Until resolved or expired
  - **Informational messages** (transaction completed): 30 days in database, indefinite in archive
  - **User dismissal**: Soft-deletes from UI

**Resolution**:
✅ **RESOLVED**: 30-day active retention, indefinite archive. User can dismiss messages.
**Resolved by**: WSIM | **Date**: 2026-01-21

---

## Cross-Team Questions

### Q28: Agent-initiated credential flow
**Asked by**: mwsim Team
**Date**: 2026-01-21
**Status**: ✅ Resolved
**Reference**: [USER_AGENT_DESIGN.md](USER_AGENT_DESIGN.md)

**Question**:
Should we replace credential display (copy/paste) with agent-initiated access request flow?

**Context**:
Current design displays client_id/secret in UI for user to copy. Security and UX concerns: secret visible on screen, manual copy/paste errors, no audit trail.

**Discussion**:
- 2026-01-21 mwsim Team: **Proposed agent-initiated flow** with three options:
  1. Push notification approval (primary)
  2. QR code scan (in-person)
  3. OAuth web flow (enterprise)
- 2026-01-21 WSIM Team: **Support with modifications:**
  - Pairing codes (not email) for Phase 1
  - 24-hour expiration for access requests
  - Limit modification restricted to decreases
  - Client-side Message Center for Phase 1
- 2026-01-21 mwsim Team: **Accepted** all modifications

**Resolution**:
✅ **RESOLVED**: Agent-initiated credential flow approved. Phase 1: Pairing codes + QR scan. Phase 2: Add alias-based. Credentials never displayed in UI.
**Resolved by**: WSIM + mwsim | **Date**: 2026-01-21

---

### Q29: SSIM → NSIM payment processing integration
**Asked by**: PM
**Date**: 2026-01-22
**Status**: 🔴 Open
**Priority**: **CRITICAL - Required for real payment flow**

**Question**:
SSIM currently validates payment tokens and creates orders, but does NOT call NSIM to actually process payments. How should we implement the SSIM → NSIM → BSIM payment integration for Sprint 2?

**Context**:
Sprint 1 deliverables are complete, but the current flow is:
```
Agent → SSIM → Creates order (no actual payment) ❌
```

We need the complete flow:
```
Agent → SSIM → NSIM → BSIM → Real payment authorization ✅
```

Without this integration:
- No real money flows through the system
- BSIM won't show agent badges on real transactions
- Integration tests (Flows 2, 3, 7, 10) cannot fully validate

**Proposed Sprint 2 Tasks for SSIM**:

| Task | Description | Dependencies |
|------|-------------|--------------|
| S7 | Implement NSIM payment client | NSIM API contract |
| S8 | Pass agentContext to NSIM in authorization request | Q10, Q11 resolved |
| S9 | Handle authorization response (approve/decline/step-up) | - |
| S10 | Link order to payment reference (authorizationId) | - |
| S11 | Implement capture on order fulfillment | - |

**Proposed API Call (SSIM → NSIM)**:
```typescript
// When agent completes checkout with payment token
const authResult = await nsimClient.authorize({
  amount: session.total,
  currency: 'CAD',
  merchantId: store.merchantId,
  paymentToken: paymentToken,  // From WSIM
  agentContext: {
    agentId: tokenInfo.agent_id,
    ownerId: tokenInfo.owner_id,
    humanPresent: tokenInfo.human_present,
    mandateId: tokenInfo.mandate_id,
    mandateType: 'cart'
  }
});

if (authResult.status === 'approved') {
  // Create order with payment reference
  order.paymentAuthorizationId = authResult.authorizationId;
  order.status = 'confirmed';
}
```

**Questions for Teams**:

1. **SSIM Team**:
   - Does the proposed task breakdown look correct?
   - Any concerns about the integration approach?
   - Estimated effort for S7-S11?

2. **NSIM Team**:
   - Confirm the authorization API contract for agent transactions
   - Any additional fields needed in agentContext?
   - Webhook events SSIM should listen for?

3. **BSIM Team**:
   - Confirm you'll receive agentContext from NSIM per Q11 resolution
   - Any changes needed to support the flow?
   - Verification approach for owner matching (Q14)?

**Discussion**:
- 2026-01-22 PM: Identified gap during Sprint 1 review. This is the critical path for MVP.

*Awaiting team responses...*

---

## Resolved Questions Archive

*Move resolved questions here for reference*

---

## Decision Log

| Date | Decision | Rationale | Approved By |
|------|----------|-----------|-------------|
| 2026-01-21 | Use OAuth 2.0 client credentials for agent auth | Industry standard, aligns with AP2 | Design Team |
| 2026-01-21 | WSIM as central Credentials Provider | Single point of control for spending limits | Design Team |
| 2026-01-21 | Tiered approval model | Balance autonomy with human oversight | Product Owner |
| 2026-01-21 | Q1: Store-configurable session expiration (30min default, 5-60min range) | Flexibility for different merchant needs | PM |
| 2026-01-21 | Q2: Defer shipping options to Phase 2 | MVP simplicity, default shipping sufficient | PM |
| 2026-01-21 | Q3: Defer promo codes to Phase 2 | Not critical for MVP demo | PM |
| 2026-01-21 | Q4: MVP rejects unavailable items | Partial fulfillment too complex for MVP | PM |
| 2026-01-21 | Q11: NSIM passes context, BSIM handles risk | Keep NSIM simple, BSIM has risk infrastructure | NSIM + BSIM |
| 2026-01-21 | Q12: Include agentContext in existing webhooks | Simpler than new event type, gradual adoption | NSIM + SSIM |
| 2026-01-21 | Q18: Token caching approved (60s TTL) | Performance vs security trade-off acceptable | PM |
| 2026-01-21 | Q19: Phase 1 isolation, Phase 2 session sharing | Start simple, design for future | PM |
| 2026-01-21 | Q20: 1000 req/min per agent, store-configurable | Reasonable baseline with flexibility | PM |
| 2026-01-21 | Q21: Retry + cache on WSIM unavailability | Graceful degradation with fallback | PM |
| 2026-01-21 | Q5: Secret rotation with re-authorization flow | Security + convenience balance | PM + WSIM |
| 2026-01-21 | Q6: 15-minute step-up expiration | User availability vs cart freshness | PM + WSIM |
| 2026-01-21 | Q7: All payment methods, user default, card selection | Flexibility with user control | PM + WSIM |
| 2026-01-21 | Q8: EST timezone for MVP, user-configurable in Phase 2 | User-friendly default | PM + WSIM |
| 2026-01-21 | Q9: mwsim full agent management required | Mobile-first user experience | PM + WSIM |
| 2026-01-21 | Q14: Verify agent owner via BsimEnrollment mapping | Prevent cross-user abuse | BSIM + WSIM |
| 2026-01-21 | Q17: WSIM providing OpenAPI spec for SSIM mocks | Unblock SSIM Week 2 start | WSIM |
| 2026-01-21 | Q10: NO validation for MVP, add to Phase 3 roadmap | Trust the chain, avoid WSIM dependency | PM |
| 2026-01-21 | Q13: Agent badge always shown (no opt-out) | Transparency critical for AI transactions | PM |
| 2026-01-21 | Q15: BSIM decline authority - P1 minimal, must support P2 | Bank liability requires control, design for expansion | PM |
| 2026-01-21 | Q22: Pairing codes for agent binding (Phase 1) | Security - avoid email enumeration/spam | WSIM + mwsim |
| 2026-01-21 | Q23: 24-hour expiration for access requests | Agent setup not time-critical like checkout | WSIM + mwsim |
| 2026-01-21 | Q24: Limit modification - decrease only | Prevent social engineering attacks | WSIM + mwsim |
| 2026-01-21 | Q25: Multiple agent instances supported | User flexibility (work/home laptops) | WSIM |
| 2026-01-21 | Q26: Client-side Message Center for Phase 1 | Defer WSIM aggregation complexity | WSIM + mwsim |
| 2026-01-21 | Q27: 30-day message retention | Balance storage with user access | WSIM |
| 2026-01-21 | Q28: Agent-initiated credential flow approved | Security improvement - credentials never displayed | WSIM + mwsim |

---

## Contact

**Project Lead**: [TBD]
**Questions**: Add to this document or reach out to project lead
**Updates**: This document updated as questions are answered
