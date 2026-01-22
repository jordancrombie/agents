# SACP Integration Test Plan

**Project**: SimToolBox Agent Commerce Protocol (SACP)
**Date**: 2026-01-22
**Status**: Ready for Execution
**Environment**: Development (192.168.1.96)

---

## Overview

This document outlines the integration test plan for validating end-to-end agent commerce flows across all SACP services.

### Services Under Test

| Service | Version | Endpoint |
|---------|---------|----------|
| WSIM | v1.0.0 | https://wsim-dev.banksim.ca |
| SSIM | v2.0.0 | https://ssim-dev.banksim.ca |
| NSIM | v1.2.0 | https://payment-dev.banksim.ca |
| BSIM | v0.8.0 | https://dev.banksim.ca |
| mwsim | P0 | Mobile app (dev build) |

---

## Test Scenarios

### Flow 1: Agent Registration (Pairing Code)

**Objective**: Validate agent can bind to user wallet via pairing code

| Step | Action | Service | Expected Result |
|------|--------|---------|-----------------|
| 1.1 | User generates pairing code | mwsim → WSIM | Returns code like `WSIM-ABC123-XYZ789`, expires in 15min |
| 1.2 | Agent submits access request with code | Agent → WSIM | Returns `access_request_id`, status `pending` |
| 1.3 | User receives push notification | WSIM → mwsim | Notification contains agent name, requested permissions |
| 1.4 | User opens access request screen | mwsim | Shows agent details, limit sliders (decrease only) |
| 1.5 | User approves with biometric | mwsim → WSIM | Returns `client_id`, `client_secret` to agent |
| 1.6 | Agent appears in agent list | mwsim | New agent visible with approved limits |

**API Calls**:
```bash
# 1.1 Generate pairing code (mwsim)
POST https://wsim-dev.banksim.ca/api/mobile/pairing-codes
Authorization: Bearer {user_token}

# 1.2 Agent requests access
POST https://wsim-dev.banksim.ca/api/agent/v1/access-requests
Content-Type: application/json
{
  "pairing_code": "WSIM-ABC123-XYZ789",
  "agent_name": "Claude Shopping Assistant",
  "requested_permissions": ["payments"],
  "requested_limits": {
    "per_transaction": 100.00,
    "daily": 500.00
  }
}

# 1.5 User approves (mwsim)
POST https://wsim-dev.banksim.ca/api/mobile/access-requests/{id}/approve
Authorization: Bearer {user_token}
{
  "approved_limits": {
    "per_transaction": 50.00,
    "daily": 200.00
  }
}
```

**Pass Criteria**:
- [ ] Pairing code generated successfully
- [ ] Access request created and linked to user
- [ ] Push notification received on mobile device
- [ ] Approval screen shows correct agent info
- [ ] Limits can only be decreased, not increased
- [ ] Agent receives valid OAuth credentials
- [ ] Agent appears in list with correct status

---

### Flow 2: Auto-Approved Purchase (Within Limits)

**Objective**: Validate agent can complete purchase without step-up when within limits

**Prerequisites**: Agent registered with $50/transaction, $200/daily limit

| Step | Action | Service | Expected Result |
|------|--------|---------|-----------------|
| 2.1 | Agent discovers store | Agent → SSIM | Returns UCP config with API endpoints |
| 2.2 | Agent authenticates | Agent → WSIM | Returns access token |
| 2.3 | Agent browses products | Agent → SSIM | Returns product catalog |
| 2.4 | Agent creates checkout session | Agent → SSIM | Returns session_id, status `cart_building` |
| 2.5 | Agent adds items to session | Agent → SSIM | Session updated with items |
| 2.6 | Agent requests payment token | Agent → WSIM | Token issued (within limits, no step-up) |
| 2.7 | Agent completes checkout | Agent → SSIM | SSIM processes payment via NSIM |
| 2.8 | Payment authorized | SSIM → NSIM → BSIM | Authorization approved with agentContext |
| 2.9 | Order confirmed | SSIM | Returns order_id, status `completed` |
| 2.10 | Transaction visible in BSIM | BSIM | Shows agent badge on transaction |

