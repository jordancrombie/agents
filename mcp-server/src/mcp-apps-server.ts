#!/usr/bin/env node
/**
 * SACP MCP Apps Server
 *
 * HTTP-based MCP server for ChatGPT Apps SDK integration.
 * Uses SSE transport and widget templates for rich UI rendering.
 *
 * Endpoints:
 * - GET /mcp - SSE connection for MCP transport
 * - POST /mcp/message - Message endpoint for MCP requests
 * - GET /health - Health check
 *
 * This server enables ChatGPT Apps to render QR codes and authorization UI
 * using the OpenAI Apps SDK widget system.
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as QRCode from 'qrcode';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// LOGGING UTILITIES
// ============================================================================

/**
 * Generate a short request ID for log correlation
 */
function generateRequestId(): string {
  return randomUUID().slice(0, 8);
}

/**
 * Structured logger with request ID correlation
 */
const log = {
  info: (requestId: string, message: string, data?: Record<string, unknown>) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      requestId,
      message,
      ...(data && { data }),
    };
    console.log(JSON.stringify(logEntry));
  },

  error: (requestId: string, message: string, error?: unknown, data?: Record<string, unknown>) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      requestId,
      message,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
      ...(data && { data }),
    };
    console.error(JSON.stringify(logEntry));
  },

  debug: (requestId: string, message: string, data?: Record<string, unknown>) => {
    if (process.env.DEBUG === 'true') {
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: 'DEBUG',
        requestId,
        message,
        ...(data && { data }),
      };
      console.log(JSON.stringify(logEntry));
    }
  },
};

/**
 * Logged fetch wrapper - logs all external API calls
 */
async function loggedFetch(
  requestId: string,
  url: string,
  options?: RequestInit
): Promise<Response> {
  const method = options?.method || 'GET';
  const startTime = Date.now();

  log.info(requestId, `External API call: ${method} ${url}`);

  try {
    const response = await fetch(url, options);
    const duration = Date.now() - startTime;

    log.info(requestId, `External API response`, {
      url,
      method,
      status: response.status,
      statusText: response.statusText,
      durationMs: duration,
    });

    return response;
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error(requestId, `External API call failed`, error, {
      url,
      method,
      durationMs: duration,
    });
    throw error;
  }
}

// Configuration
const PORT = parseInt(process.env.PORT || '8000', 10);
const WSIM_BASE_URL = process.env.WSIM_BASE_URL || 'https://wsim.banksim.ca';
const SSIM_BASE_URL = process.env.SSIM_BASE_URL || 'https://ssim.banksim.ca';

// ============================================================================
// JWT/OAUTH CONFIGURATION
// ============================================================================

// JWKS endpoint for token verification (WSIM Phase 1)
const WSIM_JWKS_URL = `${WSIM_BASE_URL}/.well-known/jwks.json`;

// Expected token claims
const EXPECTED_ISSUER = WSIM_BASE_URL;
const EXPECTED_AUDIENCE = 'chatgpt-mcp'; // OAuth client_id registered with WSIM

// Create JWKS client with caching (jose handles refresh automatically)
const jwks = createRemoteJWKSet(new URL(WSIM_JWKS_URL));

/**
 * Validated token payload with required claims
 */
interface AuthContext {
  userId: string;      // sub claim - WalletUser ID
  clientId: string;    // aud claim - OAuth client_id
  scope: string;       // scope claim - space-separated permissions
  expiresAt: Date;     // exp claim
  agentId?: string;    // agent_id claim - Agent record ID (for step-up flows)
}

/**
 * User's spending limits for an agent delegation
 */
interface AgentLimits {
  perTransaction: number;
  daily: number;
  monthly: number;
  currency: string;
  dailySpent: number;   // Amount already spent today
  monthlySpent: number; // Amount already spent this month
}

/**
 * Limit cache entry with TTL
 */
interface LimitsCacheEntry {
  limits: AgentLimits;
  expiresAt: number; // Unix timestamp
}

// Limit cache: 5-minute TTL per design doc
const LIMITS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const limitsCache = new Map<string, LimitsCacheEntry>();

/**
 * Get agent limits from WSIM (with caching)
 * Cache key: {userId}:{agentId}
 */
