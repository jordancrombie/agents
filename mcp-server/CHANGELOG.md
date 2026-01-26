# Changelog

All notable changes to the SACP MCP Server & HTTP Gateway will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.1] - 2026-01-26

### Fixed
- **Device Authorization Token Response**: Added `response_type: 'token'` parameter to device authorization request
  - WSIM v1.2.4 now supports returning access tokens directly instead of agent credentials
  - Required for guest checkout to receive usable access tokens after user approval

## [1.4.0] - 2026-01-25

### Added
- **Guest Checkout Flow**: AI agents can now browse products and create checkouts without upfront OAuth authentication
  - Authentication only required at payment time via RFC 8628 Device Authorization Grant
  - Enables ChatGPT Actions and other LLM integrations without OAuth setup complexity
- **Device Authorization Grant (RFC 8628)**: New payment authorization flow for guest checkout
  - `POST /checkout/:session_id/complete` returns 202 with `authorization_required` status for unauthenticated users
  - Returns user code (e.g., `WSIM-A3J2K9`) and verification URI for wallet app authorization
  - `GET /checkout/:session_id/payment-status/:request_id` - New polling endpoint for payment authorization status
- **Gateway Credentials**: Gateway now has its own OAuth client credentials for device authorization
  - Configured via `GATEWAY_CLIENT_ID` and `GATEWAY_CLIENT_SECRET` environment variables
  - Registered with WSIM as `sacp-gateway` client
- **Spending Limits Scoping**: Payment authorization requests scope spending limits to exact checkout total

### Changed
- **Checkout Routes No Longer Require Auth**: `POST /checkout`, `PATCH /checkout/:id`, and `GET /checkout/:id` now work without authentication
- OpenAPI spec updated with `security: []` for guest checkout endpoints
- Added `AuthorizationRequired` and `PaymentStatus` schemas to OpenAPI spec
- Version bumped to 1.4.0

### Technical Details
- Guest checkouts stored in `guestCheckouts` map for session tracking
- Device authorization requests stored in `pendingDeviceAuths` map with expiration handling
- Supports RFC 8628 error responses: `authorization_pending`, `slow_down`, `access_denied`, `expired_token`

## [1.3.1] - 2026-01-25

### Fixed
- **OpenAPI spec ChatGPT compatibility**: Fixed validation errors preventing ChatGPT Actions import
  - Upgraded OpenAPI version from 3.0.0 to 3.1.0
  - Fixed server URL to always use HTTPS (`https://sacp.banksim.ca`)
  - Added missing `items` property to array schemas (Checkout.cart.items, Order.items)
  - Simplified to single OAuth2 security scheme (ChatGPT only supports one)

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
