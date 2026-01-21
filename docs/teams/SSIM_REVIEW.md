# SSIM Team - SACP Requirements Review

**Document**: SSIM_REQUIREMENTS.md Review
**Team**: SSIM (Store Simulator)
**Reviewer**: SSIM Team
**Date**: 2026-01-21
**Status**: ✅ SIGNED OFF

---

## Executive Summary

The SSIM team has reviewed the SACP requirements document and all outstanding questions have been resolved. We are fully supportive of the initiative and ready to proceed with implementation.

**Status**: ✅ **DESIGN SIGN-OFF PROVIDED** - All prerequisites met, ready for implementation.

---

## Review Summary

### What We Like

1. **Clear API Specifications**: The checkout session API is well-defined with clear state machine
2. **Industry Alignment**: Following UCP/AP2/ACP patterns provides future-proofing
3. **Priority Tiers**: P0/P1/P2 separation allows phased delivery
4. **Multi-tenant Awareness**: Requirements acknowledge store isolation needs
5. **Concrete Examples**: Code samples and JSON schemas reduce ambiguity

### Concerns

| ID | Concern | Severity | Notes |
|----|---------|----------|-------|
| C1 | Timeline optimistic | High | See detailed breakdown below |
| C2 | WSIM mock contract undefined | High | Need API contract before Week 2 |
| C3 | Token introspection latency | Medium | Every request hits WSIM |
| C4 | MCP server complexity | Medium | New technology, learning curve |
| C5 | Missing rate limiting requirements | Medium | Agent APIs need protection |
| C6 | WSIM failure handling | Medium | What if WSIM unavailable mid-checkout? |

---

## Detailed Analysis

### Timeline Assessment

**Provided Estimate**: ~5-6 weeks

| Task | Provided | Our Assessment | Notes |
|------|----------|----------------|-------|
| UCP Discovery endpoint | 2-3 days | 2 days | Straightforward, can leverage existing store config |
| Agent auth middleware | 2-3 days | 3-4 days | WSIM integration complexity, error handling |
| Product catalog API | 3-5 days | 4-5 days | Already have products, need API layer + filtering |
| Checkout session API | 5-7 days | 7-8 days | New model, state machine, WSIM integration |
| WSIM integration | 3-5 days | 5-6 days | Critical path, untested integration |
| Schema.org markup | 2-3 days | 2 days | Straightforward |
| MCP server | 5-7 days | 7-10 days | New technology, no existing expertise |
| Webhooks | 2-3 days | 3 days | Need to handle callback failures |
| Testing | 5-7 days | 7-8 days | Integration tests require all systems |
| **Total** | **~5-6 weeks** | **~6-7 weeks** | Recommend adding 1-week buffer |

**Recommendation**: Plan for 7 weeks with 1-week buffer. Communicate 6-8 week range.

### Existing SSIM Infrastructure

SSIM already has several relevant components:

| Component | Status | Reusability |
|-----------|--------|-------------|
| Product catalog (Prisma) | Exists | High - wrap with API |
| OpenAPI spec | Exists | Needs updates for agent endpoints |
| Cart functionality | Exists | Low - session-based, not API |
| NSIM payment integration | Exists | High - add agent context |
| Multi-tenant store isolation | Exists | High - extend to agent sessions |
| Webhook handling | Exists | Medium - need to consume new events |

### WSIM Dependency Analysis

SSIM's implementation depends on WSIM providing:

| WSIM Endpoint | When Needed | Blocking? |
|---------------|-------------|-----------|
| Token introspection | Week 2 | Yes - for auth middleware |
| Payment token API | Week 4 | Yes - for checkout completion |
| Mandate validation | Week 5 | Yes - for payment flow |
| Step-up webhook | Week 5 | Yes - for awaiting_authorization state |

**Request**: WSIM team provide API contract (OpenAPI spec) by end of Week 1, even if implementation follows later. This allows SSIM to build mock services for testing.

### Token Introspection Performance

The requirements specify validating every request against WSIM:

```typescript
const agentContext = await wsimClient.introspectToken(token);
```

**Concern**: This adds latency to every agent API call (estimated 50-100ms).

**Options**:
1. **No caching** (as specified) - Simplest, most secure, but slowest
2. **Short TTL cache** (recommended) - Cache valid tokens for 30-60 seconds
3. **JWT validation** - If tokens are JWTs, validate locally without WSIM call

**Recommendation**: Implement option 2 (short TTL cache) for MVP. Discuss with WSIM team whether tokens can include expiry claims for option 3 in Phase 2.

### MCP Server Concerns

MCP (Model Context Protocol) server is listed as P1 but has significant complexity:

1. **New Technology**: No existing MCP expertise on team
2. **Runtime Requirements**: MCP servers have specific hosting requirements
3. **Security Surface**: Direct tool invocation from AI models
4. **Testing Complexity**: How to test MCP tools?

**Recommendation**: Move MCP server to P2 for MVP. Focus P1 on Schema.org markup and webhooks which provide agent discoverability without MCP complexity.

---

## Responses to Open Questions

### Q1: Session expiration configurability

**SSIM Position**: Support store-configurable expiration.

**Rationale**:
- Different products have different consideration times
- Aligns with existing store-level configuration pattern
- Suggest default of 30 minutes, configurable 5-60 minutes

### Q2: Multiple shipping options selection

