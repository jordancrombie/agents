# WSIM Team Requirements
## Agent Commerce Integration

**Project**: SimToolBox Agent Commerce Protocol (SACP)
**Component**: WSIM (Wallet Simulator)
**Priority**: P0 (Critical Path - Credentials Provider)

---

## Overview

WSIM serves as the **Credentials Provider (CP)** in the agent commerce ecosystem. This is the central authority for:
1. Registering and managing AI agents on behalf of human users
2. Issuing payment tokens for agent transactions
3. Enforcing spending limits and policies
4. Triggering step-up authentication when limits are exceeded
5. Providing mandate signing for transaction authorization

---

## Key Role: Credentials Provider

In the AP2 (Agent Payments Protocol) architecture, WSIM functions as the trusted intermediary between:
- **AI Agents** - need payment credentials to complete purchases
- **Human Owners** - authorize agents and approve transactions
- **Merchants (SSIM)** - need to verify agent authorization
- **Payment Networks (NSIM)** - process authorized payments

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│  Agent  │────>│  WSIM   │────>│  SSIM   │
└─────────┘     │  (CP)   │     └─────────┘
                │         │
┌─────────┐     │         │     ┌─────────┐
│  Human  │<───>│         │────>│  NSIM   │
└─────────┘     └─────────┘     └─────────┘
```

---

## Requirements

### P0 - Critical (Phase 1)

#### 1. Agent Registration System

**User Interface**: Add "AI Agents" section to wallet settings

**Workflow**:
1. User navigates to Settings > AI Agents
2. User clicks "Register New Agent"
3. User fills in agent details:
   - Name (e.g., "My Shopping Assistant")
   - Description (optional)
   - Permissions to grant
   - Spending limits
4. User confirms with passkey authentication
5. System generates OAuth client credentials
6. User copies credentials to configure their agent

**UI Components**:
- Agent registration form
- Agent list view
- Agent detail/edit view
- Activity log per agent
- Revoke agent button

**Agent Registration Data**:
```typescript
interface AgentRegistration {
  id: string;                   // agent_abc123
  ownerId: string;              // WSIM user ID
  name: string;
  description?: string;

  // OAuth credentials (generated)
  clientId: string;
  clientSecret: string;         // Show once, then hash

  // Permissions
  permissions: AgentPermission[];

  // Spending controls
  spendingLimits: {
    perTransaction: number;     // Auto-approve up to this
    daily: number;
    monthly: number;
    currency: string;
  };

  // Status
  status: 'active' | 'suspended' | 'revoked';

  // Tracking
  createdAt: Date;
  lastUsedAt?: Date;
  totalSpent: number;
  transactionCount: number;
}

type AgentPermission =
  | 'browse_products'
  | 'create_cart'
  | 'initiate_purchase'
  | 'complete_purchase'
  | 'view_orders';
```

#### 2. Agent OAuth Token Endpoint

**Endpoint**: `POST /api/agent/v1/oauth/token`

Agents use client credentials flow to get access tokens:

```json
POST /api/agent/v1/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=agent_abc123
&client_secret=secret_xyz
&scope=browse_products create_cart complete_purchase
```

**Response**:
```json
{
  "access_token": "eyJhbG...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "browse_products create_cart complete_purchase"
}
```

**Token Claims**:
```json
{
  "iss": "https://wsim.banksim.ca",
  "sub": "agent_abc123",
  "aud": ["ssim", "nsim"],
  "owner_id": "user_xyz789",
  "permissions": ["browse_products", "create_cart", "complete_purchase"],
  "spending_limits": {
    "per_transaction": 100.00,
    "daily_remaining": 450.00,
    "monthly_remaining": 2800.00
  },
  "iat": 1705846800,
  "exp": 1705850400
}
```

#### 3. Token Introspection Endpoint

**Endpoint**: `POST /api/agent/v1/oauth/introspect`

Merchants (SSIM) validate agent tokens:

```json
POST /api/agent/v1/oauth/introspect
Authorization: Basic {ssim_credentials}
Content-Type: application/x-www-form-urlencoded

