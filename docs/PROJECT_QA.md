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
| Q1 | SSIM | Session expiration configurability | SSIM Responded | Medium |
| Q2 | SSIM | Multiple shipping options | SSIM Responded | Low |
| Q3 | SSIM | Promo code support for agents | SSIM Responded | Low |
| Q4 | SSIM | Partial fulfillment handling | SSIM Responded | Medium |
| Q5 | WSIM | Agent secret rotation | WSIM Responded | Medium |
| Q6 | WSIM | Step-up expiration time | WSIM Responded | High |
| Q7 | WSIM | Multiple payment methods per agent | WSIM Responded | Medium |
| Q8 | WSIM | Daily limit timezone handling | WSIM Responded | Medium |
| Q9 | WSIM | mwsim agent management | WSIM Responded | **High** |
| Q10 | NSIM | Agent context validation | Under Discussion | Medium |
| Q11 | NSIM | Risk scoring delegation | Under Discussion | Medium |
| Q12 | NSIM | Agent-specific webhook events | ✅ Resolved | Low |
| Q13 | BSIM | Agent badge opt-in | Open | Low |
| Q14 | BSIM | Agent ownership verification | Open | Medium |
| Q15 | BSIM | Agent transaction decline authority | Open | High |
| Q17 | SSIM | WSIM Mock Service Contract | Open | **Critical** |
| Q18 | SSIM | Token Caching Policy | Open | High |
| Q19 | SSIM | Agent vs Human Session Interaction | Open | High |
| Q20 | SSIM | Rate Limiting Requirements | Open | Medium |
| Q21 | SSIM | WSIM Unavailability Handling | Open | Medium |

---

## SSIM Team Questions

### Q1: Session expiration configurability
**Asked by**: SSIM Team
**Date**: 2026-01-21
**Status**: SSIM Responded - Awaiting Consensus

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

**Resolution**:
[Awaiting PM/Design confirmation]

---

### Q2: Multiple shipping options selection
**Asked by**: SSIM Team
**Date**: 2026-01-21
**Status**: SSIM Responded - Awaiting Consensus

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

**Resolution**:
[Awaiting PM/Design confirmation]

---

### Q3: Promo code support for agents
**Asked by**: SSIM Team
**Date**: 2026-01-21
**Status**: SSIM Responded - Awaiting Consensus

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

**Resolution**:
[Awaiting PM/Design confirmation]

---

### Q4: Partial fulfillment handling
**Asked by**: SSIM Team
**Date**: 2026-01-21
**Status**: SSIM Responded - Awaiting Consensus

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

**Resolution**:
[Awaiting PM/Design confirmation]

---

### Q17: WSIM Mock Service Contract
**Asked by**: SSIM Team
**Date**: 2026-01-21
**Status**: Open
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
-

**Resolution**:
[Pending - WSIM team response required]

---

### Q18: Token Caching Policy
**Asked by**: SSIM Team
**Date**: 2026-01-21
**Status**: Open

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
-

**Resolution**:
[Pending - WSIM team response required]

---

### Q19: Agent Session vs Human Session Interaction
**Asked by**: SSIM Team
**Date**: 2026-01-21
**Status**: Open

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

**Resolution**:
[Pending - Design team confirmation]

---

### Q20: Rate Limiting Requirements
**Asked by**: SSIM Team
**Date**: 2026-01-21
**Status**: Open

**Question**:
What rate limits should apply to agent APIs? Per-agent? Per-owner? Per-store?

**Context**:
Not specified in requirements. Agents could potentially make many rapid requests (product search, session updates). Need to define:
1. Rate limit tiers (e.g., 100 req/min per agent)
2. What happens when limit exceeded (429 response)
3. Should limits be configurable per store?

**Discussion**:
-

**Resolution**:
[Pending - Design team guidance]

---

### Q21: WSIM Unavailability Handling
**Asked by**: SSIM Team
**Date**: 2026-01-21
**Status**: Open

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
-

**Resolution**:
[Pending - Design team guidance]

---

## WSIM Team Questions

### Q5: Agent secret rotation
**Asked by**: WSIM Team
**Date**: 2026-01-21
**Status**: Open

**Question**:
Should agent client secrets be rotatable without requiring full re-registration?

**Context**:
Security best practice is to rotate secrets periodically. Need to decide if we support rotation or require new registration.

**Discussion**:
-

**Resolution**:
[Pending]

---

### Q6: Step-up expiration time
**Asked by**: WSIM Team
**Date**: 2026-01-21
**Status**: Open

**Question**:
What should the default step-up request expiration time be?

**Context**:
Suggesting 15 minutes. Too short = user misses notification. Too long = stale carts, price changes.

**Discussion**:
-

**Resolution**:
[Pending]

---

### Q7: Multiple payment methods per agent
**Asked by**: WSIM Team
**Date**: 2026-01-21
**Status**: Open

**Question**:
Should agents be able to select from multiple enrolled payment methods, or use a designated default?

**Context**:
Users may have multiple cards enrolled. Need to decide if agent can choose, or always uses owner's default.

**Discussion**:
-

**Resolution**:
[Pending]

---

### Q8: Daily limit timezone handling
**Asked by**: WSIM Team
**Date**: 2026-01-21
**Status**: Open

**Question**:
How should we handle timezone for daily spending limits?

**Context**:
Need to define when the "day" resets - user's local timezone, UTC, or wallet server timezone?

**Discussion**:
-

**Resolution**:
[Pending]

---

### Q9: mwsim agent management
**Asked by**: WSIM Team
**Date**: 2026-01-21
**Status**: Open

**Question**:
Should mobile wallet (mwsim) users be able to register and manage agents from the mobile app?

**Context**:
Current design assumes web UI. Mobile support would expand access but increase scope.

**Discussion**:
-

**Resolution**:
[Pending]

---

## NSIM Team Questions

### Q10: Agent context validation
**Asked by**: NSIM Team
**Date**: 2026-01-21
**Status**: Under Discussion

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

**Resolution**:
[Awaiting team consensus]

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
**Status**: Under Discussion

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

**Resolution**:
[Awaiting cross-team consensus]

---

### Q14: Agent ownership verification
**Asked by**: BSIM Team
**Date**: 2026-01-21
**Status**: Under Discussion

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

**Resolution**:
[Awaiting WSIM confirmation on ID format compatibility]

---

### Q15: Agent transaction decline authority
**Asked by**: BSIM Team
**Date**: 2026-01-21
**Status**: Under Discussion

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

**Resolution**:
[Recommend proceeding with P1 minimal scope - awaiting team consensus]

---

## Cross-Team Questions

### Q16: [Reserved for cross-team questions]
**Asked by**:
**Date**:
**Status**: Open

**Question**:


**Context**:


**Discussion**:
-

**Resolution**:
[Pending]

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
| | | | |

---

## Contact

**Project Lead**: [TBD]
**Questions**: Add to this document or reach out to project lead
**Updates**: This document updated as questions are answered
