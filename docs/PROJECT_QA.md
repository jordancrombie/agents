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
| Q1 | SSIM | Session expiration configurability | Open | Medium |
| Q2 | SSIM | Multiple shipping options | Open | Low |
| Q3 | SSIM | Promo code support for agents | Open | Low |
| Q4 | SSIM | Partial fulfillment handling | Open | Medium |
| Q5 | WSIM | Agent secret rotation | Open | Medium |
| Q6 | WSIM | Step-up expiration time | Open | High |
| Q7 | WSIM | Multiple payment methods per agent | Open | Medium |
| Q8 | WSIM | Daily limit timezone handling | Open | Medium |
| Q9 | WSIM | mwsim agent management | Open | Low |
| Q10 | NSIM | Agent context validation | Open | Medium |
| Q11 | NSIM | Risk scoring delegation | Open | Medium |
| Q12 | NSIM | Agent-specific webhook events | Open | Low |
| Q13 | BSIM | Agent badge opt-in | Open | Low |
| Q14 | BSIM | Agent ownership verification | Open | Medium |
| Q15 | BSIM | Agent transaction decline authority | Open | High |

---

## SSIM Team Questions

### Q1: Session expiration configurability
**Asked by**: SSIM Team
**Date**: 2026-01-21
**Status**: Open

**Question**:
Should checkout session expiration be configurable per store, or should we use a fixed system-wide default?

**Context**:
Different merchants may have different needs - some products require quick checkout (limited inventory), others may allow longer consideration.

**Discussion**:
-

**Resolution**:
[Pending]

---

### Q2: Multiple shipping options selection
**Asked by**: SSIM Team
**Date**: 2026-01-21
**Status**: Open

**Question**:
Do we need to support agents selecting from multiple shipping options (standard, express, overnight)?

**Context**:
Current spec shows single `fulfillment` object. Need to determine if agent should be able to compare/select shipping options.

**Discussion**:
-

**Resolution**:
[Pending]

---

### Q3: Promo code support for agents
**Asked by**: SSIM Team
**Date**: 2026-01-21
**Status**: Open

**Question**:
Should agents be able to apply promotional codes during checkout?

**Context**:
This could be useful for agent-specific promotions or loyalty programs, but adds complexity.

**Discussion**:
-

**Resolution**:
[Pending]

---

### Q4: Partial fulfillment handling
**Asked by**: SSIM Team
**Date**: 2026-01-21
**Status**: Open

**Question**:
How should we handle partial fulfillment scenarios (backordered items, split shipments)?

**Context**:
Current flow assumes all items are available. Need to define behavior when some items are out of stock.

**Discussion**:
-

**Resolution**:
[Pending]

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
**Status**: Open

**Question**:
Should NSIM validate agent context against WSIM, or trust the merchant-provided context?

**Context**:
Validation adds security but introduces latency and WSIM dependency. Trust simplifies but could allow spoofing.

**Discussion**:
-

**Resolution**:
[Pending]

---

### Q11: Risk scoring delegation
**Asked by**: NSIM Team
**Date**: 2026-01-21
**Status**: Open

**Question**:
What level of agent risk scoring should NSIM perform vs. delegating entirely to BSIM?

**Context**:
NSIM could calculate risk signals (velocity, patterns) or simply pass agent flag to BSIM for all risk assessment.

**Discussion**:
-

**Resolution**:
[Pending]

---

### Q12: Agent-specific webhook events
**Asked by**: NSIM Team
**Date**: 2026-01-21
**Status**: Open

**Question**:
Should we add a specific `payment.agent_transaction` webhook event type?

**Context**:
Could help merchants who want to handle agent transactions differently. Alternative is to include agent context in existing events.

**Discussion**:
-

**Resolution**:
[Pending]

---

## BSIM Team Questions

### Q13: Agent badge opt-in
**Asked by**: BSIM Team
**Date**: 2026-01-21
**Status**: Open

**Question**:
Should the agent transaction badge be always shown, or opt-in via user settings?

**Context**:
Some users may not want visual distinction. Others may want clear visibility of agent activity.

**Discussion**:
-

**Resolution**:
[Pending]

---

### Q14: Agent ownership verification
**Asked by**: BSIM Team
**Date**: 2026-01-21
**Status**: Open

**Question**:
Should BSIM verify that the agent owner ID matches the cardholder?

**Context**:
Could prevent scenarios where Agent A (owned by User X) uses a card belonging to User Y.

**Discussion**:
-

**Resolution**:
[Pending]

---

### Q15: Agent transaction decline authority
**Asked by**: BSIM Team
**Date**: 2026-01-21
**Status**: Open

**Question**:
Should BSIM have authority to decline agent transactions based on bank-level policy, independent of WSIM limits?

**Context**:
Bank may want additional controls (e.g., decline all agent transactions above $500 regardless of wallet limits).

**Discussion**:
-

**Resolution**:
[Pending]

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