async function getAgentLimits(
  requestId: string,
  userId: string,
  agentId: string | undefined
): Promise<AgentLimits | null> {
  // If no agentId, we can't look up limits
  if (!agentId) {
    log.debug(requestId, 'No agentId in token, cannot check limits');
    return null;
  }

  const cacheKey = `${userId}:${agentId}`;
  const cached = limitsCache.get(cacheKey);

  // Return cached limits if still valid
  if (cached && cached.expiresAt > Date.now()) {
    log.debug(requestId, 'Using cached limits', { cacheKey });
    return cached.limits;
  }

  // Fetch from WSIM
  try {
    log.debug(requestId, 'Fetching limits from WSIM', { userId, agentId });

    const response = await fetch(
      `${WSIM_BASE_URL}/api/agent/v1/agents/${agentId}/limits`,
      {
        headers: {
          'Content-Type': 'application/json',
          // We pass userId in header for WSIM to verify the agent belongs to this user
          'X-User-Id': userId,
        },
      }
    );

    if (!response.ok) {
      log.info(requestId, 'Failed to fetch limits from WSIM', {
        status: response.status,
        agentId,
      });
      return null;
    }

    const data = await response.json() as {
      per_transaction: string;
      daily: string;
      monthly: string;
      currency: string;
      daily_spent: string;
      monthly_spent: string;
    };

    const limits: AgentLimits = {
      perTransaction: parseFloat(data.per_transaction) || Infinity,
      daily: parseFloat(data.daily) || Infinity,
      monthly: parseFloat(data.monthly) || Infinity,
      currency: data.currency || 'CAD',
      dailySpent: parseFloat(data.daily_spent) || 0,
      monthlySpent: parseFloat(data.monthly_spent) || 0,
    };

    // Cache the result
    limitsCache.set(cacheKey, {
      limits,
      expiresAt: Date.now() + LIMITS_CACHE_TTL_MS,
    });

    log.info(requestId, 'Cached agent limits', { cacheKey, limits });
    return limits;
  } catch (error) {
    log.error(requestId, 'Error fetching limits from WSIM', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Check if a purchase amount exceeds the user's limits
 * Returns the exceeded limit info, or null if within all limits
 */
function checkLimitsExceeded(
  amount: number,
  limits: AgentLimits
): { type: 'per_transaction' | 'daily' | 'monthly'; limit: number; requested: number } | null {
  // Check in priority order: per_transaction > daily > monthly
  if (amount > limits.perTransaction) {
    return {
      type: 'per_transaction',
      limit: limits.perTransaction,
      requested: amount,
    };
  }

  if (limits.dailySpent + amount > limits.daily) {
    return {
      type: 'daily',
      limit: limits.daily,
      requested: amount,
    };
  }

  if (limits.monthlySpent + amount > limits.monthly) {
    return {
      type: 'monthly',
      limit: limits.monthly,
      requested: amount,
    };
  }

  return null; // Within all limits
}

/**
 * Validate a JWT Bearer token from WSIM
 * Returns AuthContext if valid, null if invalid/expired
 */
async function validateBearerToken(
  requestId: string,
  token: string
): Promise<AuthContext | null> {
  try {
    log.debug(requestId, 'Validating Bearer token');

    const { payload } = await jwtVerify(token, jwks, {
      issuer: EXPECTED_ISSUER,
      audience: EXPECTED_AUDIENCE,
    });

    // Extract required claims
    const sub = payload.sub;
    const aud = payload.aud;
    const scope = (payload as JWTPayload & { scope?: string }).scope;
    const exp = payload.exp;
    // Optional: agent_id for limit lookups and step-up flows
    const agentId = (payload as JWTPayload & { agent_id?: string }).agent_id;

    if (!sub || !aud || !exp) {
      log.debug(requestId, 'Token missing required claims', { sub: !!sub, aud: !!aud, exp: !!exp });
      return null;
    }

    const authContext: AuthContext = {
      userId: sub,
      clientId: Array.isArray(aud) ? aud[0] : aud,
      scope: scope || '',
      expiresAt: new Date(exp * 1000),
      agentId, // May be undefined if WSIM doesn't include it yet
    };

    log.info(requestId, 'Token validated successfully', {
      userId: authContext.userId,
      clientId: authContext.clientId,
      scope: authContext.scope,
      agentId: authContext.agentId,
    });

    return authContext;
  } catch (error) {
    log.debug(requestId, 'Token validation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

// Widget template configuration
// Version the URI to bust ChatGPT's cache when widget changes (per OpenAI Apps SDK best practice)
const WIDGET_VERSION = '1.5.34';
const WIDGET_URI = `ui://widget/authorization-v${WIDGET_VERSION}.html`;
const WIDGET_MIME_TYPE = 'text/html+skybridge';

// Widget Content Security Policy - required for OpenAI Apps SDK submission
// Our widget is self-contained: no external fetches, just inline scripts/styles and data: URIs for QR codes
const WIDGET_CSP = {
  connect_domains: [] as string[], // Widget doesn't fetch from external APIs
  resource_domains: [] as string[], // No external static assets
  // frame_domains omitted - we don't embed iframes
};

// Unique domain identifier for the widget - required for OpenAI Apps SDK submission
// ChatGPT renders widgets under <domain>.web-sandbox.oaiusercontent.com
const WIDGET_DOMAIN = 'sacp.banksim.ca';

// Load widget template at startup
let widgetTemplate: string;
try {
  widgetTemplate = readFileSync(
    join(__dirname, 'assets', 'authorization-widget.html'),
    'utf-8'
  );
} catch {
  // Fallback for when running from dist/
  try {
    widgetTemplate = readFileSync(
      join(__dirname, '..', 'src', 'assets', 'authorization-widget.html'),
      'utf-8'
    );
  } catch {
    console.error('Warning: Could not load authorization widget template');
    widgetTemplate = '<html><body>Widget not found</body></html>';
  }
}

/**
 * Generate a QR code as base64-encoded PNG
 */
async function generateQRCodeBase64(url: string): Promise<string> {
  const buffer = await QRCode.toBuffer(url, {
    type: 'png',
    width: 200,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
  return buffer.toString('base64');
}

// Session management
interface SessionRecord {
  id: string;
  response: ServerResponse;
  createdAt: Date;
}

const sessions = new Map<string, SessionRecord>();

// Tool definitions with OpenAI Apps SDK metadata
const tools = [
  // === Store Discovery & Browsing ===
  {
    name: 'browse_products',
    description: 'Browse products available in the SACP Demo Store. Returns a list of products with prices.',
    _meta: {
      'openai/toolInvocation/invoking': 'Loading products...',
      'openai/toolInvocation/invoked': 'Products loaded',
    },
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (optional)',
        },
        category: {
          type: 'string',
          description: 'Filter by category (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 20)',
        },
      },
    },
    annotations: {
      destructiveHint: false,
      readOnlyHint: true,
    },
  },
  {
    name: 'get_product',
    description: 'Get detailed information about a specific product.',
    _meta: {
      'openai/toolInvocation/invoking': 'Loading product details...',
      'openai/toolInvocation/invoked': 'Product loaded',
    },
    inputSchema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'string',
          description: 'The product ID',
        },
      },
      required: ['product_id'],
    },
    annotations: {
      destructiveHint: false,
      readOnlyHint: true,
    },
  },

  // === Unified Checkout (Primary - Single Tool) ===
  {
    name: 'checkout',
    description:
      'Complete a purchase in one step. Provide items, buyer info, and shipping address. Returns a payment authorization widget with QR code.',
    _meta: {
      'openai/outputTemplate': WIDGET_URI,
      'openai/widgetCSP': WIDGET_CSP,
      'openai/widgetDomain': WIDGET_DOMAIN,
      'openai/toolInvocation/invoking': 'Processing checkout...',
      'openai/toolInvocation/invoked': 'Payment widget displayed',
    },
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              product_id: { type: 'string' },
              quantity: { type: 'number' },
            },
            required: ['product_id', 'quantity'],
          },
          description: 'Array of items to purchase',
        },
        buyer_name: {
          type: 'string',
          description: 'Buyer full name',
        },
        buyer_email: {
          type: 'string',
          description: 'Buyer email address',
        },
        shipping_address: {
          type: 'string',
          description: 'Shipping address (optional for pickup)',
        },
      },
      required: ['items', 'buyer_name', 'buyer_email'],
    },
    annotations: {
      destructiveHint: false,
      readOnlyHint: false,
    },
    // NO securitySchemes declared - OAuth is NOT required at setup time!
    // Per Payment-Bootstrapped OAuth model:
    // - First purchase: Device auth flow (QR/push)
    // - If user grants delegation: mcp/www_authenticate triggers OAuth AFTER payment
    // - Subsequent purchases: MCP validates Bearer token if present, but doesn't require it
  },

  // === Individual Checkout Tools (Advanced Use) ===
  {
    name: 'create_checkout',
    description: 'Create a new checkout session with items to purchase.',
    _meta: {
      'openai/toolInvocation/invoking': 'Creating checkout...',
      'openai/toolInvocation/invoked': 'Checkout created',
    },
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              product_id: { type: 'string' },
              quantity: { type: 'number' },
            },
            required: ['product_id', 'quantity'],
          },
          description: 'Array of items to add to cart',
        },
      },
      required: ['items'],
    },
    annotations: {
      destructiveHint: false,
      readOnlyHint: false,
    },
  },
  {
    name: 'get_checkout',
    description: 'Get the current status and details of a checkout session.',
    _meta: {
      'openai/toolInvocation/invoking': 'Loading checkout...',
      'openai/toolInvocation/invoked': 'Checkout loaded',
    },
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'The checkout session ID',
        },
      },
      required: ['session_id'],
    },
    annotations: {
      destructiveHint: false,
      readOnlyHint: true,
    },
  },
  {
    name: 'update_checkout',
    description: 'Update buyer information in a checkout session (name, email, shipping address).',
    _meta: {
      'openai/toolInvocation/invoking': 'Updating checkout...',
      'openai/toolInvocation/invoked': 'Checkout updated',
    },
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'The checkout session ID',
        },
        buyer_name: {
          type: 'string',
          description: 'Buyer full name',
        },
        buyer_email: {
          type: 'string',
          description: 'Buyer email address',
        },
        shipping_address: {
          type: 'string',
          description: 'Shipping address',
        },
      },
      required: ['session_id'],
    },
    annotations: {
      destructiveHint: false,
      readOnlyHint: false,
    },
  },
  {
    name: 'complete_checkout',
    description: 'Complete a checkout session. This initiates device authorization for payment and returns the authorization data. For a better experience, use the unified "checkout" tool instead.',
    _meta: {
      'openai/toolInvocation/invoking': 'Processing payment authorization...',
      'openai/toolInvocation/invoked': 'Payment ready - display widget next',
    },
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'The checkout session ID',
        },
      },
      required: ['session_id'],
    },
    annotations: {
      destructiveHint: false,
      readOnlyHint: false,
    },
  },
  {
    name: 'cancel_checkout',
    description: 'Cancel a checkout session.',
    _meta: {
      'openai/toolInvocation/invoking': 'Cancelling checkout...',
      'openai/toolInvocation/invoked': 'Checkout cancelled',
    },
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'The checkout session ID',
        },
      },
      required: ['session_id'],
    },
    annotations: {
      destructiveHint: true,
      readOnlyHint: false,
    },
  },
  {
    name: 'get_order_status',
    description: 'Get the status of a completed order.',
    _meta: {
      'openai/toolInvocation/invoking': 'Loading order...',
      'openai/toolInvocation/invoked': 'Order loaded',
    },
    inputSchema: {
      type: 'object',
      properties: {
        order_id: {
          type: 'string',
          description: 'The order ID',
        },
      },
      required: ['order_id'],
    },
    annotations: {
      destructiveHint: false,
      readOnlyHint: true,
    },
  },

  // === Device Authorization (Payment) ===
  {
    name: 'device_authorize',
    description:
      'Initiate device authorization for payment. Returns authorization data with QR code. For a better experience, use the unified "checkout" tool instead.',
    _meta: {
      'openai/toolInvocation/invoking': 'Processing payment authorization...',
      'openai/toolInvocation/invoked': 'Payment ready - display widget next',
    },
    inputSchema: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Payment amount in dollars (e.g., 25.99)',
        },
        currency: {
          type: 'string',
          description: 'Currency code (default: CAD)',
        },
        merchant_name: {
          type: 'string',
          description: 'Name of the merchant for display in the approval prompt',
        },
        description: {
          type: 'string',
          description: 'Description of the purchase',
        },
        buyer_email: {
          type: 'string',
          description:
            'Optional buyer email - if known, WSIM may send a push notification',
        },
      },
      required: ['amount', 'merchant_name'],
    },
    annotations: {
      destructiveHint: false,
      readOnlyHint: false,
    },
  },
  {
    name: 'device_authorize_status',
    description:
      'Check the status of a device authorization request. Returns pending, approved (with access_token), denied, or expired.',
    _meta: {
      'openai/toolInvocation/invoking': 'Checking authorization status...',
      'openai/toolInvocation/invoked': 'Status checked',
      // Allow widget to call this tool for status polling
      'openai/widgetAccessible': true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        device_code: {
          type: 'string',
          description: 'The device_code from device_authorize response',
        },
      },
      required: ['device_code'],
    },
    annotations: {
      destructiveHint: false,
      readOnlyHint: true,
    },
  },

];

