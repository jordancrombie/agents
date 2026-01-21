# SimToolBox Agent Commerce Protocol (SACP)

## Executive Summary

This document defines the **SimToolBox Agent Commerce Protocol (SACP)** - a protocol enabling AI agents to discover products, initiate purchases, and complete transactions on SimToolBox stores (BSIM, SSIM) while using the wallet (WSIM) for authentication, authorization, and payment credential management.

**Design Philosophy**: Align with emerging industry standards (UCP, AP2, ACP) while providing a working reference implementation within the SimToolBox ecosystem.

---

## Industry Alignment

SACP is designed to be compatible with:

| Protocol | Owner | Purpose | Our Alignment |
|----------|-------|---------|---------------|
| **UCP** (Universal Commerce Protocol) | Google + Shopify | Merchant discovery & checkout | `/.well-known/ucp` profiles, MCP tools |
| **AP2** (Agent Payments Protocol) | Google + Visa/Mastercard | Secure agent payments | Mandate structure, Credentials Provider pattern |
| **ACP** (Agentic Commerce Protocol) | OpenAI + Stripe | ChatGPT checkout sessions | REST checkout session API |

---

## Architecture Overview

```
                                    ┌─────────────────────────────────────────┐
                                    │           AI AGENT                      │
                                    │  (ChatGPT, Claude, Custom Agent)        │
                                    └──────┬──────────────┬──────────────┬────┘
                                           │              │              │
                              ┌────────────▼────┐   ┌─────▼─────┐   ┌───▼────┐
                              │   1. DISCOVER   │   │ 2. SHOP   │   │ 3. PAY │
                              │   (UCP/MCP)     │   │  (REST)   │   │ (AP2)  │
                              └────────────┬────┘   └─────┬─────┘   └───┬────┘
                                           │              │              │
┌──────────────────────────────────────────▼──────────────▼──────────────▼────┐
│                                      SSIM                                    │
│                              (Store Simulator)                               │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────────────┐  │
│  │ /.well-known/ucp│  │ /api/agent/      │  │ Product Catalog, Cart,     │  │
│  │ (Discovery)     │  │ (Checkout API)   │  │ Checkout Sessions          │  │
│  └─────────────────┘  └──────────────────┘  └────────────────────────────┘  │
└────────────────────────────────────────┬────────────────────────────────────┘
                                         │
                                         │ Payment Request + Mandate
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                                      WSIM                                     │
│                         (Wallet - Credentials Provider)                       │
│  ┌───────────────┐  ┌────────────────┐  ┌─────────────────┐  ┌────────────┐  │
│  │ Agent         │  │ Mandate        │  │ Payment Token   │  │ Step-Up    │  │
│  │ Registration  │  │ Signing        │  │ Issuance        │  │ Auth       │  │
│  └───────────────┘  └────────────────┘  └─────────────────┘  └────────────┘  │
└────────────────────────────────────────┬────────────────────────────────────┘
                                         │
                                         │ Payment Mandate + Token
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                                      NSIM                                     │
│                            (Payment Network)                                  │
│  ┌───────────────────────┐  ┌──────────────────┐  ┌───────────────────────┐  │
│  │ Authorization         │  │ Agent Transaction │  │ Multi-Bank Routing    │  │
│  │ (with agent flag)     │  │ Risk Signals      │  │                       │  │
│  └───────────────────────┘  └──────────────────┘  └───────────────────────┘  │
└────────────────────────────────────────┬────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                                      BSIM                                     │
│                            (Banking Simulator)                                │
│  ┌───────────────────────┐  ┌──────────────────┐  ┌───────────────────────┐  │
│  │ Card Authorization    │  │ Account Debit    │  │ Transaction History   │  │
│  │                       │  │                  │  │ (with agent flag)     │  │
│  └───────────────────────┘  └──────────────────┘  └───────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Concepts

### 1. Agent Identity

Agents are registered entities with:
- **Agent ID**: Unique identifier (e.g., `agent_abc123`)
- **Owner**: Human user who authorized the agent
- **Credentials**: OAuth client credentials for API access
- **Permissions**: What the agent is allowed to do
- **Spending Limits**: Maximum amounts for various tiers

```typescript
interface AgentRegistration {
  agentId: string;
  ownerId: string;              // WSIM user ID
  name: string;                 // "Claude Shopping Assistant"
  description?: string;
  permissions: AgentPermission[];
  spendingLimits: SpendingLimits;
  status: 'active' | 'suspended' | 'revoked';
  createdAt: string;
  lastUsedAt?: string;
}

interface SpendingLimits {
  perTransaction: number;       // Auto-approved up to this amount
  daily: number;                // Daily maximum
  monthly: number;              // Monthly maximum
  currency: string;             // "CAD"
}

