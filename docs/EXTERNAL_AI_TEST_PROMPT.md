# External AI Agent Test Prompt

**Purpose**: Test the SACP protocol with an external AI (ChatGPT, Gemini, Claude, etc.)
**Date**: 2026-01-25
**Version**: 1.4.0
**Gateway URL**: https://sacp.banksim.ca
**Prerequisites**:
- Access to mwsim app for authorization approval

---

## Four Options for Testing

| Option | Complexity | Best For |
|--------|------------|----------|
| **A: Guest Checkout** | Easiest | ChatGPT, Gemini - no upfront auth, pay at end |
| **B: Pairing Code + Gateway** | Easy | Users who prefer to authenticate first |
| **C: Device Authorization** | Medium | AIs with good HTTP support, direct API |
| **D: Pairing Code + Direct** | Medium | Legacy flow, user initiates, direct API |

**Recommendation**: Start with **Option A (Guest Checkout)** - it's the simplest and requires no upfront authentication. The user only authorizes at payment time.

---

## Option A: Guest Checkout (Recommended)

**New in v1.4.0!** The AI can browse, build a cart, and start checkout without any authentication. The user only needs to authorize when completing payment using RFC 8628 Device Authorization.

### Instructions

1. Copy the prompt below and paste it into ChatGPT, Gemini, or another AI
2. Browse and select products
3. AI creates checkout and asks for payment authorization
4. Enter the user code in mwsim app (Agents > Enter Code)
5. Approve the payment
6. AI completes the purchase

### Prompt

```
You are an AI shopping assistant. Help me browse and purchase products from a store using the SACP Gateway API.

## Gateway API

Base URL: https://sacp.banksim.ca

### Step 1: Browse Products (No Auth Required)
GET https://sacp.banksim.ca/products

Show me what's available with prices.

### Step 2: Create Checkout (No Auth Required)
When I pick something:

POST https://sacp.banksim.ca/checkout
Content-Type: application/json

{
  "items": [{"product_id": "<PRODUCT_ID>", "quantity": 1}]
}

This returns a `checkout_session_id`. Save it for subsequent requests.

### Step 3: Add Buyer Info (No Auth Required)
PATCH https://sacp.banksim.ca/checkout/<checkout_session_id>
Content-Type: application/json

{
  "buyer": {"name": "Test Buyer", "email": "test@example.com"},
  "fulfillment": {
    "type": "shipping",
    "address": {
      "street": "123 Test St",
      "city": "Toronto",
      "state": "ON",
      "postal_code": "M5V 1A1",
      "country": "CA"
    }
  }
}

### Step 4: Complete Checkout (Triggers Payment Authorization)
POST https://sacp.banksim.ca/checkout/<checkout_session_id>/complete
Content-Type: application/json

Since this is a guest checkout (no session), you'll get:
```json
{
  "status": "authorization_required",
  "user_code": "WSIM-A3J2K9",
  "verification_uri": "https://wsim.banksim.ca/device",
  "request_id": "...",
  "expires_in": 900
}
```

Tell me the `user_code` - I'll enter it in my wallet app and approve the payment.

### Step 5: Poll for Payment Status
GET https://sacp.banksim.ca/checkout/<checkout_session_id>/payment-status/<request_id>

Poll every 5 seconds. You'll see:
- `{"status": "pending"}` - I haven't approved yet, keep polling
- `{"status": "approved", "order": {...}}` - Payment approved! Show me the order.
- `{"status": "denied"}` - I rejected it
- `{"status": "expired"}` - Code expired, need to start over

## Your Task

1. Start by browsing products (GET /products)
2. Show me what's available
3. When I pick something, create a checkout
4. Add my shipping info
5. Complete checkout - you'll get a user code
6. Give me the code, I'll authorize in my wallet
7. Poll for payment status and show me the order confirmation

Begin now!
```

---

## Option B: Pairing Code + Gateway

User authenticates first via pairing code, then the AI has a session for the entire shopping flow.

### Instructions

