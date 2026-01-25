# Changelog

All notable changes to the SACP MCP Server & HTTP Gateway will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-01-25

### Added
- **Dual Authentication Support**: Gateway now accepts both WSIM OAuth Bearer tokens (`Authorization: Bearer`) AND pairing code sessions (`X-Session-Id`)
- OAuth2 security scheme in OpenAPI spec pointing to WSIM Authorization Code flow
- Bearer token validation via WSIM introspection endpoint
- Token session caching for performance
- Updated `/.well-known/ai-plugin.json` with OAuth configuration for ChatGPT Connectors

### Changed
- OpenAPI spec version bumped to 1.3.0
- `/tools` endpoint now documents both authentication methods
- `requireSession` middleware now provides clearer error messages for both auth types
- Session interface extended with `authType` and `bearerToken` fields

## [1.2.0] - 2026-01-25

### Added
- `/openapi.json` endpoint serving OpenAPI 3.0 specification
- `/.well-known/ai-plugin.json` endpoint for ChatGPT plugin manifest
- Full OpenAPI documentation for all endpoints with schemas

### Changed
- Updated README with discovery endpoint documentation

## [1.1.0] - 2026-01-24

### Added
- HTTP Gateway mode (`src/http-gateway.ts`) for ChatGPT, Gemini, and HTTP-capable AI agents
- REST API endpoints for shopping flow:
  - `POST /auth/register` - Pairing code registration
  - `GET /auth/status/:id` - Registration status polling
  - `GET /products` - Browse products
  - `POST /checkout` - Create checkout
  - `PATCH /checkout/:id` - Update checkout
  - `POST /checkout/:id/complete` - Complete purchase
  - `GET /checkout/:id/step-up/:id` - Step-up polling
- Session management with in-memory storage
- `/execute` endpoint for MCP-style tool execution
- `/tools` endpoint for tool discovery
- Dockerfile updated for dual-mode deployment (MCP stdio + HTTP Gateway)

### Changed
- Package now exports both `sacp-mcp` (MCP mode) and `sacp-gateway` (HTTP mode) binaries

## [1.0.0] - 2026-01-21

### Added
- Initial MCP server implementation for Claude Desktop
- SSIM client for store operations (browse, checkout, orders)
- WSIM client for wallet operations (payment tokens, step-up)
- MCP tools:
  - `discover_store` - UCP discovery
  - `browse_products` - Product search
  - `get_product` - Product details
  - `create_checkout` - Start checkout
  - `update_checkout` - Modify cart
  - `complete_checkout` - Finalize purchase
  - `cancel_checkout` - Cancel session
  - `get_order_status` - Order tracking
  - `check_spending_limits` - View limits
  - `get_payment_token` - Request authorization
  - `check_step_up_status` - Poll approval
