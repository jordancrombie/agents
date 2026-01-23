# SSIM Team - OpenAPI & Agent Discovery Specification

**For**: SSIM Team
**Date**: 2026-01-22
**Priority**: P1
**Status**: Ready for Implementation

---

## Overview

SSIM already has UCP discovery at `/.well-known/ucp`. To enable external AI agents to fully discover and use SSIM's agent APIs, we need to:
1. Extend UCP to include agent API information
2. Publish an OpenAPI 3.0 specification at `/.well-known/openapi.json`

---

## Task 1: Extend UCP Discovery

**Endpoint**: `GET /.well-known/ucp` (existing)

Add an `agent_api` section to the existing UCP response:

```json
{
  "merchant": {
    "name": "Regal Moose Coffee",
    "id": "merch_regalmoose",
    "logo": "https://ssim-dev.banksim.ca/logo.png"
  },
  "api": {
    "base_url": "https://ssim-dev.banksim.ca",
    "version": "2.1.1"
  },
  "capabilities": [
    "product_catalog",
    "checkout_sessions",
    "agent_commerce"
  ],

  "agent_api": {
    "supported": true,
    "version": "1.0",
    "openapi_url": "/.well-known/openapi.json",
    "base_path": "/api/agent/v1",
    "authentication": {
      "type": "bearer",
      "description": "Use access token from wallet provider (WSIM)",
      "wallet_provider": {
        "name": "WSIM",
        "discovery_url": "https://wsim-dev.banksim.ca/.well-known/agent-api",
        "registration_url": "https://wsim-dev.banksim.ca/api/agent/v1/register"
      }
    },
    "endpoints": {
      "products": "/api/agent/v1/products",
      "sessions": "/api/agent/v1/sessions",
      "orders": "/api/agent/v1/orders"
    }
  },

  "payment_methods": [
    {
      "type": "agent_wallet",
      "provider": "wsim",
      "provider_url": "https://wsim-dev.banksim.ca"
    }
  ]
}
```

**Key Addition**: The `agent_api.authentication.wallet_provider` tells AI agents where to get credentials.

---

## Task 2: OpenAPI Specification

**Endpoint**: `GET /.well-known/openapi.json`
**Content-Type**: `application/json`