// Resource definitions (widget templates)
const resources = [
  {
    uri: WIDGET_URI,
    mimeType: WIDGET_MIME_TYPE,
    name: 'Authorization Widget',
    description: 'Payment authorization widget with QR code display',
    // OpenAI Apps SDK widget requirements - must use _meta with correct field names
    _meta: {
      'openai/widgetCSP': WIDGET_CSP,
      'openai/widgetDomain': WIDGET_DOMAIN,
    },
  },
];

/**
 * Handle MCP JSON-RPC request
 */
async function handleMcpRequest(
  request: {
    jsonrpc: string;
    id?: string | number;
    method: string;
    params?: Record<string, unknown>;
  },
  _sessionId: string,
  authHeader?: string
): Promise<{
  jsonrpc: string;
  id?: string | number;
  result?: unknown;
  error?: { code: number; message: string };
}> {
  const { method, params, id } = request;
  const requestId = generateRequestId();

  log.info(requestId, `MCP method: ${method}`, {
    method,
    id,
    hasParams: !!params,
    hasAuth: !!authHeader,
  });

  // Validate Bearer token if present (ChatGPT OAuth flow)
  let authContext: AuthContext | null = null;
  const bearerToken = extractBearerToken(authHeader);
  if (bearerToken) {
    authContext = await validateBearerToken(requestId, bearerToken);
  }

  try {
    switch (method) {
      // Server info
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
              resources: {},
            },
            serverInfo: {
              name: 'sacp-mcp-apps',
              version: '1.5.34',
            },
          },
        };
      }

      // List available tools
      case 'tools/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: { tools },
        };
      }

      // Execute a tool
      case 'tools/call': {
        const toolName = (params as { name: string })?.name;
        const args = (params as { arguments?: Record<string, unknown> })
          ?.arguments || {};

        log.info(requestId, `MCP tools/call: ${toolName}`, {
          tool: toolName,
          arguments: args,
          authenticated: !!authContext,
        });

        const result = await executeTool(toolName, args, authContext);

        log.info(requestId, `MCP tools/call completed: ${toolName}`);

        return {
          jsonrpc: '2.0',
          id,
          result,
        };
      }

      // List resources (widget templates)
      case 'resources/list': {
        return {
          jsonrpc: '2.0',
          id,
          result: { resources },
        };
      }

      // Read a resource
      case 'resources/read': {
        const uri = (params as { uri: string })?.uri;

        if (uri === WIDGET_URI) {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [
                {
                  uri: WIDGET_URI,
                  mimeType: WIDGET_MIME_TYPE,
                  text: widgetTemplate,
                  // OpenAI Apps SDK widget requirements - must use _meta with correct field names
                  _meta: {
                    'openai/widgetCSP': WIDGET_CSP,
                    'openai/widgetDomain': WIDGET_DOMAIN,
                  },
                },
              ],
            },
          };
        }

        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: `Resource not found: ${uri}` },
        };
      }

      // Notifications (no response needed)
      case 'notifications/initialized':
      case 'notifications/cancelled': {
        return { jsonrpc: '2.0', id };
      }

      default: {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(requestId, `MCP method failed: ${method}`, error, { method, id });
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32000, message },
    };
  }
}

