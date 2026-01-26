# AI Agent Onboarding Prompt

**Purpose**: Enable external AI agents to discover, register, and transact with SACP services
**Date**: 2026-01-26
**Version**: 1.4.5
**Target AIs**: ChatGPT, Gemini, Claude, or any AI with HTTP request capabilities

---

## Quick Start Prompt (Guest Checkout - Recommended)

**New in v1.4.5!** No upfront authentication required. The user only authorizes at payment time. Now with push notifications and server-generated QR code support!

Copy and paste this prompt into your AI:

```
You are an AI agent that can make purchases on behalf of users. Your task is to browse a store, help me select products, and complete a purchase.

## Gateway API

The SACP Gateway at https://sacp.banksim.ca handles everything for you.

### Step 1: Browse Products (No Auth Required)
GET https://sacp.banksim.ca/products

Show me what's available with prices.

### Step 2: Create Checkout (No Auth Required)
When I pick a product:

POST https://sacp.banksim.ca/checkout
Content-Type: application/json

{
  "items": [{"product_id": "<PRODUCT_ID>", "quantity": 1}]
}

Save the `checkout_session_id` from the response.

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

You'll receive:
{
  "status": "authorization_required",
  "notification_sent": true/false,    // Did the user get a push notification?
  "authorization_url": "https://...", // URL with code pre-filled
  "qr_code_data_url": "data:image/png;base64,...", // Ready-to-display QR code
  "user_code": "WSIM-A3J2K9",         // Manual code entry
  "verification_uri": "https://wsim.banksim.ca/device",
  "request_id": "...",
  "expires_in": 900
}

Based on `notification_sent`:
- **If TRUE**: Tell me "Check your phone - I sent a payment request to your wallet app"
- **If FALSE**: Display the QR code and offer manual entry:
  1. Show QR: `![Scan to pay](qr_code_data_url)` - this is a ready-to-scan image
  2. "Or enter code WSIM-XXXXXX in your wallet app at [verification_uri]"

### Step 5: Poll for Payment Status
GET https://sacp.banksim.ca/checkout/<checkout_session_id>/payment-status/<request_id>

Poll every 5 seconds:
- `{"status": "pending"}` - Keep polling
- `{"status": "approved", "order": {...}}` - Success! Show me the order.
- `{"status": "denied"}` - I rejected it
- `{"status": "expired"}` - Code expired, restart checkout

## Authorization Options

| Method | When Available | User Action |
|--------|----------------|-------------|
| **Push Notification** | `notification_sent: true` | Tap notification on phone |
| **QR Code** | Always | Scan QR code generated from `authorization_url` |
| **Manual Code** | Always | Enter `WSIM-XXXXXX` at `verification_uri` |

## Important Notes

- All prices are in CAD (Canadian dollars)
- No authentication needed until payment time
- User codes expire in 15 minutes
- The `qr_code_data_url` field contains a ready-to-display QR code image - just use markdown to show it

## Begin

Start by browsing products and showing me what's available!
```

---

## Alternative: Device Authorization Flow (Full Control)

For AIs that want full OAuth control, use this prompt which does upfront authentication:

```
You are an AI agent that can make purchases on behalf of users. Your task is to discover a commerce platform, register for payment authorization, and help me complete a test purchase.

## Discovery

Start by discovering the store's capabilities using standard AI discovery endpoints:

1. **MCP Server Discovery** (preferred):
   GET https://ssim.banksim.ca/.well-known/mcp-server

   This returns a list of tools you can use as functions.

2. **AI Plugin Manifest**:
   GET https://ssim.banksim.ca/.well-known/ai-plugin.json

   This is the ChatGPT plugin format with auth and API info.

3. **OpenAPI Specification**:
   GET https://ssim.banksim.ca/.well-known/openapi.json

   Full API documentation in OpenAPI 3.0 format.

4. **Universal Commerce Protocol (UCP)**:
   GET https://ssim.banksim.ca/.well-known/ucp

   Store-specific discovery with merchant info and wallet provider details.

## What You'll Find

The store (SSIM) will tell you about:
- Its product catalog and checkout APIs
- A wallet provider (WSIM) for payment authorization
- How to get authenticated

The wallet provider (WSIM) supports two authorization flows:
- **Device Authorization (RFC 8628)** - You initiate, user enters a code
- **Pairing Code** - User generates a code, gives it to you

## Your Mission

1. **Discover** - Call the discovery endpoints and tell me what you find
2. **Register** - Use Device Authorization to get credentials (I'll enter the code you give me)
3. **Browse** - Show me what products are available
4. **Purchase** - Help me buy something and complete the transaction

## Authorization Flow

Use the OAuth Device Authorization flow (RFC 8628):

1. Call the device authorization endpoint (you'll find it in the wallet's discovery)
2. You'll get a `user_code` in format `WSIM-XXXXXX-XXXXXX`
3. Tell me the code - I'll enter it in my mobile wallet app
4. Poll the token endpoint until I approve
5. Use the access token for all subsequent requests

## Important Notes

- All prices are in CAD (Canadian dollars)
- The access token works for both the store (SSIM) and wallet (WSIM)
- If a purchase exceeds my auto-approve limit, you'll get a `step_up_id` to poll
- Payment tokens are short-lived JWTs - get them right before checkout

## Begin

Start by discovering the store. Call:
GET https://ssim.banksim.ca/.well-known/mcp-server

Tell me what tools/capabilities you discover, then we'll proceed with registration.
```

---

## Extended Prompt (Device Auth with Fallback Instructions)

For AIs that may have trouble with discovery and want the full device authorization flow:

```
You are an AI agent that can make purchases on behalf of users. Your task is to discover a commerce platform, register for payment authorization, and help me complete a test purchase.

## Step 1: Discover the Store

Call the MCP server discovery endpoint:
GET https://ssim.banksim.ca/.well-known/mcp-server

This returns tools you can use:
- `discover_store` - Get merchant info
- `list_products` - Browse catalog
- `search_products` - Search by keyword (use `q` parameter)
- `get_product` - Get product details
- `create_checkout` - Start a checkout session
- `update_checkout` - Modify cart
- `complete_checkout` - Finalize with payment
- `cancel_checkout` - Cancel session
- `get_order` - Check order status

Also check the UCP for wallet provider info:
GET https://ssim.banksim.ca/.well-known/ucp

Look for the `wallet_provider` section - it tells you where to get payment authorization.

## Step 2: Discover the Wallet

The wallet provider (WSIM) has its own discovery:
GET https://wsim.banksim.ca/.well-known/mcp-server

Tools available:
- `start_device_authorization` - Begin OAuth device flow
- `poll_device_authorization` - Check if user approved
- `register_agent` - Legacy pairing code flow
- `check_registration_status` - Poll pairing code approval
- `get_access_token` - Exchange credentials for token
- `check_spending_limits` - View my limits
- `request_payment_token` - Get payment authorization
- `check_step_up_status` - Poll for large purchase approval

Also check OAuth discovery:
GET https://wsim.banksim.ca/.well-known/oauth-authorization-server

This tells you the exact endpoints for device authorization and tokens.

## Step 3: Register Using Device Authorization

This is the preferred flow (RFC 8628):

POST https://wsim.banksim.ca/api/agent/v1/oauth/device_authorization
Content-Type: application/json

{
  "agent_name": "AI Shopping Assistant",
  "agent_description": "AI agent helping with test purchases"
}

You'll receive:
```json
{
  "device_code": "xxx",
  "user_code": "WSIM-ABC123-XYZ789",
  "verification_uri": "https://wsim.banksim.ca/device",
  "expires_in": 900,
  "interval": 5
}
```

Tell me the `user_code` and I'll enter it in my mobile wallet app.

## Step 4: Poll for Authorization

While I'm approving, poll:

POST https://wsim.banksim.ca/api/agent/v1/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code=<DEVICE_CODE>

You'll get:
- `{"error": "authorization_pending"}` - Keep polling every 5 seconds
- `{"access_token": "xxx", "expires_in": 3600}` - Success! I approved.

## Step 5: Browse Products

With your access token:

GET https://ssim.banksim.ca/api/agent/v1/products
Authorization: Bearer <ACCESS_TOKEN>

Or search:
GET https://ssim.banksim.ca/api/agent/v1/products/search?q=coffee
Authorization: Bearer <ACCESS_TOKEN>

Show me what's available with prices.

## Step 6: Create Checkout

When I pick a product:

POST https://ssim.banksim.ca/api/agent/v1/sessions
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{
  "items": [
    { "product_id": "<ID>", "quantity": 1 }
  ]
}

You'll get a `session_id` and cart total.

## Step 7: Get Payment Authorization

POST https://wsim.banksim.ca/api/agent/v1/payments/token
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{
  "amount": <CART_TOTAL>,
  "currency": "CAD",
  "merchant_id": "<FROM_UCP>",
  "session_id": "<SESSION_ID>"
}

If within my limits: You get `payment_token`
If over limits: You get `step_up_id` - poll status while I approve on my phone

## Step 8: Complete Purchase

POST https://ssim.banksim.ca/api/agent/v1/sessions/<SESSION_ID>/complete
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{
  "payment_token": "<PAYMENT_TOKEN>"
}

You'll get an order confirmation with `order_id` and `transaction_id`.

## Error Handling

- **401 Unauthorized**: Token expired or invalid - get a new one
- **400 with `step_up_required`**: Purchase needs my approval
- **authorization_pending**: Keep polling, I haven't approved yet
- **access_denied**: I rejected the request
- **expired_token**: Device code expired, start over

## Begin Now

Start by discovering the store:
GET https://ssim.banksim.ca/.well-known/mcp-server

Tell me what you discover, then let's register and make a test purchase!
```

---

## Validation Checklist

After a successful transaction, verify:

| Check | How to Verify |
|-------|---------------|
| Agent registered | Visible in mwsim app under "AI Agents" |
| Token obtained | AI can browse products without 401 |
| Checkout created | Session appears in SSIM admin |
| Payment authorized | WSIM shows transaction in agent history |
| Order completed | Order ID returned, visible in SSIM |
| BSIM transaction | Transaction shows agent badge in bank app |

---

## Troubleshooting

### AI says it can't make HTTP requests
Some AI interfaces don't support external calls. Try:
- ChatGPT Plus with "Browse" or "Code Interpreter"
- Gemini Advanced
- Claude with computer use capability

### Device code expires before approval
The 15-minute window may be too short. Either:
- Have the user ready to enter code immediately
- Use the Pairing Code flow instead (user generates code first)

### Getting 401 on SSIM after getting token from WSIM
The same token works for both services. Ensure:
- Token hasn't expired (1 hour lifetime)
- Using `Authorization: Bearer <token>` header correctly
- Not duplicating "Bearer" (common AI mistake)

### Payment token not working
Payment tokens are short-lived. Get them immediately before `complete_checkout`, not earlier.

---

## Related Documentation

- [WSIM OpenAPI Spec](teams/WSIM_OPENAPI_SPEC.md) - Full wallet API documentation
- [SSIM OpenAPI Spec](teams/SSIM_OPENAPI_SPEC.md) - Full store API documentation
- [AI Discovery Endpoints](teams/AI_DISCOVERY_ENDPOINTS.md) - Discovery protocol details
- [External AI Test Prompt](EXTERNAL_AI_TEST_PROMPT.md) - Alternative prompts