type AgentPermission =
  | 'browse_products'           // View catalogs
  | 'create_cart'               // Add items to cart
  | 'initiate_purchase'         // Start checkout (requires step-up above limit)
  | 'complete_purchase'         // Complete purchase (within limits)
  | 'view_orders'               // View order history
  | 'manage_subscriptions';     // Manage recurring orders
```

### 2. Mandates (AP2-aligned)

Mandates are cryptographically signed authorizations:

#### Intent Mandate (Pre-Authorization)
Created by user when authorizing an agent. Defines what the agent CAN do.

```typescript
interface IntentMandate {
  mandateId: string;
  type: 'intent';
  agentId: string;
  ownerId: string;
  intent: {
    description: string;        // "Buy coffee supplies when running low"
    categories?: string[];      // ["groceries", "office-supplies"]
    merchants?: string[];       // Specific allowed merchants
    maxAmount: number;
    currency: string;
  };
  validFrom: string;
  validUntil: string;
  signature: string;            // User's cryptographic signature
}
```

#### Cart Mandate (Per-Transaction)
Created when agent initiates a specific purchase. Signed by user for amounts above auto-approve threshold.

```typescript
interface CartMandate {
  mandateId: string;
  type: 'cart';
  agentId: string;
  ownerId: string;
  cart: {
    merchantId: string;
    items: CartItem[];
    subtotal: number;
    tax: number;
    total: number;
    currency: string;
  };
  humanPresent: boolean;        // Was user present when signing?
  signature?: string;           // Required if above auto-approve limit
  createdAt: string;
}
```

#### Payment Mandate (For Payment Network)
Attached to payment authorization. Signals AI agent involvement.

```typescript
interface PaymentMandate {
  mandateId: string;
  type: 'payment';
  cartMandateId: string;
  agentId: string;
  humanPresent: boolean;
  paymentMethod: {
    type: 'card' | 'wallet';
    tokenId: string;
  };
  amount: number;
  currency: string;
  signature: string;
}
```

### 3. Checkout Sessions (ACP-aligned)

REST API for managing agent checkout:

```typescript
interface CheckoutSession {
  sessionId: string;
  agentId: string;
  merchantId: string;
  status: CheckoutStatus;
  cart: {
    items: CartItem[];
    subtotal: number;
    discounts: Discount[];
    tax: number;
    shipping?: ShippingOption;
    total: number;
    currency: string;
  };
  buyer?: {
    name?: string;
    email?: string;
    shippingAddress?: Address;
  };
  payment?: {
    mandateId?: string;
    tokenId?: string;
    status: 'pending' | 'authorized' | 'captured' | 'failed';
  };
  messages: SessionMessage[];
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

type CheckoutStatus =
  | 'cart_building'             // Agent adding items
  | 'awaiting_buyer_info'       // Need shipping/billing
  | 'awaiting_authorization'    // Need user approval (step-up)
  | 'ready_for_payment'         // Can complete
  | 'processing'                // Payment in progress
  | 'completed'                 // Success
  | 'cancelled'                 // Abandoned
  | 'failed';                   // Payment failed
```

---

## Flows

### Flow 1: Agent Registration

Human user registers an agent in their wallet:

```
┌─────────┐          ┌─────────┐
│  Human  │          │  WSIM   │
└────┬────┘          └────┬────┘
     │                    │
     │  1. Login to WSIM  │
     │───────────────────>│
     │                    │
     │  2. Navigate to    │
     │     Agent Settings │
     │───────────────────>│
     │                    │
     │  3. Register Agent │
     │  - Name, description
     │  - Permissions     │
     │  - Spending limits │
     │───────────────────>│
     │                    │
     │  4. Sign Intent    │
     │     Mandate        │
     │<───────────────────│
     │                    │
     │  5. Confirm with   │
     │     Passkey        │
     │───────────────────>│
     │                    │
     │  6. Return Agent   │
     │     Credentials    │
     │  - client_id       │
     │  - client_secret   │
     │<───────────────────│
     │                    │
```

### Flow 2: Agent Discovery (UCP-aligned)

Agent discovers merchant capabilities:

```
┌─────────┐          ┌─────────┐
│  Agent  │          │  SSIM   │
└────┬────┘          └────┬────┘
     │                    │
     │ GET /.well-known/ucp
     │───────────────────>│
     │                    │
     │ Merchant Profile   │
     │ - capabilities     │
     │ - api_endpoints    │
     │ - payment_methods  │
     │ - mcp_tools        │
     │<───────────────────│
     │                    │
     │ (Optional) MCP     │
     │ tool discovery     │
     │───────────────────>│
     │                    │
```

### Flow 3: Agent Purchase (Auto-Approved)

Purchase within spending limits - no step-up required:

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  Agent  │     │  SSIM   │     │  WSIM   │     │  NSIM   │     │  BSIM   │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │               │
     │ 1. Create     │               │               │               │
     │    Session    │               │               │               │
     │──────────────>│               │               │               │
     │               │               │               │               │
     │ 2. Add Items  │               │               │               │
     │──────────────>│               │               │               │
     │               │               │               │               │
     │ 3. Set Buyer  │               │               │               │
     │    Info       │               │               │               │
     │──────────────>│               │               │               │
     │               │               │               │               │
     │ 4. Request    │               │               │               │
     │    Payment    │               │               │               │
     │──────────────>│               │               │               │
     │               │ 5. Get Token  │               │               │
     │               │──────────────>│               │               │
     │               │               │               │               │
     │               │ 6. Validate   │               │               │
     │               │    Limits     │               │               │
     │               │    (OK)       │               │               │
     │               │<──────────────│               │               │
     │               │               │               │               │
     │               │ 7. Create     │               │               │
     │               │    Mandates   │               │               │
     │               │<──────────────│               │               │
     │               │               │               │               │
     │               │ 8. Authorize  │               │               │
     │               │    Payment    │               │               │
     │               │──────────────────────────────>│               │
     │               │               │               │               │
     │               │               │               │ 9. Auth Card  │
     │               │               │               │──────────────>│
     │               │               │               │               │
     │               │               │               │ 10. Approved  │
     │               │               │               │<──────────────│
     │               │               │               │               │
     │               │ 11. Payment   │               │               │
     │               │     Complete  │               │               │
     │               │<──────────────────────────────│               │
     │               │               │               │               │
     │ 12. Order     │               │               │               │
     │     Confirmed │               │               │               │
     │<──────────────│               │               │               │
     │               │               │               │               │
```

### Flow 4: Agent Purchase (Step-Up Required)

Purchase exceeds limits - human approval needed:

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  Agent  │     │  SSIM   │     │  WSIM   │     │  Human  │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │
     │ 1-4. Same as  │               │               │
     │      above    │               │               │
     │──────────────>│               │               │
     │               │ 5. Get Token  │               │
     │               │──────────────>│               │
     │               │               │               │
     │               │ 6. Validate   │               │
     │               │    Limits     │               │
     │               │    (EXCEEDS)  │               │
     │               │<──────────────│               │
     │               │               │               │
     │ 7. Status:    │               │               │
     │    awaiting_  │               │               │
     │    authorization              │               │
     │<──────────────│               │               │
     │               │               │               │
     │               │               │ 8. Push       │
     │               │               │    Notification
     │               │               │──────────────>│
     │               │               │               │
     │               │               │ 9. Review     │
     │               │               │    Cart       │
     │               │               │<──────────────│
     │               │               │               │
     │               │               │ 10. Approve   │
     │               │               │     + Sign    │
     │               │               │     Mandate   │
     │               │               │<──────────────│
     │               │               │               │
     │               │ 11. Cart      │               │
     │               │     Mandate   │               │
     │               │<──────────────│               │
     │               │               │               │
     │ 12. Webhook:  │               │               │
     │     authorized│               │               │
     │<──────────────│               │               │
     │               │               │               │
     │ 13. Complete  │               │               │
     │     Payment   │               │               │
     │──────────────>│               │               │
     │               │               │               │
     │ ... (continue payment flow)   │               │
```

---

## API Specifications

### SSIM Agent API

#### Discovery Endpoint

```
GET /.well-known/ucp
```

Response:
```json
{
  "version": "1.0",
  "merchant": {
    "id": "ssim_regalmoose",
    "name": "Regal Moose",
    "description": "Premium Canadian goods",
    "logo": "https://ssim.banksim.ca/logo.png",
    "url": "https://ssim.banksim.ca"
  },
  "capabilities": {
    "discovery": true,
    "cart": true,
    "checkout": true,
    "order_status": true,
    "returns": false
  },
  "api": {
    "base_url": "https://ssim.banksim.ca/api/agent/v1",
    "authentication": "bearer",
    "endpoints": {
      "products": "/products",
      "sessions": "/sessions",
      "orders": "/orders"
    }
  },
  "mcp": {
    "server_url": "https://ssim.banksim.ca/mcp",
    "tools": ["search_products", "get_product", "create_cart", "checkout"]
  },
  "payment_methods": {
    "supported": ["card", "wallet"],
    "wallets": ["wsim"]
  },
  "policies": {
    "terms": "https://ssim.banksim.ca/terms",
    "privacy": "https://ssim.banksim.ca/privacy",
    "returns": "https://ssim.banksim.ca/returns"
  }
}
```

#### Checkout Session Endpoints

```
POST   /api/agent/v1/sessions              # Create session
GET    /api/agent/v1/sessions/:id          # Get session
PATCH  /api/agent/v1/sessions/:id          # Update session
POST   /api/agent/v1/sessions/:id/complete # Complete checkout
DELETE /api/agent/v1/sessions/:id          # Cancel session
```

### WSIM Agent API

#### Agent Management

```
POST   /api/agent/v1/agents                # Register agent
GET    /api/agent/v1/agents/:id            # Get agent
PATCH  /api/agent/v1/agents/:id            # Update agent
DELETE /api/agent/v1/agents/:id            # Revoke agent
```

#### Payment Authorization

```
POST   /api/agent/v1/payments/token        # Get payment token
POST   /api/agent/v1/payments/authorize    # Request authorization
GET    /api/agent/v1/payments/:id/status   # Check status
```

#### Step-Up Endpoints (for human approval)

```
GET    /api/step-up/:requestId             # View pending approval
POST   /api/step-up/:requestId/approve     # Approve
POST   /api/step-up/:requestId/reject      # Reject
```

### NSIM Extensions

#### Payment Authorization (Extended)

```
POST /api/v1/payments/authorize
```

Request body includes new fields:
```json
{
  "merchantId": "ssim_regalmoose",
  "amount": 49.99,
  "currency": "CAD",
  "cardToken": "wsim_token_...",
  "orderId": "order_123",
  "agentContext": {
    "agentId": "agent_abc123",
    "ownerId": "user_xyz789",
    "humanPresent": false,
    "mandateId": "mandate_...",
    "mandateType": "cart"
  }
}
```

---

## Component Requirements

### SSIM Team

| Priority | Requirement | Description |
|----------|-------------|-------------|
| P0 | UCP Discovery | `/.well-known/ucp` endpoint with merchant profile |
| P0 | Agent Session API | REST endpoints for checkout sessions |
| P0 | Schema.org Markup | Product data in JSON-LD format |
| P1 | MCP Server | Model Context Protocol tools for AI |
| P1 | Webhook Notifications | Session status webhooks to agents |
| P2 | Multi-store UCP | Per-store UCP profiles |

### WSIM Team

| Priority | Requirement | Description |
|----------|-------------|-------------|
| P0 | Agent Registration | UI and API for registering agents |
| P0 | Payment Token API | Token issuance for agent payments |
| P0 | Spending Limits | Enforce per-transaction, daily, monthly limits |
| P0 | Step-Up Auth | Push notification + approval UI for over-limit |
| P1 | Mandate Signing | Cryptographic signing of cart/intent mandates |
| P1 | Agent Dashboard | View agent activity, spending, revoke access |
| P2 | Intent Mandates | Pre-authorize categories/merchants/amounts |

### NSIM Team

| Priority | Requirement | Description |
|----------|-------------|-------------|
| P0 | Agent Context | Accept and store agent context in transactions |
| P1 | Payment Mandate | Forward mandate to BSIM for visibility |
| P2 | Agent Risk Scoring | Enhanced risk signals for agent transactions |

### BSIM Team

| Priority | Requirement | Description |
|----------|-------------|-------------|
| P1 | Agent Flag | Display agent transactions in history |
| P2 | Agent Policies | Bank-level agent transaction policies |

---

## Security Considerations

1. **Agent Authentication**: OAuth 2.0 client credentials with short-lived tokens
2. **Mandate Integrity**: Cryptographic signatures on all mandates
3. **Spending Controls**: Enforced at WSIM before any transaction
4. **Step-Up Triggers**: Amount, merchant category, velocity, anomaly detection
5. **Audit Trail**: All agent actions logged with mandate references
6. **Revocation**: Immediate revocation propagates to all components

---

## Future Roadmap

### Phase 2: Enhanced Capabilities
- [ ] Agent-to-Agent (A2A) payments
- [ ] Subscription management by agents
- [ ] Multi-step fulfillment (preorders, backorders)
- [ ] Return/refund initiation by agents

### Phase 3: Ecosystem Expansion
- [ ] ContractSim integration (escrow for agent purchases)
- [ ] TransferSim integration (P2P agent payments)
- [ ] mwsim agent mode (mobile app as agent host)
- [ ] Direct BSIM/NSIM access (bypass WSIM for trusted agents)

---

## References

- [Universal Commerce Protocol (UCP)](https://developers.googleblog.com/under-the-hood-universal-commerce-protocol-ucp/) - Google
- [Agent Payments Protocol (AP2)](https://ap2-protocol.org/) - Google
- [Agentic Commerce Protocol (ACP)](https://developers.openai.com/commerce/) - OpenAI
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) - Anthropic