token=eyJhbG...
```

**Response**:
```json
{
  "active": true,
  "client_id": "agent_abc123",
  "owner_id": "user_xyz789",
  "permissions": ["browse_products", "create_cart", "complete_purchase"],
  "spending_limits": {
    "per_transaction": 100.00,
    "daily_remaining": 450.00,
    "monthly_remaining": 2800.00
  },
  "exp": 1705850400
}
```

#### 4. Payment Token Issuance

**Endpoint**: `POST /api/agent/v1/payments/token`

Agent requests a payment token for a specific transaction:

```json
POST /api/agent/v1/payments/token
Authorization: Bearer {agent_token}
Content-Type: application/json

{
  "merchantId": "ssim_regalmoose",
  "sessionId": "sess_abc123",
  "amount": 56.48,
  "currency": "CAD",
  "items": [
    { "name": "Canadian Maple Syrup", "quantity": 2, "price": 24.99 }
  ]
}
```

**Response (Within Limits)**:
```json
{
  "status": "approved",
  "paymentToken": "wsim_tok_...",
  "mandateId": "mandate_...",
  "expiresAt": "2026-01-21T12:30:00Z"
}
```

**Response (Exceeds Limits)**:
```json
{
  "status": "step_up_required",
  "stepUpId": "stepup_xyz789",
  "reason": "Amount $56.48 exceeds per-transaction limit of $50.00",
  "stepUpUrl": "https://wsim.banksim.ca/step-up/stepup_xyz789",
  "expiresAt": "2026-01-21T12:30:00Z"
}
```

#### 5. Spending Limit Enforcement

Implement spending limit checks:

```typescript
async function checkSpendingLimits(
  agent: AgentRegistration,
  amount: number,
  currency: string
): Promise<SpendingCheckResult> {
  // Check per-transaction limit
  if (amount > agent.spendingLimits.perTransaction) {
    return {
      allowed: false,
      reason: 'per_transaction_exceeded',
      limit: agent.spendingLimits.perTransaction,
      requested: amount
    };
  }

  // Check daily limit
  const todaySpent = await getDailySpending(agent.id);
  if (todaySpent + amount > agent.spendingLimits.daily) {
    return {
      allowed: false,
      reason: 'daily_limit_exceeded',
      limit: agent.spendingLimits.daily,
      current: todaySpent,
      requested: amount
    };
  }

  // Check monthly limit
  const monthSpent = await getMonthlySpending(agent.id);
  if (monthSpent + amount > agent.spendingLimits.monthly) {
    return {
      allowed: false,
      reason: 'monthly_limit_exceeded',
      limit: agent.spendingLimits.monthly,
      current: monthSpent,
      requested: amount
    };
  }

  return { allowed: true };
}
```

#### 6. Step-Up Authentication Flow

When spending limits are exceeded, trigger human approval:

**Step 1: Create Step-Up Request**
```typescript
interface StepUpRequest {
  id: string;                   // stepup_xyz789
  agentId: string;
  ownerId: string;
  merchantId: string;
  sessionId: string;
  amount: number;
  currency: string;
  items: CartItem[];
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  createdAt: Date;
  expiresAt: Date;
}
```

**Step 2: Send Push Notification**

Use existing WSIM push infrastructure (APNs) to notify human:

```json
{
  "title": "Purchase Approval Needed",
  "body": "Your agent wants to spend $156.48 at Regal Moose",
  "data": {
    "type": "step_up",
    "stepUpId": "stepup_xyz789"
  }
}
```

**Step 3: Approval UI**

Create web page at `/step-up/:stepUpId`:
- Show purchase details (merchant, items, total)
- Show which agent is requesting
- Show reason for step-up
- "Approve" and "Reject" buttons
- Passkey authentication for approval

**Step 4: Webhook Callback**

After approval/rejection, notify the merchant:

```json
POST {merchant_webhook_url}
{
  "type": "step_up.resolved",
  "stepUpId": "stepup_xyz789",
  "sessionId": "sess_abc123",
  "status": "approved",
  "paymentToken": "wsim_tok_...",
  "mandateId": "mandate_..."
}
```

#### 7. Spending Tracking

Track agent spending for limit enforcement:

```sql
CREATE TABLE wsim_agent_transactions (
  id VARCHAR(255) PRIMARY KEY,
  agent_id VARCHAR(255) NOT NULL,
  owner_id VARCHAR(255) NOT NULL,
  merchant_id VARCHAR(255) NOT NULL,
  session_id VARCHAR(255),
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  status VARCHAR(50) NOT NULL,
  mandate_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),

  FOREIGN KEY (agent_id) REFERENCES wsim_agents(id)
);

