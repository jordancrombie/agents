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

### WSIM APIs You'll Consume:

| API | Endpoint | Purpose |
|-----|----------|---------|
| **Pairing Codes** | `POST /api/mobile/pairing-codes` | Generate code for agent binding |
| **Access Requests** | `GET /api/mobile/access-requests/pending` | List pending agent requests |
| **Access Requests** | `GET /api/mobile/access-requests/:id` | Get request details |
| **Access Requests** | `POST /api/mobile/access-requests/:id/approve` | Approve with limits |
| **Access Requests** | `POST /api/mobile/access-requests/:id/reject` | Reject request |
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
| **Credential Flow Design** | [docs/USER_AGENT_DESIGN.md](../USER_AGENT_DESIGN.md) | **START HERE** - Agent binding flow |
| **Protocol Design** | [docs/PROTOCOL_DESIGN.md](../PROTOCOL_DESIGN.md) | Full protocol specification |
| **Project Status** | [docs/PROJECT_STATUS.md](../PROJECT_STATUS.md) | Current progress, team status |
| **Q&A Log** | [docs/PROJECT_QA.md](../PROJECT_QA.md) | All resolved questions (Q22-Q28 for mwsim) |
| **WSIM Requirements** | [WSIM repo](https://github.com/jordancrombie/wsim/blob/agentic-support/docs/sacp/WSIM_REQUIREMENTS.md) | Backend requirements |
| **mwsim Requirements** | [WSIM repo](https://github.com/jordancrombie/wsim/blob/agentic-support/docs/sacp/MWSIM_REQUIREMENTS.md) | Your detailed requirements |
| **WSIM OpenAPI Spec** | [WSIM repo](https://github.com/jordancrombie/wsim/blob/agentic-support/docs/sacp/openapi-agent.yaml) | API contract for all endpoints |

**Start here**: Read the [USER_AGENT_DESIGN.md](../USER_AGENT_DESIGN.md) document first - it contains the approved agent-initiated credential flow that you'll implement.

---

## Key Design Decisions (Already Made)

These decisions affect your implementation:

| Decision | Details | Reference |
|----------|---------|-----------|
| **Agent binding** | Pairing codes for Phase 1 | Q22, Q28 |
| **Access request expiration** | 24 hours | Q23 |
| **Limit modifications** | User can only decrease limits | Q24 |
| **Multiple instances** | Same agent can bind to multiple users | Q25 |
| **Message Center** | Client-side aggregation for Phase 1 | Q26 |
| **Message retention** | 30 days | Q27 |
| Step-up expiration | 15 minutes | Q6 |
| Agent badge | Always shown (transparency) | Q13 |
| Payment methods | User sets default, can select during step-up | Q7 |
| Timezone | EST for daily limit reset (MVP) | Q8 |

---

## Sprint 1 Tasks for mwsim

| # | Task | Priority | Notes |
|---|------|----------|-------|
| M1 | Generate pairing code screen | P0 | User generates code to share with agent |
| M2 | QR scanner for agent binding | P0 | Alternative binding method |
| M3 | Access request approval screen | P0 | Review agent's requested permissions |
| M4 | Agent list screen | P0 | `GET /api/mobile/agents` |
| M5 | Agent detail/edit screen | P1 | `PATCH /api/mobile/agents/:id` |
| M6 | Delete/revoke agent | P1 | `DELETE /api/mobile/agents/:id` with confirmation |
| M7 | Step-up approval screen | P0 | Show merchant, amount, agent; approve/reject buttons |
| M8 | Push notification handler | P0 | Receive push, deep link to approval screen |
| M9 | Message Center (client-side aggregation) | P1 | Unified notification hub |

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