/**
 * Execute a tool and return the result
 */
async function executeTool(
  name: string,
  args: Record<string, unknown>,
  authContext: AuthContext | null
): Promise<{
  content: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
  isError?: boolean;
}> {
  const requestId = generateRequestId();
  const startTime = Date.now();

  // Log tool invocation
  log.info(requestId, `Tool invoked: ${name}`, {
    tool: name,
    arguments: args,
    authenticated: !!authContext,
    userId: authContext?.userId,
  });

  try {
    const result = await executeToolInternal(requestId, name, args, authContext);
    const duration = Date.now() - startTime;

    log.info(requestId, `Tool completed: ${name}`, {
      tool: name,
      durationMs: duration,
      success: true,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error(requestId, `Tool failed: ${name}`, error, {
      tool: name,
      arguments: args,
      durationMs: duration,
    });

    throw error;
  }
}

/**
 * Internal tool execution (called by executeTool wrapper)
 */
async function executeToolInternal(
  requestId: string,
  name: string,
  args: Record<string, unknown>,
  authContext: AuthContext | null
): Promise<{
  content: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
  isError?: boolean;
}> {
  switch (name) {
    // === Store Discovery & Browsing ===
    case 'browse_products': {
      const query = args.query as string | undefined;
      const category = args.category as string | undefined;
      const limit = (args.limit as number) || 20;

      // Build query params
      const params = new URLSearchParams();
      if (query) params.set('query', query);
      if (category) params.set('category', category);
      params.set('limit', limit.toString());

      const response = await loggedFetch(requestId,
        `${SSIM_BASE_URL}/api/agent/v1/products?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch products: ${response.status}`);
      }

      const products = await response.json();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(products, null, 2),
          },
        ],
      };
    }

    case 'get_product': {
      const productId = args.product_id as string;

      const response = await loggedFetch(requestId,
        `${SSIM_BASE_URL}/api/agent/v1/products/${productId}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch product: ${response.status}`);
      }

      const product = await response.json();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(product, null, 2),
          },
        ],
      };
    }

    // === Unified Checkout (Primary) ===
    case 'checkout': {
      const items = args.items as Array<{ product_id: string; quantity: number }>;
      const buyerName = args.buyer_name as string;
      const buyerEmail = args.buyer_email as string;
      const shippingAddress = args.shipping_address as string | undefined;

      // Step 1: Create checkout session with items
      const createResponse = await loggedFetch(requestId, `${SSIM_BASE_URL}/api/agent/v1/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        throw new Error(`Failed to create checkout: ${createResponse.status} ${errorText}`);
      }

      const session = await createResponse.json() as { session_id: string };
      const sessionId = session.session_id;

      // Step 2: Update with buyer info
      const updateData: Record<string, unknown> = {
        buyer: {
          name: buyerName,
          email: buyerEmail,
          ...(authContext && { wallet_user_id: authContext.userId }), // Link to authenticated user if available
        },
      };
      if (shippingAddress) {
        updateData.fulfillment = {
          type: 'shipping',
          address: { street: shippingAddress },
        };
      }

      const updateResponse = await loggedFetch(requestId,
        `${SSIM_BASE_URL}/api/agent/v1/sessions/${sessionId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData),
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        throw new Error(`Failed to update checkout: ${updateResponse.status} ${errorText}`);
      }

      // Step 3: Get the updated checkout to know the total
      const checkoutResponse = await loggedFetch(requestId,
        `${SSIM_BASE_URL}/api/agent/v1/sessions/${sessionId}`
      );

      if (!checkoutResponse.ok) {
        throw new Error(`Failed to fetch checkout: ${checkoutResponse.status}`);
      }

      const checkout = await checkoutResponse.json() as {
        session_id: string;
        cart?: {
          items?: Array<{ product_id: string; name: string; quantity: number; unit_price: number; subtotal: number }>;
          total?: number;
          currency?: string;
        };
      };

      if (!checkout.cart || checkout.cart.total === undefined) {
        throw new Error('Checkout cart is empty or has no total.');
      }

      // Build description from cart items
      const itemNames = checkout.cart.items?.map(i => `${i.quantity}x ${i.name}`).join(', ') || 'Purchase';
      const merchantName = 'SACP Demo Store';
      const amount = checkout.cart.total;
      const currency = checkout.cart.currency || 'CAD';

      // ========================================================================
      // OAUTH AUTHENTICATED FLOW: User has valid OAuth token
      // Check limits before auto-approving. If exceeded, trigger step-up.
      // ========================================================================
      if (authContext) {
        log.info(requestId, 'Processing authenticated checkout (OAuth flow)', {
          userId: authContext.userId,
          scope: authContext.scope,
          agentId: authContext.agentId,
        });

        // Check limits if we have an agentId
        const limits = await getAgentLimits(requestId, authContext.userId, authContext.agentId);
        const exceededLimit = limits ? checkLimitsExceeded(amount, limits) : null;

        if (exceededLimit) {
          // ====================================================================
          // STEP-UP FLOW: Purchase exceeds user's limits
          // Trigger device authorization for this specific transaction
          // ====================================================================
          log.info(requestId, 'Purchase exceeds limits, triggering step-up', {
            userId: authContext.userId,
            agentId: authContext.agentId,
            amount,
            exceededLimit,
          });

          // Call WSIM device authorization with step-up parameters
          const stepUpResponse = await loggedFetch(requestId,
            `${WSIM_BASE_URL}/api/agent/v1/oauth/device_authorization`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                agent_name: merchantName,
                agent_description: itemNames,
                scope: 'browse cart purchase',
                response_type: 'token',
                request_type: 'step_up', // NEW: Step-up flow
                existing_agent_id: authContext.agentId, // NEW: Link to existing delegation
                payment_context: { // NEW: Payment details for approval UI
                  amount: amount.toString(),
                  currency,
                  item_description: itemNames,
                  merchant_name: merchantName,
                },
                exceeded_limit: { // NEW: Which limit was exceeded
                  type: exceededLimit.type,
                  limit: exceededLimit.limit.toString(),
                  requested: exceededLimit.requested.toString(),
                  currency,
                },
                buyer_email: buyerEmail,
                checkout_session_id: sessionId,
              }),
            }
          );

          if (!stepUpResponse.ok) {
            const errorText = await stepUpResponse.text();
            throw new Error(`Step-up authorization failed: ${stepUpResponse.status} ${errorText}`);
          }

          const stepUpAuth = (await stepUpResponse.json()) as {
            device_code: string;
            user_code: string;
            verification_uri: string;
            verification_uri_complete?: string;
            expires_in: number;
            notification_sent?: boolean;
          };

          // Build the authorization URL
          const authorizationUrl =
            stepUpAuth.verification_uri_complete ||
            `${stepUpAuth.verification_uri}?code=${stepUpAuth.user_code}`;

          // Generate QR code
          const qrCodeBase64 = await generateQRCodeBase64(authorizationUrl);
          const notificationSent = stepUpAuth.notification_sent === true;

          log.info(requestId, 'Step-up authorization initiated', {
            sessionId,
            deviceCode: stepUpAuth.device_code.slice(0, 8) + '...',
            notificationSent,
            exceededLimitType: exceededLimit.type,
          });

          // Return step-up authorization widget
          const limitTypeText = exceededLimit.type === 'per_transaction' ? 'per-transaction' :
                                exceededLimit.type === 'daily' ? 'daily' : 'monthly';
          return {
            content: [
              {
                type: 'text',
                text: `This purchase of ${currency} ${amount.toFixed(2)} exceeds your ${limitTypeText} limit of ${currency} ${exceededLimit.limit.toFixed(2)}. ${notificationSent ? 'A notification was sent to your WSIM wallet for approval.' : 'Please approve this one-time purchase.'}`,
              },
            ],
            isError: true,
            structuredContent: {
              checkout_session_id: sessionId,
              amount,
              currency,
              merchant_name: merchantName,
              item_description: itemNames,
              device_code: stepUpAuth.device_code,
              user_code: stepUpAuth.user_code,
              authorization_url: authorizationUrl,
              qr_code: qrCodeBase64,
              notification_sent: notificationSent,
              expires_in: stepUpAuth.expires_in,
              status: 'step_up_required',
              exceeded_limit: exceededLimit,
            },
            _meta: {
              'mcp/www_authenticate': [
                `Bearer resource_metadata="${WSIM_BASE_URL}/.well-known/oauth-protected-resource", error="insufficient_scope", error_description="Purchase exceeds spending limit"`,
              ],
            },
          };
        }

        // ======================================================================
        // WITHIN LIMITS: Auto-approve payment
        // ======================================================================
        log.info(requestId, 'Purchase within limits, auto-approving', {
          userId: authContext.userId,
          amount,
          limits: limits ? { perTransaction: limits.perTransaction, daily: limits.daily } : 'not checked',
        });

        // Complete payment (OAuth token + within limits = authorized)
        const completeResponse = await loggedFetch(requestId,
          `${SSIM_BASE_URL}/api/agent/v1/sessions/${sessionId}/complete`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              payment_method: 'oauth_authorized',
              wallet_user_id: authContext.userId,
            }),
          }
        );

        if (!completeResponse.ok) {
          const errorText = await completeResponse.text();
          throw new Error(`Failed to complete checkout: ${completeResponse.status} ${errorText}`);
        }

        const order = await completeResponse.json() as { order_id: string };

        log.info(requestId, 'Checkout completed via OAuth (within limits)', {
          sessionId,
          orderId: order.order_id,
          amount,
          currency,
          userId: authContext.userId,
        });

        // Return success message (no widget needed for OAuth flow)
        return {
          content: [{
            type: 'text',
            text: `Payment authorized and processed!\n\nOrder ID: ${order.order_id}\nAmount: ${currency} ${amount.toFixed(2)}\nItems: ${itemNames}\nMerchant: ${merchantName}\n\nThank you for your purchase!`,
          }],
          structuredContent: {
            order_id: order.order_id,
            session_id: sessionId,
            amount,
            currency,
            merchant_name: merchantName,
            items: itemNames,
            status: 'completed',
            payment_method: 'oauth_authorized',
          },
        };
      }

      // ========================================================================
      // DEVICE AUTH FLOW (DEFAULT): No OAuth token, use QR code flow
      // This is the standard flow for unauthenticated users
      // ========================================================================
      log.info(requestId, 'Processing checkout with device authorization (first purchase flow)');

      // Call WSIM device authorization endpoint with first-purchase parameters
      const deviceAuthResponse = await loggedFetch(requestId,
        `${WSIM_BASE_URL}/api/agent/v1/oauth/device_authorization`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            agent_name: merchantName,
            agent_description: itemNames,
            scope: 'browse cart purchase',
            response_type: 'token',
            request_type: 'first_purchase', // NEW: Distinguish from step-up
            payment_context: { // NEW: Payment details for approval UI
              amount: amount.toString(),
              currency,
              item_description: itemNames,
              merchant_name: merchantName,
            },
            show_delegation_option: true, // NEW: Show "Allow future purchases" checkbox
            spending_limits: {
              per_transaction: amount.toString(),
              currency,
            },
            buyer_email: buyerEmail,
            checkout_session_id: sessionId,
          }),
        }
      );

      if (!deviceAuthResponse.ok) {
        const errorText = await deviceAuthResponse.text();
        throw new Error(
          `Device authorization failed: ${deviceAuthResponse.status} ${errorText}`
        );
      }

      const deviceAuth = (await deviceAuthResponse.json()) as {
        device_code: string;
        user_code: string;
        verification_uri: string;
        verification_uri_complete?: string;
        expires_in: number;
        notification_sent?: boolean;
      };

      // Build the authorization URL
      const authorizationUrl =
        deviceAuth.verification_uri_complete ||
        `${deviceAuth.verification_uri}?code=${deviceAuth.user_code}`;

      // Generate QR code
      const qrCodeBase64 = await generateQRCodeBase64(authorizationUrl);

      // Build payment data for widget
      const notificationSent = deviceAuth.notification_sent === true;

      log.info(requestId, 'Checkout device auth initiated', {
        sessionId,
        deviceCode: deviceAuth.device_code.slice(0, 8) + '...',
        notificationSent,
        expiresIn: deviceAuth.expires_in,
      });

      // First purchase flow: Return device auth info for widget to display
      // Data must be at TOP LEVEL of structuredContent for widget to read it
      // NO OAuth challenge here - OAuth is only earned AFTER user approves AND grants delegation
      return {
        content: [
          {
            type: 'text',
            text: `Payment authorization required for ${currency} ${amount.toFixed(2)}. ${notificationSent ? 'A push notification was sent to your WSIM wallet.' : 'Please scan the QR code or use the link to authorize.'}`,
          },
        ],
        structuredContent: {
          // Widget reads these fields directly from structuredContent
          checkout_session_id: sessionId,
          amount,
          currency,
          merchant_name: merchantName,
          description: itemNames,
          authorization_url: authorizationUrl,
          user_code: deviceAuth.user_code,
          device_code: deviceAuth.device_code,
          verification_uri: deviceAuth.verification_uri,
          qr_code_base64: qrCodeBase64,
          notification_sent: notificationSent,
          expires_in: deviceAuth.expires_in,
        },
        // NO _meta['mcp/www_authenticate'] here!
        // OAuth challenge is ONLY returned from device_authorize_status when delegation_pending=true
      };
    }

    // === Individual Checkout Tools (Advanced Use) ===
    case 'create_checkout': {
      const items = args.items as Array<{ product_id: string; quantity: number }>;

      const response = await loggedFetch(requestId,`${SSIM_BASE_URL}/api/agent/v1/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create checkout: ${response.status} ${errorText}`);
      }

      const checkout = await response.json();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(checkout, null, 2),
          },
        ],
      };
    }

    case 'get_checkout': {
      const sessionId = args.session_id as string;

      const response = await loggedFetch(requestId,
        `${SSIM_BASE_URL}/api/agent/v1/sessions/${sessionId}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch checkout: ${response.status}`);
      }

      const checkout = await response.json();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(checkout, null, 2),
          },
        ],
      };
    }

    case 'update_checkout': {
      const sessionId = args.session_id as string;
      const buyerName = args.buyer_name as string | undefined;
      const buyerEmail = args.buyer_email as string | undefined;
      const shippingAddress = args.shipping_address as string | undefined;

      // Build update data matching SSIM Session schema (nested objects)
      const updateData: Record<string, unknown> = {};

      // Buyer is a nested object: { name, email, phone }
      if (buyerName || buyerEmail) {
        updateData.buyer = {
          ...(buyerName && { name: buyerName }),
          ...(buyerEmail && { email: buyerEmail }),
        };
      }

      // Fulfillment is a nested object: { type, address }
      if (shippingAddress) {
        updateData.fulfillment = {
          type: 'shipping',
          address: {
            street: shippingAddress,
          },
        };
      }

      const response = await loggedFetch(requestId,
        `${SSIM_BASE_URL}/api/agent/v1/sessions/${sessionId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateData),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update checkout: ${response.status} ${errorText}`);
      }

      const checkout = await response.json();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(checkout, null, 2),
          },
        ],
      };
    }

    case 'complete_checkout': {
      const sessionId = args.session_id as string;

      // First, get the checkout to know the total and buyer info
      const checkoutResponse = await loggedFetch(requestId,
        `${SSIM_BASE_URL}/api/agent/v1/sessions/${sessionId}`
      );

      if (!checkoutResponse.ok) {
        throw new Error(`Failed to fetch checkout: ${checkoutResponse.status}`);
      }

      // SSIM Session schema: cart is nested object with items, total, currency
      const checkout = await checkoutResponse.json() as {
        session_id: string;
        status: string;
        cart?: {
          items?: Array<{ product_id: string; name: string; quantity: number; unit_price: number; subtotal: number }>;
          subtotal?: number;
          tax?: number;
          total?: number;
          currency?: string;
        };
        buyer?: {
          name?: string;
          email?: string;
        };
      };

      // Validate cart exists
      if (!checkout.cart || checkout.cart.total === undefined) {
        throw new Error('Checkout cart is empty or has no total. Add items first.');
      }

      // Build description from cart items
      const itemNames = checkout.cart.items?.map(i => `${i.quantity}x ${i.name}`).join(', ') || 'Purchase';
      const merchantName = 'SACP Demo Store';

      // Now initiate device authorization for the total
      const amount = checkout.cart.total;
      const currency = checkout.cart.currency || 'CAD';
      const buyerEmail = checkout.buyer?.email;

      // Call WSIM device authorization endpoint with first-purchase parameters
      const deviceAuthResponse = await loggedFetch(requestId,
        `${WSIM_BASE_URL}/api/agent/v1/oauth/device_authorization`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            agent_name: merchantName,
            agent_description: itemNames,
            scope: 'browse cart purchase',
            response_type: 'token',
            request_type: 'first_purchase', // NEW: Distinguish from step-up
            payment_context: { // NEW: Payment details for approval UI
              amount: amount.toString(),
              currency,
              item_description: itemNames,
              merchant_name: merchantName,
            },
            show_delegation_option: true, // NEW: Show "Allow future purchases" checkbox
            spending_limits: {
              per_transaction: amount.toString(),
              currency,
            },
            buyer_email: buyerEmail,
            checkout_session_id: sessionId,
          }),
        }
      );

      if (!deviceAuthResponse.ok) {
        const errorText = await deviceAuthResponse.text();
        throw new Error(
          `Device authorization failed: ${deviceAuthResponse.status} ${errorText}`
        );
      }

      const deviceAuth = (await deviceAuthResponse.json()) as {
        device_code: string;
        user_code: string;
        verification_uri: string;
        verification_uri_complete?: string;
        expires_in: number;
        notification_sent?: boolean;
      };

      // Build the authorization URL
      const authorizationUrl =
        deviceAuth.verification_uri_complete ||
        `${deviceAuth.verification_uri}?code=${deviceAuth.user_code}`;

      // Generate QR code
      const qrCodeBase64 = await generateQRCodeBase64(authorizationUrl);

      // Return device auth info for widget to display
      // Data must be at TOP LEVEL of structuredContent for widget to read it
      const notificationSent = deviceAuth.notification_sent === true;

      return {
        content: [
          {
            type: 'text',
            text: `Payment authorization required for ${currency} ${amount.toFixed(2)}. ${notificationSent ? 'A push notification was sent to your WSIM wallet.' : 'Please scan the QR code or use the link to authorize.'}`,
          },
        ],
        structuredContent: {
          // Widget reads these fields directly from structuredContent
          checkout_session_id: sessionId,
          amount,
          currency,
          merchant_name: merchantName,
          description: itemNames,
          authorization_url: authorizationUrl,
          user_code: deviceAuth.user_code,
          device_code: deviceAuth.device_code,
          verification_uri: deviceAuth.verification_uri,
          qr_code_base64: qrCodeBase64,
          notification_sent: notificationSent,
          expires_in: deviceAuth.expires_in,
        },
      };
    }

    case 'cancel_checkout': {
      const sessionId = args.session_id as string;

      const response = await loggedFetch(requestId,
        `${SSIM_BASE_URL}/api/agent/v1/sessions/${sessionId}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to cancel checkout: ${response.status}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: 'Checkout cancelled successfully.',
          },
        ],
      };
    }

    case 'get_order_status': {
      const orderId = args.order_id as string;

      const response = await loggedFetch(requestId,
        `${SSIM_BASE_URL}/api/agent/v1/orders/${orderId}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch order: ${response.status}`);
      }

      const order = await response.json();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(order, null, 2),
          },
        ],
      };
    }

    // === Device Authorization (Payment) ===
    case 'device_authorize': {
      const amount = args.amount as number;
      const currency = (args.currency as string) || 'CAD';
      const merchantName = args.merchant_name as string;
      const description =
        (args.description as string) || `Payment to ${merchantName}`;
      const buyerEmail = args.buyer_email as string | undefined;

      // Call WSIM device authorization endpoint with first-purchase parameters
      const deviceAuthResponse = await loggedFetch(requestId,
        `${WSIM_BASE_URL}/api/agent/v1/oauth/device_authorization`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            agent_name: merchantName,
            agent_description: description,
            scope: 'browse cart purchase',
            response_type: 'token',
            request_type: 'first_purchase', // NEW: Distinguish from step-up
            payment_context: { // NEW: Payment details for approval UI
              amount: amount.toString(),
              currency,
              item_description: description,
              merchant_name: merchantName,
            },
            show_delegation_option: true, // NEW: Show "Allow future purchases" checkbox
            spending_limits: {
              per_transaction: amount.toString(),
              currency,
            },
            buyer_email: buyerEmail,
          }),
        }
      );

      if (!deviceAuthResponse.ok) {
        const errorText = await deviceAuthResponse.text();
        throw new Error(
          `Device authorization failed: ${deviceAuthResponse.status} ${errorText}`
        );
      }

      const deviceAuth = (await deviceAuthResponse.json()) as {
        device_code: string;
        user_code: string;
        verification_uri: string;
        verification_uri_complete?: string;
        expires_in: number;
        notification_sent?: boolean;
      };

      // Build the authorization URL
      const authorizationUrl =
        deviceAuth.verification_uri_complete ||
        `${deviceAuth.verification_uri}?code=${deviceAuth.user_code}`;

      // Generate QR code
      const qrCodeBase64 = await generateQRCodeBase64(authorizationUrl);

      // Return device auth info for widget to display
      // Data must be at TOP LEVEL of structuredContent for widget to read it
      const notificationSent = deviceAuth.notification_sent === true;

      return {
        content: [
          {
            type: 'text',
            text: `Payment authorization required for ${currency} ${amount.toFixed(2)}. ${notificationSent ? 'A push notification was sent to your WSIM wallet.' : 'Please scan the QR code or use the link to authorize.'}`,
          },
        ],
        structuredContent: {
          // Widget reads these fields directly from structuredContent
          amount,
          currency,
          merchant_name: merchantName,
          description,
          authorization_url: authorizationUrl,
          user_code: deviceAuth.user_code,
          device_code: deviceAuth.device_code,
          verification_uri: deviceAuth.verification_uri,
          qr_code_base64: qrCodeBase64,
          notification_sent: notificationSent,
          expires_in: deviceAuth.expires_in,
        },
      };
    }

    case 'device_authorize_status': {
      const deviceCode = args.device_code as string;

      // Poll WSIM token endpoint
      const tokenResponse = await loggedFetch(requestId,`${WSIM_BASE_URL}/api/agent/v1/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: deviceCode,
        }),
      });

      const tokenResult = (await tokenResponse.json()) as {
        error?: string;
        error_description?: string;
        access_token?: string;
        token_type?: string;
        expires_in?: number;
        // NEW: Delegation fields from WSIM
        delegation_granted?: boolean;
        delegation_pending?: boolean;
      };

      if (tokenResult.error) {
        // Handle RFC 8628 error responses
        let status: string;
        let message: string;

        switch (tokenResult.error) {
          case 'authorization_pending':
            status = 'pending';
            message = 'Waiting for user authorization...';
            break;
          case 'slow_down':
            status = 'pending';
            message = 'Polling too fast, slowing down...';
            break;
          case 'access_denied':
            status = 'denied';
            message = 'User denied the authorization request';
            break;
          case 'expired_token':
            status = 'expired';
            message = 'Authorization request expired';
            break;
          default:
            throw new Error(
              `Token error: ${tokenResult.error} - ${tokenResult.error_description}`
            );
        }

        return {
          content: [
            {
              type: 'text',
              text: `Status: ${status}\n${message}`,
            },
          ],
          structuredContent: {
            status,
            message,
          },
        };
      }

      // ========================================================================
      // DELEGATION PENDING: User approved payment AND granted delegation
      // Trigger OAuth challenge so ChatGPT initiates the OAuth flow
      // ========================================================================
      if (tokenResult.delegation_pending) {
        log.info(requestId, 'Delegation pending - triggering OAuth challenge', {
          delegationGranted: tokenResult.delegation_granted,
        });

        return {
          content: [
            {
              type: 'text',
              text: 'Payment complete! To enable automatic payments for future purchases, please link your WSIM Wallet.',
            },
          ],
          isError: true, // Mark as error to trigger OAuth handling
          structuredContent: {
            status: 'approved',
            message: 'Payment authorized successfully!',
            delegation_granted: tokenResult.delegation_granted,
            delegation_pending: tokenResult.delegation_pending,
          },
          _meta: {
            // Trigger OAuth challenge - ChatGPT will initiate OAuth flow
            'mcp/www_authenticate': [
              `Bearer resource_metadata="${WSIM_BASE_URL}/.well-known/oauth-protected-resource"`,
            ],
          },
        };
      }

      // ========================================================================
      // SUCCESS: Payment approved (no delegation or delegation declined)
      // ========================================================================
      return {
        content: [
          {
            type: 'text',
            text: `Authorization approved!\nAccess token: ${tokenResult.access_token?.substring(0, 20)}...`,
          },
        ],
        structuredContent: {
          status: 'approved',
          access_token: tokenResult.access_token,
          token_type: tokenResult.token_type,
          expires_in: tokenResult.expires_in,
          message: 'Payment authorized successfully!',
          delegation_granted: tokenResult.delegation_granted ?? false,
        },
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Handle SSE connection
 */
function handleSseRequest(res: ServerResponse) {
  const sessionId = randomUUID();

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Session-Id': sessionId,
  });

  // Store session
  sessions.set(sessionId, {
    id: sessionId,
    response: res,
    createdAt: new Date(),
  });

  // Send session ID to client
  res.write(`event: session\ndata: ${JSON.stringify({ sessionId })}\n\n`);

  // Send endpoint event telling client where to POST messages (MCP SSE transport requirement)
  res.write(`event: endpoint\ndata: /mcp/message?sessionId=${sessionId}\n\n`);

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  // Clean up on close
  res.on('close', () => {
    clearInterval(heartbeat);
    sessions.delete(sessionId);
    log.info(sessionId.slice(0, 8), `SSE session closed`, { sessionId });
  });

  log.info(sessionId.slice(0, 8), `SSE session connected`, { sessionId });
}

