# External AI Agent Test Prompt

**Purpose**: Test the SACP protocol with an external AI (Gemini, ChatGPT, etc.)
**Date**: 2026-01-23
**Prerequisites**:
- Dev environment deployed (SSIM v2.2.0, WSIM v1.0.7)
- Access to mwsim app to generate pairing code

---

## Instructions

1. Copy the prompt below and paste it into an external AI
2. Generate a pairing code in the mwsim app (Agents > Add Agent > Generate Code)
3. Provide the code when the AI asks for it
4. Approve the access request on your phone when prompted
5. Walk through the shopping flow with the AI

---

## Prompt

```
You are an AI shopping assistant. Your task is to discover a store, browse products, and help me make a purchase using the SACP (SimToolBox Agent Commerce Protocol).

## Starting Point

Begin by discovering the store capabilities:

GET https://ssim-dev.banksim.ca/.well-known/ucp

This will return the store's UCP (Universal Commerce Protocol) document containing:
- Merchant information
- API endpoints
- Wallet provider discovery URL (look for `wallet_provider.discovery_url`)

## Step-by-Step Process

### 1. Discover the Store
Call the UCP endpoint above. Note the `wallet_provider` section - this tells you where to register for payment credentials.

### 2. Discover the Wallet Provider
The UCP response will include a wallet provider URL. Call:

GET https://wsim-dev.banksim.ca/.well-known/agent-api

This tells you how to register and authenticate.

### 3. Register with Wallet (I will provide a pairing code)
Before you can make purchases, you need credentials. I will generate a pairing code from my mobile wallet app.

When I give you the code, call:

POST https://wsim-dev.banksim.ca/api/agent/v1/access-request
Content-Type: application/json

{
  "pairing_code": "<CODE_I_PROVIDE>",
  "agent_name": "AI Shopping Assistant",
  "agent_description": "AI assistant helping with online purchases"
}

Then poll for approval status until I approve on my phone:

GET https://wsim-dev.banksim.ca/api/agent/v1/access-request/<request_id>/status

Once approved, you'll receive `client_id` and `client_secret`.

### 4. Get Access Token
Exchange your credentials for an access token:

POST https://wsim-dev.banksim.ca/api/agent/v1/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=<YOUR_CLIENT_ID>&client_secret=<YOUR_CLIENT_SECRET>

### 5. Browse Products
Use your access token to browse the store:

GET https://ssim-dev.banksim.ca/api/agent/v1/products
Authorization: Bearer <ACCESS_TOKEN>

Or search:

GET https://ssim-dev.banksim.ca/api/agent/v1/products/search?q=coffee
Authorization: Bearer <ACCESS_TOKEN>

Show me what's available and let me choose what to buy.

### 6. Create Checkout
When I select a product:

POST https://ssim-dev.banksim.ca/api/agent/v1/sessions
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{
  "items": [
    { "product_id": "<PRODUCT_ID>", "quantity": 1 }
  ]
}

### 7. Get Payment Token
Request payment authorization from the wallet:

POST https://wsim-dev.banksim.ca/api/agent/v1/payments/token
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{
  "amount": <CART_TOTAL>,
  "currency": "CAD",
  "merchant_id": "<FROM_UCP>",
  "session_id": "<SESSION_ID>"
}

If the amount exceeds my auto-approve limit, you'll get a `step_up_id`. Poll for my approval:

GET https://wsim-dev.banksim.ca/api/agent/v1/payments/token/<step_up_id>/status
Authorization: Bearer <ACCESS_TOKEN>

### 8. Complete Purchase
Submit the payment token to complete checkout:

POST https://ssim-dev.banksim.ca/api/agent/v1/sessions/<session_id>/complete
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json

{
  "payment_token": "<PAYMENT_TOKEN>"
}

## Your Task

1. Start by calling the UCP discovery endpoint
2. Show me what you discover about the store and wallet provider
3. Wait for me to provide a pairing code
4. Walk me through browsing and selecting a product
5. Help me complete the purchase

Begin now by discovering the store at https://ssim-dev.banksim.ca/.well-known/ucp
```

---

## Expected Flow

| Step | AI Action | User Action |
|------|-----------|-------------|
| 1 | Calls UCP discovery | - |
| 2 | Calls WSIM agent-api discovery | - |
| 3 | Shows registration info, asks for pairing code | Generate code in mwsim |
| 4 | Submits access request | Approve on phone |
| 5 | Polls for approval, gets credentials | - |
| 6 | Gets OAuth access token | - |
| 7 | Browses products, shows catalog | Choose product |
| 8 | Creates checkout session | - |
| 9 | Requests payment token | Approve step-up if needed |
| 10 | Completes checkout | - |
| 11 | Shows order confirmation | Verify in BSIM |

---

## Troubleshooting

### AI can't make HTTP requests
Some AIs (especially free tiers) can't make external HTTP calls. Try:
- ChatGPT Plus with browsing enabled
- Gemini Advanced
- Claude with computer use (if available)

### Pairing code expired
Codes expire after 5 minutes. Generate a fresh one.

### Access request not appearing
Check that WSIM is deployed and healthy: `https://wsim-dev.banksim.ca/api/health`

### Payment declined
- Check spending limits in mwsim
- Verify the cart total doesn't exceed per-transaction limit
- For amounts over the limit, wait for step-up approval

---

## Verification

After a successful purchase:
1. Check BSIM transaction history - should show agent badge
2. Check order in SSIM admin
3. Verify the AI received order confirmation

---

## Related Documentation

- [SSIM OpenAPI Spec](teams/SSIM_OPENAPI_SPEC.md)
- [WSIM OpenAPI Spec](teams/WSIM_OPENAPI_SPEC.md)
- [Protocol Design](PROTOCOL_DESIGN.md)
- [Integration Test Plan](INTEGRATION_TEST_PLAN.md)
