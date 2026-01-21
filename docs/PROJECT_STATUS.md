# SACP - Project Status & Sign-Off Tracker

**Project**: SimToolBox Agent Commerce Protocol (SACP)
**Project Manager**: [TBD]
**Last Updated**: 2026-01-21

---

## Executive Summary

| Metric | Status |
|--------|--------|
| Overall Project Health | :yellow_circle: Planning |
| Design Sign-Off | **4 / 4 signed** ✅ (SSIM, WSIM, NSIM, BSIM) |
| Implementation Progress | Not Started |
| Target Launch | TBD |

---

## Project Phases

### Phase 1: Design & Planning
| Milestone | Status | Target Date | Actual Date |
|-----------|--------|-------------|-------------|
| Protocol design document | :white_check_mark: Complete | 2026-01-21 | 2026-01-21 |
| Team requirements documents | :white_check_mark: Complete | 2026-01-21 | 2026-01-21 |
| Design review meetings | :hourglass: Pending | TBD | - |
| Q&A resolution | :hourglass: Pending | TBD | - |
| Design sign-off (all teams) | :hourglass: Pending | TBD | - |

### Phase 2: Implementation
| Milestone | Status | Target Date | Actual Date |
|-----------|--------|-------------|-------------|
| WSIM: Agent registration | :white_circle: Not Started | TBD | - |
| WSIM: Payment token API | :white_circle: Not Started | TBD | - |
| WSIM: Step-up flow | :white_circle: Not Started | TBD | - |
| SSIM: UCP discovery | :white_circle: Not Started | TBD | - |
| SSIM: Checkout session API | :white_circle: Not Started | TBD | - |
| NSIM: Agent context | :white_circle: Not Started | TBD | - |
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
| **Implementation Status** | :construction: OpenAPI Spec Delivered |

**Current Blockers**: None

**Notes**:
- Estimated effort: ~6-8 weeks ✅ Confirmed
- Critical path component - all other teams depend on WSIM
- Review document: [WSIM_REVIEW.md](https://github.com/jordancrombie/wsim/blob/agentic-support/docs/sacp/WSIM_REVIEW.md)
- **Q5-Q9 ✅ RESOLVED** - All WSIM questions now have consensus:
  - Q5: Secret rotation with re-authorization flow
  - Q6: 15-minute step-up expiration
  - Q7: All payment methods, user default, card selection
  - Q8: EST timezone for MVP, user-configurable Phase 2
  - Q9: mwsim full agent management required
- Also confirmed Q14 (BSIM ID compatibility - UUID via BsimEnrollment)
- **Q17 ✅ DELIVERED**: OpenAPI spec at [`docs/sacp/openapi-agent.yaml`](https://github.com/jordancrombie/wsim/blob/agentic-support/docs/sacp/openapi-agent.yaml)
- mwsim requirements drafted - [MWSIM_REQUIREMENTS.md](https://github.com/jordancrombie/wsim/blob/agentic-support/docs/sacp/MWSIM_REQUIREMENTS.md)
- mwsim adds ~3-4 weeks parallel effort for mobile agent management

**✅ FORMAL SIGN-OFF (2026-01-21)**:
> I, on behalf of the WSIM team, have reviewed the SACP requirements document dated 2026-01-21 and confirm our team's readiness to proceed with implementation as specified.
>
> **Scope Confirmed**:
> - P0: Agent registration, OAuth token/introspect, payment token API, spending limits, step-up flow
> - P1: Mandate signing, agent dashboard, intent mandates
> - P2: Activity webhooks, merchant allow/block lists, velocity controls
>
> **Estimate Confirmed**: ~6-8 weeks (WSIM) + ~3-4 weeks parallel (mwsim)
>
> **Deliverables Completed**:
> - OpenAPI spec for agent endpoints (Q17 - SSIM unblocked)
> - mwsim requirements document
> - Technical review with implementation approach
>
> **No Blocking Concerns**: All questions resolved with cross-team consensus
>
> **Dependencies Accepted**:
> - SSIM will use OpenAPI spec for mock development
> - BSIM will verify agent ownership via BsimEnrollment mapping
> - mwsim will implement agent management UI in parallel

---

### NSIM Team (Payment Network)

| Item | Status |
|------|--------|
| **Team Lead** | [TBD] |
| **Assigned Developers** | [TBD] |
| **Requirements Reviewed** | :white_check_mark: Complete |
| **Estimate Confirmed** | :white_check_mark: ~2 weeks confirmed |
| **Design Sign-Off** | :white_check_mark: Ready (Q10-Q12 resolved) |
| **Implementation Status** | Not Started |

**Current Blockers**: None

**Notes**:
- Estimated effort: ~2 weeks ✅ Confirmed
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
| R1 | WSIM delays block all teams | Medium | High | Start WSIM first, parallel mock development | PM | Open |
| R2 | Industry standards evolve during development | Low | Medium | Design for extensibility, monitor UCP/AP2 updates | Design | Open |
| R3 | Step-up UX causes user friction | Medium | Medium | User testing before launch, adjustable thresholds | WSIM | Open |
| R4 | Security vulnerabilities in mandate signing | Low | High | Security review, follow AP2 patterns | WSIM | Open |
| R5 | Integration complexity underestimated | Medium | Medium | Early integration testing, clear API contracts | PM | Open |

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
| A1 | Schedule design review meeting | PM | TBD | Open |
| A2 | Assign team leads for each component | PM | TBD | Open |
| A3 | Review and respond to open questions | All Teams | TBD | ✅ WSIM Complete |
| A4 | Confirm effort estimates | Team Leads | TBD | ✅ Complete |
| A5 | Complete design sign-off | Team Leads | TBD | ✅ Complete (4/4) |
| A6 | Create GitHub issues for Phase 1 work | PM | TBD | Open |
| A7 | Deliver OpenAPI spec for agent endpoints (Q17) | WSIM | Week 1 | ✅ Delivered |

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

---

## Appendix: Effort Summary

| Team | Estimated Effort | Dependencies | Start Constraint |
|------|------------------|--------------|------------------|
| WSIM | 6-8 weeks | None | Can start immediately |
| SSIM | 6-8 weeks | WSIM OAuth | Can start Week 2 with mocks |
| NSIM | 2 weeks | SSIM checkout | Can start Week 4 |
| BSIM | 1.5-2 weeks | NSIM context | Can start Week 5 |
| **Total** | **~8 weeks** (parallel) | | |

---

## Contact

**Project Manager**: [TBD]
**Technical Lead**: [TBD]
**Stakeholder**: [TBD]

**Repository**: https://github.com/jordancrombie/agents
