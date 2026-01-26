#!/usr/bin/env node
/**
 * SACP HTTP Gateway
 *
 * An HTTP API that enables any AI agent (ChatGPT, Claude, Gemini, etc.) to:
 * - Register via pairing code
 * - Browse products and create checkouts
 * - Complete purchases with payment authorization
 *
 * This wraps the MCP tools in a simple REST API that any HTTP client can use.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { createRequire } from 'module';
import QRCode from 'qrcode';
import { SsimClient, CartItem } from './clients/ssim.js';
import { WsimClient } from './clients/wsim.js';

// Import version from package.json
const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const VERSION = pkg.version;

const app = express();
app.use(cors());
app.use(express.json());

// Configuration
const config = {
  port: parseInt(process.env.PORT || '3000'),
  wsim: {
    baseUrl: process.env.WSIM_BASE_URL || 'https://wsim.banksim.ca',
  },
  ssim: {
    baseUrl: process.env.SSIM_BASE_URL || 'https://ssim.banksim.ca',
  },
  gateway: {
    // Gateway's own OAuth credentials for device authorization flow
    clientId: process.env.GATEWAY_CLIENT_ID || 'sacp-gateway',
    clientSecret: process.env.GATEWAY_CLIENT_SECRET || '',
    baseUrl: process.env.GATEWAY_BASE_URL || 'https://sacp.banksim.ca',
  },
};

/**
 * Create a signed token for optimized web fallback flow.
 * When appended to verification_uri_complete, WSIM can skip code/email entry
 * and go directly to the waiting page.
 *
 * Token format: base64url(email).base64url(hmac_signature)
 * Signature input: "email:code" (e.g., "user@example.com:WSIM-FQHJCG")
 */