-- Indexes for spending queries
CREATE INDEX idx_agent_tx_daily ON wsim_agent_transactions(agent_id, created_at);
```

---

### P1 - Important (Phase 2)

#### 8. Mandate Signing

Implement cryptographic signing of mandates:

**Cart Mandate** (for specific purchase):
```typescript
interface CartMandate {
  mandateId: string;
  type: 'cart';
  agentId: string;
  ownerId: string;
  cart: {
    merchantId: string;
    sessionId: string;
    items: CartItem[];
    subtotal: number;
    tax: number;
    total: number;
    currency: string;
  };
  humanPresent: boolean;
  createdAt: string;
  signature: string;            // HMAC or RSA signature
}
```

**Signing Process**:
```typescript
function signMandate(mandate: UnsignedMandate, signingKey: string): string {
  const payload = JSON.stringify({
    mandateId: mandate.mandateId,
    type: mandate.type,
    agentId: mandate.agentId,
    ownerId: mandate.ownerId,
    cart: mandate.cart,
    createdAt: mandate.createdAt
  });

  return crypto
    .createHmac('sha256', signingKey)
    .update(payload)
    .digest('hex');
}
```

#### 9. Agent Dashboard

Add dashboard for human users to monitor agent activity:

**Features**:
- List of registered agents
- Per-agent transaction history
- Spending charts (daily/monthly)
- Real-time activity feed
- Suspend/revoke controls
- Edit spending limits

**UI Components**:
- `/settings/agents` - Agent list
- `/settings/agents/:id` - Agent details
- `/settings/agents/:id/transactions` - Transaction history
- `/settings/agents/:id/edit` - Edit settings

#### 10. Intent Mandates (Pre-Authorization)

Allow users to pre-authorize categories of purchases:

```typescript
interface IntentMandate {
  mandateId: string;
  type: 'intent';
  agentId: string;
  ownerId: string;
  intent: {
    description: string;        // "Buy coffee when running low"
    categories?: string[];      // ["groceries", "food"]
    merchants?: string[];       // ["ssim_regalmoose"]
    maxAmount: number;
    currency: string;
  };
  validFrom: string;
  validUntil: string;
  signature: string;
}
```

---

### P2 - Nice to Have (Phase 3)

#### 11. Agent Activity Webhooks

Notify external systems of agent activity:

```json
POST {user_webhook_url}
{
  "type": "agent.transaction",
  "agentId": "agent_abc123",
  "transaction": {
    "merchantId": "ssim_regalmoose",
    "amount": 56.48,
    "status": "completed"
  }
}
```

#### 12. Merchant Allow/Block Lists

Let users restrict which merchants their agents can use:

```typescript
interface AgentMerchantPolicy {
  agentId: string;
  mode: 'allowlist' | 'blocklist';
  merchants: string[];
}
```

#### 13. Velocity Controls

Detect anomalous spending patterns:

- Too many transactions in short period
- Unusual merchant categories
- Geographic anomalies
- Amount patterns

---

## Database Changes

### New Tables

```sql
-- Agent registrations
CREATE TABLE wsim_agents (
  id VARCHAR(255) PRIMARY KEY,
  owner_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  client_id VARCHAR(255) UNIQUE NOT NULL,
  client_secret_hash VARCHAR(255) NOT NULL,
  permissions JSONB NOT NULL,
  spending_limits JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,

  FOREIGN KEY (owner_id) REFERENCES wsim_users(id)
);

