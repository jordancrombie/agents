# WSIM Team - OpenAPI & Agent Discovery Specification

**For**: WSIM Team
**Date**: 2026-01-25
**Priority**: P1
**Status**: ✅ **COMPLETE** (v1.1.5)

---

## Implementation Status

| Endpoint | Status | Notes |
|----------|--------|-------|
| `/.well-known/openapi.json` | ✅ Complete | Serves OpenAPI 3.0 spec |
| `/.well-known/agent-api` | ✅ Complete | Agent discovery with all auth flows |
| `/.well-known/oauth-authorization-server` | ✅ Complete | RFC 8414 + RFC 8628 + Authorization Code |
| `/.well-known/ai-plugin.json` | ✅ Complete | ChatGPT plugin manifest |
| `/.well-known/mcp-server` | ✅ Complete | 8 MCP tools |
| `GET /api/agent/v1/oauth/authorize` | ✅ Complete | OAuth Authorization Code consent page |

**Implementation**: See [well-known.ts](https://github.com/jordancrombie/wsim/blob/agentic-support/backend/src/routes/well-known.ts) and [agent-oauth.ts](https://github.com/jordancrombie/wsim/blob/agentic-support/backend/src/routes/agent-oauth.ts)

**Authoritative Spec**: The actual OpenAPI specification is at `docs/sacp/openapi-agent.yaml`.

---

## What's New in v1.1.5

### OAuth Authorization Code Flow with PKCE (NEW)

Added browser-based OAuth for ChatGPT Connectors and similar integrations:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/agent/v1/oauth/authorize` | Authorization endpoint (consent page) |
| `POST /api/agent/v1/oauth/authorize/identify` | Submit email, send push to mobile |
| `GET /api/agent/v1/oauth/authorize/status/:id` | Poll for user approval |
| `POST /api/agent/v1/oauth/token` | Token endpoint (supports `authorization_code` grant) |

**Pre-registered Clients:**
- `chatgpt` - ChatGPT Connectors
- `claude-mcp` - Claude MCP
- `gemini` - Google Gemini
- `wsim-test` - Testing

### Three Authorization Flows

| Flow | RFC | Initiator | Use Case |
|------|-----|-----------|----------|
| Authorization Code | RFC 6749 | Browser | ChatGPT Connectors, browser-based AI |
| Device Authorization | RFC 8628 | Agent | CLI tools, devices without browsers |
| Pairing Code | Custom | User | Manual agent linking via mobile app |

---

## What's in v1.1.3

### OAuth Device Authorization Grant (RFC 8628)

Added standard OAuth Device Authorization flow for AI agents:

| Endpoint | Purpose |
|----------|---------|
| `POST /api/agent/v1/oauth/device_authorization` | Agent initiates authorization |
| `POST /api/mobile/access-requests/device-codes/claim` | User enters code in mobile app |
| `POST /api/agent/v1/oauth/token` | Extended to support `device_code` grant |

### Two Authorization Flows

| Flow | RFC | Initiator | Use Case |
|------|-----|-----------|----------|
| Device Authorization | RFC 8628 | Agent | Agent requests code, user enters in app |
| Pairing Code | Custom | User | User generates code in app, gives to agent |

---

## Overview

To enable external AI agents to discover and use WSIM's agent APIs:
1. Publish an OpenAPI 3.0 specification at `/.well-known/openapi.json`
2. Publish an agent discovery document at `/.well-known/agent-api`
3. Add OAuth 2.0 discovery at `/.well-known/oauth-authorization-server` (RFC 8414 + RFC 8628)
4. Publish AI plugin manifest at `/.well-known/ai-plugin.json`
5. Publish MCP server discovery at `/.well-known/mcp-server`

---

## OpenAPI Specification

**Endpoint**: `GET /.well-known/openapi.json`
**Content-Type**: `application/json`

```yaml
openapi: 3.0.3
info:
  title: WSIM Agent API
  description: |
    Wallet API for AI agents. Enables agents to:
    - Register via Device Authorization (RFC 8628) or Pairing Code
    - Request payment authorization tokens
    - Check spending limits
    - Handle step-up approvals for large purchases
  version: 1.1.3
  contact:
    name: SimToolBox
    url: https://wsim.banksim.ca

servers:
  - url: https://wsim-dev.banksim.ca
    description: Development
  - url: https://wsim.banksim.ca
    description: Production

paths:
  # ============================================
  # Device Authorization Flow (RFC 8628) - NEW
  # ============================================
  /api/agent/v1/oauth/device_authorization:
    post:
      operationId: startDeviceAuthorization
      summary: Start Device Authorization flow (RFC 8628)
      description: |
        Initiates OAuth Device Authorization. Returns a device_code for polling
        and a user_code (format: WSIM-XXXXXX-XXXXXX) for the user to enter
        in their mobile wallet app.

        The agent should display the user_code and poll the token endpoint
        with the device_code until approved or expired (15 minute expiration).
      tags:
        - Device Authorization
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - agent_name
                - agent_description
              properties:
                agent_name:
                  type: string
                  description: Display name for this agent
                  example: "AI Shopping Assistant"
                agent_description:
                  type: string
                  description: Description of agent's purpose
                  example: "Helps users shop online"
      responses:
        '200':
          description: Device authorization started
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DeviceAuthorizationResponse'

  # ============================================
  # Pairing Code Flow (Legacy)
  # ============================================
  /api/agent/v1/access-request:
    post:
      operationId: registerWithPairingCode
      summary: Register agent with pairing code
      description: |
        Submit a pairing code to request access to a user's wallet.
        The pairing code is generated by the user in their mobile wallet app.
        After submission, poll the status endpoint until approved.
      tags:
        - Pairing Code Registration
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - pairing_code
                - agent_name
                - agent_description
              properties:
                pairing_code:
                  type: string
                  description: 6-character pairing code from user's wallet app
                  example: "ABC123"
                agent_name:
                  type: string
                  description: Display name for this agent
                  example: "Shopping Assistant"
                agent_description:
                  type: string
                  description: Description of agent's purpose
                  example: "AI assistant for online shopping"
      responses:
        '202':
          description: Registration request submitted, awaiting user approval
          content:
            application/json:
              schema:
                type: object
                properties:
                  request_id:
                    type: string
                    description: ID to poll for approval status
                  status:
                    type: string
                    enum: [pending]
                  expires_at:
                    type: string
                    format: date-time
        '400':
          description: Invalid pairing code

  /api/agent/v1/access-request/{request_id}/status:
    get:
      operationId: getRegistrationStatus
      summary: Check pairing code registration status
      tags:
        - Pairing Code Registration
      parameters:
        - name: request_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Registration status
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    enum: [pending, approved, rejected, expired]
                  client_id:
                    type: string
                    description: Only present if approved
                  client_secret:
                    type: string
                    description: Only present if approved (shown once)

  # ============================================
  # OAuth Token Endpoint
  # ============================================
  /api/agent/v1/oauth/token:
    post:
      operationId: getAccessToken
      summary: Exchange credentials for access token
      description: |
        OAuth 2.0 token endpoint. Supports two grant types:
        - `client_credentials`: Exchange client_id/client_secret for token
        - `urn:ietf:params:oauth:grant-type:device_code`: Poll for device authorization approval
      tags:
        - Authentication
      requestBody:
        required: true
        content:
          application/x-www-form-urlencoded:
            schema:
              oneOf:
                - $ref: '#/components/schemas/ClientCredentialsRequest'
                - $ref: '#/components/schemas/DeviceCodeRequest'
      responses:
        '200':
          description: Access token
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TokenResponse'
        '400':
          description: Error response (RFC 8628 compliant for device flow)
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/TokenErrorResponse'

  # ============================================
  # Spending Limits
  # ============================================
  /api/agent/v1/limits:
    get:
      operationId: getSpendingLimits
      summary: Get current spending limits
      tags:
        - Payments
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Current spending limits
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SpendingLimits'

  # ============================================
  # Payment Authorization
  # ============================================
  /api/agent/v1/payments/token:
    post:
      operationId: requestPaymentToken
      summary: Request payment authorization
      description: |
        Request a payment token for a purchase. If the amount is within
        the agent's auto-approve limits, a token is returned immediately.
        If the amount exceeds limits, a step_up_id is returned and the
        user receives a push notification to approve.
      tags:
        - Payments
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - amount
                - merchant_id
                - session_id
              properties:
                amount:
                  type: number
                  format: decimal
                  description: Payment amount in dollars
                  example: 25.99
                currency:
                  type: string
                  default: CAD
                merchant_id:
                  type: string
                  description: Merchant ID from store's UCP discovery
                session_id:
                  type: string
                  description: Checkout session ID from store
      responses:
        '200':
          description: Payment token or step-up required
          content:
            application/json:
              schema:
                oneOf:
                  - $ref: '#/components/schemas/PaymentTokenResponse'
                  - $ref: '#/components/schemas/StepUpRequired'

  /api/agent/v1/payments/token/{step_up_id}/status:
    get:
      operationId: getStepUpStatus
      summary: Check step-up approval status
      tags:
        - Payments
      security:
        - bearerAuth: []
      parameters:
        - name: step_up_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Step-up status
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/StepUpStatus'

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      description: Access token from /oauth/token

  schemas:
    # Device Authorization (RFC 8628)
    DeviceAuthorizationResponse:
      type: object
      properties:
        device_code:
          type: string
          description: Code for polling token endpoint
        user_code:
          type: string
          description: Code for user to enter (format WSIM-XXXXXX-XXXXXX)
          example: "WSIM-ABC123-XYZ789"
        verification_uri:
          type: string
          format: uri
          description: URL where user can enter code
        verification_uri_complete:
          type: string
          format: uri
          description: URL with code pre-filled
        expires_in:
          type: integer
          description: Seconds until codes expire (900 = 15 min)
          example: 900
        interval:
          type: integer
          description: Minimum polling interval in seconds
          example: 5

    ClientCredentialsRequest:
      type: object
      required:
        - grant_type
        - client_id
        - client_secret
      properties:
        grant_type:
          type: string
          enum: [client_credentials]
        client_id:
          type: string
        client_secret:
          type: string

    DeviceCodeRequest:
      type: object
      required:
        - grant_type
        - device_code
      properties:
        grant_type:
          type: string
          enum: ["urn:ietf:params:oauth:grant-type:device_code"]
        device_code:
          type: string
          description: Device code from device_authorization endpoint

    TokenResponse:
      type: object
      properties:
        access_token:
          type: string
        token_type:
          type: string
          example: Bearer
        expires_in:
          type: integer
          example: 3600

    TokenErrorResponse:
      type: object
      description: RFC 8628 compliant error responses
      properties:
        error:
          type: string
          enum:
            - authorization_pending
            - slow_down
            - access_denied
            - expired_token
            - invalid_grant
        error_description:
          type: string

    SpendingLimits:
      type: object
      properties:
        per_transaction:
          type: number
          description: Maximum per-transaction amount (auto-approve)
        daily:
          type: number
          description: Daily spending limit
        daily_remaining:
          type: number
          description: Remaining daily allowance
        monthly:
          type: number
        monthly_remaining:
          type: number
        currency:
          type: string
          example: CAD

    PaymentTokenResponse:
      type: object
      properties:
        payment_token:
          type: string
          description: Token to submit to merchant for payment
        expires_at:
          type: string
          format: date-time

    StepUpRequired:
      type: object
      properties:
        step_up_required:
          type: boolean
          example: true
        step_up_id:
          type: string
          description: ID to poll for approval
        message:
          type: string
          example: "Amount exceeds auto-approve limit. User notified."

    StepUpStatus:
      type: object
      properties:
        status:
          type: string
          enum: [pending, approved, rejected, expired]
        payment_token:
          type: string
          description: Only present if approved
        expires_at:
          type: string
          format: date-time
```

---

## Agent Discovery Document

**Endpoint**: `GET /.well-known/agent-api`
**Content-Type**: `application/json`

```json
{
  "name": "WSIM Agent API",
  "description": "Wallet service for AI agent payments",
  "version": "1.1.3",
  "documentation_url": "https://docs.banksim.ca/agent-api",

  "registration": {
    "flows": {
      "device_authorization": {
        "method": "oauth_device_code",
        "endpoint": "/api/agent/v1/oauth/device_authorization",
        "description": "Agent initiates, user enters code in mobile app (RFC 8628)",
        "requires_human_approval": true
      },
      "pairing_code": {
        "method": "pairing_code",
        "endpoint": "/api/agent/v1/access-request",
        "description": "User generates code in app, gives to agent",
        "requires_human_approval": true
      }
    },
    "recommended": "device_authorization"
  },

  "authentication": {
    "type": "oauth2",
    "flows": ["authorization_code", "client_credentials", "device_code"],
    "authorization_endpoint": "/api/agent/v1/oauth/authorize",
    "token_endpoint": "/api/agent/v1/oauth/token",
    "discovery_url": "/.well-known/oauth-authorization-server"
  },

  "capabilities": [
    "payment_authorization",
    "spending_limits",
    "step_up_approval",
    "device_authorization",
    "authorization_code_pkce"
  ],

  "api": {
    "openapi_url": "/.well-known/openapi.json",
    "base_path": "/api/agent/v1"
  },

  "limits": {
    "rate_limit": "100 requests/minute",
    "token_expiry": "1 hour",
    "device_code_expiry": "15 minutes"
  }
}
```

---

## OAuth Discovery (RFC 8414 + RFC 8628 + Authorization Code)

**Endpoint**: `GET /.well-known/oauth-authorization-server`
**Content-Type**: `application/json`

```json
{
  "issuer": "https://wsim.banksim.ca",
  "authorization_endpoint": "https://wsim.banksim.ca/api/agent/v1/oauth/authorize",
  "token_endpoint": "https://wsim.banksim.ca/api/agent/v1/oauth/token",
  "device_authorization_endpoint": "https://wsim.banksim.ca/api/agent/v1/oauth/device_authorization",
  "token_introspection_endpoint": "https://wsim.banksim.ca/api/agent/v1/oauth/introspect",
  "revocation_endpoint": "https://wsim.banksim.ca/api/agent/v1/oauth/revoke",
  "grant_types_supported": [
    "authorization_code",
    "client_credentials",
    "urn:ietf:params:oauth:grant-type:device_code"
  ],
  "token_endpoint_auth_methods_supported": ["client_secret_post", "none"],
  "response_types_supported": ["code", "token"],
  "code_challenge_methods_supported": ["S256"]
}
```

---

## Device Authorization Flow Sequence

```
┌─────────────┐                                    ┌─────────────┐
│   AI Agent  │                                    │    WSIM     │
└──────┬──────┘                                    └──────┬──────┘
       │                                                  │
       │  POST /oauth/device_authorization                │
       │  { agent_name, agent_description }               │
       │─────────────────────────────────────────────────>│
       │                                                  │
       │  { device_code, user_code: "WSIM-XXX-XXX",      │
       │    verification_uri, expires_in: 900 }           │
       │<─────────────────────────────────────────────────│
       │                                                  │
       │  Display user_code to user                       │
       │                                                  │
       │                                    ┌─────────────┴─────────────┐
       │                                    │        User enters        │
       │                                    │   code in mobile app      │
       │                                    │   and approves access     │
       │                                    └─────────────┬─────────────┘
       │                                                  │
       │  POST /oauth/token                               │
       │  grant_type=urn:ietf:params:oauth:grant-type:device_code
       │  device_code=<device_code>                       │
       │─────────────────────────────────────────────────>│
       │                                                  │
       │  (if pending) { error: "authorization_pending" } │
       │<─────────────────────────────────────────────────│
       │                                                  │
       │  ... poll every 5 seconds ...                    │
       │                                                  │
       │  (when approved) { access_token, expires_in }    │
       │<─────────────────────────────────────────────────│
       │                                                  │
```

---

## Files Changed (v1.1.3)

| File | Changes |
|------|---------|
| `backend/src/routes/agent-oauth.ts` | Device authorization endpoints (lines 51-227) |
| `backend/src/routes/access-request.ts` | Device code claim endpoint (lines 168-266) |
| `backend/src/routes/well-known.ts` | Discovery updates |
| `docs/sacp/openapi-agent.yaml` | API documentation |
| `CHANGELOG.md` | v1.1.3 release notes |

---

## Acceptance Criteria

- [x] `POST /api/agent/v1/oauth/device_authorization` returns device/user codes
- [x] `POST /api/mobile/access-requests/device-codes/claim` allows user to claim code
- [x] `POST /api/agent/v1/oauth/token` supports `device_code` grant type
- [x] Token endpoint returns RFC 8628 compliant errors
- [x] `/.well-known/oauth-authorization-server` includes `device_authorization_endpoint`
- [x] `/.well-known/agent-api` documents both authorization flows
- [x] `/.well-known/ai-plugin.json` returns valid plugin manifest
- [x] `/.well-known/mcp-server` returns MCP tool discovery
- [x] All endpoints return proper `Content-Type: application/json`
- [x] CORS headers allow cross-origin requests

---

## References

- [RFC 8628 - OAuth 2.0 Device Authorization Grant](https://datatracker.ietf.org/doc/html/rfc8628)
- [RFC 8414 - OAuth 2.0 Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)

---

## Contact

**Requestor**: PM
**WSIM Team Lead**: [TBD]