function createDeviceAuthToken(email: string, code: string): string {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return '';

  const emailB64 = Buffer.from(email).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${email}:${code}`)
    .digest('base64url');
  return `${emailB64}.${signature}`;
}

// Session storage (in-memory for demo, use Redis for production)
interface Session {
  id: string;
  clientId: string;
  clientSecret: string;
  agentId: string;
  accessToken?: string;
  tokenExpiresAt?: number;
  createdAt: Date;
  // For OAuth Bearer token sessions (from WSIM OAuth flow)
  authType: 'pairing_code' | 'bearer_token';
  bearerToken?: string;
}

const sessions = new Map<string, Session>();
const pendingRegistrations = new Map<string, { requestId: string; pollUrl: string; expiresAt: string }>();
// Cache Bearer tokens to sessions for performance
const bearerTokenSessions = new Map<string, Session>();

// Guest checkout sessions (no auth required until payment)
interface GuestCheckout {
  sessionId: string;
  ssimSessionId: string; // The session ID from SSIM
  createdAt: Date;
  cart?: {
    total: number;
    currency: string;
    items: Array<{ product_id: string; quantity: number }>;
  };
}
const guestCheckouts = new Map<string, GuestCheckout>();

// Pending device authorization requests (for guest checkout payment)
interface PendingDeviceAuth {
  requestId: string;
  checkoutSessionId: string;
  ssimSessionId: string;
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: Date;
  interval: number; // polling interval in seconds
  amount: number;
  currency: string;
  qrCodeBuffer?: Buffer; // QR code image for serving via URL
}
const pendingDeviceAuths = new Map<string, PendingDeviceAuth>();

// Generate a simple session ID
function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// Create a session from a Bearer token (validates with WSIM)
async function getOrCreateBearerSession(bearerToken: string): Promise<Session | null> {
  // Check cache first
  const cached = bearerTokenSessions.get(bearerToken);
  if (cached) {
    return cached;
  }

  try {
    // Validate token with WSIM introspection endpoint
    const response = await fetch(`${config.wsim.baseUrl}/api/agent/v1/oauth/introspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `token=${encodeURIComponent(bearerToken)}`,
    });

    if (!response.ok) {
      console.error('Token introspection failed:', response.status);
      return null;
    }

    const data = await response.json();

    if (!data.active) {
      console.error('Token is not active');
      return null;
    }

    // Create a virtual session for this Bearer token
    const session: Session = {
      id: `bearer_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      clientId: data.client_id || 'oauth_client',
      clientSecret: '', // Not needed for Bearer token auth
      agentId: data.sub || data.agent_id || 'oauth_agent',
      accessToken: bearerToken,
      tokenExpiresAt: data.exp ? data.exp * 1000 : undefined,
      createdAt: new Date(),
      authType: 'bearer_token',
      bearerToken: bearerToken,
    };

    // Cache the session
    bearerTokenSessions.set(bearerToken, session);

    return session;
  } catch (error) {
    console.error('Error validating Bearer token:', error);
    return null;
  }
}

// ============================================================================
// Tool Definitions (for discovery)
// ============================================================================

const tools = [
  {
    name: 'register',
    description: 'Register this agent with the wallet using a pairing code. The user must generate this code in their mobile wallet app.',
    endpoint: 'POST /auth/register',
    parameters: {
      pairing_code: { type: 'string', required: true, description: 'Pairing code from user (format: WSIM-XXXXXX-XXXXXX)' },
      agent_name: { type: 'string', required: true, description: 'Name for this agent' },
      agent_description: { type: 'string', required: false, description: 'Description of what this agent does' },
    },
  },
  {
    name: 'check_registration',
    description: 'Check the status of a pending registration request',
    endpoint: 'GET /auth/status/:request_id',
    parameters: {
      request_id: { type: 'string', required: true, description: 'The registration request ID' },
    },
  },
  {
    name: 'browse_products',
    description: 'Browse available products in the store',
    endpoint: 'GET /products',
    parameters: {
      q: { type: 'string', required: false, description: 'Search query' },
      category: { type: 'string', required: false, description: 'Filter by category' },
      limit: { type: 'number', required: false, description: 'Max results (default 20)' },
    },
  },
  {
    name: 'get_product',
    description: 'Get details for a specific product',
    endpoint: 'GET /products/:product_id',
    parameters: {
      product_id: { type: 'string', required: true, description: 'Product ID' },
    },
  },
  {
    name: 'create_checkout',
    description: 'Create a new checkout session with items',
    endpoint: 'POST /checkout',
    parameters: {
      items: { type: 'array', required: true, description: 'Array of {product_id, quantity}' },
    },
  },
  {
    name: 'update_checkout',
    description: 'Update checkout with buyer and fulfillment info',
    endpoint: 'PATCH /checkout/:session_id',
    parameters: {
      session_id: { type: 'string', required: true },
      buyer: { type: 'object', required: false, description: '{ name, email }' },
      fulfillment: { type: 'object', required: false, description: '{ type, address }' },
    },
  },
  {
    name: 'complete_checkout',
    description: 'Complete checkout. Returns authorization_required with user_code and notification_sent. If notification_sent=true, tell user to check their phone. If false, offer QR code (from authorization_url) or manual code entry. Then poll payment-status until approved.',
    endpoint: 'POST /checkout/:session_id/complete',
    parameters: {
      session_id: { type: 'string', required: true },
    },
  },
  {
    name: 'get_order',
    description: 'Get order status after purchase',
    endpoint: 'GET /orders/:order_id',
    parameters: {
      order_id: { type: 'string', required: true },
    },
  },
];

// ============================================================================
// Middleware
// ============================================================================

// Session middleware - extracts session from X-Session-Id OR Authorization: Bearer
async function sessionMiddleware(req: Request, res: Response, next: NextFunction) {
  // Try X-Session-Id first (pairing code flow)
  const sessionId = req.headers['x-session-id'] as string;
  if (sessionId) {
    const session = sessions.get(sessionId);
    if (session) {
      (req as any).session = session;
      return next();
    }
  }

  // Try Authorization: Bearer (OAuth flow)
  const authHeader = req.headers['authorization'] as string;
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearerToken = authHeader.substring(7).trim();
    if (bearerToken) {
      const session = await getOrCreateBearerSession(bearerToken);
      if (session) {
        (req as any).session = session;
        return next();
      }
    }
  }

  next();
}

app.use(sessionMiddleware);

// Helper to get authenticated clients
async function getClients(session: Session): Promise<{ wsim: WsimClient; ssim: SsimClient; token: string }> {
  let token: string;

  if (session.authType === 'bearer_token' && session.bearerToken) {
    // For OAuth Bearer token sessions, use the token directly
    token = session.bearerToken;
    // Create a minimal WSIM client that uses the Bearer token
    const wsim = new WsimClient(config.wsim.baseUrl, session.clientId, session.clientSecret);
    // Override the token
    (wsim as any).accessToken = token;
    const ssim = new SsimClient(config.ssim.baseUrl, token);
    return { wsim, ssim, token };
  } else {
    // For pairing code sessions, get token via client credentials
    const wsim = new WsimClient(config.wsim.baseUrl, session.clientId, session.clientSecret);
    token = await wsim.getAccessToken();
    const ssim = new SsimClient(config.ssim.baseUrl, token);
    return { wsim, ssim, token };
  }
}

// ============================================================================
// Routes
// ============================================================================

// Discovery - list available tools
app.get('/tools', (req, res) => {
  res.json({
    name: 'SACP Agent Gateway',
    version: '1.4.6',
    description: 'HTTP gateway for AI agents to browse and purchase from SimToolBox stores',
    base_url: `${req.protocol}://${req.get('host')}`,
    authentication: {
      methods: [
        {
          type: 'oauth2',
          name: 'WSIM OAuth (Recommended)',
          description: 'OAuth 2.0 Authorization Code flow via WSIM wallet',
          authorization_url: `${config.wsim.baseUrl}/api/agent/v1/oauth/authorize`,
          token_url: `${config.wsim.baseUrl}/api/agent/v1/oauth/token`,
          scopes: ['shopping'],
          header: 'Authorization: Bearer <token>',
        },
        {
          type: 'pairing_code',
          name: 'Pairing Code Flow',
          description: 'Register with a pairing code from user wallet, receive session_id',
          flow: '1) User generates code in wallet app, 2) POST /auth/register, 3) Poll /auth/status until approved, 4) Use session_id',
          header: 'X-Session-Id: <session_id>',
        },
      ],
    },
    tools,
  });
});

// Health check with version for deployment validation
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: VERSION,
    service: 'sacp-gateway',
    timestamp: new Date().toISOString(),
  });
});

