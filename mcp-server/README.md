# SACP MCP Server & HTTP Gateway

A dual-mode server that enables AI agents to make purchases on SimToolBox stores:

- **MCP Mode**: For Claude Desktop and MCP-compatible clients (stdio transport)
- **HTTP Gateway Mode**: For ChatGPT, Gemini, and any HTTP-capable AI agent

## Overview

This server provides tools for AI agents to:
- Discover store capabilities via UCP (Universal Commerce Protocol)
- Browse and search products
- Create checkout sessions
- Request payment authorization from the user's wallet
- Handle step-up approvals for purchases exceeding limits
- Complete purchases

## Architecture

### MCP Mode (Claude Desktop, etc.)

```
┌─────────────────────────────────────────────┐
│              AI Agent (Claude)              │
└──────────────────┬──────────────────────────┘
                   │ MCP Protocol (stdio)
                   ▼
┌─────────────────────────────────────────────┐
│              sacp-mcp server                │
│                                             │
│  Tools: discover_store, browse_products,    │
│         create_checkout, get_payment_token, │
│         complete_checkout, etc.             │
└──────┬───────────────────────┬──────────────┘
       │                       │
       ▼                       ▼
┌─────────────┐         ┌─────────────┐
│    SSIM     │         │    WSIM     │
│  (Store)    │         │  (Wallet)   │
└─────────────┘         └─────────────┘
```

### HTTP Gateway Mode (ChatGPT, Gemini, etc.)

```
┌─────────────────────────────────────────────┐
│     AI Agent (ChatGPT, Gemini, etc.)        │
└──────────────────┬──────────────────────────┘
                   │ HTTP REST API
                   ▼
┌─────────────────────────────────────────────┐
│           SACP HTTP Gateway                 │
│                                             │
│  Endpoints:                                 │
│  ├─ GET  /tools         (discovery)         │
│  ├─ POST /auth/register (pairing flow)      │
│  ├─ GET  /products      (browse)            │
│  ├─ POST /checkout      (create)            │
│  ├─ POST /checkout/:id/complete             │
│  └─ POST /execute       (MCP-style)         │
│                                             │
│  Features:                                  │
│  ├─ Session management                      │
│  ├─ Automatic token handling                │
│  └─ Step-up flow orchestration              │
└──────┬───────────────────────┬──────────────┘
       │                       │
       ▼                       ▼
┌─────────────┐         ┌─────────────┐
│    SSIM     │         │    WSIM     │
│  (Store)    │         │  (Wallet)   │
└─────────────┘         └─────────────┘
```

## Installation

```bash
cd mcp-server
npm install
npm run build
```

## Running

### MCP Mode (for Claude Desktop)

```bash
# Development
npm run dev

# Production
npm run start
```

### HTTP Gateway Mode (for ChatGPT, Gemini, etc.)

```bash
# Development
npm run dev:gateway

# Production
npm run start:gateway
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP Gateway port | `3000` |
| `WSIM_BASE_URL` | WSIM API base URL | `https://wsim.banksim.ca` |
| `SSIM_BASE_URL` | SSIM API base URL | `https://ssim.banksim.ca` |
| `WSIM_CLIENT_ID` | Agent OAuth client ID | (MCP mode only) |
| `WSIM_CLIENT_SECRET` | Agent OAuth client secret | (MCP mode only) |

**Note**: HTTP Gateway mode handles credentials dynamically via the registration flow. MCP mode requires pre-configured credentials.

## HTTP Gateway API

### Discovery

```bash
# OpenAPI 3.0 spec (for ChatGPT Actions, Gemini Extensions)
GET /openapi.json

# ChatGPT plugin manifest
GET /.well-known/ai-plugin.json

# List available tools and endpoints
GET /tools

# Health check
GET /health
```

### Authentication

The gateway supports **two authentication methods**:

#### Option 1: OAuth 2.0 (Recommended for ChatGPT Connectors)

Use WSIM's OAuth Authorization Code flow with PKCE:

```bash
# ChatGPT/Gemini handles OAuth automatically when configured as a connector
# Authorization URL: https://wsim.banksim.ca/api/agent/v1/oauth/authorize
# Token URL: https://wsim.banksim.ca/api/agent/v1/oauth/token

# After OAuth, use the Bearer token:
GET /checkout/sess_123
Authorization: Bearer <wsim_access_token>
```

#### Option 2: Pairing Code Flow

For manual testing or non-OAuth clients:

```bash
# Step 1: User generates pairing code in mwsim app
# Step 2: Register with pairing code
POST /auth/register
Content-Type: application/json

{
  "pairing_code": "WSIM-XXXXXX-XXXXXX",
  "agent_name": "ChatGPT Shopping Assistant"
}

# Response: { "status": "pending", "request_id": "...", "poll_endpoint": "/auth/status/..." }

# Step 3: Poll for approval
GET /auth/status/:request_id

# When approved, response includes session_id
# Use session_id as X-Session-Id header for authenticated requests
GET /checkout/sess_123
X-Session-Id: sess_xxx
```

### Products (No Auth Required)

