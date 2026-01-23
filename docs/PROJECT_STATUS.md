# SACP - Project Status & Sign-Off Tracker

**Project**: SimToolBox Agent Commerce Protocol (SACP)
**Project Manager**: [TBD]
**Last Updated**: 2026-01-22 (Agent payments verified working in dev environment)

---

## Executive Summary

| Metric | Status |
|--------|--------|
| Overall Project Health | :green_circle: **ON TRACK** |
| Design Sign-Off | **4 / 4 signed** ✅ (SSIM, WSIM, NSIM, BSIM) |
| Implementation Progress | **WSIM v1.0.7 + SSIM v2.1.1 + NSIM v1.2.0 + BSIM v0.8.0 + mwsim P0 Complete** |
| Dev Deployment | ✅ **ALL SERVICES DEPLOYED** (SSIM, BSIM, NewBank, WSIM, NSIM) |
| Integration Testing | ✅ **ALL TESTS PASSING** |
| Target Launch | TBD |

### ✅ Q30 Resolved - Agent Payments Working

**Issue**: Agent payment tokens from WSIM were missing `card_token`. BSIM could not authorize payments.

**Resolution**:
- WSIM v1.0.6: Added BSIM card token request to agent payment flow ✅ **IMPLEMENTED**
- SSIM v2.1.1: Extract both tokens from JWT and pass to NSIM ✅ **IMPLEMENTED**

**Deployment Order**: WSIM first, then SSIM