```yaml
openapi: 3.0.3
info:
  title: SSIM Agent Commerce API
  description: |
    Store API for AI agents. Enables agents to:
    - Discover store capabilities via UCP
    - Browse and search products
    - Create and manage checkout sessions
    - Complete purchases with wallet payment tokens
  version: 2.1.1
  contact:
    name: SimToolBox
    url: https://ssim.banksim.ca

servers:
  - url: https://ssim-dev.banksim.ca
    description: Development
  - url: https://ssim.banksim.ca
    description: Production

paths:
  /.well-known/ucp:
    get:
      operationId: discoverStore
      summary: Discover store capabilities
      description: |
        Universal Commerce Protocol (UCP) discovery endpoint.
        Returns merchant info, API endpoints, and agent API details.
        No authentication required.
      tags:
        - Discovery
      responses:
        '200':
          description: Store capabilities
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UcpConfig'

  /api/agent/v1/products:
    get:
      operationId: browseProducts
      summary: Browse product catalog
      tags:
        - Products
      security:
        - bearerAuth: []
      parameters:
        - name: q
          in: query
          description: Search query
          schema:
            type: string
        - name: category
          in: query
          description: Filter by category
          schema:
            type: string
        - name: limit
          in: query
          description: Maximum results (default 20)
          schema:
            type: integer
            default: 20
        - name: offset
          in: query
          description: Pagination offset
          schema:
            type: integer
            default: 0
      responses:
        '200':
          description: Product list
          content:
            application/json:
              schema:
                type: object
                properties:
                  products:
                    type: array
                    items:
                      $ref: '#/components/schemas/Product'
                  total:
                    type: integer
                  limit:
                    type: integer
                  offset:
                    type: integer

  /api/agent/v1/products/{product_id}:
    get:
      operationId: getProduct
      summary: Get product details
      tags:
        - Products
      security:
        - bearerAuth: []
      parameters:
        - name: product_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Product details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Product'
        '404':
          description: Product not found

  /api/agent/v1/sessions:
    post:
      operationId: createCheckout
      summary: Create checkout session
      description: Create a new checkout session with items to purchase
      tags:
        - Checkout
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - items
              properties:
                items:
                  type: array
                  items:
                    $ref: '#/components/schemas/CartItem'
      responses:
        '201':
          description: Checkout session created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CheckoutSession'

  /api/agent/v1/sessions/{session_id}:
    get:
      operationId: getCheckout
      summary: Get checkout session
      tags:
        - Checkout
      security:
        - bearerAuth: []
      parameters:
        - name: session_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Checkout session
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CheckoutSession'
        '404':
          description: Session not found

    patch:
      operationId: updateCheckout
      summary: Update checkout items
      tags:
        - Checkout
      security:
        - bearerAuth: []
      parameters:
        - name: session_id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - items
              properties:
                items:
                  type: array
                  items:
                    $ref: '#/components/schemas/CartItem'
      responses:
        '200':
          description: Updated checkout session
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/CheckoutSession'

  /api/agent/v1/sessions/{session_id}/complete:
    post:
      operationId: completeCheckout
      summary: Complete checkout with payment
      description: |
        Submit payment token to complete the purchase.
        The payment_token must be obtained from the wallet provider (WSIM).
      tags:
        - Checkout
      security:
        - bearerAuth: []
      parameters:
        - name: session_id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - payment_token
              properties:
                payment_token:
                  type: string
                  description: Payment token from WSIM
                mandate_id:
                  type: string
                  description: Optional mandate ID
      responses:
        '200':
          description: Order created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'
        '400':
          description: Payment failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    type: string
                  message:
                    type: string
                  decline_reason:
                    type: string

  /api/agent/v1/sessions/{session_id}/cancel:
    post:
      operationId: cancelCheckout
      summary: Cancel checkout session
      tags:
        - Checkout
      security:
        - bearerAuth: []
      parameters:
        - name: session_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Session cancelled

  /api/agent/v1/orders/{order_id}:
    get:
      operationId: getOrder
      summary: Get order status
      tags:
        - Orders
      security:
        - bearerAuth: []
      parameters:
        - name: order_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Order details
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Order'

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      description: |
        Access token from wallet provider (WSIM).
        Obtain via WSIM's /api/agent/v1/oauth/token endpoint.

  schemas:
    UcpConfig:
      type: object
      properties:
        merchant:
          type: object
          properties:
            name:
              type: string
            id:
              type: string
            logo:
              type: string
              format: uri
        api:
          type: object
          properties:
            base_url:
              type: string
              format: uri
            version:
              type: string
        capabilities:
          type: array
          items:
            type: string
        agent_api:
          type: object
          properties:
            supported:
              type: boolean
            version:
              type: string
            openapi_url:
              type: string
            base_path:
              type: string
            authentication:
              type: object
              properties:
                type:
                  type: string
                wallet_provider:
                  type: object
                  properties:
                    name:
                      type: string
                    discovery_url:
                      type: string
                      format: uri
                    registration_url:
                      type: string
                      format: uri

    Product:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
        description:
          type: string
        price:
          type: number
          format: decimal
          description: Price in dollars
        currency:
          type: string
          example: CAD
        image_url:
          type: string
          format: uri
        available:
          type: boolean
        category:
          type: string

    CartItem:
      type: object
      required:
        - product_id
        - quantity
      properties:
        product_id:
          type: string
        quantity:
          type: integer
          minimum: 1

    CheckoutSession:
      type: object
      properties:
        id:
          type: string
        status:
          type: string
          enum:
            - cart_building
            - ready_for_payment
            - awaiting_authorization
            - completed
            - cancelled
            - expired
        cart:
          type: object
          properties:
            items:
              type: array
              items:
                type: object
                properties:
                  product_id:
                    type: string
                  name:
                    type: string
                  quantity:
                    type: integer
                  price:
                    type: number
            subtotal:
              type: number
            tax:
              type: number
            total:
              type: number
            currency:
              type: string
        created_at:
          type: string
          format: date-time
        expires_at:
          type: string
          format: date-time

    Order:
      type: object
      properties:
        id:
          type: string
        status:
          type: string
          enum:
            - pending
            - confirmed
            - processing
            - shipped
            - delivered
            - cancelled
        total:
          type: number
        currency:
          type: string
        items:
          type: array
          items:
            type: object
            properties:
              product_id:
                type: string
              name:
                type: string
              quantity:
                type: integer
              price:
                type: number
        created_at:
          type: string
          format: date-time
        transaction_id:
          type: string
          description: Payment transaction reference
```