```bash
# Browse products
GET /products
GET /products?q=coffee&category=beverages&limit=10

# Get specific product
GET /products/:product_id
```

### Checkout (Requires X-Session-Id Header)

```bash
# Create checkout
POST /checkout
X-Session-Id: sess_xxx
Content-Type: application/json

{
  "items": [{"product_id": "prod_123", "quantity": 1}]
}

# Update with buyer/shipping info
PATCH /checkout/:session_id
X-Session-Id: sess_xxx
Content-Type: application/json

{
  "buyer": {"name": "John Doe", "email": "john@example.com"},
  "fulfillment": {
    "type": "shipping",
    "address": {"street": "123 Main St", "city": "Toronto", "state": "ON", "postal_code": "M5V 1A1", "country": "CA"}
  }
}

# Complete purchase (auto-handles payment token)
POST /checkout/:session_id/complete
X-Session-Id: sess_xxx

# If step-up required, poll:
GET /checkout/:session_id/step-up/:step_up_id
X-Session-Id: sess_xxx
```

### MCP-Style Tool Execution

```bash
# Execute any tool by name
POST /execute
X-Session-Id: sess_xxx (if required)
Content-Type: application/json

{
  "tool": "browse_products",
  "parameters": {"q": "coffee", "limit": 5}
}
```

## MCP Tools

### Store Tools (SSIM)

| Tool | Description |
|------|-------------|
| `discover_store` | Discover store via `/.well-known/ucp` |
| `browse_products` | Search/list products |
| `get_product` | Get product details |
| `create_checkout` | Start checkout session |
| `update_checkout` | Modify cart items |
| `complete_checkout` | Finalize with payment token |
| `cancel_checkout` | Cancel session |
| `get_order_status` | Check order status |

### Wallet Tools (WSIM)

| Tool | Description |
|------|-------------|
| `check_spending_limits` | View current limits and remaining balance |
| `get_payment_token` | Request payment authorization |
| `check_step_up_status` | Poll for step-up approval |

## Usage with Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "sacp": {
      "command": "node",
      "args": ["/path/to/agents/mcp-server/dist/index.js"],
      "env": {
        "WSIM_CLIENT_ID": "agent_xxx",
        "WSIM_CLIENT_SECRET": "your_secret",
        "WSIM_BASE_URL": "https://wsim.banksim.ca",
        "SSIM_BASE_URL": "https://ssim.banksim.ca"
      }
    }
  }
}
```

## Usage with ChatGPT/Gemini

**Production Gateway**: https://sacp.banksim.ca

Give the AI this prompt:

```
You can make purchases using the API at https://sacp.banksim.ca

To get started:
1. GET /tools to see available operations
2. GET /products to browse items

To purchase, you need authentication:
1. Ask the user to generate a pairing code in their mwsim app
2. POST /auth/register with the pairing code
3. Poll /auth/status/:request_id until approved
4. Use the session_id as X-Session-Id header

Then create checkout, add buyer info, and complete the purchase.
```

## Example Flow

```
1. Agent calls GET /products
   → Returns list of products

2. User provides pairing code: WSIM-ABC123-XYZ789

3. Agent calls POST /auth/register with pairing code
   → Returns request_id

4. User approves in mwsim app

5. Agent polls GET /auth/status/:request_id
   → Returns session_id when approved

6. Agent calls POST /checkout with items and X-Session-Id header
   → Returns checkout session with cart total

7. Agent calls PATCH /checkout/:session_id with buyer and shipping info
   → Returns updated session, status: "ready_for_payment"

8. Agent calls POST /checkout/:session_id/complete
   → If within limits: Returns order confirmation
   → If exceeds limits: Returns step_up_id (user gets push notification)

9. If step-up required:
   Agent polls GET /checkout/:session_id/step-up/:step_up_id
   → Returns order confirmation when user approves
```

## Docker

### Build

```bash
docker build -t sacp-gateway .
```

### Run MCP Mode

```bash
docker run -it \
  -e WSIM_CLIENT_ID=agent_xxx \
  -e WSIM_CLIENT_SECRET=secret \
  sacp-gateway
```

### Run HTTP Gateway Mode

```bash
docker run -p 3000:3000 \
  -e WSIM_BASE_URL=https://wsim.banksim.ca \
  -e SSIM_BASE_URL=https://ssim.banksim.ca \
  sacp-gateway node dist/http-gateway.js
```

## Development

```bash
# Run MCP server in development mode
npm run dev

# Run HTTP Gateway in development mode
npm run dev:gateway

# Build for production
npm run build

# Run tests
npm test
```

## Security Notes

- Agent credentials should be stored securely
- Payment tokens are short-lived and scoped to specific transactions
- Step-up flow requires human approval via mobile app
- All transactions are logged with agent context for auditing
- HTTP Gateway sessions are stored in-memory (use Redis for production)

## Related Documentation

- [Deployment Guide](./DEPLOYMENT.md)
- [Protocol Design](../docs/PROTOCOL_DESIGN.md)
- [AI Discovery Endpoints](../docs/teams/AI_DISCOVERY_ENDPOINTS.md)
- [External AI Test Prompt](../docs/EXTERNAL_AI_TEST_PROMPT.md)