// OpenAPI spec for ChatGPT Actions and other LLM integrations
app.get('/openapi.json', (req, res) => {
  // Force HTTPS for production - ChatGPT requires server URL to match origin
  const baseUrl = process.env.GATEWAY_BASE_URL || 'https://sacp.banksim.ca';

  const wsimBaseUrl = config.wsim.baseUrl;

  const openApiSpec = {
    openapi: '3.1.0',
    info: {
      title: 'SACP Agent Gateway',
      description: `AI shopping assistant API for browsing products and completing purchases.

**Two Authentication Options:**

Use OAuth 2.0 Authorization Code flow to authenticate. ChatGPT will handle the OAuth flow automatically when configured as a connector.`,
      version: '1.4.6',
      contact: {
        name: 'SimToolBox',
        url: 'https://simtoolbox.com',
      },
    },
    servers: [
      {
        url: baseUrl,
        description: 'SACP Gateway',
      },
    ],
    paths: {
      '/products': {
        get: {
          operationId: 'browseProducts',
          summary: 'Browse available products',
          description: 'Get a list of products available for purchase. No authentication required.',
          parameters: [
            {
              name: 'q',
              in: 'query',
              description: 'Search query',
              schema: { type: 'string' },
            },
            {
              name: 'category',
              in: 'query',
              description: 'Filter by category',
              schema: { type: 'string' },
            },
            {
              name: 'limit',
              in: 'query',
              description: 'Maximum number of results',
              schema: { type: 'integer', default: 20 },
            },
          ],
          responses: {
            '200': {
              description: 'List of products',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      products: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/Product' },
                      },
                      pagination: { $ref: '#/components/schemas/Pagination' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/products/{product_id}': {
        get: {
          operationId: 'getProduct',
          summary: 'Get product details',
          parameters: [
            {
              name: 'product_id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Product details',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Product' },
                },
              },
            },
          },
        },
      },
      '/auth/register': {
        post: {
          operationId: 'registerAgent',
          summary: 'Register with pairing code',
          description: 'Register this AI agent using a pairing code from the user\'s wallet app. After calling this, poll /auth/status/{request_id} until approved.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['pairing_code', 'agent_name'],
                  properties: {
                    pairing_code: {
                      type: 'string',
                      description: 'Pairing code from user (format: WSIM-XXXXXX-XXXXXX)',
                    },
                    agent_name: {
                      type: 'string',
                      description: 'Name for this agent',
                    },
                    agent_description: {
                      type: 'string',
                      description: 'Optional description',
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Registration started',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', enum: ['pending'] },
                      request_id: { type: 'string' },
                      poll_endpoint: { type: 'string' },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/auth/status/{request_id}': {
        get: {
          operationId: 'checkRegistrationStatus',
          summary: 'Check registration status',
          description: 'Poll this endpoint until status is "approved" (returns session_id) or "rejected".',
          parameters: [
            {
              name: 'request_id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Registration status',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
                      session_id: { type: 'string', description: 'Only present when approved' },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/checkout': {
        post: {
          operationId: 'createCheckout',
          summary: 'Create checkout session',
          description: 'Create a new guest checkout with items. No authentication required - payment authorization happens at checkout completion.',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['items'],
                  properties: {
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['product_id', 'quantity'],
                        properties: {
                          product_id: { type: 'string' },
                          quantity: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Checkout created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Checkout' },
                },
              },
            },
            '401': { description: 'Session required' },
          },
        },
      },
      '/checkout/{session_id}': {
        patch: {
          operationId: 'updateCheckout',
          summary: 'Update checkout with buyer/shipping info',
          description: 'Add buyer information and shipping details to the checkout session. No authentication required.',
          security: [],
          parameters: [
            {
              name: 'session_id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    buyer: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        email: { type: 'string' },
                      },
                    },
                    fulfillment: {
                      type: 'object',
                      properties: {
                        type: { type: 'string', enum: ['shipping', 'pickup'] },
                        address: {
                          type: 'object',
                          properties: {
                            street: { type: 'string' },
                            city: { type: 'string' },
                            state: { type: 'string' },
                            postal_code: { type: 'string' },
                            country: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Checkout updated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Checkout' },
                },
              },
            },
          },
        },
      },
      '/checkout/{session_id}/complete': {
        post: {
          operationId: 'completeCheckout',
          summary: 'Complete the purchase',
          description: 'Finalize checkout. Returns 202 with authorization_required. If notification_sent=true, tell user to check phone. If false, display qr_code_url as image using ![QR](url) or show user_code. Poll poll_endpoint every 5s.',
          security: [],
          parameters: [
            {
              name: 'session_id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Purchase completed (user was already authenticated)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', enum: ['completed'] },
                      order_id: { type: 'string' },
                      transaction_id: { type: 'string' },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
            '202': {
              description: 'Payment authorization required. AI: Check notification_sent to determine how to guide the user (push notification vs QR code vs manual code entry).',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AuthorizationRequired' },
                },
              },
            },
          },
        },
      },
      '/checkout/{session_id}/step-up/{step_up_id}': {
        get: {
          operationId: 'checkStepUpStatus',
          summary: 'Check step-up approval status',
          description: 'Poll until user approves or rejects the purchase in their wallet app.',
          security: [{ oauth2: ['shopping'] }],
          parameters: [
            {
              name: 'session_id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
            {
              name: 'step_up_id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Step-up status',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', enum: ['pending', 'completed', 'rejected', 'expired'] },
                      order_id: { type: 'string' },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/checkout/{session_id}/payment-status/{request_id}': {
        get: {
          operationId: 'getPaymentStatus',
          summary: 'Poll for payment authorization status',
          description: 'Poll this endpoint after receiving authorization_required from completeCheckout. Returns pending until user approves/rejects in their wallet app, or the request expires.',
          security: [],
          parameters: [
            {
              name: 'session_id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Checkout session ID',
            },
            {
              name: 'request_id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Payment authorization request ID from poll_endpoint',
            },
          ],
          responses: {
            '200': {
              description: 'Payment authorization status',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PaymentStatus' },
                },
              },
            },
            '404': {
              description: 'Session or request not found',
            },
          },
        },
      },
      '/qr/{request_id}': {
        get: {
          operationId: 'getQRCode',
          summary: 'Get QR code image for payment authorization',
          description: 'Returns the QR code as a PNG image. Use this URL in markdown to display the QR code: ![Scan to pay](url). The QR code expires when the payment request expires.',
          security: [],
          parameters: [
            {
              name: 'request_id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Payment request ID from the qr_code_url field',
            },
          ],
          responses: {
            '200': {
              description: 'QR code PNG image',
              content: {
                'image/png': {
                  schema: { type: 'string', format: 'binary' },
                },
              },
            },
            '404': {
              description: 'QR code not found',
            },
            '410': {
              description: 'QR code has expired',
            },
          },
        },
      },
      '/orders/{order_id}': {
        get: {
          operationId: 'getOrder',
          summary: 'Get order details',
          security: [{ oauth2: ['shopping'] }],
          parameters: [
            {
              name: 'order_id',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Order details',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Order' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        oauth2: {
          type: 'oauth2',
          description: 'OAuth 2.0 Authorization Code flow via WSIM wallet. After authorization, tokens are automatically included.',
          flows: {
            authorizationCode: {
              authorizationUrl: `${wsimBaseUrl}/api/agent/v1/oauth/authorize`,
              tokenUrl: `${wsimBaseUrl}/api/agent/v1/oauth/token`,
              scopes: {
                'shopping': 'Browse products and make purchases',
              },
            },
          },
        },
      },
      schemas: {
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            price: {
              type: 'object',
              properties: {
                amount: { type: 'number' },
                currency: { type: 'string' },
              },
            },
            categories: { type: 'array', items: { type: 'string' } },
            inventory: {
              type: 'object',
              properties: {
                available: { type: 'boolean' },
              },
            },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            limit: { type: 'integer' },
            offset: { type: 'integer' },
            has_more: { type: 'boolean' },
          },
        },
        Checkout: {
          type: 'object',
          properties: {
            session_id: { type: 'string' },
            status: { type: 'string' },
            cart: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      product_id: { type: 'string' },
                      name: { type: 'string' },
                      quantity: { type: 'integer' },
                      unit_price: { type: 'number' },
                      total: { type: 'number' },
                    },
                  },
                },
                subtotal: { type: 'number' },
                tax: { type: 'number' },
                total: { type: 'number' },
                currency: { type: 'string' },
              },
            },
            next_step: { type: 'string' },
          },
        },
        Order: {
          type: 'object',
          properties: {
            order_id: { type: 'string' },
            status: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  product_id: { type: 'string' },
                  name: { type: 'string' },
                  quantity: { type: 'integer' },
                  unit_price: { type: 'number' },
                  total: { type: 'number' },
                },
              },
            },
            total: { type: 'number' },
            currency: { type: 'string' },
            transaction_id: { type: 'string' },
          },
        },
        AuthorizationRequired: {
          type: 'object',
          description: 'User must authorize payment. Check notification_sent: true=tell user to check phone, false=show QR code or manual code.',
          properties: {
            status: { type: 'string', enum: ['authorization_required'] },
            authorization_url: { type: 'string', description: 'URL with code pre-filled' },
            qr_code_url: { type: 'string', description: 'URL to QR code image - display with ![Scan to pay](url) markdown. ChatGPT can render this.' },
            user_code: { type: 'string', description: 'Code user enters manually (e.g., WSIM-A3J2K9)' },
            verification_uri: { type: 'string', description: 'URL where user enters the code manually' },
            poll_endpoint: { type: 'string', description: 'Poll this every 5s until approved/denied/expired' },
            expires_in: { type: 'integer', description: 'Seconds until code expires (typically 900)' },
            notification_sent: { type: 'boolean', description: 'true=push sent (check phone), false=show QR or manual code' },
            message: { type: 'string', description: 'Human-readable message for user' },
          },
        },
        PaymentStatus: {
          type: 'object',
          description: 'Status of a payment authorization request',
          properties: {
            status: { type: 'string', enum: ['pending', 'completed', 'rejected', 'expired'] },
            order_id: { type: 'string', description: 'Order ID (only present when completed)' },
            transaction_id: { type: 'string', description: 'Transaction ID (only present when completed)' },
            expires_in: { type: 'integer', description: 'Seconds until request expires (only present when pending)' },
            message: { type: 'string', description: 'Human-readable status message' },
          },
        },
      },
    },
  };

  res.json(openApiSpec);
});

