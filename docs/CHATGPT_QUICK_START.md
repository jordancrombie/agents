# ChatGPT Quick Start - SACP Shopping Demo

Copy and paste the prompt below into ChatGPT (Plus with browsing) or Gemini Advanced.

**v1.4.5 Update**: Guest checkout now supports push notifications and server-generated QR codes! If you provide a real email, you may receive a push notification to your phone. Otherwise, the AI displays a ready-to-scan QR code or you can enter a code manually.

---

## The Prompt (Guest Checkout - Recommended)

```
You are an AI shopping assistant. Help me browse and purchase products using this API:

Base URL: https://sacp.banksim.ca

STEP 1 - Browse products (no auth needed):
GET https://sacp.banksim.ca/products

Show me what's available with prices.

STEP 2 - Create checkout (no auth needed):
POST https://sacp.banksim.ca/checkout
Content-Type: application/json
{"items": [{"product_id": "<ID>", "quantity": 1}]}

This returns a checkout_session_id. Save it.

STEP 3 - Add shipping info (no auth needed):
PATCH https://sacp.banksim.ca/checkout/<checkout_session_id>
Content-Type: application/json
{
  "buyer": {"name": "Test User", "email": "test@example.com"},
  "fulfillment": {
    "type": "shipping",
    "address": {"street": "123 Main St", "city": "Toronto", "state": "ON", "postal_code": "M5V 1A1", "country": "CA"}
  }
}

STEP 4 - Complete purchase:
POST https://sacp.banksim.ca/checkout/<checkout_session_id>/complete
Content-Type: application/json

The response tells you how the user should authorize payment:
{
  "status": "authorization_required",
  "notification_sent": true/false,    // Did the user get a push notification?
  "authorization_url": "https://...", // URL with code pre-filled
  "qr_code_data_url": "data:image/png;base64,...", // Ready-to-display QR code
  "user_code": "WSIM-A3J2K9",         // Manual code entry
  "verification_uri": "https://...",  // Where to enter code
  "poll_endpoint": "/checkout/.../payment-status/...",
  "expires_in": 900
}

Based on the response:
- If notification_sent is TRUE: Tell me "Check your phone - I sent a payment request to your wallet app"
- If notification_sent is FALSE: Display the QR code and offer manual entry:
  1. Show QR: `![Scan to pay](qr_code_data_url)` - this is a ready-to-scan image
  2. "Or enter code WSIM-XXXXXX in your wallet app"

STEP 5 - Poll for payment:
GET https://sacp.banksim.ca/checkout/<checkout_session_id>/payment-status/<request_id>

Poll every 5 seconds until status is "approved" - then you'll get the order confirmation!

Start by showing me the products!
```

---

## What You Need

1. **ChatGPT Plus** (with browsing) or **Gemini Advanced**
2. **mwsim app** on your phone to approve purchases

---

## Flow (Guest Checkout)

1. Paste the prompt → AI shows products
2. Pick something → AI creates checkout (no auth needed!)
3. AI adds your info and completes checkout
4. AI shows authorization options based on `notification_sent`:
   - **If TRUE**: "Check your phone" - you'll get a push notification
   - **If FALSE**: AI offers QR code or manual code entry
5. Authorize in mwsim:
   - **Push**: Tap notification → Approve
   - **QR**: Open mwsim → Scan QR code → Approve
   - **Manual**: Agents → Authorize → Enter code (e.g., `WSIM-A3J2K9`) → Approve
6. AI polls and shows order confirmation
7. Verify the order in BSIM (look for 🤖 agent badge)

---

## Authorization Options

| Method | When Available | User Action |
|--------|----------------|-------------|
| **Push Notification** | `notification_sent: true` | Tap notification on phone |
| **QR Code** | Always | Scan QR code with mwsim app |
| **Manual Code** | Always | Enter `WSIM-XXXXXX` in mwsim |

The Gateway generates a ready-to-display QR code in `qr_code_data_url` - the AI just displays it with markdown.

---

## Alternative: Pairing Code Flow (Legacy)

If you prefer to authenticate before shopping:

```
You are an AI shopping assistant. Help me browse and purchase products using this API:

Base URL: https://sacp.banksim.ca

STEP 1 - Browse products (no auth needed):
GET https://sacp.banksim.ca/products

STEP 2 - When I want to buy, I'll give you a pairing code. Register with it:
POST https://sacp.banksim.ca/auth/register
Content-Type: application/json
{"pairing_code": "<MY_CODE>", "agent_name": "ChatGPT Shopping Assistant"}

Then poll for my approval:
GET https://sacp.banksim.ca/auth/status/<request_id>

When approved, you get a session_id. Use it as X-Session-Id header for all subsequent requests.

STEP 3 - Create checkout:
POST https://sacp.banksim.ca/checkout
X-Session-Id: <session_id>
Content-Type: application/json
{"items": [{"product_id": "<ID>", "quantity": 1}]}

STEP 4 - Add shipping info:
PATCH https://sacp.banksim.ca/checkout/<checkout_id>
X-Session-Id: <session_id>
Content-Type: application/json
{
  "buyer": {"name": "Test User", "email": "test@example.com"},
  "fulfillment": {
    "type": "shipping",
    "address": {"street": "123 Main St", "city": "Toronto", "state": "ON", "postal_code": "M5V 1A1", "country": "CA"}
  }
}

STEP 5 - Complete purchase:
POST https://sacp.banksim.ca/checkout/<checkout_id>/complete
X-Session-Id: <session_id>

Start by showing me the products!
```

---

## Troubleshooting

**AI can't make requests?**
- Make sure you're using ChatGPT Plus with browsing enabled
- Or Gemini Advanced

**Code expired?**
- User codes expire after 15 minutes - AI should restart the checkout

**Payment pending too long?**
- Make sure you entered the code correctly in mwsim
- The code format is `WSIM-XXXXXX` (6 characters after the dash)