1. Copy the prompt below and paste it into ChatGPT, Gemini, or another AI
2. Generate a pairing code in mwsim app (Agents > Add Agent > Generate Code)
3. Give the code to the AI when it asks
4. Approve the access request on your phone
5. Walk through the shopping flow

### Prompt

```
You are an AI shopping assistant. Help me browse and purchase products from a store using the SACP Gateway API.

## Gateway API

Base URL: https://sacp.banksim.ca

### Step 1: See Available Operations
GET https://sacp.banksim.ca/tools

This shows all available endpoints.

### Step 2: Browse Products (No Auth Required)
GET https://sacp.banksim.ca/products

Show me what's available.

### Step 3: Register (When I Provide a Code)
I will generate a pairing code from my mobile wallet app. When I give it to you, register:

POST https://sacp.banksim.ca/auth/register
Content-Type: application/json

{
  "pairing_code": "<CODE_I_PROVIDE>",
  "agent_name": "ChatGPT Shopping Assistant"
}

This returns a `request_id`. Poll for my approval:

GET https://sacp.banksim.ca/auth/status/<request_id>

When I approve, you'll get a `session_id`. Use it as `X-Session-Id` header for all subsequent requests.

### Step 4: Create Checkout
POST https://sacp.banksim.ca/checkout
X-Session-Id: <session_id>
Content-Type: application/json

{
  "items": [{"product_id": "<PRODUCT_ID>", "quantity": 1}]
}

### Step 5: Add Buyer Info
PATCH https://sacp.banksim.ca/checkout/<checkout_session_id>
X-Session-Id: <session_id>
Content-Type: application/json

{
  "buyer": {"name": "Test Buyer", "email": "test@example.com"},
  "fulfillment": {
    "type": "shipping",
    "address": {
      "street": "123 Test St",
      "city": "Toronto",
      "state": "ON",
      "postal_code": "M5V 1A1",
      "country": "CA"
    }
  }
}

### Step 6: Complete Purchase
POST https://sacp.banksim.ca/checkout/<checkout_session_id>/complete
X-Session-Id: <session_id>

The gateway automatically handles payment authorization. If the amount exceeds my limit, you'll get a `step_up_required` response - poll the step-up endpoint until I approve.

## Your Task

1. Start by browsing products (GET /products)
2. Show me what's available
3. When I'm ready to buy, ask me for a pairing code
4. Register and poll for my approval
5. Create checkout with my selection
6. Complete the purchase

Begin now!
```

---

## Option C: Device Authorization Flow (Direct API)

For AIs that can handle more complex flows, this uses standard OAuth Device Authorization (RFC 8628) directly against WSIM.

### Instructions

1. Copy the prompt below
2. The AI will generate a user code (format: `WSIM-XXXXXX-XXXXXX`)
3. Enter the code in mwsim app (Agents > Enter Code)
4. Approve and set spending limits
5. Walk through the shopping flow

### Prompt

