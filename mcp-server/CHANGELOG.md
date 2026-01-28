# Changelog

All notable changes to the SACP MCP Server & HTTP Gateway will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0-beta.1] - 2026-01-28 (feature/mcp-ui-authorization branch)

### Added
- **MCP ImageContent for QR Codes**: MCP server now returns QR codes as ImageContent
  - MCP-capable clients (Claude Desktop) can render QR codes natively in tool results
  - Uses the MCP specification's ImageContent type: `{ type: 'image', data: base64, mimeType: 'image/png' }`
  - Solves the UI transport capability mismatch - QR codes are now first-class UI elements
- **Device Authorization Tools**: New tools for guest checkout via device authorization
  - `device_authorize`: Initiates device authorization, returns QR code + authorization URL
  - `device_authorize_status`: Polls for authorization approval status
  - Supports RFC 8628 Device Authorization Grant flow
  - Returns both text content and image content for maximum compatibility
- **Design Document**: Added `docs/design/MCP_IMAGE_CONTENT_QR.md` documenting the approach

### Technical Details
- QR codes generated server-side using `qrcode` npm package
- Base64-encoded PNG returned in MCP ImageContent
- Fallback hierarchy: Push notification → QR code image → Clickable link → Manual code
- HTTP Gateway unchanged (ChatGPT still cannot render external images)

## [1.4.10] - 2026-01-28

### Changed
- **GPT Instructions**: Updated to use clickable authorization links as primary method
  - ChatGPT Custom GPTs cannot render external images (platform security restriction)
  - QR codes will not display regardless of correct HTTPS URLs or markdown syntax
  - Updated `docs/GPT_INSTRUCTIONS.md` to use `authorization_url` links instead
  - QR code URL still provided for other AI clients that can render images (Claude, custom apps)

## [1.4.9] - 2026-01-27

### Fixed
- **QR Code HTTPS**: Fixed `qr_code_url` to use HTTPS instead of HTTP
  - ChatGPT runs over HTTPS and blocks mixed content (HTTP images)
  - Now uses `GATEWAY_BASE_URL` config (https://sacp.banksim.ca) instead of `req.protocol`

## [1.4.8] - 2026-01-27

### Added
- **Privacy Policy**: Public privacy policy accessible at `/privacy` endpoint
  - Emphasizes this is an educational sandbox/simulation
  - Warns users NOT to use real personal information (fake emails, etc.)
  - Explains data collection is minimal and session-based
  - HTML-formatted page for easy viewing in browsers
  - Markdown version available at `mcp-server/PRIVACY_POLICY.md`

## [1.4.7] - 2026-01-26

### Added
- **Optimized Web Fallback**: Authorization URL now includes signed token for streamlined web flow
  - Appends `&t=<token>` to `verification_uri_complete` when buyer email is available
  - Token format: `base64url(email).hmac_signature` signed with `INTERNAL_API_SECRET`
  - Allows WSIM to skip code/email entry and go directly to waiting page
  - Graceful degradation: if secret not set or no email, flow works as before

### Fixed
- **GPT Authorization Instructions**: Fixed documentation to use correct URL fields
  - Always use `authorization_url` for user-facing links (has code pre-filled)
  - Never direct users to `verification_uri` (base URL without code)
  - Always provide fallback options (QR code + clickable link) even when push notification sent
  - Added URL Field Reference table to clarify field purposes

## [1.4.6] - 2026-01-26

### Fixed
- **QR Code Display for ChatGPT**: Custom GPTs cannot render base64 data URLs as images
  - Changed from `qr_code_data_url` (data URL) to `qr_code_url` (HTTP URL)
  - New `GET /qr/:request_id` endpoint serves QR code as actual PNG image
  - ChatGPT can now display QR codes using markdown: `![Scan to pay](qr_code_url)`
  - QR codes expire automatically with the payment request

### Changed
- Authorization response field renamed from `qr_code_data_url` to `qr_code_url`
- OpenAPI spec updated with new `/qr/{request_id}` endpoint documentation

## [1.4.5] - 2026-01-26

### Added
- **QR Code Generation**: Gateway now generates QR codes server-side for payment authorization
  - New `qr_code_data_url` field in authorization response contains ready-to-display QR code
  - AI agents can embed directly with markdown: `![QR](qr_code_data_url)`
  - Uses `qrcode` npm package for reliable, scannable QR codes
  - Eliminates dependency on AI image generation (DALL-E can't make functional QR codes)

### Changed
- Authorization response now includes `qr_code_data_url` alongside existing fields
- Updated message for non-push authorization to mention QR scanning option
- OpenAPI spec updated with `qr_code_data_url` field documentation

## [1.4.4] - 2026-01-26

### Added
- **Push Notification Support**: Guest checkout now supports push notifications for known users
  - Passes `buyer_email` to WSIM device authorization endpoint
  - WSIM looks up user by email and sends push notification if found (v1.2.5+)
  - Returns `notification_sent: true/false` in authorization response
  - AI agents can adjust messaging based on whether push was sent
  - Fallback to manual code entry always available
- **Merchant Name in Notifications**: Device authorization now uses merchant name from checkout
  - Uses `checkout.merchant?.name` if available, falls back to `"SACP Gateway"`
  - Improves push notification UX with actual store name

### Changed
- `AuthorizationRequired` response now includes `notification_sent` boolean field
- Authorization message varies based on push notification status
- OpenAPI spec updated with `notification_sent` field documentation

## [1.4.3] - 2026-01-26

### Added
- **Health Check Version**: `/health` endpoint now includes version for deployment validation
  - Returns `{ status, version, service, timestamp }`
  - Enables automated deployment verification

## [1.4.2] - 2026-01-26

### Fixed
- **Payment Token Endpoint Path**: Fixed URL path for WSIM payment token request
  - Changed from `/api/agent/v1/payment-tokens` to `/api/agent/v1/payments/token`
  - Matches WSIM's actual endpoint structure

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
