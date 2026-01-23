# SACP MCP Server

A Model Context Protocol (MCP) server that enables AI agents to make purchases on SimToolBox stores.

## Overview

This MCP server provides tools for AI agents to:
- Discover store capabilities via UCP (Universal Commerce Protocol)
- Browse and search products
- Create checkout sessions
- Request payment authorization from the user's wallet
- Handle step-up approvals for purchases exceeding limits
- Complete purchases

## Architecture

```
┌─────────────────────────────────────────────┐
│              AI Agent (Claude/Gemini)        │
└──────────────────┬──────────────────────────┘
                   │ MCP Protocol (stdio)
                   ▼
┌─────────────────────────────────────────────┐
│              sacp-mcp server                 │
│                                             │
│  Tools:                                     │
│  ├─ discover_store      (→ SSIM)            │
│  ├─ browse_products     (→ SSIM)            │
│  ├─ get_product         (→ SSIM)            │
│  ├─ create_checkout     (→ SSIM)            │
│  ├─ update_checkout     (→ SSIM)            │
│  ├─ complete_checkout   (→ SSIM)            │
│  ├─ cancel_checkout     (→ SSIM)            │
│  ├─ check_spending_limits (→ WSIM)          │
│  ├─ get_payment_token   (→ WSIM)            │
│  ├─ check_step_up_status (→ WSIM)           │
│  └─ get_order_status    (→ SSIM)            │
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

## Configuration

Set the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `WSIM_BASE_URL` | WSIM API base URL | `https://wsim-dev.banksim.ca` |
| `WSIM_CLIENT_ID` | Agent OAuth client ID | (required) |
| `WSIM_CLIENT_SECRET` | Agent OAuth client secret | (required) |
| `SSIM_BASE_URL` | SSIM API base URL | `https://ssim-dev.banksim.ca` |

### Getting Agent Credentials

1. User generates a pairing code in mwsim app
2. Agent requests access via WSIM API with the pairing code
3. User approves and sets spending limits
4. Agent receives `client_id` and `client_secret`

See [Agent Credential Flow](../docs/USER_AGENT_DESIGN.md) for details.

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
        "WSIM_BASE_URL": "https://wsim-dev.banksim.ca",
        "SSIM_BASE_URL": "https://ssim-dev.banksim.ca"
      }
    }
  }
}
```

## Available Tools

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

## Example Flow

```
1. Agent calls discover_store("https://ssim-dev.banksim.ca")
   → Returns merchant info and capabilities

2. Agent calls browse_products(query="coffee")
   → Returns list of coffee products

3. Agent calls create_checkout([{product_id: "prod_123", quantity: 1}])
   → Returns session with cart total

4. Agent calls get_payment_token(amount: 25.99, merchant_id: "...", session_id: "...")
   → If within limits: Returns payment_token
   → If exceeds limits: Returns step_up_id (user gets push notification)

5. If step-up required:
   Agent calls check_step_up_status(step_up_id: "...")
   → Returns "approved" with payment_token when user approves

6. Agent calls complete_checkout(session_id: "...", payment_token: "...")
   → Returns order confirmation
```

## Development

```bash
# Run in development mode
npm run dev

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

## Related Documentation

- [Protocol Design](../docs/PROTOCOL_DESIGN.md)
- [Agent Credential Flow](../docs/USER_AGENT_DESIGN.md)
- [Integration Test Plan](../docs/INTEGRATION_TEST_PLAN.md)
