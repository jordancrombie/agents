# SSIM Team - OpenAPI & Agent Discovery Specification

**For**: SSIM Team
**Date**: 2026-01-22
**Priority**: P1
**Status**: Ready for Implementation
**Last Verified**: 2026-01-22 (against `src/routes/agent-api.ts`)

---

## Overview

SSIM already has UCP discovery at `/.well-known/ucp`. To enable external AI agents to fully discover and use SSIM's agent APIs, we need to:
1. Extend UCP to include wallet provider discovery info
2. Publish an OpenAPI 3.0 specification at `/.well-known/openapi.json`

---

## Current UCP Response (Actual Implementation)

The current UCP response from `agent-api.ts:57-115`:

```json
{
  "version": "1.0",
  "merchant": {
    "id": "ssim_ssim-dev_banksim_ca",
    "name": "SSIM Dev Store",
    "description": "Welcome to SSIM Dev Store",
    "logo": "https://ssim-dev.banksim.ca/logo.png",
    "url": "https://ssim-dev.banksim.ca"
  },
  "capabilities": {
    "discovery": true,
    "cart": true,
    "checkout": true,
    "order_status": true,
    "returns": false
  },
  "api": {
    "base_url": "https://ssim-dev.banksim.ca/api/agent/v1",
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
    "terms": "https://ssim-dev.banksim.ca/terms",
    "privacy": "https://ssim-dev.banksim.ca/privacy"
  },
  "session_config": {
    "expiration_minutes": 30,
    "expiration_range": { "min": 5, "max": 60 }
  }
}
```

---

## Task 1: Extend UCP Discovery

Add a `wallet_provider` section to help agents discover WSIM:

```json
{
  "version": "1.0",
  "merchant": { ... },
  "capabilities": { ... },
  "api": { ... },
  "payment_methods": {
    "supported": ["card", "wallet"],
    "wallets": ["wsim"]
  },

  "wallet_provider": {
    "name": "WSIM",
    "base_url": "https://wsim-dev.banksim.ca",
    "discovery_url": "https://wsim-dev.banksim.ca/.well-known/agent-api",
    "registration_url": "https://wsim-dev.banksim.ca/api/agent/v1/access-request",
    "description": "Register with WSIM using a pairing code to get OAuth credentials"
  },

  "openapi_url": "/.well-known/openapi.json",

  "policies": { ... },
  "session_config": { ... }
}
```

**Implementation** (modify `agent-api.ts:67-106`):

```typescript
const ucpProfile = {
  version: '1.0',
  merchant: { ... },
  capabilities: { ... },
  api: { ... },
  payment_methods: { ... },

  // NEW: Wallet provider discovery
  wallet_provider: {
    name: 'WSIM',
    base_url: config.wsimBaseUrl,
    discovery_url: `${config.wsimBaseUrl}/.well-known/agent-api`,
    registration_url: `${config.wsimBaseUrl}/api/agent/v1/access-request`,
    description: 'Register with WSIM using a pairing code to get OAuth credentials',
  },

  // NEW: OpenAPI spec location
  openapi_url: '/.well-known/openapi.json',

  policies: { ... },
  session_config: { ... },
};
```

---

## Task 2: Add `/orders/:id` Endpoint

**Issue Found**: UCP claims `endpoints.orders: "/orders"` but no orders endpoint exists!

**Add to `agent-api.ts`**:

```typescript
/**
 * GET /api/agent/v1/orders/:id
 * Get order details by ID
 */
router.get('/orders/:id', authenticateAgent, async (req: Request, res: Response) => {
  try {
    const order = await prisma.order.findFirst({
      where: {
        id: req.params.id,
        storeId: req.storeId,
        agentId: req.agent!.agentId,
      },
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({
      order_id: order.id,
      status: order.status,
      items: order.items,
      subtotal: order.subtotal / 100,
      currency: order.currency,
      transaction_id: (order.paymentDetails as any)?.transactionId,
      created_at: order.createdAt.toISOString(),
      updated_at: order.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('[Agent API] Get order error:', error);
    res.status(500).json({ error: 'Failed to get order' });
  }
});
```

---

## Task 3: OpenAPI Specification

**Endpoint**: `GET /.well-known/openapi.json`
**Content-Type**: `application/json`