**See**: [Q30 in PROJECT_QA.md](PROJECT_QA.md#q30-agent-payment-token-missing-bsim-card_token)

---

## Project Phases

### Phase 1: Design & Planning
| Milestone | Status | Target Date | Actual Date |
|-----------|--------|-------------|-------------|
| Protocol design document | :white_check_mark: Complete | 2026-01-21 | 2026-01-21 |
| Team requirements documents | :white_check_mark: Complete | 2026-01-21 | 2026-01-21 |
| Design review meetings | :white_check_mark: Complete | 2026-01-21 | 2026-01-21 |
| Q&A resolution | :white_check_mark: Complete | 2026-01-21 | 2026-01-21 |
| Design sign-off (all teams) | :white_check_mark: Complete | 2026-01-21 | 2026-01-21 |

### Phase 2: Implementation
| Milestone | Status | Target Date | Actual Date |
|-----------|--------|-------------|-------------|
| WSIM: Agent registration | :white_check_mark: **Complete** | 2026-01-21 | 2026-01-21 |
| WSIM: Payment token API | :white_check_mark: **Complete** | 2026-01-21 | 2026-01-21 |
| WSIM: Step-up flow | :white_check_mark: **Complete** | 2026-01-21 | 2026-01-21 |
| WSIM: Database migration (Dev) | :white_check_mark: **Complete** | 2026-01-21 | 2026-01-21 |
| SSIM: Database migration (Dev) | :white_check_mark: **Complete** | 2026-01-21 | 2026-01-21 |
| NSIM: Database migration (Dev) | :white_check_mark: **Complete** | 2026-01-21 | 2026-01-21 |
| BSIM: Database migration (Dev) | :white_check_mark: **Complete** | 2026-01-21 | 2026-01-21 |
| SSIM: UCP discovery | :white_check_mark: **Complete** | 2026-01-21 | 2026-01-21 |
| SSIM: Checkout session API | :white_check_mark: **Complete** | 2026-01-21 | 2026-01-21 |
| NSIM: Agent context | :white_check_mark: **Complete** | 2026-01-21 | 2026-01-21 |
| BSIM: Agent visibility | :white_check_mark: **Complete** | 2026-01-21 | 2026-01-21 |

### Phase 3: Integration & Testing
| Milestone | Status | Target Date | Actual Date |
|-----------|--------|-------------|-------------|
| Integration testing (Sprint 1) | :white_check_mark: **Complete** | 2026-01-22 | 2026-01-22 |
| End-to-end demo | :white_circle: Not Started | TBD | - |
| Security review | :white_circle: Not Started | TBD | - |
| Documentation finalization | :white_circle: Not Started | TBD | - |

### Phase 4: Launch
| Milestone | Status | Target Date | Actual Date |
|-----------|--------|-------------|-------------|
| Staging deployment | :white_circle: Not Started | TBD | - |
| UAT sign-off | :white_circle: Not Started | TBD | - |
| Production deployment | :white_circle: Not Started | TBD | - |
| Launch announcement | :white_circle: Not Started | TBD | - |

---

## Team Status

### SSIM Team (Store Simulator)

| Item | Status |
|------|--------|
| **Team Lead** | [TBD] |
| **Assigned Developers** | [TBD] |
| **Requirements Reviewed** | :white_check_mark: Complete |
| **Estimate Confirmed** | :white_check_mark: 6-8 weeks confirmed |
| **Design Sign-Off** | ✅ **SIGNED OFF** |
| **Implementation Status** | ✅ **v2.1.0 COMPLETE** |
| **Dev Deployment** | ✅ **DEPLOYED** (DB migrated, pipeline updated from `feature/agentic-support`) |
| **Integration Testing** | ✅ **ALL TESTS PASSING** |

**Current Blockers**: None

**Notes**:
- ~~Estimated effort: ~6-8 weeks~~ → **Completed in 1 day** :rocket:
- Review document: [SSIM_REVIEW.md](teams/SSIM_REVIEW.md)
- 4 original questions responded to (Q1-Q4)
- 5 new questions raised (Q17-Q21) - **ALL RESOLVED**
- Q18 (Token caching) ✅ Implemented - 60s TTL with in-memory cache + webhook invalidation
- Q19 (Session isolation) ✅ Implemented - Separate `agent_sessions` table
- Q20 (Rate limiting) ✅ Implemented - 1000 req/min per agent
- Q21 (WSIM unavailability) ✅ Implemented - Retry with exponential backoff
- MCP server deferred to P2 (approved)

**✅ IMPLEMENTATION COMPLETE (2026-01-21) + BUG FIXES (2026-01-22)**:
> SSIM v2.0.5 released with full SACP P0 implementation:
>
> **Delivered (v2.0.0)**:
> - UCP discovery endpoint at `/.well-known/ucp`
> - Agent authentication middleware with WSIM token introspection
> - Token caching with 60-second TTL (per Q18)
> - Rate limiting at 1000 req/min per agent (per Q20)
> - Retry with exponential backoff on WSIM unavailability (per Q21)
> - Product Catalog API (`/api/agent/v1/products`, search, get by ID)
> - Checkout Session API (create, get, update, complete, cancel)
> - Session state machine with complete isolation from human sessions (per Q19)
> - Mock mode for development without WSIM
>
> **Bug Fixes (v2.0.1 - v2.0.5)**:
> - v2.0.1: Snake_case API responses to align with SACP convention
> - v2.0.2: Webhook-based token cache invalidation (`/api/agent/webhooks/token-revoked`)
> - v2.0.3: Cents-to-dollars conversion for WSIM payment token requests
> - v2.0.4: Accept snake_case `payment_token` and `mandate_id` in checkout
> - v2.0.5: Create orders when valid WSIM payment_token provided (not just mock mode)
>
> **Database Changes** (new table + columns):
> - `agent_sessions` table for agent checkout sessions
> - `agentId`, `agentSessionId` columns on `orders` table
>
> **New Files**:
> - `src/services/wsim-agent.ts` - WSIM agent client with token introspection
> - `src/middleware/agent-auth.ts` - Authentication and rate limiting
> - `src/routes/agent-api.ts` - All agent API endpoints
> - `src/routes/agent-webhooks.ts` - Token revocation webhook endpoint
>
> **Branch**: `feature/agentic-support` - Ready for PR to main

---

### WSIM Team (Wallet Simulator)

| Item | Status |
|------|--------|
| **Team Lead** | [TBD] |
| **Assigned Developers** | [TBD] |
| **Requirements Reviewed** | :white_check_mark: Complete |
| **Estimate Confirmed** | :white_check_mark: ~6-8 weeks confirmed |
| **Design Sign-Off** | ✅ **SIGNED OFF** |
| **Implementation Status** | ✅ **v1.0.7 COMPLETE** |
| **Dev Deployment** | ✅ **DEPLOYED** (from `agentic-support` branch) |
| **Integration Testing** | ✅ **ALL QA TESTS PASSING** |

**Current Blockers**: None - WSIM is NOT blocking any other team

**Notes**:
- ~~Estimated effort: ~6-8 weeks~~ → **Completed in 1 day** :rocket:
- Critical path component - all other teams depend on WSIM
- Review document: [WSIM_REVIEW.md](https://github.com/jordancrombie/wsim/blob/agentic-support/docs/sacp/WSIM_REVIEW.md)
- **Q5-Q9 ✅ RESOLVED** - All WSIM questions now have consensus
- **Q17 ✅ DELIVERED**: OpenAPI spec at [`docs/sacp/openapi-agent.yaml`](https://github.com/jordancrombie/wsim/blob/agentic-support/docs/sacp/openapi-agent.yaml)
- mwsim requirements drafted - [MWSIM_REQUIREMENTS.md](https://github.com/jordancrombie/wsim/blob/agentic-support/docs/sacp/MWSIM_REQUIREMENTS.md)

**✅ IMPLEMENTATION COMPLETE (2026-01-21) + QA BUG FIXES (2026-01-22)**:
> WSIM v1.0.5 released with full SACP P0 implementation + QA fixes:
>
> **Delivered (v1.0.0)**:
> - Agent registration and management API (`/api/mobile/agents/*`)
> - OAuth 2.0 client credentials flow (`/api/agent/v1/oauth/*`)
> - Token introspection endpoint (RFC 7662 compliant)
> - Payment token API (`/api/agent/v1/payments/*`)
> - EST timezone-aware daily/monthly spending limits
> - Step-up authorization flow with push notifications (`/api/mobile/step-up/*`)
>
> **Bug Fixes (v1.0.1 - v1.0.4)**:
> - v1.0.1: Fixed doubled route paths in access-request.ts
> - v1.0.2: Made max active pairing codes configurable via `MAX_ACTIVE_PAIRING_CODES`
> - v1.0.3: Fixed agent access request route path
> - v1.0.4: Fixed token expiry parsing (`parseDuration()` for "1h", "5m" formats), snake_case API responses, agent list filtering (exclude revoked by default)
>
> **v1.0.5 - Token Revocation Webhooks**:
> - `MerchantWebhook` and `WebhookDeliveryLog` models for SSIM notifications
> - Webhook API (`/api/agent/v1/webhooks`) - register, get, delete, logs, test
> - Events: `token.revoked`, `agent.deactivated`, `agent.secret_rotated`
> - HMAC-SHA256 webhook signatures with timestamp for replay protection
> - Integrated into token revocation, agent deletion, secret rotation flows
>
> **Database Changes** (6 new tables total):
> - `agents` - Agent credentials and configuration
> - `agent_access_tokens` - Token revocation tracking
> - `agent_transactions` - Payment audit trail
> - `step_up_requests` - Authorization request state
> - `pairing_codes` - User-generated pairing codes for agent binding
> - `access_requests` - Agent access request tracking
> - `merchant_webhooks` - Webhook registrations for merchants (v1.0.5)
> - `webhook_delivery_logs` - Webhook delivery tracking (v1.0.5)
>
> **New Environment Variables**:
> - `AGENT_JWT_SECRET`, `AGENT_ACCESS_TOKEN_EXPIRY` (supports "1h", "5m" format)
> - `PAYMENT_TOKEN_SECRET`, `PAYMENT_TOKEN_EXPIRY` (supports "1h", "5m" format)
> - `STEP_UP_EXPIRY_MINUTES`, `DAILY_LIMIT_RESET_TIMEZONE`
> - `INTROSPECTION_CLIENT_ID`, `INTROSPECTION_CLIENT_SECRET`
> - `MAX_ACTIVE_PAIRING_CODES` (default: 30 dev, 10 prod)
>
> **Dependencies Added**: nanoid@^5.0.0, luxon@^3.4.0
>
> **Branch**: `agentic-support` - Ready for PR to main

---

### NSIM Team (Payment Network)

| Item | Status |
|------|--------|
| **Team Lead** | [TBD] |
| **Assigned Developers** | [TBD] |
| **Requirements Reviewed** | :white_check_mark: Complete |
| **Estimate Confirmed** | :white_check_mark: ~2 weeks confirmed |
| **Design Sign-Off** | :white_check_mark: Ready (Q10-Q12 resolved) |
| **Implementation Status** | ✅ **v1.2.0 COMPLETE** |
| **Dev Deployment** | ✅ **DEPLOYED** (Build #8 from `feature/agentic-support`) |

**Current Blockers**: None - NSIM is NOT blocking any other team

**Notes**:
- ~~Estimated effort: ~2 weeks~~ → **Completed in 1 day** :rocket:
- Lower complexity, mainly pass-through changes
- Review document: [NSIM_REVIEW.md](teams/NSIM_REVIEW.md)
- **Q10 ✅ RESOLVED** - No validation for MVP, trust the chain
- **Q11 ✅ RESOLVED** - NSIM passes context, BSIM handles risk
- **Q12 ✅ RESOLVED** - Include agentContext in existing webhooks

**✅ FORMAL SIGN-OFF (2026-01-21)**:
> I, on behalf of the NSIM team, have reviewed the SACP requirements document dated 2026-01-21 and confirm our team's readiness to proceed with implementation as specified.
>
> **Scope Confirmed**: P0 (agent context in auth, DB storage, BSIM forwarding) + P1 (webhooks, query filtering)
> **Estimate Confirmed**: ~2 weeks
> **No Blocking Concerns**: All questions resolved with cross-team consensus
> **Dependencies Accepted**: SSIM sends agentContext; BSIM accepts agentContext

**✅ IMPLEMENTATION COMPLETE (2026-01-21)**:
> NSIM v1.2.0 released with full SACP P0 + P1 implementation:
>
> **P0 Delivered** (v1.1.0):
> - Accept `agentContext` in authorization requests
> - Validate required fields (agentId, ownerId, humanPresent) when present
> - Store agent context in payment transactions with database indexes
> - Forward agent context to BSIM for issuer visibility
> - OpenAPI spec v1.3.0 with AgentContext schema
>
> **P1 Delivered** (v1.2.0):
> - Add `agentContext` to all webhook payloads (authorized, captured, voided, refunded, expired, failed)
> - Query endpoint `GET /api/v1/payments?agentId=...` - filter by agent ID
> - Query endpoint `GET /api/v1/payments?ownerId=...` - filter by owner ID
> - Query endpoint `GET /api/v1/payments?humanPresent=...` - filter by human presence
> - AsyncAPI spec v1.1.0, OpenAPI spec v1.4.0
>
> **Database Changes** (new columns on `nsim_payment_transactions`):
> - `agent_id` - Unique agent identifier
> - `agent_owner_id` - Human owner (WSIM user ID)
> - `agent_human_present` - Human presence flag
> - `agent_mandate_id` - Authorization mandate reference
> - `agent_mandate_type` - Mandate type (cart/intent/none)
>
> **Next Steps**:
> - Run database migration in production environment
> - Merge PR to main after migration testing
>
> **Branch**: `feature/agentic-support` - Ready for PR to main after migration testing

---

### BSIM Team (Banking Simulator)

| Item | Status |
|------|--------|
| **Team Lead** | [TBD] |
| **Assigned Developers** | [TBD] |
| **Requirements Reviewed** | :white_check_mark: Complete |
| **Estimate Confirmed** | :white_check_mark: ~1.5-2 weeks confirmed |
| **Design Sign-Off** | ✅ **SIGNED OFF** (Q13-Q15 resolved) |
| **Implementation Status** | ✅ **v0.8.0 COMPLETE** |
| **Dev Deployment** | ✅ **DEPLOYED** (from `feature/agentic-support`) |

**Current Blockers**: None - BSIM prep work complete

**Notes**:
- ~~Estimated effort: ~1.5-2 weeks~~ → **Prep work completed in 1 day** :rocket:
- Primarily UI/visibility changes + bank-level policy (P1 minimal)
- Confirmed NSIM Q11 (risk scoring delegation to BSIM)
- **Q13 ✅ RESOLVED** - Agent badge always shown (no opt-out)
- **Q14 ✅ RESOLVED** - WSIM confirmed ownerId UUID format, maps via BsimEnrollment
- **Q15 ✅ RESOLVED** - BSIM decline authority: P1 minimal scope, must support P2 expansion

**✅ FORMAL SIGN-OFF (2026-01-21)**:
> I, on behalf of the BSIM team, have reviewed the SACP requirements document dated 2026-01-21 and confirm our team's readiness to proceed with implementation as specified.
>
> **Scope Confirmed**: P1 (agent context in authorization, DB storage, transaction history UI) + P2 (filtering, summary, policies)
> **Estimate Confirmed**: ~1.5-2 weeks
> **No Blocking Concerns**: All questions resolved with cross-team consensus
> **Dependencies Accepted**: NSIM forwards agentContext in authorization requests

**✅ IMPLEMENTATION COMPLETE (2026-01-21)**:
> BSIM v0.8.0 released with SACP P1 prep work:
>
> **Delivered**:
> - Agent context columns in `credit_card_transactions` table
> - Agent context columns in `payment_authorizations` for auth→capture propagation
> - `AgentContext` interface in payment network types
> - `PaymentAuthorizationRequest` extended to accept `agentContext` from NSIM
> - SimNetHandler stores agent context during authorize, propagates to capture/refund
> - 🤖 Agent badge UI component in transaction history
> - Transaction detail shows agent ID and "(autonomous)" label
>
> **Database Changes** (new columns):
> - `agent_id` - Agent identifier
> - `agent_owner_id` - Human owner (WSIM user ID)
> - `agent_human_present` - Human presence flag
> - `idx_card_tx_agent` - Index for agent transaction queries
>
> **Next Steps**:
> - Run database migration in production environment
> - P2: Agent transaction filtering, summary card, bank-level policies
>
> **Branch**: `agentic-support` - Ready for PR to main after migration testing

---

## Sprint 1 - Task Assignments

**Sprint Start**: 2026-01-21
**Sprint Goal**: WSIM staging deployment, SSIM agent auth working, prep work for NSIM/BSIM

### WSIM Team

| # | Task | Priority | Status |
|---|------|----------|--------|
| W1 | Run DB migration on dev | P0 | :white_check_mark: **Complete** (tables already existed) |
| W1b | Run DB migration on staging/prod | P0 | :hourglass: Pending |
| W2 | Configure dev env vars | P0 | :white_check_mark: **Complete** (8 Buildkite secrets added) |
| W2b | Configure staging/prod env vars | P0 | :hourglass: Pending |
| W3 | Validate APIs on dev | P0 | :hourglass: In Progress (SSIM introspection configured) |
| W4 | PR `agentic-support` → main | P1 | :white_circle: Blocked by W3 |
| W5 | Implement pairing code generation | P0 | :white_check_mark: **Complete** |
| W6 | Implement access request endpoints | P0 | :white_check_mark: **Complete** |
| W7 | Add `agent.access_request` notification type | P0 | :white_check_mark: **Complete** |
| W8 | Update OpenAPI spec with access-request endpoints | P1 | :white_check_mark: **Complete** |

**New**: Agent-initiated credential flow approved and implemented (see [USER_AGENT_DESIGN.md](USER_AGENT_DESIGN.md))

### SSIM Team

| # | Task | Priority | Status |
|---|------|----------|--------|
| S1 | Build WSIM mock client | P0 | :white_check_mark: **Complete** (`src/services/wsim-agent.ts`) |
| S2 | Implement `/.well-known/ucp` discovery | P0 | :white_check_mark: **Complete** (`src/routes/agent-api.ts`) |
| S3 | Implement agent auth middleware | P0 | :white_check_mark: **Complete** (`src/middleware/agent-auth.ts`) |
| S4 | Add `agent_sessions` table | P1 | :white_check_mark: **Complete** (Prisma schema + migration) |
| S5 | Implement `POST /api/agent/v1/sessions` | P1 | :white_check_mark: **Complete** (full session API) |
| S6 | Configure WSIM introspection credentials | P0 | :white_check_mark: **Complete** (Build #8, mock mode disabled) |

**Note**: SSIM v2.0.0 complete! All Sprint 1 tasks delivered. Real WSIM introspection active. Branch: `feature/agentic-support`

### NSIM Team (Prep Work)

| # | Task | Priority | Status |
|---|------|----------|--------|
| N1 | Add `agentContext` columns to DB | P1 | :white_check_mark: **Complete** |
| N2 | Prepare authorization endpoint changes | P1 | :white_check_mark: **Complete** |
| N3 | Review BSIM forwarding spec | P2 | :white_check_mark: **Complete** |

**Note**: NSIM v1.2.0 complete! All P0+P1 tasks delivered. Branch: `feature/agentic-support`

### BSIM Team (Prep Work)

| # | Task | Priority | Status |
|---|------|----------|--------|
| B1 | Add `agentContext` columns to DB | P1 | :white_check_mark: **Complete** |
| B2 | Design agent badge UI component | P1 | :white_check_mark: **Complete** |
| B3 | Prepare authorization endpoint changes | P2 | :white_check_mark: **Complete** |

**Note**: BSIM v0.8.0 complete! All prep work delivered. Branch: `agentic-support`

### mwsim Team

| # | Task | Priority | Status |
|---|------|----------|--------|
| M1 | Generate pairing code screen | P0 | :white_check_mark: **Complete** |
| M2 | QR scanner for agent binding | P0 | :white_check_mark: **Complete** |
| M3 | Access request approval screen | P0 | :white_check_mark: **Complete** |
| M4 | Agent list screen | P0 | :white_check_mark: **Complete** |
| M5 | Agent detail/edit screen | P1 | :white_circle: Not Started |
| M6 | Delete/revoke agent | P1 | :white_circle: Not Started |
| M7 | Step-up approval screen | P0 | :white_check_mark: **Complete** |
| M8 | Push notification handler | P0 | :white_check_mark: **Complete** |
| M9 | Message Center (client-side aggregation) | P1 | :white_circle: Not Started |

**Note**: mwsim onboarding at [MWSIM_ONBOARDING.md](teams/MWSIM_ONBOARDING.md) | Credential flow design at [USER_AGENT_DESIGN.md](USER_AGENT_DESIGN.md)

**✅ mwsim P0 COMPLETE (2026-01-21)**:
> mwsim P0 tasks delivered with full agent commerce UI:
>
> **Delivered**:
> - Agent list screen (`AgentList.tsx`) - View registered agents, pending requests
> - Generate pairing code screen (`GeneratePairingCode.tsx`) - 15-minute expiring codes
> - QR scanner for agent binding (`AgentQrScanner.tsx`) - Alternative binding method
> - Access request approval screen (`AccessRequestApproval.tsx`) - Review/approve/reject with biometric auth
> - Step-up approval screen (`StepUpApproval.tsx`) - Approve purchases exceeding limits
> - Push notification deep linking for all agent notification types
> - Navigation wiring in App.tsx, Settings menu entry for AI Agents
>
> **New Files**:
> - `app/src/screens/AgentList.tsx`
> - `app/src/screens/GeneratePairingCode.tsx`
> - `app/src/screens/AgentQrScanner.tsx`
> - `app/src/screens/AccessRequestApproval.tsx`
> - `app/src/screens/StepUpApproval.tsx`
> - `app/src/services/agent-api.ts`
> - `app/src/types/agent.ts`
>
> **Modified Files**:
> - `app/App.tsx` - Navigation, deep linking, screen rendering
> - `app/src/screens/Settings.tsx` - AI Agents menu entry
> - `app/src/services/notifications.ts` - Agent notification types and handlers
>
> **Tested**: Dev build installed on iPhone, pairing code generation verified working
>
> **Remaining P1**: Agent detail/edit screen (M5), Delete/revoke agent (M6), Message Center (M9)

---

## Sprint 2 - Payment Processing Integration

**Sprint Start**: TBD
**Sprint Goal**: Wire agent checkout to existing NSIM payment flow with agentContext

### ✅ Q29 RESOLVED - Integration Already Exists

**Finding**: SSIM already has complete NSIM payment integration for human checkout!

**Existing Payment Service** (`src/services/payment.ts`):
- `authorizePayment()` - Already calls NSIM `/api/v1/payments/authorize`
- `capturePayment()` - Already calls NSIM capture
- `voidPayment()`, `refundPayment()` - Already implemented

**Existing Payment Flows** (`src/routes/payment.ts`):
- Bank payment (BSIM OAuth) → NSIM ✅
- Wallet redirect (WSIM OAuth) → NSIM ✅
- Popup wallet payment → NSIM ✅
- Mobile wallet (mwsim) → NSIM ✅

**Sprint 2 Scope (Significantly Reduced)**:
- Only need to add `agentContext` to `AuthorizeParams` interface
- Pass agentContext from agent checkout to existing `authorizePayment()` function

**Estimated Effort**: ~2 days (down from original 5-7 days)

**See Q29 in [PROJECT_QA.md](PROJECT_QA.md) for full resolution.**

### SSIM Team (Sprint 2)

| # | Task | Priority | Status | Notes |
|---|------|----------|--------|-------|
| ~~S7~~ | ~~Implement NSIM payment client~~ | N/A | ✅ **Already Exists** | `src/services/payment.ts` |
| S8 | Add `agentContext` to `AuthorizeParams` | P0 | ✅ **Complete** | v2.1.0 - Interface + body param |
| S8b | Pass agentContext from agent checkout | P0 | ✅ **Complete** | v2.1.0 - Wired in agent-api.ts |
| S9 | Test authorize/decline with agentContext | P0 | ✅ **Complete** | Transactions verified in dev |
| ~~S10~~ | ~~Link order to payment reference~~ | N/A | ✅ **Already Done** | Orders already have `transactionId` |
| ~~S11~~ | ~~Implement capture on fulfillment~~ | N/A | ✅ **Already Exists** | `capturePayment()` exists |

### NSIM Team (Sprint 2)

| # | Task | Priority | Status | Notes |
|---|------|----------|--------|-------|
| N4 | Confirm authorization API contract | P0 | ✅ **Confirmed** | NSIM v1.2.0 accepts agentContext |
| N5 | Validate agentContext fields | P0 | ✅ **Already Done** | NSIM v1.2.0 complete |

### BSIM Team (Sprint 2)

| # | Task | Priority | Status | Notes |
|---|------|----------|--------|-------|
| B4 | Confirm agentContext receipt from NSIM | P0 | ✅ **Confirmed** | BSIM v0.8.0 ready |
| B5 | Test owner verification (Q14) | P1 | :white_circle: Not Started | BsimEnrollment lookup |

### mwsim Team (Sprint 2)

| # | Task | Priority | Status | Notes |
|---|------|----------|--------|-------|
| M5 | Agent detail/edit screen | P1 | :white_circle: Not Started | `PATCH /api/mobile/agents/:id` |
| M6 | Delete/revoke agent | P1 | :white_circle: Not Started | With confirmation dialog |
| M9 | Message Center | P1 | :white_circle: Not Started | Client-side aggregation |

---

## Design Sign-Off

Each team must review their requirements document and sign off before implementation begins.

### Sign-Off Checklist

**By signing off, each team confirms:**
- [ ] Requirements have been reviewed and understood
- [ ] Effort estimates are realistic
- [ ] No blocking technical concerns
- [ ] Team has capacity to deliver in proposed timeline
- [ ] Open questions have been addressed or are non-blocking

### Sign-Off Record

| Team | Reviewer | Date | Status | Comments |
|------|----------|------|--------|----------|
| SSIM | SSIM Team | 2026-01-21 | ✅ **SIGNED OFF** | Q17-Q21 resolved; formal sign-off provided |
| WSIM | WSIM Team | 2026-01-21 | ✅ **SIGNED OFF** | Q5-Q9 resolved; OpenAPI spec delivered |
| NSIM | NSIM Team | 2026-01-21 | ✅ **SIGNED OFF** | Q10-Q12 resolved; formal sign-off provided |
| BSIM | BSIM Team | 2026-01-21 | ✅ **SIGNED OFF** | Q13-Q15 resolved; formal sign-off provided |

**Sign-Off Format**:
```
I, [Name], on behalf of the [Team] team, have reviewed the SACP requirements
document dated 2026-01-21 and confirm our team's readiness to proceed with
implementation as specified.

Signature: _______________
Date: _______________
```

---

## Risk Register

| ID | Risk | Probability | Impact | Mitigation | Owner | Status |
|----|------|-------------|--------|------------|-------|--------|
| R1 | WSIM delays block all teams | ~~Medium~~ | ~~High~~ | ~~Start WSIM first, parallel mock development~~ | PM | ✅ **Mitigated** - WSIM v1.0.0 complete |
| R2 | Industry standards evolve during development | Low | Medium | Design for extensibility, monitor UCP/AP2 updates | Design | Open |
| R3 | Step-up UX causes user friction | Medium | Medium | User testing before launch, adjustable thresholds | WSIM | Open |
| R4 | Security vulnerabilities in mandate signing | Low | High | Security review, follow AP2 patterns | WSIM | Open (P1) |
| R5 | Integration complexity underestimated | Medium | Medium | Early integration testing, clear API contracts | PM | Open |
| R6 | Database migration issues in production | Low | Medium | Test migration on staging, backup before deploy | WSIM | Open |

---

## Dependencies

```
┌─────────────────────────────────────────────────────────────┐
│                    DEPENDENCY GRAPH                          │
│                                                              │
│    ┌──────┐                                                  │
│    │ WSIM │◄─── All teams depend on WSIM agent auth         │
│    └──┬───┘                                                  │
│       │                                                      │
│       ├────────────────┬────────────────┐                   │
│       ▼                ▼                ▼                   │
│    ┌──────┐        ┌──────┐        ┌──────┐                │
│    │ SSIM │───────>│ NSIM │───────>│ BSIM │                │
│    └──────┘        └──────┘        └──────┘                │
│                                                              │
│    SSIM needs WSIM tokens to test checkout                  │
│    NSIM needs SSIM to send agent context                    │
│    BSIM needs NSIM to forward agent context                 │
└─────────────────────────────────────────────────────────────┘
```

### Critical Path
1. **WSIM**: Agent registration + OAuth endpoints (Week 1-3)
2. **SSIM**: UCP discovery + basic session API (Week 2-4, can start with mock WSIM)
3. **WSIM**: Payment token + step-up flow (Week 3-6)
4. **SSIM**: Full checkout integration (Week 5-6)
5. **NSIM**: Agent context support (Week 4-5)
6. **BSIM**: Agent visibility (Week 5-6)
7. **Integration Testing**: (Week 7-8)

---

## Meeting Schedule

| Meeting | Frequency | Participants | Next Date |
|---------|-----------|--------------|-----------|
| Design Review | One-time | All teams | TBD |
| Sprint Planning | Bi-weekly | All teams | TBD |
| Standup | Weekly | Team leads | TBD |
| Demo | End of sprint | All teams + stakeholders | TBD |

---

## Action Items

| ID | Action | Owner | Due Date | Status |
|----|--------|-------|----------|--------|
| A1 | Schedule design review meeting | PM | TBD | ✅ Complete |
| A2 | Assign team leads for each component | PM | TBD | Open |
| A3 | Review and respond to open questions | All Teams | TBD | ✅ Complete |
| A4 | Confirm effort estimates | Team Leads | TBD | ✅ Complete |
| A5 | Complete design sign-off | Team Leads | TBD | ✅ Complete (4/4) |
| A6 | Create GitHub issues for Phase 1 work | PM | TBD | Open |
| A7 | Deliver OpenAPI spec for agent endpoints (Q17) | WSIM | Week 1 | ✅ Delivered |
| A8 | Implement WSIM SACP P0 | WSIM | 2026-01-21 | ✅ **v1.0.0 Complete** |
| A9 | Run database migration on dev | All Teams | 2026-01-21 | ✅ **Complete** (SSIM, BSIM, NewBank, WSIM, NSIM) |
| A9b | Run database migration on staging/prod | All Teams | TBD | :hourglass: Pending |
| A10 | Configure dev environment variables | DevOps | 2026-01-21 | ✅ **Complete** |
| A10b | Configure production environment variables | DevOps | TBD | :hourglass: Pending |
| A11 | Begin SSIM implementation | SSIM | 2026-01-21 | ✅ **v2.0.0 Complete** |
| A12 | mwsim agent management UI | mwsim | 2026-01-21 | ✅ **P0 Complete** |
| A13 | Dev integration testing (Sprint 1) | All Teams | 2026-01-22 | ✅ **COMPLETE** |
| A14 | SSIM bug fixes (v2.0.1-v2.0.5) | SSIM | 2026-01-22 | ✅ **Complete** |
| A15 | WSIM QA bug fixes (v1.0.1-v1.0.4) | WSIM | 2026-01-22 | ✅ **Complete** |
| A16 | WSIM token revocation webhooks (v1.0.5) | WSIM | 2026-01-22 | ✅ **Complete** |
| A17 | Clear dev environment for Phase 2 | DevOps | 2026-01-22 | ✅ **Complete** |
| A18 | Phase 2 planning | PM | TBD | :yellow_circle: **In Progress** |
| A19 | Review Q29 payment processing integration | SSIM, NSIM, BSIM | 2026-01-22 | ✅ **Resolved** - SSIM already has NSIM integration |
| A20 | Sprint 2 kickoff | PM | TBD | :white_circle: Ready to Start |

---

## Communication Plan

| Audience | Channel | Frequency | Content |
|----------|---------|-----------|---------|
| Team Leads | Slack #sacp-leads | Daily | Blockers, decisions |
| All Teams | Slack #sacp-project | Weekly | Status updates |
| Stakeholders | Email | Bi-weekly | Executive summary |
| Public | GitHub | As needed | Documentation updates |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-21 | Design Team | Initial document |
| 1.1 | 2026-01-21 | WSIM Team | Q5-Q9 resolved, Q14 confirmed, Q17 in progress |
| 1.2 | 2026-01-21 | PM | Q10, Q13, Q15 resolved; NSIM/BSIM ready for sign-off |
| 1.3 | 2026-01-21 | NSIM Team | **NSIM FORMAL SIGN-OFF** - First team to complete sign-off |
| 1.4 | 2026-01-21 | SSIM Team | **SSIM FORMAL SIGN-OFF** - Q17-Q21 resolved; ready for implementation |
| 1.5 | 2026-01-21 | BSIM Team | **BSIM FORMAL SIGN-OFF** - Third team to complete sign-off |
| 1.6 | 2026-01-21 | WSIM Team | **WSIM FORMAL SIGN-OFF** - All 4 teams signed off! OpenAPI spec delivered. |
| 2.0 | 2026-01-21 | WSIM Team | **WSIM v1.0.0 IMPLEMENTATION COMPLETE** - All P0 features implemented. Pending DB migration. |
| 2.1 | 2026-01-21 | PM | Added Sprint 1 task assignments; mwsim onboarding document created |
| 2.2 | 2026-01-21 | NSIM Team | **NSIM v1.1.0 IMPLEMENTATION COMPLETE** - All P0 features implemented. Pending DB migration. |
| 2.3 | 2026-01-21 | BSIM Team | **BSIM v0.8.0 IMPLEMENTATION COMPLETE** - All P1 prep work implemented. Pending DB migration. |
| 2.4 | 2026-01-21 | NSIM Team | **NSIM v1.2.0 P1 COMPLETE** - Webhooks with agentContext + query filtering. |
| 2.5 | 2026-01-21 | DevOps | **DEV DEPLOYMENT COMPLETE** - All services deployed to dev environment with SACP support. |
| 2.6 | 2026-01-21 | SSIM Team | **SSIM v2.0.0 IMPLEMENTATION COMPLETE** - All P0 features implemented. UCP, auth middleware, session API. |
| 2.7 | 2026-01-21 | mwsim Team | **mwsim P0 IMPLEMENTATION COMPLETE** - All P0 screens implemented. Agent list, pairing code, QR scanner, access request approval, step-up approval, push notification handling. |
| 2.8 | 2026-01-22 | DevOps | **SSIM INTROSPECTION CONFIGURED** - SSIM Build #8 deployed with real WSIM introspection credentials. Mock mode disabled. SSIM ↔ WSIM token validation now active. |
| 2.9 | 2026-01-22 | SSIM Team | **SSIM v2.0.5 BUG FIXES** - Fixed snake_case API (v2.0.1), added webhook invalidation (v2.0.2), cents-to-dollars conversion (v2.0.3), snake_case checkout params (v2.0.4), real payment_token handling (v2.0.5). |
| 3.0 | 2026-01-22 | QA | **SPRINT 1 INTEGRATION TESTING COMPLETE** - All 6 test flows passing. Ready for Phase 2. |
| 3.1 | 2026-01-22 | WSIM Team | **WSIM v1.0.4 QA BUG FIXES** - Token expiry parsing (parseDuration for "1h" format), snake_case API responses, agent list filtering. |
| 3.2 | 2026-01-22 | WSIM Team | **WSIM v1.0.5 WEBHOOK SYSTEM** - Token revocation webhooks for SSIM. MerchantWebhook model, HMAC-SHA256 signatures, dispatch on revoke/delete/rotate. |
| 3.3 | 2026-01-22 | QA | **ALL QA TESTS PASSING** - Sprint 1 complete. Dev environment cleared. Ready for Phase 2. |
| 3.4 | 2026-01-22 | PM | **SPRINT 2 PLANNING** - Identified critical gap: SSIM not processing payments via NSIM. Added Q29 for team review. Sprint 2 tasks proposed. |
| 3.5 | 2026-01-22 | SSIM Team | **Q29 RESOLVED** - SSIM already has complete NSIM payment integration (`src/services/payment.ts`). Sprint 2 scope reduced to ~2 days (add agentContext to existing flow). |
| 3.6 | 2026-01-22 | SSIM Team | **SSIM v2.1.0 SPRINT 2 COMPLETE** - Added agentContext to payment authorization. Agent checkouts now process through NSIM → BSIM. 🤖 Agent badges visible in BSIM. |
| 3.7 | 2026-01-23 | DevOps | **Q30 OPENED - CRITICAL BLOCKER** - Agent payments failing. WSIM payment token missing `card_token`. WSIM+SSIM code changes required. See PROJECT_QA.md for details. |
| 3.8 | 2026-01-22 | SSIM Team | **SSIM v2.1.1 Q30 FIX IMPLEMENTED** - Extract `card_token` from WSIM JWT. Graceful error when token missing. |
| 3.9 | 2026-01-22 | WSIM Team | **WSIM v1.0.6 Q30 FIX IMPLEMENTED** - Added `card_token` to payment JWT. Requests BSIM card token before generating JWT (same pattern as human flow). Q30 fully resolved. |
| 4.0 | 2026-01-22 | QA | **🎉 AGENT PAYMENTS WORKING IN DEV** - End-to-end agent payment flow verified. Transactions processing through full stack: Agent → SSIM → NSIM → BSIM. Agent badges visible in BSIM transaction history. Sprint 2 complete! |
| 4.1 | 2026-01-22 | WSIM Team | **WSIM v1.0.7 DISCOVERY ENDPOINTS** - Added `/.well-known/openapi.json`, `/.well-known/agent-api`, `/.well-known/oauth-authorization-server`. External AI agents can now programmatically discover WSIM capabilities. |

---

## Development Deployment Status

**Deployment Date**: 2026-01-21
**Environment**: Development (192.168.1.96 - Local Docker)
**Branch**: `feature/agentic-support`

### Deployment Summary

| Service | Database Migration | Pipeline Updated | Build # | Health Endpoint |
|---------|-------------------|------------------|---------|-----------------|
| **SSIM** | ✅ `agent_sessions` table + order columns | ✅ Agent env vars + introspection creds | #8 | https://ssim-dev.banksim.ca/health |
| **Regalmoose** | ✅ (shared with SSIM) | ✅ Agent env vars + introspection creds | #8 | https://regalmoose.ca/health |
| **BSIM** | ✅ Agent columns on cards/transactions | ✅ Already configured | Complete | https://dev.banksim.ca/api/health |
| **NewBank** | ✅ Agent columns on cards/transactions | ✅ Already configured | Complete | https://newbank-dev.banksim.ca/api/health |
| **WSIM** | ✅ Tables already existed | ✅ 8 agent env vars added | #1 | https://wsim-dev.banksim.ca/api/health |
| **NSIM** | ✅ Agent columns on transactions | ✅ Already configured | #8 | https://payment-dev.banksim.ca/health |

### Database Changes Applied

| Database | Tables/Columns Added |
|----------|---------------------|
| `ssim` | `agent_sessions` table; `agentId`, `agentSessionId` on `orders` |
| `bsim` | `agentId`, `agentOwnerId`, `agentMandateId`, `agentMandateType`, `agentHumanPresent` on `cards` and `transactions` |
| `newbank` | Same as `bsim` (shared codebase) |
| `wsim` | Tables already existed: `agents`, `agent_access_tokens`, `agent_transactions`, `step_up_requests` |
| `nsim` | `agent_id`, `agent_owner_id`, `agent_human_present`, `agent_mandate_id`, `agent_mandate_type` on `nsim_payment_transactions` |

### Buildkite Secrets Added

| Secret Name | Environment | Service |
|-------------|-------------|---------|
| `WSIM_AGENT_JWT_SECRET_DEV` | Dev | WSIM |
| `WSIM_PAYMENT_TOKEN_SECRET_DEV` | Dev | WSIM |
| `WSIM_INTROSPECTION_CLIENT_ID_DEV` | Dev | WSIM |
| `WSIM_INTROSPECTION_CLIENT_SECRET_DEV` | Dev | WSIM |
| `WSIM_AGENT_JWT_SECRET_PROD` | Prod | WSIM |
| `WSIM_PAYMENT_TOKEN_SECRET_PROD` | Prod | WSIM |
| `WSIM_INTROSPECTION_CLIENT_ID_PROD` | Prod | WSIM |
| `WSIM_INTROSPECTION_CLIENT_SECRET_PROD` | Prod | WSIM |
| `SSIM_WSIM_INTROSPECTION_CLIENT_ID` | Dev | SSIM |
| `SSIM_WSIM_INTROSPECTION_CLIENT_SECRET` | Dev | SSIM |
| `SSIM_WSIM_INTROSPECTION_CLIENT_ID_PROD` | Prod | SSIM |
| `SSIM_WSIM_INTROSPECTION_CLIENT_SECRET_PROD` | Prod | SSIM |

### Verification Results (2026-01-22)

| Service | Health Endpoint | Status | Version |
|---------|-----------------|--------|---------|
| **SSIM** | ssim-dev.banksim.ca/health | ✅ Healthy | v2.1.1 |
| **Regalmoose** | regalmoose.ca/health | ✅ Healthy | v2.1.1 |
| **BSIM** | dev.banksim.ca/api/health | ✅ Healthy | v0.8.0 |
| **NewBank** | newbank-dev.banksim.ca/health | ✅ Healthy | - |
| **WSIM** | wsim-dev.banksim.ca/api/health | ✅ Healthy | v1.0.7 |
| **NSIM** | payment-dev.banksim.ca/health | ✅ Healthy | - |

### Integration Test Results (2026-01-22)

| Flow | Test | Status |
|------|------|--------|
| 01 | UCP Discovery | ✅ Pass |
| 02 | Product Catalog | ✅ Pass |
| 03 | Checkout Flow (with step-up) | ✅ Pass |
| 04 | Auto-approved Purchase | ✅ Pass |
| 05 | Session Management | ✅ Pass |
| 06 | Agent Revocation | ✅ Pass |
| 07 | Token Expiry (1h) | ✅ Pass (fixed in v1.0.4) |
| 08 | Snake_case API Responses | ✅ Pass (fixed in v1.0.4) |
| 09 | Agent List Filtering | ✅ Pass (fixed in v1.0.4) |

**UCP Discovery**: ✅ `https://ssim-dev.banksim.ca/.well-known/ucp` returns valid merchant config

**SSIM Token Introspection**: ✅ Mock mode disabled, using real WSIM introspection credentials (Build #8)

**Token Revocation Webhooks**: ✅ WSIM v1.0.5 - SSIM can register webhooks for real-time revocation notifications

### Verification Commands

```bash
# Check all dev health endpoints
for url in \
  "https://ssim-dev.banksim.ca/health" \
  "https://regalmoose.ca/health" \
  "https://dev.banksim.ca/api/health" \
  "https://newbank-dev.banksim.ca/health" \
  "https://wsim-dev.banksim.ca/api/health" \
  "https://payment-dev.banksim.ca/health"; do \
  echo "Checking $url"; curl -sk "$url" | jq -r ".version // .status // \"OK\""; done

# Check SSIM agent discovery endpoint
curl -sk https://ssim-dev.banksim.ca/.well-known/ucp
```

### Next Steps for Production Deployment

1. [ ] Run database migrations on production RDS (via SSM)
2. [x] Verify Buildkite prod secrets are configured (WSIM ✅, SSIM ✅)
3. [ ] Trigger production deployments from `main` branch (after PR merge)
4. [ ] Verify production health endpoints
5. [ ] Run integration tests

---

## Appendix: Effort Summary

| Team | Estimated Effort | Actual | Dependencies | Status |
|------|------------------|--------|--------------|--------|
| WSIM | 6-8 weeks | **2 days** | None | ✅ **v1.0.7 Complete** (incl. QA fixes + webhooks + Q30 fix + discovery) |
| SSIM | 6-8 weeks | **2 days** | WSIM OAuth | ✅ **v2.1.1 Complete** (Sprint 1+2+Q30) |
| NSIM | 2 weeks | **1 day** | SSIM checkout | ✅ **v1.2.0 Complete** (P0+P1) |
| BSIM | 1.5-2 weeks | **1 day** | NSIM context | ✅ **v0.8.0 Complete** |
| mwsim | 3-4 weeks | **1 day** | WSIM APIs | ✅ **P0 Complete** |
| Integration | 1 week | **1 day** | All services | ✅ **All QA Tests Passing** |
| **Total** | **~8 weeks** (parallel) | **2 days** | | **Sprint 1 Complete** |

---

## Contact

**Project Manager**: [TBD]
**Technical Lead**: [TBD]
**Stakeholder**: [TBD]

**Repository**: https://github.com/jordancrombie/agents