```
You are an AI shopping assistant. Your task is to discover a store, browse products, and help me make a purchase using the SACP (SimToolBox Agent Commerce Protocol).

## Starting Point

Begin by discovering the store capabilities:

GET https://ssim.banksim.ca/.well-known/ucp

This will return the store's UCP (Universal Commerce Protocol) document containing:
- Merchant information
- API endpoints
- Wallet provider discovery URL (look for `wallet_provider.discovery_url`)

## Step-by-Step Process

### 1. Discover the Store
Call the UCP endpoint above. Note the `wallet_provider` section - this tells you where to register for payment credentials.

### 2. Discover the Wallet Provider
The UCP response will include a wallet provider URL. Call:

GET https://wsim.banksim.ca/.well-known/agent-api

This tells you how to register and authenticate. Note the `registration.flows.device_authorization` section.

### 3. Start Device Authorization (RFC 8628)
Initiate the OAuth Device Authorization flow:

POST https://wsim.banksim.ca/api/agent/v1/oauth/device_authorization
Content-Type: application/json

{
  "agent_name": "AI Shopping Assistant",
  "agent_description": "AI assistant helping with online purchases"
}

You will receive:
- `device_code`: Keep this for polling
- `user_code`: Display this to me (format: WSIM-XXXXXX-XXXXXX)
- `expires_in`: 900 seconds (15 minutes)

Tell me the user_code and ask me to enter it in my mobile wallet app.

### 4. Poll for Authorization
While I enter the code and approve, poll the token endpoint:

POST https://wsim.banksim.ca/api/agent/v1/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code=<DEVICE_CODE>

You will receive:
- `authorization_pending` error while waiting
- `access_token` when I approve

Poll every 5 seconds until approved or expired.

### 5. Browse Products
Use your access token to browse the store:

GET https://ssim.banksim.ca/api/agent/v1/products
Authorization: Bearer <ACCESS_TOKEN>

Show me what's available and let me choose what to buy.

### 6. Create Checkout
When I select a product:

POST https://ssim.banksim.ca/api/agent/v1/sessions
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{
  "items": [
    { "product_id": "<PRODUCT_ID>", "quantity": 1 }
  ]
}

### 7. Get Payment Token
Request payment authorization from the wallet:

POST https://wsim.banksim.ca/api/agent/v1/payments/token
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{
  "amount": <CART_TOTAL>,
  "currency": "CAD",
  "merchant_id": "<FROM_UCP>",
  "session_id": "<SESSION_ID>"
}

If the amount exceeds my auto-approve limit, you'll get a `step_up_id`. Poll for my approval:

GET https://wsim.banksim.ca/api/agent/v1/payments/token/<step_up_id>/status
Authorization: Bearer <ACCESS_TOKEN>

### 8. Complete Purchase
Submit the payment token to complete checkout:

POST https://ssim.banksim.ca/api/agent/v1/sessions/<session_id>/complete
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{
  "payment_token": "<PAYMENT_TOKEN>"
}

## Your Task

1. Start by calling the UCP discovery endpoint
2. Show me what you discover about the store and wallet provider
3. Start device authorization and give me the user code to enter
4. Walk me through browsing and selecting a product
5. Help me complete the purchase

Begin now by discovering the store at https://ssim.banksim.ca/.well-known/ucp
```

---

## Option D: Pairing Code Flow (Direct API)

User generates a code first, then gives it to the AI. This uses the direct SSIM/WSIM APIs instead of the Gateway.

### Instructions

1. Generate a pairing code in mwsim app (Agents > Add Agent > Generate Code)
2. Copy the prompt below
3. Provide the code when the AI asks
4. Approve the access request
5. Walk through the shopping flow

### Prompt

```
You are an AI shopping assistant. Your task is to discover a store, browse products, and help me make a purchase using the SACP (SimToolBox Agent Commerce Protocol).

## Starting Point

Begin by discovering the store capabilities:

GET https://ssim.banksim.ca/.well-known/ucp

## Step-by-Step Process

### 1. Discover the Store
Call the UCP endpoint above. Note the `wallet_provider` section.

### 2. Discover the Wallet Provider
GET https://wsim.banksim.ca/.well-known/agent-api

### 3. Register with Wallet (I will provide a pairing code)
I will generate a pairing code. When I give you the code, call:

POST https://wsim.banksim.ca/api/agent/v1/access-request
Content-Type: application/json

{
  "pairing_code": "<CODE_I_PROVIDE>",
  "agent_name": "AI Shopping Assistant",
  "agent_description": "AI assistant helping with online purchases",
  "permissions": ["browse", "cart", "purchase"],
  "spending_limits": {
    "per_transaction": 100,
    "daily": 500,
    "monthly": 1000,
    "currency": "CAD"
  }
}

Then poll for approval status:

GET https://wsim.banksim.ca/api/agent/v1/access-request/<request_id>

Once approved, you'll receive `client_id` and `client_secret`.

### 4. Get Access Token
POST https://wsim.banksim.ca/api/agent/v1/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=<YOUR_CLIENT_ID>&client_secret=<YOUR_CLIENT_SECRET>

### 5. Browse Products
GET https://ssim.banksim.ca/api/agent/v1/products
Authorization: Bearer <ACCESS_TOKEN>

### 6. Create Checkout
POST https://ssim.banksim.ca/api/agent/v1/sessions
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{
  "items": [{ "product_id": "<PRODUCT_ID>", "quantity": 1 }]
}

### 7. Get Payment Token
POST https://wsim.banksim.ca/api/agent/v1/payments/token
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{
  "amount": <CART_TOTAL>,
  "currency": "CAD",
  "merchant_id": "ssim_ssim_banksim_ca",
  "session_id": "<SESSION_ID>"
}

### 8. Complete Purchase
POST https://ssim.banksim.ca/api/agent/v1/sessions/<session_id>/complete
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{
  "payment_token": "<PAYMENT_TOKEN>"
}

## Your Task

1. Start by calling the UCP discovery endpoint
2. Show me what you discover
3. Wait for me to provide a pairing code
4. Walk me through the purchase

Begin now by discovering the store at https://ssim.banksim.ca/.well-known/ucp
```