// ChatGPT plugin manifest
app.get('/.well-known/ai-plugin.json', (req, res) => {
  const baseUrl = process.env.GATEWAY_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const wsimBaseUrl = config.wsim.baseUrl;

  res.json({
    schema_version: 'v1',
    name_for_human: 'SACP Shopping Assistant',
    name_for_model: 'sacp_shopping',
    description_for_human: 'Browse and purchase products from SimToolBox stores with AI assistance.',
    description_for_model: 'API for AI agents to browse products and complete purchases. Supports OAuth authentication via WSIM wallet.',
    auth: {
      type: 'oauth',
      client_url: `${wsimBaseUrl}/api/agent/v1/oauth/authorize`,
      scope: 'shopping',
      authorization_url: `${wsimBaseUrl}/api/agent/v1/oauth/token`,
      authorization_content_type: 'application/x-www-form-urlencoded',
      verification_tokens: {
        openai: 'sacp_shopping_verification',
      },
    },
    api: {
      type: 'openapi',
      url: `${baseUrl}/openapi.json`,
    },
    logo_url: `${baseUrl}/logo.png`,
    contact_email: 'support@simtoolbox.com',
    legal_info_url: 'https://simtoolbox.com/legal',
  });
});

// ============================================================================
// Authentication Routes
// ============================================================================