**API Calls**:
```bash
# 2.1 Discover store
GET https://ssim-dev.banksim.ca/.well-known/ucp

# 2.2 Get access token
POST https://wsim-dev.banksim.ca/api/agent/v1/oauth/token
Content-Type: application/x-www-form-urlencoded
grant_type=client_credentials&client_id={client_id}&client_secret={client_secret}

# 2.3 Browse products
GET https://ssim-dev.banksim.ca/api/agent/v1/products
Authorization: Bearer {agent_token}

# 2.4 Create session
POST https://ssim-dev.banksim.ca/api/agent/v1/sessions
Authorization: Bearer {agent_token}
{
  "items": [
    { "product_id": "prod_123", "quantity": 1 }
  ]
}

# 2.6 Request payment token
POST https://wsim-dev.banksim.ca/api/agent/v1/payment-tokens
Authorization: Bearer {agent_token}
{
  "amount": 25.00,
  "currency": "CAD",
  "merchant_id": "ssim_ssim-dev_banksim_ca",
  "session_id": "{session_id}"
}

# 2.7 Complete checkout
POST https://ssim-dev.banksim.ca/api/agent/v1/sessions/{session_id}/complete
Authorization: Bearer {agent_token}
{
  "payment_token": "{payment_token}"
}
```

**Pass Criteria**:
- [ ] UCP discovery returns valid merchant config
- [ ] Agent token introspection succeeds (SSIM → WSIM)
- [ ] Product catalog returned
- [ ] Session created with correct state machine
- [ ] Payment token issued without step-up (humanPresent: false)
- [ ] NSIM receives agentContext in authorization
- [ ] BSIM receives agentContext from NSIM
- [ ] Order created with agentId, agentSessionId
- [ ] Transaction shows agent badge in BSIM UI

---

### Flow 3: Step-Up Purchase (Exceeds Limits)

**Objective**: Validate step-up flow triggers when purchase exceeds agent limits

**Prerequisites**: Agent registered with $50/transaction limit

| Step | Action | Service | Expected Result |
|------|--------|---------|-----------------|
| 3.1-3.5 | Same as Flow 2 | - | Session created with $75 item |
| 3.6 | Agent requests payment token | Agent → WSIM | Returns `step_up_required`, `step_up_id` |
| 3.7 | User receives push notification | WSIM → mwsim | "Purchase approval needed" |
| 3.8 | User opens step-up screen | mwsim | Shows merchant, amount, agent name |
| 3.9 | User approves with biometric | mwsim → WSIM | Step-up approved |
| 3.10 | Agent polls for token | Agent → WSIM | Payment token issued (humanPresent: true) |
| 3.11 | Agent completes checkout | Agent → SSIM | Order completed |
| 3.12 | Transaction shows human approval | BSIM | agentHumanPresent: true |

**API Calls**:
```bash
# 3.6 Request payment token (exceeds limit)
POST https://wsim-dev.banksim.ca/api/agent/v1/payment-tokens
Authorization: Bearer {agent_token}
{
  "amount": 75.00,
  "currency": "CAD",
  "merchant_id": "ssim_ssim-dev_banksim_ca",
  "session_id": "{session_id}"
}
# Response: { "step_up_required": true, "step_up_id": "..." }

# 3.9 User approves step-up (mwsim)
POST https://wsim-dev.banksim.ca/api/mobile/step-up/{step_up_id}/approve
Authorization: Bearer {user_token}

# 3.10 Agent polls for token
GET https://wsim-dev.banksim.ca/api/agent/v1/payment-tokens/{step_up_id}/status
Authorization: Bearer {agent_token}
# Response: { "status": "approved", "payment_token": "..." }
```

**Pass Criteria**:
- [ ] Step-up triggered when amount > per_transaction limit
- [ ] Push notification sent within 2 seconds
- [ ] Step-up screen shows correct details
- [ ] 15-minute expiration enforced
- [ ] Payment token includes humanPresent: true
- [ ] Transaction flagged as human-approved in BSIM

---

### Flow 4: Step-Up Rejection

**Objective**: Validate rejection flow and agent notification

