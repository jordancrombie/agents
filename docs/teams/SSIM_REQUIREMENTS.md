# SSIM Team Requirements
## Agent Commerce Integration

**Project**: SimToolBox Agent Commerce Protocol (SACP)
**Component**: SSIM (Store Simulator / Regal Moose)
**Priority**: P0 (Critical Path)

---

## Overview

SSIM needs to expose machine-readable interfaces that allow AI agents to:
1. Discover the store's capabilities
2. Browse and search products
3. Create and manage checkout sessions
4. Complete purchases via the agent protocol

---

## Requirements

### P0 - Critical (Phase 1)

#### 1. UCP Discovery Endpoint

**Endpoint**: `GET /.well-known/ucp`

Create a JSON endpoint that describes the store's agent capabilities.

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
  "payment_methods": {
    "supported": ["card", "wallet"],
    "wallets": ["wsim"]
  },
  "policies": {
    "terms": "https://ssim.banksim.ca/terms",
    "privacy": "https://ssim.banksim.ca/privacy"
  }
}
```

**Notes**:
- Should respect multi-tenant (per-store) configuration
- Logo and URLs should be dynamic based on store branding
- Consider caching with reasonable TTL

#### 2. Agent Authentication

Agents authenticate using OAuth 2.0 Bearer tokens issued by WSIM.

**Implementation**:
1. Accept `Authorization: Bearer {token}` header
2. Validate token against WSIM's token introspection endpoint
3. Extract agent identity: `agentId`, `ownerId`, `permissions`
4. Reject requests with invalid/expired tokens

```typescript
// Middleware example
async function authenticateAgent(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing token' });

  const agentContext = await wsimClient.introspectToken(token);
  if (!agentContext.valid) return res.status(401).json({ error: 'Invalid token' });

  req.agent = agentContext;
  next();
}
```

#### 3. Product Catalog API

**Endpoints**:
```
GET  /api/agent/v1/products              # List products
GET  /api/agent/v1/products/:id          # Get product details
GET  /api/agent/v1/products/search       # Search products
```

**Product Response**:
```json
{
  "id": "prod_123",
  "name": "Canadian Maple Syrup",
  "description": "Grade A amber maple syrup from Quebec",
  "price": {
    "amount": 24.99,
    "currency": "CAD"
  },
  "images": [
    { "url": "https://...", "alt": "Bottle front view" }
  ],
  "inventory": {
    "available": true,
    "quantity": 50
  },
  "categories": ["food", "condiments"],
  "attributes": {
    "size": "500ml",
    "grade": "A Amber"
  },
  "schema_org": {
    "@type": "Product",
    "...": "Full Schema.org Product markup"
  }
}
```

**Search Parameters**:
- `q` - Full text search
- `category` - Filter by category
- `minPrice` / `maxPrice` - Price range
- `inStock` - Only available items
- `limit` / `offset` - Pagination

#### 4. Checkout Session API

**Endpoints**:
```
POST   /api/agent/v1/sessions              # Create session
GET    /api/agent/v1/sessions/:id          # Get session
PATCH  /api/agent/v1/sessions/:id          # Update session
POST   /api/agent/v1/sessions/:id/complete # Complete checkout
DELETE /api/agent/v1/sessions/:id          # Cancel session
```

**Create Session**:
```json
POST /api/agent/v1/sessions
{
  "items": [
    { "productId": "prod_123", "quantity": 2 }
  ]
}
```

**Session Response**:
```json
{
  "sessionId": "sess_abc123",
  "status": "cart_building",
  "cart": {
    "items": [
      {
        "productId": "prod_123",
        "name": "Canadian Maple Syrup",
        "quantity": 2,
        "unitPrice": 24.99,
        "subtotal": 49.98
      }
    ],
    "subtotal": 49.98,
    "tax": 6.50,
    "shipping": null,
    "total": 56.48,
    "currency": "CAD"
  },
  "buyer": null,
  "fulfillment": null,
  "payment": null,
  "messages": [],
  "expiresAt": "2026-01-21T12:00:00Z"
}
```

**Update Session**:
```json
PATCH /api/agent/v1/sessions/:id
{
  "items": [
    { "productId": "prod_123", "quantity": 3 }
  ],
  "buyer": {
    "name": "John Doe",
    "email": "john@example.com"
  },
  "fulfillment": {
    "type": "shipping",
    "address": {
      "line1": "123 Main St",
      "city": "Toronto",
      "province": "ON",
      "postalCode": "M5V 1A1",
      "country": "CA"
    }
  }
}
```

**Complete Checkout**:
```json
POST /api/agent/v1/sessions/:id/complete
{
  "paymentToken": "wsim_tok_...",
  "mandateId": "mandate_..."
}
```

**Session Statuses**:
| Status | Description |
|--------|-------------|
| `cart_building` | Agent adding/modifying items |
| `awaiting_buyer_info` | Missing required buyer/shipping info |
| `awaiting_authorization` | Need human step-up approval (from WSIM) |
| `ready_for_payment` | Can complete checkout |
| `processing` | Payment in progress |
| `completed` | Order created successfully |
| `cancelled` | Session cancelled |
| `failed` | Payment failed |

#### 5. WSIM Integration for Payments

When completing checkout:

1. Receive `paymentToken` from agent (issued by WSIM)
2. Call WSIM to validate token and get agent context
3. If amount > agent's auto-approve limit:
   - Set session status to `awaiting_authorization`
   - WSIM triggers step-up notification to human
   - Wait for approval webhook
4. Once authorized, proceed with NSIM payment flow
5. Include `agentContext` in NSIM authorization request

```typescript
// Payment authorization with agent context
const nsimResponse = await nsim.authorize({
  merchantId: store.merchantId,
  amount: session.cart.total,
  currency: session.cart.currency,
  cardToken: paymentToken,
  orderId: session.sessionId,
  agentContext: {
    agentId: session.agentId,
    ownerId: session.ownerId,
    humanPresent: false,
    mandateId: session.mandateId
  }
});
```

---

### P1 - Important (Phase 2)

#### 6. Schema.org Product Markup

Add JSON-LD markup to product pages and API responses:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Canadian Maple Syrup",
  "description": "Grade A amber maple syrup",
  "image": "https://...",
  "sku": "MAPLE-500",
  "offers": {
    "@type": "Offer",
    "price": "24.99",
    "priceCurrency": "CAD",
    "availability": "https://schema.org/InStock"
  }
}
</script>
```