-- Agent transactions for spending tracking
CREATE TABLE wsim_agent_transactions (
  id VARCHAR(255) PRIMARY KEY,
  agent_id VARCHAR(255) NOT NULL,
  owner_id VARCHAR(255) NOT NULL,
  merchant_id VARCHAR(255) NOT NULL,
  session_id VARCHAR(255),
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  status VARCHAR(50) NOT NULL,
  mandate_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),

  FOREIGN KEY (agent_id) REFERENCES wsim_agents(id)
);

-- Step-up requests
CREATE TABLE wsim_step_up_requests (
  id VARCHAR(255) PRIMARY KEY,
  agent_id VARCHAR(255) NOT NULL,
  owner_id VARCHAR(255) NOT NULL,
  merchant_id VARCHAR(255) NOT NULL,
  session_id VARCHAR(255),
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  items JSONB NOT NULL,
  reason VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  callback_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  resolved_at TIMESTAMP,

  FOREIGN KEY (agent_id) REFERENCES wsim_agents(id)
);

-- Mandates
CREATE TABLE wsim_mandates (
  id VARCHAR(255) PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  agent_id VARCHAR(255) NOT NULL,
  owner_id VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  signature VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,

  FOREIGN KEY (agent_id) REFERENCES wsim_agents(id)
);

-- Indexes
CREATE INDEX idx_agents_owner ON wsim_agents(owner_id);
CREATE INDEX idx_agent_tx_agent ON wsim_agent_transactions(agent_id);
CREATE INDEX idx_agent_tx_created ON wsim_agent_transactions(created_at);
CREATE INDEX idx_step_up_status ON wsim_step_up_requests(status, expires_at);
```

---

## API Summary

### Agent Management
```
POST   /api/agent/v1/agents                # Register agent
GET    /api/agent/v1/agents                # List my agents
GET    /api/agent/v1/agents/:id            # Get agent details
PATCH  /api/agent/v1/agents/:id            # Update agent
DELETE /api/agent/v1/agents/:id            # Revoke agent
```

### OAuth
```
POST   /api/agent/v1/oauth/token           # Get access token
POST   /api/agent/v1/oauth/introspect      # Validate token
POST   /api/agent/v1/oauth/revoke          # Revoke token
```

### Payments
```
POST   /api/agent/v1/payments/token        # Get payment token
GET    /api/agent/v1/payments/:id/status   # Check payment status
```

### Step-Up
```
GET    /step-up/:id                        # Step-up approval page
POST   /api/step-up/:id/approve            # Approve (with passkey)
POST   /api/step-up/:id/reject             # Reject
```

---

## Security Considerations

1. **Client Secrets**: Hash with bcrypt, show only once at registration
2. **Token Expiration**: Short-lived tokens (1 hour), refresh via new client_credentials call
3. **Step-Up Expiration**: 15-minute window for approval
4. **Passkey Required**: All approval actions require passkey authentication
5. **Audit Logging**: Log all agent actions with mandate references
6. **Rate Limiting**: Limit token requests per agent

---

## Timeline Estimate

| Task | Estimate |
|------|----------|
| Agent registration UI | 3-5 days |
| Agent database schema | 1-2 days |
| OAuth token endpoint | 2-3 days |
| Token introspection | 1-2 days |
| Payment token issuance | 3-5 days |
| Spending limit enforcement | 2-3 days |
| Step-up flow (backend) | 3-5 days |
| Step-up UI | 3-5 days |
| Push notification integration | 2-3 days |
| Mandate signing | 2-3 days |
| Agent dashboard | 5-7 days |
| Testing | 5-7 days |
| **Total** | **~6-8 weeks** |

---

## Questions for Design Review

1. Should agent secrets be rotatable without re-registering?
2. What's the default step-up expiration time? (Suggesting 15 minutes)
3. Should we support multiple payment methods per agent (card selection)?
4. How do we handle timezone for daily spending limits?
5. Should mwsim users be able to register/manage agents from mobile?

---

## Contact

**Project Lead**: [TBD]
**WSIM Team Lead**: [TBD]
**Design Review**: Schedule after initial read
