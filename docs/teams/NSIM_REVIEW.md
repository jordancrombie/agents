# SACP - NSIM Requirements Review

**Reviewer**: NSIM Team
**Date**: 2026-01-21
**Status**: Review Complete - Ready for Discussion

---

## Executive Summary

NSIM's role in SACP is well-defined and appropriately scoped. The requirements are primarily **pass-through changes** with visibility enhancements. The 2-week estimate is realistic given our current codebase state.

**Recommendation**: ✅ **Proceed with minor clarifications**

---

## Requirements Analysis

### P0 - Critical (Phase 1)

#### 1. Accept Agent Context in Authorization ✅

**Assessment**: Straightforward extension of existing endpoint.

**Current State**:
```typescript
// src/routes/payment.ts - authorize endpoint
const { merchantId, amount, currency, cardToken, orderId, description, metadata } = req.body;
```

**Required Changes**:
- Add `agentContext` to request body validation
- Pass through to payment service
- Store in transaction record

**Effort**: 1-2 days ✅ Agree with estimate

**Implementation Notes**:
- Use optional chaining - agent context is optional (not all payments are agent-initiated)
- Validate field types if present: `agentId`, `ownerId`, `humanPresent` are required when context exists

---

#### 2. Store Agent Context in Transactions ✅

**Assessment**: Simple schema extension. Follows our existing patterns.

**Required Schema Changes** (prisma/schema.prisma):
```prisma
model PaymentTransaction {
  // ... existing fields ...

  // NEW: Agent context
  agentId          String?   @map("agent_id")
  agentOwnerId     String?   @map("agent_owner_id")
  agentHumanPresent Boolean? @map("agent_human_present")
  agentMandateId   String?   @map("agent_mandate_id")
  agentMandateType String?   @map("agent_mandate_type")  // 'cart' | 'intent' | 'none'

  // Index for agent queries
  @@index([agentId], map: "idx_tx_agent_id")
  @@index([agentOwnerId], map: "idx_tx_agent_owner_id")
}
```

**Effort**: 1 day ✅ Agree with estimate

**Implementation Notes**:
- Need new migration file (`prisma migrate dev --name add_agent_context`)
- Consider composite index on `(agentId, createdAt)` for agent history queries

---

#### 3. Forward Agent Context to BSIM ✅

**Assessment**: Straightforward. BSIM client already exists.

**Current BSIM Client** (`src/clients/bsim.ts`):
```typescript
async authorize(params: BsimAuthorizeParams): Promise<BsimAuthorizeResponse>
```

**Required Changes**:
- Extend `BsimAuthorizeParams` interface with optional `agentContext`
- Include in BSIM HTTP request body
- ⚠️ **Confirm BSIM API is ready to accept this field** (dependency)

**Effort**: 1-2 days ✅ Agree with estimate

**Question for BSIM Team**:
> Will BSIM accept `agentContext` before the BSIM team completes their implementation?
> Need graceful handling if BSIM returns validation error for unknown field.

---

### P1 - Important (Phase 2)

#### 4. Include Agent Context in Webhooks ✅

**Assessment**: Simple addition to webhook payload.

**Current Webhook Payload** (`src/types/webhook.ts`):
```typescript
export interface WebhookPayloadData {
  transactionId: string;
  merchantId: string;
  orderId: string;
  amount: number;
  currency: string;
  status: string;
}
```

**Required Changes**:
```typescript
export interface WebhookPayloadData {
  // ... existing fields ...
  agentContext?: {
    agentId: string;
    ownerId: string;
    humanPresent: boolean;
  };
}
```

**Effort**: 1-2 days ✅ Agree with estimate