| Step | Action | Service | Expected Result |
|------|--------|---------|-----------------|
| 4.1-4.7 | Same as Flow 3 | - | Step-up pending |
| 4.8 | User rejects step-up | mwsim → WSIM | Step-up status: rejected |
| 4.9 | Agent polls for status | Agent → WSIM | Returns `rejected` |
| 4.10 | Session remains open | SSIM | Agent can modify cart or cancel |

**Pass Criteria**:
- [ ] Rejection recorded in WSIM
- [ ] Agent receives rejected status
- [ ] No payment processed
- [ ] Session not auto-cancelled (agent can retry)

---

### Flow 5: Step-Up Expiration

**Objective**: Validate 15-minute step-up expiration

| Step | Action | Service | Expected Result |
|------|--------|---------|-----------------|
| 5.1-5.6 | Same as Flow 3 | - | Step-up created |
| 5.7 | Wait 15 minutes | - | - |
| 5.8 | Agent polls for status | Agent → WSIM | Returns `expired` |

**Pass Criteria**:
- [ ] Step-up expires after 15 minutes
- [ ] Agent notified of expiration
- [ ] Agent can request new payment token (new step-up)

---

### Flow 6: Agent Revocation

**Objective**: Validate user can revoke agent access

| Step | Action | Service | Expected Result |
|------|--------|---------|-----------------|
| 6.1 | User deletes agent | mwsim → WSIM | Agent status: revoked |
| 6.2 | Agent attempts API call | Agent → WSIM | 401 Unauthorized |
| 6.3 | Agent attempts SSIM call | Agent → SSIM | 401 (introspection fails) |

**API Calls**:
```bash
# 6.1 Revoke agent
DELETE https://wsim-dev.banksim.ca/api/mobile/agents/{agent_id}
Authorization: Bearer {user_token}
```

**Pass Criteria**:
- [ ] Agent removed from list
- [ ] Token introspection fails for revoked agent
- [ ] SSIM rejects requests from revoked agent

---

### Flow 7: Token Caching Validation

**Objective**: Validate SSIM token caching behavior (60s TTL per Q18)

| Step | Action | Service | Expected Result |
|------|--------|---------|-----------------|
| 7.1 | Agent makes first request | Agent → SSIM | SSIM calls WSIM introspection |
| 7.2 | Agent makes second request (within 60s) | Agent → SSIM | SSIM uses cached token |
| 7.3 | Revoke agent | mwsim → WSIM | Agent revoked |
| 7.4 | Agent makes request (within cache window) | Agent → SSIM | Request succeeds (cached) |
| 7.5 | Wait for cache expiry | - | 60 seconds |
| 7.6 | Agent makes request | Agent → SSIM | 401 (introspection fails) |

**Pass Criteria**:
- [ ] Second request faster (no introspection call)
- [ ] Revoked agent temporarily succeeds within cache window
- [ ] After cache expiry, revoked agent blocked

---

### Flow 8: Rate Limiting Validation

**Objective**: Validate SSIM rate limiting (1000 req/min per agent per Q20)

| Step | Action | Service | Expected Result |
|------|--------|---------|-----------------|
| 8.1 | Agent makes 1000 requests in 1 minute | Agent → SSIM | All succeed |
| 8.2 | Agent makes request #1001 | Agent → SSIM | 429 Too Many Requests |
| 8.3 | Wait 1 minute | - | Rate limit window resets |
| 8.4 | Agent makes request | Agent → SSIM | Succeeds |

**Pass Criteria**:
- [ ] First 1000 requests succeed
- [ ] Request #1001 returns 429
- [ ] Rate limit resets after window

---

### Flow 9: WSIM Unavailability (Graceful Degradation)

**Objective**: Validate SSIM handles WSIM outage per Q21

| Step | Action | Service | Expected Result |
|------|--------|---------|-----------------|
| 9.1 | Agent makes successful request | Agent → SSIM | Token cached |
| 9.2 | Simulate WSIM outage | - | Stop WSIM container |
| 9.3 | Agent makes request (within cache) | Agent → SSIM | Succeeds (cached token) |
| 9.4 | Agent makes request (cache expired) | Agent → SSIM | Retry with exponential backoff |
| 9.5 | After retries exhausted | Agent → SSIM | 503 Service Unavailable |
| 9.6 | Restore WSIM | - | Start WSIM container |
| 9.7 | Agent makes request | Agent → SSIM | Succeeds |