**SSIM Position**: Support for Phase 2, not MVP.

**Rationale**:
- Current SSIM has single shipping calculation
- Adding shipping option selection requires UI work in checkout
- Recommend: MVP uses store's default/cheapest shipping
- Phase 2: Add shipping options endpoint and selection

### Q3: Promo code support for agents

**SSIM Position**: Defer to Phase 2.

**Rationale**:
- Adds complexity to session API
- Promo validation logic exists but not exposed via API
- Not critical for MVP demo
- Phase 2: Add `promoCode` field to session update

### Q4: Partial fulfillment handling

**SSIM Position**: MVP rejects unavailable items.

**Rationale**:
- Partial fulfillment significantly complicates order management
- Current SSIM doesn't support split orders
- Recommend: Agent receives `item_unavailable` error if out of stock
- Phase 3: Backorder/split shipment support

### Q12 (NSIM): Agent-specific webhook events

**SSIM Position**: Agree with NSIM recommendation.

**Rationale**:
- Adding `agentContext` to existing events is simpler
- We already handle `payment.captured`, `payment.failed` etc.
- One event type to handle, filter by `agentContext` presence
- Supports gradual adoption - existing handlers still work

---

## New Questions from SSIM

### Q17: WSIM Mock Service Contract

**Question**: Can WSIM team provide an OpenAPI specification for agent endpoints by end of Week 1, to enable SSIM mock development?

**Context**: Critical for SSIM to start Week 2. Need to know exact request/response formats for:
- Token introspection
- Payment token request
- Step-up webhook payload

### Q18: Token Caching Policy

**Question**: Is SSIM permitted to cache token introspection results for short periods (30-60 seconds)?

**Context**: Performance optimization. Need WSIM team guidance on security implications.

### Q19: Agent Session vs Human Session Interaction

**Question**: Can an agent session coexist with a human session for the same store? What if human adds to cart while agent is building session?

**Context**: Current SSIM uses session-based cart. Need to ensure agent sessions are fully isolated.

### Q20: Rate Limiting Requirements

**Question**: What rate limits should apply to agent APIs? Per-agent? Per-owner? Per-store?

**Context**: Not specified in requirements. Agents could potentially make many rapid requests.

### Q21: WSIM Unavailability Handling

**Question**: What should SSIM do if WSIM becomes unavailable during an active checkout session?

**Context**: Need graceful degradation. Options:
- Fail the session immediately
- Allow retry with exponential backoff
- Hold session and notify agent

---

## Database Changes Assessment

### New Table: `ssim_agent_sessions`

```prisma
model AgentSession {
  id            String   @id @default(cuid())
  storeId       String
  agentId       String
  ownerId       String
  status        String   @default("cart_building")
  cart          Json     @default("{}")
  buyer         Json?
  fulfillment   Json?
  payment       Json?
  mandateId     String?
  messages      Json     @default("[]")
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  expiresAt     DateTime

  store         Store    @relation(fields: [storeId], references: [id])

  @@index([storeId])
  @@index([agentId])
  @@index([expiresAt])
}
```

### Order Table Changes

```prisma
model Order {
  // ... existing fields
  agentId         String?
  agentSessionId  String?
}
```

**Migration Risk**: Low - additive changes only, no data transformation.

---

## Sign-Off Prerequisites

All prerequisites have been resolved:

| # | Prerequisite | Owner | Status |
|---|--------------|-------|--------|
| 1 | WSIM API contract (OpenAPI spec) | WSIM | ✅ In Progress (`docs/openapi-agent.yaml`) |
| 2 | Answer to Q17 (mock contract) | WSIM | ✅ Committed to Week 1 delivery |
| 3 | Answer to Q18 (token caching) | WSIM | ✅ Resolved - 60s TTL approved |
| 4 | Answer to Q19 (session isolation) | Design | ✅ Resolved - Phase 1 isolation confirmed |
| 5 | Agreement on MCP deferral to P2 | PM | ✅ Approved |

**Additional Resolutions:**
- Q20 (Rate limiting): ✅ Resolved - 1000 req/min per agent baseline
- Q21 (WSIM unavailability): ✅ Resolved - Retry with exponential backoff + cache

---

## Formal Sign-Off

The SSIM team formally signs off on the SACP requirements with the following confirmed amendments:

1. **Timeline**: 6-8 weeks (revised from 5-6)
2. **MCP Server**: Deferred to P2 (P1 focuses on webhooks + Schema.org)
3. **Token Caching**: Will implement with 60-second TTL
4. **Session Isolation**: Agent sessions completely independent of human sessions
5. **Rate Limiting**: 1000 req/min per agent baseline
6. **WSIM Unavailability**: Retry with exponential backoff, use cached tokens

---

## Sign-Off Statement

```
I, on behalf of the SSIM (Store Simulator) team, have reviewed the SACP requirements
document dated 2026-01-21 and confirm our team's readiness to proceed with
implementation as specified, with the amendments noted above.

All blocking questions (Q17-Q21) have been satisfactorily resolved.
WSIM has committed to delivering the OpenAPI specification by end of Week 1.

Team: SSIM
Date: 2026-01-21
Status: ✅ SIGNED OFF
```

---

## Contact

**SSIM Team Lead**: [TBD]
**Technical Contact**: SSIM Engineering
**Document Questions**: Add to PROJECT_QA.md or contact team lead