// Start registration with pairing code
app.post('/auth/register', async (req, res) => {
  try {
    const { pairing_code, agent_name, agent_description } = req.body;

    if (!pairing_code || !agent_name) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'pairing_code and agent_name are required',
      });
    }

    // Call WSIM to register
    const response = await fetch(`${config.wsim.baseUrl}/api/agent/v1/access-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairing_code,
        agent_name,
        agent_description: agent_description || 'AI shopping assistant',
        permissions: ['browse', 'cart', 'purchase'],
        spending_limits: {
          per_transaction: 100,
          daily: 500,
          monthly: 1000,
          currency: 'CAD',
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // Store pending registration
    pendingRegistrations.set(data.request_id, {
      requestId: data.request_id,
      pollUrl: data.poll_url,
      expiresAt: data.expires_at,
    });

    res.json({
      status: 'pending',
      request_id: data.request_id,
      message: 'Registration submitted. User must approve in their wallet app.',
      poll_endpoint: `/auth/status/${data.request_id}`,
      expires_at: data.expires_at,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Check registration status
app.get('/auth/status/:request_id', async (req, res) => {
  try {
    const { request_id } = req.params;
    const pending = pendingRegistrations.get(request_id);

    if (!pending) {
      return res.status(404).json({
        error: 'not_found',
        error_description: 'Registration request not found',
      });
    }

    // Poll WSIM for status
    const response = await fetch(pending.pollUrl);
    const data = await response.json();

    if (data.status === 'approved' && data.credentials) {
      // Create session
      const sessionId = generateSessionId();
      const session: Session = {
        id: sessionId,
        clientId: data.credentials.client_id,
        clientSecret: data.credentials.client_secret,
        agentId: data.agent_id,
        createdAt: new Date(),
        authType: 'pairing_code',
      };
      sessions.set(sessionId, session);

      // Clean up pending registration
      pendingRegistrations.delete(request_id);

      res.json({
        status: 'approved',
        session_id: sessionId,
        agent_id: data.agent_id,
        permissions: data.permissions,
        spending_limits: data.spending_limits,
        message: 'Registration approved! Include session_id as X-Session-Id header in all requests.',
      });
    } else if (data.status === 'rejected') {
      pendingRegistrations.delete(request_id);
      res.json({
        status: 'rejected',
        message: 'User rejected the registration request.',
      });
    } else {
      res.json({
        status: 'pending',
        message: 'Waiting for user approval...',
        time_remaining_seconds: data.time_remaining_seconds,
      });
    }
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get current session info
app.get('/auth/session', (req, res) => {
  const session = (req as any).session as Session | undefined;

  if (!session) {
    return res.status(401).json({
      error: 'unauthorized',
      error_description: 'No valid session. Register first or include X-Session-Id header.',
    });
  }

  res.json({
    session_id: session.id,
    agent_id: session.agentId,
    created_at: session.createdAt.toISOString(),
  });
});

// ============================================================================
// Product Routes
// ============================================================================

// Browse products (no auth required for browsing)
app.get('/products', async (req, res) => {
  try {
    const { q, category, limit } = req.query;
    const params = new URLSearchParams();
    if (q) params.set('q', q as string);
    if (category) params.set('category', category as string);
    if (limit) params.set('limit', limit as string);

    const response = await fetch(
      `${config.ssim.baseUrl}/api/agent/v1/products?${params.toString()}`
    );
    const data = await response.json();

    res.json(data);
  } catch (error) {
    console.error('Products error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get single product
app.get('/products/:product_id', async (req, res) => {
  try {
    const { product_id } = req.params;
    const response = await fetch(
      `${config.ssim.baseUrl}/api/agent/v1/products/${product_id}`
    );
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Product error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Checkout Routes (require session)
// ============================================================================

function requireSession(req: Request, res: Response, next: NextFunction) {
  const session = (req as any).session as Session | undefined;
  if (!session) {
    return res.status(401).json({
      error: 'unauthorized',
      error_description: 'Authentication required. Use either: 1) X-Session-Id header (from pairing code flow), or 2) Authorization: Bearer token (from WSIM OAuth).',
    });
  }
  next();
}

// Create checkout (supports guest checkout - no auth required)
app.post('/checkout', async (req, res) => {
  try {
    const session = (req as any).session as Session | undefined;
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'items array is required',
      });
    }

    // If authenticated, use existing flow
    if (session) {
      const { ssim } = await getClients(session);
      const checkout = await ssim.createCheckout(items);
      return res.json({
        ...checkout,
        next_step: 'PATCH /checkout/:session_id with buyer and fulfillment info',
      });
    }

    // Guest checkout - SSIM session endpoints are unauthenticated (Option A)
    const response = await fetch(`${config.ssim.baseUrl}/api/agent/v1/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json(errorData);
    }

    const ssimCheckout = await response.json();

    // Store guest checkout session
    const guestCheckout: GuestCheckout = {
      sessionId: ssimCheckout.session_id,
      ssimSessionId: ssimCheckout.session_id,
      createdAt: new Date(),
      cart: ssimCheckout.cart,
    };
    guestCheckouts.set(ssimCheckout.session_id, guestCheckout);

    res.json({
      ...ssimCheckout,
      next_step: 'PATCH /checkout/:session_id with buyer and fulfillment info',
    });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Update checkout (supports guest checkout - no auth required)
