# NSIM Team Requirements
## Agent Commerce Integration

**Project**: SimToolBox Agent Commerce Protocol (SACP)
**Component**: NSIM (Payment Network Simulator)
**Priority**: P1 (Important - Visibility)

---

## Overview

NSIM's role in agent commerce is primarily about **visibility and traceability**. The payment network needs to:
1. Accept and store agent context with transactions
2. Forward agent information to issuing banks (BSIM)
3. Enable risk assessment based on agent involvement
4. Provide transaction reporting with agent attribution

---

## Requirements

### P0 - Critical (Phase 1)

#### 1. Accept Agent Context in Authorization

**Current Endpoint**: `POST /api/v1/payments/authorize`

**Extended Request Body**:
```json
{
  "merchantId": "ssim_regalmoose",
  "amount": 56.48,
  "currency": "CAD",
  "cardToken": "wsim_tok_...",
  "orderId": "sess_abc123",

  // NEW: Agent context
  "agentContext": {
    "agentId": "agent_abc123",
    "ownerId": "user_xyz789",
    "humanPresent": false,
    "mandateId": "mandate_...",
    "mandateType": "cart"
  }
}
```

**Field Definitions**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agentId` | string | Yes | Unique agent identifier |
| `ownerId` | string | Yes | Human owner of the agent |
| `humanPresent` | boolean | Yes | Was human present for this transaction? |
| `mandateId` | string | No | Reference to authorization mandate |
| `mandateType` | string | No | Type: `cart`, `intent`, or `none` |

**Processing**:
1. Validate agent context fields
2. Store with transaction record
3. Include in BSIM authorization request
4. Include in webhook notifications

#### 2. Store Agent Context in Transactions

**Database Update**:
```sql
ALTER TABLE nsim_payment_transactions
ADD COLUMN agent_id VARCHAR(255),
ADD COLUMN agent_owner_id VARCHAR(255),
ADD COLUMN agent_human_present BOOLEAN,
ADD COLUMN agent_mandate_id VARCHAR(255),
ADD COLUMN agent_mandate_type VARCHAR(50);

-- Index for agent queries
CREATE INDEX idx_tx_agent ON nsim_payment_transactions(agent_id);
```

#### 3. Forward Agent Context to BSIM

**Current BSIM Authorization Call**:
```typescript
const bsimResponse = await bsim.authorize({
  cardToken,
  amount,
  currency,
  merchantId,
  merchantName
});
```

**Extended Call**:
```typescript
const bsimResponse = await bsim.authorize({
  cardToken,
  amount,
  currency,
  merchantId,
  merchantName,

  // NEW: Agent context for issuer visibility
  agentContext: req.body.agentContext ? {
    agentId: req.body.agentContext.agentId,
    ownerId: req.body.agentContext.ownerId,
    humanPresent: req.body.agentContext.humanPresent,
    mandateType: req.body.agentContext.mandateType
  } : null
});
```

---

### P1 - Important (Phase 2)

#### 4. Include Agent Context in Webhooks

**Current Webhook Payload**:
```json
{
  "id": "webhook_delivery_id",
  "type": "payment.captured",
  "timestamp": "2026-01-21T...",
  "data": {
    "transactionId": "tx_...",
    "merchantId": "ssim_regalmoose",
    "orderId": "sess_abc123",
    "amount": 56.48,
    "currency": "CAD",
    "status": "captured"
  }
}
```

**Extended Webhook Payload**:
```json
{
  "id": "webhook_delivery_id",
  "type": "payment.captured",
  "timestamp": "2026-01-21T...",
  "data": {
    "transactionId": "tx_...",
    "merchantId": "ssim_regalmoose",
    "orderId": "sess_abc123",
    "amount": 56.48,
    "currency": "CAD",
    "status": "captured",

    // NEW: Agent context
    "agentContext": {
      "agentId": "agent_abc123",
      "ownerId": "user_xyz789",
      "humanPresent": false
    }
  }
}
```

#### 5. Transaction Query Filtering

**Endpoint**: `GET /api/v1/payments`

**New Query Parameters**:
```
GET /api/v1/payments?agentId=agent_abc123
GET /api/v1/payments?ownerId=user_xyz789
GET /api/v1/payments?humanPresent=false
```

---

### P2 - Nice to Have (Phase 3)

#### 6. Agent Risk Signals

Add risk scoring considerations for agent transactions:

```typescript
interface AgentRiskSignals {
  isAgentTransaction: boolean;
  humanPresent: boolean;
  mandateVerified: boolean;
  agentAge: number;              // Days since agent registration
  agentTransactionCount: number; // Historical transactions
  velocityScore: number;         // Unusual activity indicator
}

function assessAgentRisk(context: AgentContext): AgentRiskSignals {
  // Fetch agent history from WSIM (optional integration)
  // Calculate risk signals
  // Return for BSIM consideration
}
```

#### 7. Agent Transaction Reporting

Create reporting endpoints for agent commerce analytics:

```
GET /api/v1/reports/agents
```

Response:
```json
{
  "period": "2026-01",
  "summary": {
    "totalAgentTransactions": 1250,
    "totalAgentVolume": 45678.90,
    "uniqueAgents": 89,
    "uniqueOwners": 67,
    "humanPresentRate": 0.23,
    "averageTransactionSize": 36.54
  },
  "topAgents": [
    {
      "agentId": "agent_abc123",
      "transactionCount": 156,
      "volume": 5678.90
    }
  ]
}
```

---

## API Documentation Updates

Update `docs/openapi.yaml` to document agent context:

```yaml
components:
  schemas:
    AgentContext:
      type: object
      properties:
        agentId:
          type: string
          description: Unique agent identifier
          example: "agent_abc123"
        ownerId:
          type: string
          description: Human owner of the agent
          example: "user_xyz789"
        humanPresent:
          type: boolean
          description: Was human present for this transaction
          example: false
        mandateId:
          type: string
          description: Reference to authorization mandate
          example: "mandate_xyz789"
        mandateType:
          type: string
          enum: [cart, intent, none]
          description: Type of mandate authorizing this transaction
          example: "cart"
      required:
        - agentId
        - ownerId
        - humanPresent

    PaymentAuthorizationRequest:
      type: object
      properties:
        # ... existing fields ...
        agentContext:
          $ref: '#/components/schemas/AgentContext'
```

---

## Timeline Estimate

| Task | Estimate |
|------|----------|
| Accept agent context in authorization | 1-2 days |
| Database schema update | 1 day |
| Forward context to BSIM | 1-2 days |
| Include in webhooks | 1-2 days |
| Query filtering | 1-2 days |
| API documentation | 1 day |
| Testing | 2-3 days |
| **Total** | **~2 weeks** |

---

## Questions for Design Review

1. Should we validate agent context against WSIM? (performance trade-off)
2. What level of agent risk scoring should NSIM perform vs. delegating to BSIM?
3. Should we add a specific `payment.agent_transaction` webhook event type?

---

## Contact

**Project Lead**: [TBD]
**NSIM Team Lead**: [TBD]
**Design Review**: Schedule after initial read