This spec matches the ACTUAL implementation in `agent-api.ts`:

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
        Returns merchant info, API endpoints, and wallet provider details.
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
      operationId: listProducts
      summary: List product catalog
      description: Browse products with optional filtering and pagination
      tags:
        - Products
      security:
        - bearerAuth: []
        - {}  # Also allows unauthenticated access
      parameters:
        - name: limit
          in: query
          description: Maximum results (default 20, max 100)
          schema:
            type: integer
            default: 20
            maximum: 100
        - name: offset
          in: query
          description: Pagination offset
          schema:
            type: integer
            default: 0
        - name: category
          in: query
          description: Filter by category
          schema:
            type: string
        - name: minPrice
          in: query
          description: Minimum price in cents
          schema:
            type: integer
        - name: maxPrice
          in: query
          description: Maximum price in cents
          schema:
            type: integer
      responses:
        '200':
          description: Product list with pagination
          content:
            application/json:
              schema:
                type: object
                properties:
                  products:
                    type: array
                    items:
                      $ref: '#/components/schemas/Product'
                  pagination:
                    $ref: '#/components/schemas/Pagination'

  /api/agent/v1/products/search:
    get:
      operationId: searchProducts
      summary: Search products by query
      tags:
        - Products
      security:
        - bearerAuth: []
        - {}
      parameters:
        - name: q
          in: query
          required: true
          description: Search query (searches name, description, category)
          schema:
            type: string
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
        - name: offset
          in: query
          schema:
            type: integer
            default: 0
      responses:
        '200':
          description: Search results
          content:
            application/json:
              schema:
                type: object
                properties:
                  products:
                    type: array
                    items:
                      $ref: '#/components/schemas/Product'
                  query:
                    type: string
                  pagination:
                    $ref: '#/components/schemas/Pagination'
        '400':
          description: Missing query parameter

  /api/agent/v1/products/{product_id}:
    get:
      operationId: getProduct
      summary: Get product details
      tags:
        - Products
      security:
        - bearerAuth: []
        - {}
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
      operationId: createSession
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
                buyer:
                  $ref: '#/components/schemas/Buyer'
                fulfillment:
                  $ref: '#/components/schemas/Fulfillment'
      responses:
        '201':
          description: Checkout session created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Session'
        '400':
          description: Invalid items or product not found

  /api/agent/v1/sessions/{session_id}:
    get:
      operationId: getSession
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
                $ref: '#/components/schemas/Session'
        '404':
          description: Session not found

    patch:
      operationId: updateSession
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
              properties:
                items:
                  type: array
                  items:
                    $ref: '#/components/schemas/CartItem'
                buyer:
                  $ref: '#/components/schemas/Buyer'
                fulfillment:
                  $ref: '#/components/schemas/Fulfillment'
      responses:
        '200':
          description: Updated checkout session
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Session'

    delete:
      operationId: cancelSession
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
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                    example: Session cancelled

  /api/agent/v1/sessions/{session_id}/complete:
    post:
      operationId: completeCheckout
      summary: Complete checkout with payment
      description: |
        Submit payment token to complete the purchase.
        The payment_token must be obtained from the wallet provider (WSIM).
        If no token provided, SSIM will request one from WSIM (may trigger step-up).
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
        required: false
        content:
          application/json:
            schema:
              type: object
              properties:
                payment_token:
                  type: string
                  description: Payment token from WSIM (JWT)
                mandate_id:
                  type: string
                  description: Optional mandate ID
      responses:
        '200':
          description: Order created successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    enum: [completed]
                  order_id:
                    type: string
                  transaction_id:
                    type: string
                  message:
                    type: string
        '202':
          description: Step-up authorization required
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    enum: [step_up_required]
                  step_up_id:
                    type: string
                  message:
                    type: string
        '400':
          description: Payment declined or session not ready
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    enum: [declined]
                  order_id:
                    type: string
                  message:
                    type: string

  /api/agent/v1/orders/{order_id}:
    get:
      operationId: getOrder
      summary: Get order status
      description: |
        NOTE: This endpoint needs to be implemented.
        Currently claimed in UCP but not available.
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
        '404':
          description: Order not found

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
        version:
          type: string
          example: "1.0"
        merchant:
          type: object
          properties:
            id:
              type: string
            name:
              type: string
            description:
              type: string
            logo:
              type: string
              format: uri
            url:
              type: string
              format: uri
        capabilities:
          type: object
          description: Object with boolean flags (NOT an array)
          properties:
            discovery:
              type: boolean
            cart:
              type: boolean
            checkout:
              type: boolean
            order_status:
              type: boolean
            returns:
              type: boolean
        api:
          type: object
          properties:
            base_url:
              type: string
              format: uri
            authentication:
              type: string
              enum: [bearer]
            endpoints:
              type: object
              properties:
                products:
                  type: string
                sessions:
                  type: string
                orders:
                  type: string
        payment_methods:
          type: object
          properties:
            supported:
              type: array
              items:
                type: string
            wallets:
              type: array
              items:
                type: string
        wallet_provider:
          type: object
          description: NEW - wallet provider discovery info
          properties:
            name:
              type: string
            base_url:
              type: string
              format: uri
            discovery_url:
              type: string
              format: uri
            registration_url:
              type: string
              format: uri
        policies:
          type: object
          properties:
            terms:
              type: string
              format: uri
            privacy:
              type: string
              format: uri
        session_config:
          type: object
          properties:
            expiration_minutes:
              type: integer
            expiration_range:
              type: object
              properties:
                min:
                  type: integer
                max:
                  type: integer

    Product:
      type: object
      description: |
        Note: Price is an OBJECT with amount and currency,
        not a simple number as originally spec'd.
      properties:
        id:
          type: string
        name:
          type: string
        description:
          type: string
        price:
          type: object
          properties:
            amount:
              type: number
              format: decimal
              description: Price in dollars (converted from cents)
            currency:
              type: string
              example: CAD
        images:
          type: array
          items:
            type: object
            properties:
              url:
                type: string
                format: uri
              alt:
                type: string
        inventory:
          type: object
          properties:
            available:
              type: boolean
            quantity:
              type: integer
              nullable: true
        categories:
          type: array
          items:
            type: string
        schema_org:
          type: object
          description: Schema.org Product markup

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

    Buyer:
      type: object
      properties:
        name:
          type: string
        email:
          type: string
          format: email
        phone:
          type: string

    Fulfillment:
      type: object
      properties:
        type:
          type: string
          enum: [shipping, pickup]
        address:
          type: object
          properties:
            street:
              type: string
            city:
              type: string
            state:
              type: string
            postal_code:
              type: string
            country:
              type: string

    Session:
      type: object
      description: |
        Note: Uses session_id (not id) per SACP convention
      properties:
        session_id:
          type: string
        status:
          type: string
          enum:
            - cart_building
            - ready_for_payment
            - awaiting_authorization
            - processing
            - completed
            - cancelled
            - failed
            - expired
        cart:
          type: object
          nullable: true
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
                  unit_price:
                    type: number
                    description: Price in dollars
                  subtotal:
                    type: number
            subtotal:
              type: number
            tax:
              type: number
            shipping:
              type: number
              nullable: true
            total:
              type: number
            currency:
              type: string
        buyer:
          $ref: '#/components/schemas/Buyer'
        fulfillment:
          $ref: '#/components/schemas/Fulfillment'
        payment:
          type: object
          nullable: true
        messages:
          type: array
          items:
            type: object
        expires_at:
          type: string
          format: date-time
        created_at:
          type: string
          format: date-time
        updated_at:
          type: string
          format: date-time

    Order:
      type: object
      properties:
        order_id:
          type: string
        status:
          type: string
          enum:
            - pending
            - authorized
            - declined
            - failed
            - processing
            - shipped
            - delivered
            - cancelled
        items:
          type: array
          items:
            type: object
        subtotal:
          type: number
        currency:
          type: string
        transaction_id:
          type: string
          description: Payment transaction reference
        created_at:
          type: string
          format: date-time
        updated_at:
          type: string
          format: date-time

    Pagination:
      type: object
      properties:
        total:
          type: integer
        limit:
          type: integer
        offset:
          type: integer
        has_more:
          type: boolean