/**
 * Handle POST message
 */
async function handlePostMessage(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
) {
  // Get session ID from query or header
  const sessionId =
    url.searchParams.get('sessionId') ||
    (req.headers['x-session-id'] as string);

  if (!sessionId || !sessions.has(sessionId)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid or missing session ID' }));
    return;
  }

  // Read request body
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const body = Buffer.concat(chunks).toString();

  let request;
  try {
    request = JSON.parse(body);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }

  // Handle the MCP request (pass Authorization header for OAuth)
  const authHeader = req.headers.authorization;
  const result = await handleMcpRequest(request, sessionId, authHeader);

  // Send response via SSE
  const session = sessions.get(sessionId);
  if (session) {
    session.response.write(`data: ${JSON.stringify(result)}\n\n`);
  }

  // Also respond to the POST
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify({ status: 'ok' }));
}

/**
 * Handle health check
 */
function handleHealth(res: ServerResponse) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      status: 'healthy',
      service: 'sacp-mcp-apps',
      version: '1.5.34',
      timestamp: new Date().toISOString(),
    })
  );
}

/**
 * Handle CORS preflight
 */
function handleCors(res: ServerResponse) {
  res.writeHead(200, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Session-Id, Authorization',
    'Access-Control-Max-Age': '86400',
  });
  res.end();
}

// Create HTTP server
const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const requestId = generateRequestId();

  log.info(requestId, `HTTP request: ${req.method} ${url.pathname}`, {
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
  });

  // CORS preflight
  if (req.method === 'OPTIONS') {
    handleCors(res);
    return;
  }

  // Health check
  if (req.method === 'GET' && url.pathname === '/health') {
    handleHealth(res);
    return;
  }

  // SSE connection
  if (req.method === 'GET' && url.pathname === '/mcp') {
    handleSseRequest(res);
    return;
  }

  // Message endpoint
  if (req.method === 'POST' && url.pathname === '/mcp/message') {
    await handlePostMessage(req, res, url);
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Start server
httpServer.listen(PORT, () => {
  log.info('startup', `SACP MCP Apps Server started`, {
    version: '1.5.34',
    port: PORT,
    mcpEndpoint: `http://localhost:${PORT}/mcp`,
    healthEndpoint: `http://localhost:${PORT}/health`,
    ssimBaseUrl: SSIM_BASE_URL,
    wsimBaseUrl: WSIM_BASE_URL,
  });
});
