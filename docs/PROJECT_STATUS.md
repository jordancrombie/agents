# SACP - Project Status & Sign-Off Tracker

**Project**: SimToolBox Agent Commerce Protocol (SACP)
**Project Manager**: [TBD]
**Last Updated**: 2026-01-21

---

## Executive Summary

| Metric | Status |
|--------|--------|
| Overall Project Health | :green_circle: In Progress |
| Design Sign-Off | **4 / 4 signed** ✅ (SSIM, WSIM, NSIM, BSIM) |
| Implementation Progress | **WSIM v1.0.0 + NSIM v1.1.0 Complete** (pending DB migrations) |
| Target Launch | TBD |

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
| WSIM: Database migration | :hourglass: Pending | TBD | - |
| SSIM: UCP discovery | :white_circle: Not Started | TBD | - |
| SSIM: Checkout session API | :white_circle: Not Started | TBD | - |
| NSIM: Agent context | :white_check_mark: **Complete** | 2026-01-21 | 2026-01-21 |
| BSIM: Agent visibility | :white_circle: Not Started | TBD | - |

### Phase 3: Integration & Testing
| Milestone | Status | Target Date | Actual Date |
|-----------|--------|-------------|-------------|
| Integration testing | :white_circle: Not Started | TBD | - |
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
| **Implementation Status** | Not Started |

**Current Blockers**: None

**Notes**:
- Original estimate: ~5-6 weeks → **Revised: 6-8 weeks** ✅ Confirmed
- Review document: [SSIM_REVIEW.md](teams/SSIM_REVIEW.md)
- 4 original questions responded to (Q1-Q4)
- 5 new questions raised (Q17-Q21) - **ALL RESOLVED**
- Q17 (WSIM API contract) ✅ In Progress - WSIM committed to Week 1 delivery
- Q18 (Token caching) ✅ Resolved - 60s TTL approved
- Q19 (Session isolation) ✅ Resolved - Phase 1 isolation confirmed
- Q20 (Rate limiting) ✅ Resolved - 1000 req/min baseline
- Q21 (WSIM unavailability) ✅ Resolved - Retry + cache
- MCP server deferred to P2 (approved)
- **Ready to begin implementation Week 2 with WSIM mocks**

---

### WSIM Team (Wallet Simulator)

| Item | Status |
|------|--------|
| **Team Lead** | [TBD] |
| **Assigned Developers** | [TBD] |
| **Requirements Reviewed** | :white_check_mark: Complete |
| **Estimate Confirmed** | :white_check_mark: ~6-8 weeks confirmed |
| **Design Sign-Off** | ✅ **SIGNED OFF** |
| **Implementation Status** | ✅ **v1.0.0 COMPLETE** (pending DB migration) |

**Current Blockers**: None - WSIM is NOT blocking any other team

