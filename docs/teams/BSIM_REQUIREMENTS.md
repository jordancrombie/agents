# BSIM Team Requirements
## Agent Commerce Integration

**Project**: SimToolBox Agent Commerce Protocol (SACP)
**Component**: BSIM (Banking Simulator)
**Priority**: P1 (Important - Issuer Visibility)

---

## Overview

BSIM (as the issuing bank) needs to:
1. Receive and store agent context from NSIM
2. Display agent transactions distinctly in account history
3. Optionally apply agent-specific policies

---

## Requirements

### P1 - Important (Phase 1)

#### 1. Accept Agent Context from NSIM

**Current Payment Network Endpoint**: `POST /api/payment-network/authorize`

**Extended Request Body**:
```json
{
  "cardToken": "ctok_...",
  "amount": 56.48,
  "currency": "CAD",
  "merchantId": "ssim_regalmoose",
  "merchantName": "Regal Moose",

  // NEW: Agent context forwarded from NSIM
  "agentContext": {
    "agentId": "agent_abc123",
    "ownerId": "user_xyz789",
    "humanPresent": false,
    "mandateType": "cart"
  }
}
```

**Processing**:
1. Accept agent context (no validation required - trust NSIM)
2. Store with card transaction record
3. Continue normal authorization flow

#### 2. Store Agent Context in Transactions

**Database Update**:
```sql
ALTER TABLE bsim_card_transactions
ADD COLUMN agent_id VARCHAR(255),
ADD COLUMN agent_owner_id VARCHAR(255),
ADD COLUMN agent_human_present BOOLEAN;

-- Index for agent filtering
CREATE INDEX idx_card_tx_agent ON bsim_card_transactions(agent_id);
```

#### 3. Display Agent Transactions in UI

**Transaction History Enhancement**:

Add visual indicator for agent transactions:

```tsx
// Transaction row component
function TransactionRow({ transaction }) {
  return (
    <div className="transaction-row">
      <div className="merchant">
        {transaction.merchantName}
        {transaction.agentId && (
          <span className="agent-badge" title="AI Agent Transaction">
            🤖 Agent
          </span>
        )}
      </div>
      <div className="amount">{formatCurrency(transaction.amount)}</div>
      {transaction.agentId && (
        <div className="agent-info text-sm text-gray-500">
          Via {transaction.agentId}
          {!transaction.agentHumanPresent && " (autonomous)"}
        </div>
      )}
    </div>
  );
}
```

**Transaction Detail View**:
- Show "AI Agent Transaction" section
- Display agent ID
- Show whether human was present
- Link to owner's profile (if same user)

---

### P2 - Nice to Have (Phase 2)

#### 4. Agent Transaction Filtering

Add filter option in transaction history:

```
GET /api/accounts/:id/transactions?agentOnly=true
GET /api/accounts/:id/transactions?humanOnly=true
```

UI toggle: "Show only AI Agent transactions"

#### 5. Agent Transaction Summary

Add summary card in account dashboard:

```tsx
function AgentSummaryCard({ accountId }) {
  const stats = useAgentStats(accountId);

  return (
    <Card>
      <h3>AI Agent Activity</h3>
      <div>Transactions this month: {stats.count}</div>
      <div>Total spent by agents: {formatCurrency(stats.total)}</div>
      <div>Active agents: {stats.uniqueAgents}</div>
    </Card>
  );
}
```

#### 6. Agent Policies (Future)

Bank-level policies for agent transactions:

```typescript
interface AgentPolicy {
  enabled: boolean;
  maxTransactionAmount?: number;
  requireHumanPresent?: boolean;
  blockedMerchantCategories?: string[];
  alertThreshold?: number;
}
```

---

## Database Changes

```sql
-- Add agent context to card transactions
ALTER TABLE bsim_card_transactions
ADD COLUMN agent_id VARCHAR(255),
ADD COLUMN agent_owner_id VARCHAR(255),
ADD COLUMN agent_human_present BOOLEAN;

CREATE INDEX idx_card_tx_agent ON bsim_card_transactions(agent_id);

-- Future: Bank-level agent policies
-- CREATE TABLE bsim_agent_policies (
--   id VARCHAR(255) PRIMARY KEY,
--   bank_id VARCHAR(255) NOT NULL,
--   enabled BOOLEAN DEFAULT true,
--   config JSONB NOT NULL,
--   created_at TIMESTAMP DEFAULT NOW()
-- );
```

---

## Timeline Estimate

| Task | Estimate |
|------|----------|
| Accept agent context in authorization | 1-2 days |
| Database schema update | 1 day |
| Transaction history UI updates | 2-3 days |
| Transaction detail view | 1-2 days |
| Testing | 2-3 days |
| **Total** | **~1.5-2 weeks** |

---

## Questions for Design Review

1. Should agent badge be opt-in or always shown?
2. Do we need to verify agent ownership (agentOwnerId matches cardholder)?
3. Should BSIM have authority to decline agent transactions based on policy?

---

## Contact

**Project Lead**: [TBD]
**BSIM Team Lead**: [TBD]
**Design Review**: Schedule after initial read