```

---

## Implementation Checklist

### Required Changes

- [ ] **Task 1**: Add `wallet_provider` and `openapi_url` to UCP response (`agent-api.ts:67-106`)
- [ ] **Task 2**: Implement `GET /api/agent/v1/orders/:id` endpoint (currently missing!)
- [ ] **Task 3**: Add `GET /.well-known/openapi.json` endpoint

### Nice-to-Have

- [ ] Add `config.wsimBaseUrl` to `env.ts` if not present
- [ ] Add CORS headers for cross-origin access

---

## Estimated Effort

| Task | Effort |
|------|--------|
| Add wallet_provider to UCP | 30 min |
| Implement orders endpoint | 1 hour |
| Add OpenAPI endpoint | 30 min |
| Testing | 1 hour |
| **Total** | **~3 hours** |

---

## End-to-End Discovery Flow

```
1. AI receives store URL (e.g., "ssim-dev.banksim.ca")

2. AI calls: GET https://ssim-dev.banksim.ca/.well-known/ucp
   → Gets merchant info + wallet_provider.discovery_url

3. AI calls: GET https://wsim-dev.banksim.ca/.well-known/agent-api
   → Gets wallet registration and auth info

4. AI registers with WSIM (pairing code from user)
   → Gets client_id + client_secret

5. AI calls: POST https://wsim-dev.banksim.ca/api/agent/v1/oauth/token
   → Gets access_token

6. AI uses access_token to call SSIM endpoints:
   - Browse products: GET /api/agent/v1/products
   - Search: GET /api/agent/v1/products/search?q=coffee
   - Create checkout: POST /api/agent/v1/sessions
   - Get payment token from WSIM
   - Complete checkout: POST /api/agent/v1/sessions/:id/complete
   - Check order: GET /api/agent/v1/orders/:id
```

---

## Discrepancies Fixed in This Document

| Issue | Original Spec | Corrected |
|-------|---------------|-----------|
| `capabilities` format | Array | Object with booleans |
| `Product.price` | Number | Object `{ amount, currency }` |
| `Product.image_url` | String field | Array `images: [{ url, alt }]` |
| Session ID field | `id` | `session_id` |
| Orders endpoint | Assumed exists | Marked as "needs implementation" |
| Search endpoint | Not documented | Added `/products/search` |
| Additional product fields | Missing | Added `inventory`, `categories`, `schema_org` |

---

## Contact

**Requestor**: PM
**SSIM Team Lead**: [TBD]