---

## Expected Flow Comparison

### Guest Checkout (Option A) - Simplest
| Step | AI Action | User Action |
|------|-----------|-------------|
| 1 | Browses products | - |
| 2 | Shows catalog | Choose product |
| 3 | Creates checkout | - |
| 4 | Adds buyer info | - |
| 5 | Completes checkout | - |
| 6 | Shows user code | Enter code in mwsim |
| 7 | Polls payment status | Approve payment |
| 8 | Shows confirmation | Verify in BSIM |

### Gateway with Auth (Option B)
| Step | AI Action | User Action |
|------|-----------|-------------|
| 1 | Browses products | - |
| 2 | Shows catalog | Choose product, generate pairing code |
| 3 | Registers with code | Approve in mwsim |
| 4 | Gets session_id | - |
| 5 | Creates checkout | - |
| 6 | Completes purchase | Approve step-up if needed |
| 7 | Shows confirmation | Verify in BSIM |

### Direct API (Options C/D)
| Step | AI Action | User Action |
|------|-----------|-------------|
| 1 | Discovers UCP | - |
| 2 | Discovers WSIM | - |
| 3 | Starts auth flow | Enter code / provide code |
| 4 | Polls for approval | Approve & set limits |
| 5 | Gets access token | - |
| 6 | Browses products | Choose product |
| 7 | Creates checkout | - |
| 8 | Gets payment token | Approve step-up if needed |
| 9 | Completes checkout | - |
| 10 | Shows confirmation | Verify in BSIM |

---

## Troubleshooting

### AI can't make HTTP requests
Some AIs (especially free tiers) can't make external HTTP calls. Try:
- ChatGPT Plus with browsing enabled
- Gemini Advanced
- Claude with tool use

### Gateway health check
```bash
curl https://sacp.banksim.ca/health
```

### Pairing code expired
Codes expire after 15 minutes. Generate a fresh one.

### Access request not appearing
Check that WSIM is healthy: `https://wsim.banksim.ca/api/health`

### Payment declined
- Check spending limits in mwsim
- For amounts over the limit, wait for step-up approval

### Step-up required
If purchase exceeds auto-approve limit, the gateway returns:
```json
{
  "status": "step_up_required",
  "step_up_id": "...",
  "poll_endpoint": "/checkout/.../step-up/..."
}
```
Poll until user approves in mwsim.

---

## Quick Test Commands

```bash
# Check gateway health
curl https://sacp.banksim.ca/health

# List tools
curl https://sacp.banksim.ca/tools

# Browse products
curl https://sacp.banksim.ca/products

# Start registration (need pairing code from mwsim)
curl -X POST https://sacp.banksim.ca/auth/register \
  -H "Content-Type: application/json" \
  -d '{"pairing_code":"WSIM-XXXXXX-XXXXXX","agent_name":"Test"}'
```

---

## Verification

After a successful purchase:
1. Check BSIM transaction history - should show 🤖 agent badge
2. Check order in SSIM admin
3. Verify the AI received order confirmation

---

## Related Documentation

- [MCP Server README](../mcp-server/README.md)
- [Deployment Guide](../mcp-server/DEPLOYMENT.md)
- [AI Discovery Endpoints](teams/AI_DISCOVERY_ENDPOINTS.md)
- [Protocol Design](PROTOCOL_DESIGN.md)