**Notes**:
- ~~Estimated effort: ~6-8 weeks~~ → **Completed in 1 day** :rocket:
- Critical path component - all other teams depend on WSIM
- Review document: [WSIM_REVIEW.md](https://github.com/jordancrombie/wsim/blob/agentic-support/docs/sacp/WSIM_REVIEW.md)
- **Q5-Q9 ✅ RESOLVED** - All WSIM questions now have consensus
- **Q17 ✅ DELIVERED**: OpenAPI spec at [`docs/sacp/openapi-agent.yaml`](https://github.com/jordancrombie/wsim/blob/agentic-support/docs/sacp/openapi-agent.yaml)
- mwsim requirements drafted - [MWSIM_REQUIREMENTS.md](https://github.com/jordancrombie/wsim/blob/agentic-support/docs/sacp/MWSIM_REQUIREMENTS.md)

**✅ IMPLEMENTATION COMPLETE (2026-01-21)**:
> WSIM v1.0.0 released with full SACP P0 implementation:
>
> **Delivered**:
> - Agent registration and management API (`/api/mobile/agents/*`)
> - OAuth 2.0 client credentials flow (`/api/agent/v1/oauth/*`)
> - Token introspection endpoint (RFC 7662 compliant)
> - Payment token API (`/api/agent/v1/payments/*`)
> - EST timezone-aware daily/monthly spending limits
> - Step-up authorization flow with push notifications (`/api/mobile/step-up/*`)
>
> **Database Changes** (4 new tables):
> - `agents` - Agent credentials and configuration
> - `agent_access_tokens` - Token revocation tracking
> - `agent_transactions` - Payment audit trail
> - `step_up_requests` - Authorization request state
>
> **New Environment Variables**:
> - `AGENT_JWT_SECRET`, `AGENT_ACCESS_TOKEN_EXPIRY`
> - `PAYMENT_TOKEN_SECRET`, `PAYMENT_TOKEN_EXPIRY`
> - `STEP_UP_EXPIRY_MINUTES`, `DAILY_LIMIT_RESET_TIMEZONE`
> - `INTROSPECTION_CLIENT_ID`, `INTROSPECTION_CLIENT_SECRET`
>
> **Dependencies Added**: nanoid@^5.0.0, luxon@^3.4.0
>
> **Next Steps**:
> - Run database migration in production environment
> - Configure production environment variables
> - Begin integration testing with SSIM
>
> **Branch**: `agentic-support` - Ready for PR to main after migration testing

---

### NSIM Team (Payment Network)

| Item | Status |
|------|--------|
| **Team Lead** | [TBD] |
| **Assigned Developers** | [TBD] |
| **Requirements Reviewed** | :white_check_mark: Complete |
| **Estimate Confirmed** | :white_check_mark: ~2 weeks confirmed |
| **Design Sign-Off** | :white_check_mark: Ready (Q10-Q12 resolved) |
| **Implementation Status** | ✅ **v1.1.0 COMPLETE** (pending DB migration) |

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
> NSIM v1.1.0 released with full SACP P0 implementation:
>
> **Delivered**:
> - Accept `agentContext` in authorization requests
> - Validate required fields (agentId, ownerId, humanPresent) when present
> - Store agent context in payment transactions with database indexes
> - Forward agent context to BSIM for issuer visibility
> - OpenAPI spec v1.3.0 with AgentContext schema
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
> - P1: Add agentContext to webhook payloads
> - P1: Add query filtering by agent fields
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
| **Implementation Status** | Not Started |

**Current Blockers**: None

**Notes**:
- Estimated effort: ~1.5-2 weeks ✅ Confirmed
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

---

## Sprint 1 - Task Assignments

**Sprint Start**: 2026-01-21
**Sprint Goal**: WSIM staging deployment, SSIM agent auth working, prep work for NSIM/BSIM

### WSIM Team

| # | Task | Priority | Status |
|---|------|----------|--------|
| W1 | Run DB migration on staging | P0 | :hourglass: Pending |
| W2 | Configure staging env vars | P0 | :hourglass: Pending |
| W3 | Validate APIs on staging | P0 | :white_circle: Not Started |
| W4 | PR `agentic-support` → main | P1 | :white_circle: Blocked by W1-W3 |
| W5 | Implement pairing code generation | P0 | :white_check_mark: **Complete** |
| W6 | Implement access request endpoints | P0 | :white_check_mark: **Complete** |
| W7 | Add `agent.access_request` notification type | P0 | :white_check_mark: **Complete** |
| W8 | Update OpenAPI spec with access-request endpoints | P1 | :white_check_mark: **Complete** |

**New**: Agent-initiated credential flow approved and implemented (see [USER_AGENT_DESIGN.md](USER_AGENT_DESIGN.md))

### SSIM Team

| # | Task | Priority | Status |
|---|------|----------|--------|
| S1 | Build WSIM mock client | P0 | :white_circle: Not Started |
| S2 | Implement `/.well-known/ucp` discovery | P0 | :white_circle: Not Started |
| S3 | Implement agent auth middleware | P0 | :white_circle: Not Started |
| S4 | Add `ssim_agent_sessions` table | P1 | :white_circle: Not Started |
| S5 | Implement `POST /api/agent/v1/sessions` | P1 | :white_circle: Not Started |

### NSIM Team (Prep Work)

| # | Task | Priority | Status |
|---|------|----------|--------|
| N1 | Add `agentContext` columns to DB | P1 | :white_check_mark: **Complete** |
| N2 | Prepare authorization endpoint changes | P1 | :white_check_mark: **Complete** |
| N3 | Review BSIM forwarding spec | P2 | :white_check_mark: **Complete** |

**Note**: NSIM v1.1.0 complete! All P0 tasks delivered. Branch: `feature/agentic-support`

### BSIM Team (Prep Work)

| # | Task | Priority | Status |
|---|------|----------|--------|
| B1 | Add `agentContext` columns to DB | P1 | :white_circle: Not Started |
| B2 | Design agent badge UI component | P1 | :white_circle: Not Started |
| B3 | Prepare authorization endpoint changes | P2 | :white_circle: Not Started |

### mwsim Team

| # | Task | Priority | Status |
|---|------|----------|--------|
| M1 | Generate pairing code screen | P0 | :white_circle: Not Started |
| M2 | QR scanner for agent binding | P0 | :white_circle: Not Started |
| M3 | Access request approval screen | P0 | :white_circle: Not Started |
| M4 | Agent list screen | P0 | :white_circle: Not Started |
| M5 | Agent detail/edit screen | P1 | :white_circle: Not Started |
| M6 | Delete/revoke agent | P1 | :white_circle: Not Started |
| M7 | Step-up approval screen | P0 | :white_circle: Not Started |
| M8 | Push notification handler | P0 | :white_circle: Not Started |
| M9 | Message Center (client-side aggregation) | P1 | :white_circle: Not Started |

**Note**: mwsim onboarding at [MWSIM_ONBOARDING.md](teams/MWSIM_ONBOARDING.md) | Credential flow design at [USER_AGENT_DESIGN.md](USER_AGENT_DESIGN.md)

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
| A9 | Run database migration on staging | WSIM | TBD | :hourglass: Pending |
| A10 | Configure production environment variables | WSIM/DevOps | TBD | :hourglass: Pending |
| A11 | Begin SSIM implementation | SSIM | TBD | :white_circle: Ready to start |
| A12 | mwsim agent management UI | mwsim | TBD | :white_circle: Ready to start |

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

---

## Appendix: Effort Summary

| Team | Estimated Effort | Actual | Dependencies | Status |
|------|------------------|--------|--------------|--------|
| WSIM | 6-8 weeks | **1 day** | None | ✅ **v1.0.0 Complete** |
| SSIM | 6-8 weeks | - | WSIM OAuth | :white_circle: Ready to start |
| NSIM | 2 weeks | **1 day** | SSIM checkout | ✅ **v1.1.0 Complete** |
| BSIM | 1.5-2 weeks | - | NSIM context | :white_circle: Ready to start |
| **Total** | **~8 weeks** (parallel) | | | |

---

## Contact

**Project Manager**: [TBD]
**Technical Lead**: [TBD]
**Stakeholder**: [TBD]

**Repository**: https://github.com/jordancrombie/agents