**Implementation Notes**:
- Only include if transaction has agent context (don't send empty object)
- Update AsyncAPI spec (`asyncapi.yaml`)

---

#### 5. Transaction Query Filtering ✅

**Assessment**: Simple query parameter additions.

**New Query Parameters**:
- `GET /api/v1/payments?agentId=agent_abc123`
- `GET /api/v1/payments?ownerId=user_xyz789`
- `GET /api/v1/payments?humanPresent=false`

**Effort**: 1-2 days ✅ Agree with estimate

**Implementation Notes**:
- Add to existing list endpoint
- Use Prisma `where` clause filtering
- Update OpenAPI spec

---

### P2 - Nice to Have (Phase 3)

#### 6. Agent Risk Signals ⚠️

**Assessment**: This needs clarification. See Q11 in PROJECT_QA.md.

**Concern**:
- NSIM doesn't have agent history - that's in WSIM
- Calculating `agentAge`, `agentTransactionCount`, `velocityScore` requires WSIM integration
- This could add latency and complexity

**Recommendation**:
> **Defer risk scoring to BSIM.** NSIM should pass agent context as-is.
> If risk signals are needed, BSIM can query WSIM directly or receive signals in the mandate.

**Effort**: If implemented as specified: 3-5 days. If deferred: 0 days.

---

#### 7. Agent Transaction Reporting ⚠️

**Assessment**: Nice to have, but low priority for MVP.

**Recommendation**:
> Defer to Phase 3. Focus on core functionality first.
> Reporting can be built once we have real transaction data with agent context.

---

## Open Questions - NSIM Responses

### Q10: Agent Context Validation

**Question**: Should NSIM validate agent context against WSIM?

**NSIM Recommendation**: ❌ **No validation for MVP**

**Rationale**:
1. Adds latency to every agent transaction
2. Creates WSIM dependency (what if WSIM is down?)
3. SSIM received the token from WSIM - trust the chain
4. Payment token is already validated by BSIM (who issued it)

**Alternative**: Log agent context for auditing. Flag anomalies in reporting (Phase 3).

---

### Q11: Risk Scoring Delegation

**Question**: What level of risk scoring should NSIM perform?

**NSIM Recommendation**: ✅ **Delegate entirely to BSIM**

**Rationale**:
1. BSIM already has risk/fraud infrastructure
2. BSIM has cardholder history and spending patterns
3. NSIM is a routing layer - keep it simple
4. Risk data (velocity, patterns) would need WSIM integration

**What NSIM should provide to BSIM**:
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

**BSIM decides**: approve, decline, or flag for review.

---

### Q12: Agent-Specific Webhook Events

**Question**: Should we add `payment.agent_transaction` webhook event type?

**NSIM Recommendation**: ❌ **No - include context in existing events**

**Rationale**:
1. Simpler for merchants - one event type to handle
2. Agent context is additive, not a different flow
3. Merchants can filter by `agentContext` presence if needed
4. Reduces webhook type proliferation

**Proposed approach**:
```json
{
  "type": "payment.captured",  // Existing event type
  "data": {
    "transactionId": "tx_...",
    "agentContext": { ... }    // Present if agent-initiated
  }
}
```

---

## Dependencies & Blockers

| Dependency | Owner | Status | Impact on NSIM |
|------------|-------|--------|----------------|
| BSIM accepts `agentContext` in authorize | BSIM | Unknown | Can't forward until ready |
| SSIM sends `agentContext` in authorize | SSIM | Unknown | Can't test until ready |
| Schema migration to production | Ops | Pending | Need migration plan |

**Recommendation**: NSIM can start development immediately using mocks. Integration testing requires SSIM/BSIM readiness.

---

## Effort Estimate Validation

| Task | Spec Estimate | Our Estimate | Notes |
|------|---------------|--------------|-------|
| Accept agent context | 1-2 days | 1-2 days | ✅ Agree |
| Database schema update | 1 day | 1 day | ✅ Agree |
| Forward context to BSIM | 1-2 days | 1-2 days | ✅ Agree |
| Include in webhooks | 1-2 days | 1 day | Slightly optimistic |
| Query filtering | 1-2 days | 1-2 days | ✅ Agree |
| API documentation | 1 day | 1 day | ✅ Agree |
| Testing | 2-3 days | 2-3 days | ✅ Agree |
| **Total** | **~2 weeks** | **~2 weeks** | ✅ Agree |

**Confidence**: High. This is well-defined work with no architectural changes.

---

## API Specification Updates Required

### OpenAPI (openapi.yaml)

1. Add `AgentContext` schema component
2. Add `agentContext` to `PaymentAuthorizationRequest`
3. Add query parameters to `GET /payments`
4. Bump version to 1.3.0

### AsyncAPI (asyncapi.yaml)

1. Add `agentContext` to webhook payload schema
2. Bump version to 1.1.0

---

## Sign-Off Checklist

- [x] Requirements have been reviewed and understood
- [x] Effort estimates are realistic (~2 weeks)
- [x] No blocking technical concerns
- [ ] Team has capacity to deliver *(need to confirm sprint availability)*
- [x] Open questions have responses (Q10, Q11, Q12)

---

## Recommended Next Steps

1. **Confirm capacity** for ~2 week implementation window (Week 4-5 per project plan)
2. **Add Q10/Q11/Q12 responses** to PROJECT_QA.md
3. **Schedule design review** with SSIM/BSIM to align on agent context format
4. **Create feature branch** `feature/agentic-support` ✅ Done
5. **Begin implementation** once WSIM OAuth is ready (Week 4)

---

## Contact

**NSIM Review**: [Auto-generated]
**Date**: 2026-01-21
**Branch**: `feature/agentic-support`
