# mwsim Team - SACP Onboarding

**Project**: SimToolBox Agent Commerce Protocol (SACP)
**Team**: mwsim (Mobile Wallet Simulator)
**Date**: 2026-01-21
**Status**: Ready to Begin

---

## Welcome to SACP

The SACP (SimToolBox Agent Commerce Protocol) initiative enables AI agents to make purchases on behalf of human users across the SimToolBox ecosystem. This is a cross-team effort involving WSIM, SSIM, NSIM, and BSIM - and now **mwsim**.

**Your role is critical**: mwsim will be the **primary interface** for users to manage their AI agents and approve purchases that exceed spending limits.

---

## Project Overview

### What We're Building

AI agents (like ChatGPT, Claude, or custom agents) will be able to:
1. **Discover** stores via UCP protocol
2. **Shop** using REST APIs (browse products, build carts)
3. **Pay** using wallet-issued payment tokens

### The Key Innovation

**Tiered Approval Model**:
- **Auto-approve**: Small purchases within user-defined limits proceed automatically
- **Step-up**: Larger purchases trigger a push notification to the user's mobile device for approval

This is where mwsim comes in - you own the mobile experience for agent management and step-up approvals.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           AI AGENT                                   │
└──────────┬───────────────────┬───────────────────────┬──────────────┘
           │                   │                       │
           ▼                   ▼                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                            SSIM (Store)                              │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     WSIM (Wallet - Backend)                          │
│   • Agent registration API       • Payment token issuance            │
│   • OAuth token management       • Step-up request creation          │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                              ▼
┌───────────────────────────┐      ┌───────────────────────────────────┐
│     mwsim (Mobile UI)     │      │          NSIM → BSIM              │
│  • Agent management       │      │    (Payment processing)           │
│  • Step-up approvals      │      │                                   │
│  • Push notifications     │      │                                   │
└───────────────────────────┘      └───────────────────────────────────┘
```

---

## Your Relationship with WSIM

**This is important**: mwsim is the mobile frontend for WSIM's backend APIs. You are building the UI layer on top of WSIM's agent management and step-up authorization endpoints.

### WSIM Has Already Built (v1.0.0 Complete):

| API | Endpoint | Purpose |
|-----|----------|---------|
| Agent Management | `POST /api/mobile/agents` | Create new agent |
| Agent Management | `GET /api/mobile/agents` | List user's agents |
| Agent Management | `PATCH /api/mobile/agents/:id` | Update agent settings |
| Agent Management | `DELETE /api/mobile/agents/:id` | Revoke agent |
| Step-Up | `GET /api/mobile/step-up/pending` | Get pending approval requests |
| Step-Up | `POST /api/mobile/step-up/:id/approve` | Approve purchase |
| Step-Up | `POST /api/mobile/step-up/:id/reject` | Reject purchase |

### You Need to Coordinate With WSIM On:

1. **Push notification integration** - WSIM triggers notifications, mwsim receives them
2. **API contract validation** - Ensure your UI matches WSIM's response formats
3. **Error handling** - Consistent error messages and recovery flows
4. **Testing** - Integration testing against WSIM staging environment

---

## Documentation Locations

| Document | Location | Description |
|----------|----------|-------------|
| **Protocol Design** | [docs/PROTOCOL_DESIGN.md](../PROTOCOL_DESIGN.md) | Full protocol specification |
| **Project Status** | [docs/PROJECT_STATUS.md](../PROJECT_STATUS.md) | Current progress, team status |
| **Q&A Log** | [docs/PROJECT_QA.md](../PROJECT_QA.md) | All resolved questions |
| **WSIM Requirements** | [WSIM repo](https://github.com/jordancrombie/wsim/blob/agentic-support/docs/sacp/WSIM_REQUIREMENTS.md) | Backend requirements |
| **mwsim Requirements** | [WSIM repo](https://github.com/jordancrombie/wsim/blob/agentic-support/docs/sacp/MWSIM_REQUIREMENTS.md) | Your detailed requirements |
| **WSIM OpenAPI Spec** | [WSIM repo](https://github.com/jordancrombie/wsim/blob/agentic-support/docs/sacp/openapi-agent.yaml) | API contract for all endpoints |

**Start here**: Read the [mwsim Requirements](https://github.com/jordancrombie/wsim/blob/agentic-support/docs/sacp/MWSIM_REQUIREMENTS.md) document first - it was drafted by WSIM specifically for your team.

---

## Key Design Decisions (Already Made)

These decisions affect your implementation:

| Decision | Details | Reference |
|----------|---------|-----------|
| Step-up expiration | 15 minutes | Q6 |
| Agent badge | Always shown (transparency) | Q13 |
| Payment methods | User sets default, can select during step-up | Q7 |
| Timezone | EST for daily limit reset (MVP) | Q8 |
| Secret rotation | Support re-authorization flow | Q5 |

---

## Sprint 1 Tasks for mwsim

| # | Task | Priority | Notes |
|---|------|----------|-------|
| M1 | Agent list screen | P0 | `GET /api/mobile/agents` |
| M2 | Create agent flow | P0 | `POST /api/mobile/agents` with name, limits, permissions |
| M3 | Edit agent screen | P1 | `PATCH /api/mobile/agents/:id` |
| M4 | Delete/revoke agent | P1 | `DELETE /api/mobile/agents/:id` with confirmation |
| M5 | Step-up notification handler | P0 | Receive push, deep link to approval screen |
| M6 | Step-up approval screen | P0 | Show merchant, amount, agent; approve/reject buttons |

---

## Timeline

- **mwsim effort estimate**: ~3-4 weeks (parallel with other teams)
- **Dependencies**: WSIM APIs (already complete and available)
- **Integration testing**: Coordinate with WSIM team

---

## Communication

| Channel | Purpose |
|---------|---------|
| Slack #sacp-project | Project-wide updates |
| Slack #sacp-leads | Team lead coordination |
| WSIM Team | Your primary integration partner |

---

## Questions?

- Add questions to [PROJECT_QA.md](../PROJECT_QA.md)
- Reach out to WSIM team for API questions
- Reach out to PM for scope/requirements questions

**Welcome to SACP - let's build something great!**