---

## Implementation Notes

### File Locations (suggested)

```
ssim/
├── src/routes/
│   └── well-known.ts         # Add OpenAPI endpoint
├── src/openapi/
│   └── agent-api.yaml        # OpenAPI spec source
```

### Extend Existing UCP Route

```typescript
// src/routes/well-known.ts (or wherever UCP is currently served)

// Existing UCP endpoint - add agent_api section
router.get('/ucp', (req, res) => {
  res.json({
    merchant: {
      name: config.merchantName,
      id: config.merchantId,
      logo: `${config.baseUrl}/logo.png`,
    },
    api: {
      base_url: config.baseUrl,
      version: config.version,
    },
    capabilities: ['product_catalog', 'checkout_sessions', 'agent_commerce'],

    // NEW: Agent API section
    agent_api: {
      supported: true,
      version: '1.0',
      openapi_url: '/.well-known/openapi.json',
      base_path: '/api/agent/v1',
      authentication: {
        type: 'bearer',
        description: 'Use access token from wallet provider',
        wallet_provider: {
          name: 'WSIM',
          discovery_url: `${config.wsimBaseUrl}/.well-known/agent-api`,
          registration_url: `${config.wsimBaseUrl}/api/agent/v1/register`,
        },
      },
    },

    payment_methods: [
      {
        type: 'agent_wallet',
        provider: 'wsim',
        provider_url: config.wsimBaseUrl,
      },
    ],
  });
});

// NEW: OpenAPI endpoint
router.get('/openapi.json', (req, res) => {
  res.json(agentOpenApiSpec);
});
```

---

## End-to-End Discovery Flow

Here's how an external AI agent would discover and use the APIs:

```
1. AI receives store URL (e.g., "ssim-dev.banksim.ca")

2. AI calls: GET https://ssim-dev.banksim.ca/.well-known/ucp
   → Gets merchant info + agent_api.wallet_provider.discovery_url

3. AI calls: GET https://wsim-dev.banksim.ca/.well-known/agent-api
   → Gets wallet registration and auth info

4. AI registers with WSIM (pairing code from user)
   → Gets client_id + client_secret

5. AI calls: POST https://wsim-dev.banksim.ca/api/agent/v1/oauth/token
   → Gets access_token

6. AI uses access_token to call SSIM endpoints:
   - Browse products
   - Create checkout
   - Get payment token from WSIM
   - Complete checkout
```

---

## Estimated Effort

| Task | Effort |
|------|--------|
| Write OpenAPI spec | 2-3 hours |
| Add agent_api to UCP | 30 min |
| Add OpenAPI endpoint | 30 min |
| Testing | 1 hour |
| **Total** | **~0.5 day** |

---

## Acceptance Criteria

- [ ] `GET /.well-known/ucp` includes `agent_api` section with wallet provider info
- [ ] `GET /.well-known/openapi.json` returns valid OpenAPI 3.0 spec
- [ ] UCP correctly points to WSIM discovery URL
- [ ] CORS headers allow cross-origin requests
- [ ] All endpoints return proper `Content-Type: application/json`

---

## Questions for SSIM Team

1. Should UCP include links to both dev and prod wallet providers, or just the matching environment?
2. Are there any additional product fields that should be exposed in the API?
3. Should we add rate limiting info to the discovery documents?

---

## Contact

**Requestor**: PM
**SSIM Team Lead**: [TBD]
