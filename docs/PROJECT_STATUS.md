# SACP - Project Status & Sign-Off Tracker

**Project**: SimToolBox Agent Commerce Protocol (SACP)
**Project Manager**: [TBD]
**Last Updated**: 2026-01-21

---

## Executive Summary

| Metric | Status |
|--------|--------|
| Overall Project Health | :yellow_circle: Planning |
| Design Sign-Off | 0 / 4 teams (3 reviews complete, awaiting consensus) |
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
| **Estimate Confirmed** | :hourglass: Revised to 6-8 weeks |
| **Design Sign-Off** | :hourglass: Conditional - awaiting prerequisites |
| **Implementation Status** | Not Started |

**Current Blockers**:
- Q17: WSIM API contract needed by end of Week 1 (**CRITICAL**)
- Q18: Token caching policy decision needed
- Q19: Session isolation confirmation needed

**Notes**:
- Original estimate: ~5-6 weeks → **Revised: 6-8 weeks**
- Review document: [SSIM_REVIEW.md](teams/SSIM_REVIEW.md)
- 4 original questions responded to (Q1-Q4)
- 5 new questions raised (Q17-Q21)
- Recommends moving MCP server from P1 to P2
- Conditional sign-off pending Q17/Q18/Q19 resolution

---

### WSIM Team (Wallet Simulator)

| Item | Status |
|------|--------|
| **Team Lead** | [TBD] |
| **Assigned Developers** | [TBD] |
| **Requirements Reviewed** | :white_check_mark: Complete |
| **Estimate Confirmed** | :white_check_mark: ~6-8 weeks confirmed |
| **Design Sign-Off** | :hourglass: Awaiting team consensus on Q5-Q9 |
| **Implementation Status** | Not Started |

**Current Blockers**: None

**Notes**:
- Estimated effort: ~6-8 weeks ✅ Confirmed
- Critical path component - all other teams depend on WSIM
- Review document: [WSIM_REVIEW.md](https://github.com/jordancrombie/wsim/blob/agentic-support/docs/sacp/WSIM_REVIEW.md)
- 5 questions responded to in PROJECT_QA.md (Q5-Q9)
- Also responded to Q14 (BSIM ID compatibility), Q17 (OpenAPI spec), Q18 (caching)
- **NEW**: mwsim requirements drafted - [MWSIM_REQUIREMENTS.md](https://github.com/jordancrombie/wsim/blob/agentic-support/docs/sacp/MWSIM_REQUIREMENTS.md)
- mwsim adds ~3-4 weeks parallel effort for mobile agent management

---

### NSIM Team (Payment Network)

| Item | Status |
|------|--------|
| **Team Lead** | [TBD] |
| **Assigned Developers** | [TBD] |
| **Requirements Reviewed** | :white_check_mark: Complete |
| **Estimate Confirmed** | :white_check_mark: ~2 weeks confirmed |
| **Design Sign-Off** | :hourglass: Awaiting team consensus on Q10/Q11/Q12 |
| **Implementation Status** | Not Started |

**Current Blockers**: None

**Notes**:
- Estimated effort: ~2 weeks ✅ Confirmed
- Lower complexity, mainly pass-through changes
- Review document: [NSIM_REVIEW.md](teams/NSIM_REVIEW.md)
- 3 open questions responded to in PROJECT_QA.md (Q10, Q11, Q12)

---

### BSIM Team (Banking Simulator)

| Item | Status |
|------|--------|
| **Team Lead** | [TBD] |
| **Assigned Developers** | [TBD] |
| **Requirements Reviewed** | :white_check_mark: Complete |
| **Estimate Confirmed** | :white_check_mark: ~1.5-2 weeks confirmed |
| **Design Sign-Off** | :hourglass: Awaiting team consensus on Q13/Q14/Q15 |
| **Implementation Status** | Not Started |

**Current Blockers**: None

**Notes**:
- Estimated effort: ~1.5-2 weeks ✅ Confirmed
- Primarily UI/visibility changes + bank-level policy (P1 minimal)
- 3 questions responded to in PROJECT_QA.md (Q13, Q14, Q15)
- Confirmed NSIM Q11 (risk scoring delegation to BSIM)
- Dependency: Need WSIM confirmation on ownerId format for Q14

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
| SSIM | SSIM Team | 2026-01-21 | :hourglass: Review Complete | Conditional sign-off pending Q17/Q18/Q19 |
| WSIM | WSIM Team | 2026-01-21 | :hourglass: Review Complete | Awaiting Q5-Q9 consensus; responded to Q14/Q17/Q18 |
| NSIM | NSIM Team | 2026-01-21 | :hourglass: Review Complete | Awaiting Q10 consensus (Q11/Q12 resolved) |
| BSIM | BSIM Team | 2026-01-21 | :hourglass: Review Complete | Awaiting Q13/Q14/Q15 consensus |

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
| A3 | Review and respond to open questions | All Teams | TBD | Open |
| A4 | Confirm effort estimates | Team Leads | TBD | Open |
| A5 | Complete design sign-off | Team Leads | TBD | Open |
| A6 | Create GitHub issues for Phase 1 work | PM | TBD | Open |

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

---

## Appendix: Effort Summary

| Team | Estimated Effort | Dependencies | Start Constraint |
|------|------------------|--------------|------------------|
| WSIM | 6-8 weeks | None | Can start immediately |
| SSIM | 5-6 weeks | WSIM OAuth | Can start Week 2 with mocks |
| NSIM | 2 weeks | SSIM checkout | Can start Week 4 |
| BSIM | 1.5-2 weeks | NSIM context | Can start Week 5 |
| **Total** | **~8 weeks** (parallel) | | |

---

## Contact

**Project Manager**: [TBD]
**Technical Lead**: [TBD]
**Stakeholder**: [TBD]

**Repository**: https://github.com/jordancrombie/agents