**Pass Criteria**:
- [ ] Cached tokens allow continued operation
- [ ] Retry attempts with backoff (not immediate flood)
- [ ] Graceful 503 after retries exhausted
- [ ] Recovery when WSIM restored

---

### Flow 10: BSIM Agent Badge Display

**Objective**: Validate agent transactions display correctly in banking UI

| Step | Action | Service | Expected Result |
|------|--------|---------|-----------------|
| 10.1 | Complete agent purchase | Flow 2 | Transaction created |
| 10.2 | User logs into BSIM | BSIM | - |
| 10.3 | View transaction history | BSIM | Agent badge visible |
| 10.4 | Click transaction | BSIM | Detail shows agentId, "(autonomous)" |

**Pass Criteria**:
- [ ] Agent badge always shown (per Q13)
- [ ] Tooltip shows agent ID
- [ ] Detail view shows full agent context
- [ ] humanPresent flag displayed correctly

---

## Test Data Setup

### Prerequisites

1. **Test User Account**
   - WSIM user with enrolled BSIM card
   - mwsim app installed and logged in

2. **Test Products in SSIM**
   - Product A: $25.00 (within auto-approve limit)
   - Product B: $75.00 (triggers step-up)
   - Product C: $150.00 (exceeds daily limit)

3. **Test Agent Limits**
   - Per-transaction: $50.00
   - Daily: $200.00

### Test Accounts

| Account | Purpose |
|---------|---------|
| `test-user-1@banksim.ca` | Primary test user |
| `test-agent-1` | Auto-approve testing |
| `test-agent-2` | Step-up testing |
| `test-agent-3` | Revocation testing |

---

## Execution Checklist

### Pre-Test Verification

- [ ] All services healthy (run verification commands)
- [ ] SSIM mock mode disabled (real WSIM introspection)
- [ ] Test user has valid BSIM enrollment
- [ ] mwsim dev build installed on test device
- [ ] Push notifications enabled

### Test Execution Order

1. [ ] **Flow 1**: Agent Registration
2. [ ] **Flow 2**: Auto-Approved Purchase
3. [ ] **Flow 3**: Step-Up Purchase
4. [ ] **Flow 4**: Step-Up Rejection
5. [ ] **Flow 10**: BSIM Badge Display
6. [ ] **Flow 6**: Agent Revocation
7. [ ] **Flow 7**: Token Caching
8. [ ] **Flow 8**: Rate Limiting
9. [ ] **Flow 5**: Step-Up Expiration (15 min wait)
10. [ ] **Flow 9**: WSIM Unavailability (requires container control)

### Post-Test Cleanup

- [ ] Revoke all test agents
- [ ] Clear test sessions
- [ ] Document any failures

---

## Success Criteria

**MVP Ready** when:
- All P0 flows pass (Flows 1-4, 6, 10)
- No critical bugs in payment path
- Agent badge always displays in BSIM

**Production Ready** when:
- All flows pass including edge cases (Flows 5, 7-9)
- Performance acceptable under load
- Security review complete

---

## Issue Tracking

| ID | Flow | Issue | Severity | Status |
|----|------|-------|----------|--------|
| - | - | - | - | - |

---

## Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| QA Lead | TBD | - | Pending |
| WSIM | TBD | - | Pending |
| SSIM | TBD | - | Pending |
| NSIM | TBD | - | Pending |
| BSIM | TBD | - | Pending |
| mwsim | TBD | - | Pending |

---

## Appendix: Verification Commands

```bash
# Check all services healthy
for url in \
  "https://ssim-dev.banksim.ca/health" \
  "https://dev.banksim.ca/api/health" \
  "https://wsim-dev.banksim.ca/api/health" \
  "https://payment-dev.banksim.ca/health"; do \
  echo "=== $url ===" && curl -sk "$url" | jq '.status'; done

# Check UCP discovery
curl -sk https://ssim-dev.banksim.ca/.well-known/ucp | jq '.merchant.name'

# Test agent token flow (requires valid credentials)
curl -sk -X POST https://wsim-dev.banksim.ca/api/agent/v1/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=agent_xxx&client_secret=xxx"
```