#### 7. MCP Server (Model Context Protocol)

Create an MCP server that exposes store functionality as tools for AI models:

**Tools**:
- `search_products` - Search product catalog
- `get_product` - Get product details
- `create_session` - Start checkout session
- `update_session` - Modify session
- `complete_checkout` - Finalize purchase

```typescript
// MCP tool definition example
{
  name: "search_products",
  description: "Search for products in the store catalog",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      category: { type: "string", description: "Filter by category" },
      maxPrice: { type: "number", description: "Maximum price" }
    },
    required: ["query"]
  }
}
```

**Server Location**: `https://ssim.banksim.ca/mcp`

#### 8. Session Webhooks

Notify agents of session status changes:

```json
POST {agent_webhook_url}
{
  "type": "session.updated",
  "sessionId": "sess_abc123",
  "status": "awaiting_authorization",
  "message": "Human approval required for $156.48 purchase"
}
```

**Events**:
- `session.created`
- `session.updated`
- `session.authorized` (step-up approved)
- `session.completed`
- `session.failed`
- `session.cancelled`

---

### P2 - Nice to Have (Phase 3)

#### 9. Multi-Store UCP Profiles

Each store tenant should have its own UCP profile:

```
GET /.well-known/ucp?store=regalmoose
GET /.well-known/ucp?store=techmart
```

#### 10. Order Status API

Allow agents to check order status after purchase:

```
GET /api/agent/v1/orders/:orderId
```

---

## Database Changes

### New Tables

```sql
-- Agent checkout sessions
CREATE TABLE ssim_agent_sessions (
  id VARCHAR(255) PRIMARY KEY,
  store_id VARCHAR(255) NOT NULL,
  agent_id VARCHAR(255) NOT NULL,
  owner_id VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  cart JSONB NOT NULL,
  buyer JSONB,
  fulfillment JSONB,
  payment JSONB,
  mandate_id VARCHAR(255),
  messages JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,

  FOREIGN KEY (store_id) REFERENCES ssim_stores(id)
);

-- Index for expiration cleanup
CREATE INDEX idx_agent_sessions_expires ON ssim_agent_sessions(expires_at);
```

### Existing Table Changes

```sql
-- Add agent reference to orders
ALTER TABLE ssim_orders
ADD COLUMN agent_id VARCHAR(255),
ADD COLUMN agent_session_id VARCHAR(255);
```

---

## API Documentation

Update `docs/openapi.yaml` to include all new agent endpoints.

See template in main protocol design document.

---

## Testing Requirements

1. **Unit Tests**
   - UCP endpoint returns valid JSON
   - Product search works correctly
   - Session state machine transitions

2. **Integration Tests**
   - Agent authentication with WSIM tokens
   - Full checkout flow with NSIM
   - Step-up authorization flow

3. **E2E Tests**
   - Playwright test: Agent completes purchase
   - Test with mock AI agent

---

## Timeline Estimate

| Task | Estimate |
|------|----------|
| UCP Discovery endpoint | 2-3 days |
| Agent auth middleware | 2-3 days |
| Product catalog API | 3-5 days |
| Checkout session API | 5-7 days |
| WSIM integration | 3-5 days |
| Schema.org markup | 2-3 days |
| MCP server | 5-7 days |
| Webhooks | 2-3 days |
| Testing | 5-7 days |
| **Total** | **~5-6 weeks** |

---

## Questions for Design Review

1. Should session expiration be configurable per store?
2. Do we need to support multiple shipping options selection?
3. Should agents be able to apply promo codes?
4. How do we handle partial fulfillment (backordered items)?

---

## Contact

**Project Lead**: [TBD]
**SSIM Team Lead**: [TBD]
**Design Review**: Schedule after initial read