app.patch('/checkout/:session_id', async (req, res) => {
  try {
    const session = (req as any).session as Session | undefined;
    const { session_id } = req.params;
    const { buyer, fulfillment, items } = req.body;

    // Build headers - authenticated users include token, guest checkout is unauthenticated
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (session) {
      const { wsim } = await getClients(session);
      headers['Authorization'] = `Bearer ${await wsim.getAccessToken()}`;
    }
    // Guest checkout - SSIM session endpoints are unauthenticated (Option A)

    const response = await fetch(
      `${config.ssim.baseUrl}/api/agent/v1/sessions/${session_id}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ buyer, fulfillment, items }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // Update guest checkout cart info if this is a guest session
    const guestCheckout = guestCheckouts.get(session_id);
    if (guestCheckout && data.cart) {
      guestCheckout.cart = data.cart;
    }

    res.json({
      ...data,
      next_step: data.status === 'ready_for_payment'
        ? 'POST /checkout/:session_id/complete to finalize purchase'
        : 'Continue updating checkout',
    });
  } catch (error) {
    console.error('Update checkout error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get checkout (supports guest checkout - no auth required)
app.get('/checkout/:session_id', async (req, res) => {
  try {
    const session = (req as any).session as Session | undefined;
    const { session_id } = req.params;

    // If authenticated, use session's credentials
    if (session) {
      const { ssim } = await getClients(session);
      const checkout = await ssim.getCheckout(session_id);
      return res.json(checkout);
    }

    // Guest checkout - SSIM session endpoints are unauthenticated (Option A)
    const response = await fetch(
      `${config.ssim.baseUrl}/api/agent/v1/sessions/${session_id}`
    );

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json(errorData);
    }

    const checkout = await response.json();
    res.json(checkout);
  } catch (error) {
    console.error('Get checkout error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Complete checkout (handles payment token automatically)
// For authenticated users: processes payment immediately
// For guest checkout: initiates device authorization flow (RFC 8628)
app.post('/checkout/:session_id/complete', async (req, res) => {
  try {
    const session = (req as any).session as Session | undefined;
    const { session_id } = req.params;

    // Get checkout to find total (works for both authenticated and guest)
    let checkout: any;
    if (session) {
      const { ssim } = await getClients(session);
      checkout = await ssim.getCheckout(session_id);
    } else {
      // Guest checkout - SSIM session endpoints are unauthenticated (Option A)
      const response = await fetch(
        `${config.ssim.baseUrl}/api/agent/v1/sessions/${session_id}`
      );
      if (!response.ok) {
        const errorData = await response.json();
        return res.status(response.status).json(errorData);
      }
      checkout = await response.json();
    }

    if (checkout.status !== 'ready_for_payment') {
      return res.status(400).json({
        error: 'invalid_state',
        error_description: `Checkout is not ready for payment. Current status: ${checkout.status}`,
        next_step: 'Update checkout with buyer and fulfillment info first',
      });
    }

    // If user is authenticated, use existing flow
    if (session) {
      const { wsim, ssim } = await getClients(session);

      // Request payment token
      const paymentResult = await wsim.requestPaymentToken({
        amount: checkout.cart.total,
        currency: checkout.cart.currency,
        merchant_id: 'ssim_ssim_banksim_ca',
        session_id: session_id,
      });

      // Check if step-up is required
      if (paymentResult.step_up_required && paymentResult.step_up_id) {
        return res.status(202).json({
          status: 'step_up_required',
          step_up_id: paymentResult.step_up_id,
          message: 'Purchase exceeds auto-approve limit. User must approve in wallet app.',
          poll_endpoint: `/checkout/${session_id}/step-up/${paymentResult.step_up_id}`,
          amount: checkout.cart.total,
          currency: checkout.cart.currency,
        });
      }

      if (!paymentResult.payment_token) {
        return res.status(500).json({
          error: 'payment_error',
          error_description: 'Failed to get payment token',
        });
      }

      // Complete the checkout
      const order = await ssim.completeCheckout(session_id, paymentResult.payment_token);

      return res.json({
        status: 'completed',
        order_id: order.id,
        transaction_id: order.transaction_id,
        total: checkout.cart.total,
        currency: checkout.cart.currency,
        message: 'Purchase completed successfully!',
      });
    }

    // Guest checkout - initiate Device Authorization Grant (RFC 8628)
    // Call WSIM device_authorization endpoint
    // Per WSIM team: scope is space-separated string, no client_id needed
    // If buyer_email is provided, WSIM will attempt to send a push notification (v1.2.5+)
    const deviceAuthResponse = await fetch(
      `${config.wsim.baseUrl}/api/agent/v1/oauth/device_authorization`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_name: checkout.merchant?.name || 'SACP Gateway',
          agent_description: `Payment authorization for checkout ${session_id}`,
          scope: 'browse cart purchase',
          response_type: 'token', // Request access token directly (not credentials)
          spending_limits: {
            per_transaction: checkout.cart.total,
            currency: checkout.cart.currency,
          },
          buyer_email: checkout.buyer?.email, // WSIM will send push notification if user found
        }),
      }
    );

    if (!deviceAuthResponse.ok) {
      const errorData = await deviceAuthResponse.json();
      console.error('Device authorization failed:', errorData);
      return res.status(deviceAuthResponse.status).json({
        error: 'authorization_failed',
        error_description: errorData.error_description || 'Failed to initiate payment authorization',
        details: errorData,
      });
    }

    const deviceAuth = await deviceAuthResponse.json();

    // Check if WSIM sent a push notification (v1.2.5+)
    const notificationSent = deviceAuth.notification_sent === true;

    // Generate a request ID for tracking
    const requestId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    // Store pending device authorization
    const pendingAuth: PendingDeviceAuth = {
      requestId,
      checkoutSessionId: session_id,
      ssimSessionId: session_id,
      deviceCode: deviceAuth.device_code,
      userCode: deviceAuth.user_code,
      verificationUri: deviceAuth.verification_uri,
      expiresAt: new Date(Date.now() + (deviceAuth.expires_in || 300) * 1000),
      interval: deviceAuth.interval || 5,
      amount: checkout.cart.total,
      currency: checkout.cart.currency,
    };
    pendingDeviceAuths.set(requestId, pendingAuth);

    // Format amount for display (cents to dollars)
    const displayAmount = `${checkout.cart.currency} ${(checkout.cart.total / 100).toFixed(2)}`;

    // Build authorization URL, optionally with signed token for optimized web flow
    // When token is present, WSIM can skip code/email entry and go straight to waiting page
    let authorizationUrl = deviceAuth.verification_uri_complete || deviceAuth.verification_uri;
    if (process.env.INTERNAL_API_SECRET && checkout.buyer?.email && deviceAuth.user_code) {
      const token = createDeviceAuthToken(checkout.buyer.email, deviceAuth.user_code);
      if (token) {
        authorizationUrl = `${authorizationUrl}&t=${token}`;
      }
    }
    let qrCodeBuffer: Buffer | undefined;
    try {
      qrCodeBuffer = await QRCode.toBuffer(authorizationUrl, {
        width: 200,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      // Store QR code buffer for serving via URL endpoint
      pendingAuth.qrCodeBuffer = qrCodeBuffer;
      pendingDeviceAuths.set(requestId, pendingAuth);
    } catch (qrError) {
      console.error('Failed to generate QR code:', qrError);
      // Continue without QR code - user can still enter code manually
    }

    // Build the base URL for serving QR code
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const qrCodeUrl = qrCodeBuffer ? `${baseUrl}/qr/${requestId}` : undefined;

    // Return 202 with authorization required response
    // Message varies based on whether push notification was sent
    return res.status(202).json({
      status: 'authorization_required',
      authorization_url: authorizationUrl,
      qr_code_url: qrCodeUrl, // URL to fetch QR code image (ChatGPT can render this)
      user_code: deviceAuth.user_code,
      verification_uri: deviceAuth.verification_uri,
      poll_endpoint: `/checkout/${session_id}/payment-status/${requestId}`,
      expires_in: deviceAuth.expires_in || 300,
      notification_sent: notificationSent,
      message: notificationSent
        ? `We've sent a payment request to your phone. Check your WSIM app to approve the ${displayAmount} payment. If you don't see it, enter code ${deviceAuth.user_code} at ${deviceAuth.verification_uri}.`
        : `To complete your purchase of ${displayAmount}, please enter code ${deviceAuth.user_code} at ${deviceAuth.verification_uri} or scan the QR code with your wallet app.`,
    });
  } catch (error) {
    console.error('Complete checkout error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Serve QR code image for payment authorization
// This endpoint allows ChatGPT and other AIs to display the QR code using standard markdown
app.get('/qr/:request_id', (req, res) => {
  const { request_id } = req.params;

  const pendingAuth = pendingDeviceAuths.get(request_id);
  if (!pendingAuth) {
    return res.status(404).json({
      error: 'not_found',
      error_description: 'QR code not found or expired',
    });
  }

  if (!pendingAuth.qrCodeBuffer) {
    return res.status(404).json({
      error: 'not_found',
      error_description: 'QR code not available',
    });
  }

  // Check if expired
  if (new Date() > pendingAuth.expiresAt) {
    pendingDeviceAuths.delete(request_id);
    return res.status(410).json({
      error: 'expired',
      error_description: 'QR code has expired',
    });
  }

  // Serve the QR code as a PNG image
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(pendingAuth.qrCodeBuffer);
});

// Poll step-up status
app.get('/checkout/:session_id/step-up/:step_up_id', requireSession, async (req, res) => {
  try {
    const session = (req as any).session as Session;
    const { session_id, step_up_id } = req.params;
    const { wsim, ssim } = await getClients(session);

    const status = await wsim.getStepUpStatus(step_up_id);

    if (status.status === 'approved' && status.payment_token) {
      // Auto-complete the checkout
      const order = await ssim.completeCheckout(session_id, status.payment_token);

      res.json({
        status: 'completed',
        order_id: order.id,
        transaction_id: order.transaction_id,
        message: 'Step-up approved and purchase completed!',
      });
    } else if (status.status === 'rejected') {
      res.json({
        status: 'rejected',
        message: 'User rejected the purchase.',
      });
    } else if (status.status === 'expired') {
      res.json({
        status: 'expired',
        message: 'Step-up request expired.',
      });
    } else {
      res.json({
        status: 'pending',
        message: 'Waiting for user approval...',
      });
    }
  } catch (error) {
    console.error('Step-up status error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Poll payment authorization status (for guest checkout device auth flow)
app.get('/checkout/:session_id/payment-status/:request_id', async (req, res) => {
  try {
    const { session_id, request_id } = req.params;

    // Find the pending device authorization
    const pendingAuth = pendingDeviceAuths.get(request_id);

    if (!pendingAuth) {
      return res.status(404).json({
        error: 'not_found',
        error_description: 'Payment authorization request not found',
      });
    }

    // Verify session_id matches
    if (pendingAuth.checkoutSessionId !== session_id) {
      return res.status(404).json({
        error: 'not_found',
        error_description: 'Session ID does not match payment request',
      });
    }

    // Check if expired
    if (new Date() > pendingAuth.expiresAt) {
      pendingDeviceAuths.delete(request_id);
      return res.json({
        status: 'expired',
        message: 'Payment authorization request has expired. Please try again.',
      });
    }

    // Poll WSIM token endpoint with device_code
    const tokenResponse = await fetch(
      `${config.wsim.baseUrl}/api/agent/v1/oauth/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: pendingAuth.deviceCode,
          client_id: config.gateway.clientId,
        }).toString(),
      }
    );

    const tokenData = await tokenResponse.json();

    // Handle different responses per RFC 8628
    if (tokenResponse.ok && tokenData.access_token) {
      // User approved - we have an access token!
      // Now complete the checkout with SSIM using this token

      // First, get a payment token from WSIM using the access token
      const paymentTokenResponse = await fetch(
        `${config.wsim.baseUrl}/api/agent/v1/payments/token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tokenData.access_token}`,
          },
          body: JSON.stringify({
            amount: pendingAuth.amount,
            currency: pendingAuth.currency,
            merchant_id: 'ssim_ssim_banksim_ca',
            session_id: pendingAuth.ssimSessionId,
          }),
        }
      );

      if (!paymentTokenResponse.ok) {
        const errorData = await paymentTokenResponse.json();
        console.error('Payment token request failed:', errorData);
        return res.status(500).json({
          error: 'payment_error',
          error_description: 'Failed to get payment token after authorization',
          details: errorData,
        });
      }

      const paymentTokenData = await paymentTokenResponse.json();

      // Complete checkout with SSIM
      const completeResponse = await fetch(
        `${config.ssim.baseUrl}/api/agent/v1/sessions/${pendingAuth.ssimSessionId}/complete`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tokenData.access_token}`,
          },
          body: JSON.stringify({
            payment_token: paymentTokenData.payment_token,
          }),
        }
      );

      if (!completeResponse.ok) {
        const errorData = await completeResponse.json();
        console.error('Checkout completion failed:', errorData);
        return res.status(500).json({
          error: 'checkout_error',
          error_description: 'Failed to complete checkout',
          details: errorData,
        });
      }

      const order = await completeResponse.json();

      // Clean up pending auth
      pendingDeviceAuths.delete(request_id);
      guestCheckouts.delete(session_id);

      return res.json({
        status: 'completed',
        order_id: order.id || order.order_id,
        transaction_id: order.transaction_id,
        message: 'Payment authorized and purchase completed successfully!',
      });
    }

    // Handle error responses
    if (tokenData.error === 'authorization_pending') {
      // Still waiting for user
      const expiresIn = Math.max(0, Math.floor((pendingAuth.expiresAt.getTime() - Date.now()) / 1000));
      return res.json({
        status: 'pending',
        expires_in: expiresIn,
        message: `Waiting for user to authorize payment. Enter code ${pendingAuth.userCode} at ${pendingAuth.verificationUri}`,
      });
    }

    if (tokenData.error === 'slow_down') {
      // We're polling too fast - increase interval
      pendingAuth.interval = Math.min(pendingAuth.interval + 5, 30);
      const expiresIn = Math.max(0, Math.floor((pendingAuth.expiresAt.getTime() - Date.now()) / 1000));
      return res.json({
        status: 'pending',
        expires_in: expiresIn,
        message: 'Waiting for user authorization...',
      });
    }

    if (tokenData.error === 'access_denied') {
      // User rejected
      pendingDeviceAuths.delete(request_id);
      return res.json({
        status: 'rejected',
        message: 'User rejected the payment authorization.',
      });
    }

    if (tokenData.error === 'expired_token') {
      // Device code expired
      pendingDeviceAuths.delete(request_id);
      return res.json({
        status: 'expired',
        message: 'Payment authorization request has expired. Please try again.',
      });
    }

    // Unknown error
    console.error('Unexpected token response:', tokenData);
    return res.status(500).json({
      error: 'authorization_error',
      error_description: tokenData.error_description || 'Unknown authorization error',
    });
  } catch (error) {
    console.error('Payment status error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Order Routes
// ============================================================================

app.get('/orders/:order_id', requireSession, async (req, res) => {
  try {
    const session = (req as any).session as Session;
    const { order_id } = req.params;
    const { ssim } = await getClients(session);
    const order = await ssim.getOrder(order_id);
    res.json(order);
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Generic Tool Execution (for MCP-style calls)
// ============================================================================

app.post('/execute', async (req, res) => {
  const { tool, parameters } = req.body;
  const session = (req as any).session as Session | undefined;

  if (!tool) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'tool name is required',
    });
  }

  try {
    switch (tool) {
      case 'register':
        // Forward to register endpoint
        const regResponse = await fetch(`http://localhost:${config.port}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parameters),
        });
        return res.json(await regResponse.json());

      case 'check_registration':
        const statusResponse = await fetch(
          `http://localhost:${config.port}/auth/status/${parameters.request_id}`
        );
        return res.json(await statusResponse.json());

      case 'browse_products':
        const productsResponse = await fetch(
          `http://localhost:${config.port}/products?${new URLSearchParams(parameters || {})}`
        );
        return res.json(await productsResponse.json());

      case 'get_product':
        const productResponse = await fetch(
          `http://localhost:${config.port}/products/${parameters.product_id}`
        );
        return res.json(await productResponse.json());

      case 'create_checkout':
        if (!session) {
          return res.status(401).json({ error: 'unauthorized', error_description: 'Session required' });
        }
        const createResponse = await fetch(`http://localhost:${config.port}/checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-Id': session.id,
          },
          body: JSON.stringify(parameters),
        });
        return res.json(await createResponse.json());

      case 'update_checkout':
        if (!session) {
          return res.status(401).json({ error: 'unauthorized', error_description: 'Session required' });
        }
        const updateResponse = await fetch(
          `http://localhost:${config.port}/checkout/${parameters.session_id}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'X-Session-Id': session.id,
            },
            body: JSON.stringify(parameters),
          }
        );
        return res.json(await updateResponse.json());

      case 'complete_checkout':
        if (!session) {
          return res.status(401).json({ error: 'unauthorized', error_description: 'Session required' });
        }
        const completeResponse = await fetch(
          `http://localhost:${config.port}/checkout/${parameters.session_id}/complete`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Session-Id': session.id,
            },
          }
        );
        return res.json(await completeResponse.json());

      case 'get_order':
        if (!session) {
          return res.status(401).json({ error: 'unauthorized', error_description: 'Session required' });
        }
        const orderResponse = await fetch(
          `http://localhost:${config.port}/orders/${parameters.order_id}`,
          {
            headers: { 'X-Session-Id': session.id },
          }
        );
        return res.json(await orderResponse.json());

      default:
        return res.status(400).json({
          error: 'unknown_tool',
          error_description: `Unknown tool: ${tool}`,
          available_tools: tools.map(t => t.name),
        });
    }
  } catch (error) {
    console.error('Execute error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Start Server
// ============================================================================

app.listen(config.port, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    SACP Agent Gateway                         ║
╠═══════════════════════════════════════════════════════════════╣
║  HTTP gateway for AI agents to interact with SACP stores      ║
╠═══════════════════════════════════════════════════════════════╣
║  Server running on: http://localhost:${config.port.toString().padEnd(25)}║
║  SSIM endpoint:     ${config.ssim.baseUrl.padEnd(35)}║
║  WSIM endpoint:     ${config.wsim.baseUrl.padEnd(35)}║
╠═══════════════════════════════════════════════════════════════╣
║  Endpoints:                                                   ║
║    GET  /openapi.json    - OpenAPI 3.1 spec (ChatGPT Actions) ║
║    GET  /tools           - List available tools               ║
║    POST /auth/register   - Register with pairing code         ║
║    GET  /auth/status/:id - Check registration status          ║
║    GET  /products        - Browse products                    ║
║    POST /checkout        - Create checkout                    ║
║    POST /execute         - Execute any tool (MCP-style)       ║
╚═══════════════════════════════════════════════════════════════╝
`);
});
