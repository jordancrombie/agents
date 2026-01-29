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

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const PORT = parseInt(process.env.PORT || '8000', 10);
const WSIM_BASE_URL = process.env.WSIM_BASE_URL || 'https://wsim.banksim.ca';
const SSIM_BASE_URL = process.env.SSIM_BASE_URL || 'https://ssim.banksim.ca';

// Widget template configuration
// Version the URI to bust ChatGPT's cache when widget changes (per OpenAI Apps SDK best practice)
const WIDGET_VERSION = '1.5.15';
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
// NOTE: Widget-rendering tools (complete_checkout, device_authorize) use Method B (result-driven):
// - NO outputTemplate in tool definition (would cause early widget mount)
// - Widget is triggered by ui:// resource in tool RESULT only
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

  // === Checkout ===
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
    description: 'Complete a checkout session. This will initiate device authorization for payment and return a QR code widget.',
    _meta: {
      // NO outputTemplate here - widget is triggered by ui:// resource in tool RESULT only
      'openai/widgetCSP': WIDGET_CSP,
      'openai/widgetDomain': WIDGET_DOMAIN,
      'openai/toolInvocation/invoking': 'Processing payment...',
      'openai/toolInvocation/invoked': 'Payment authorization ready',
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
      'Initiate device authorization for payment. Returns a QR code widget for the user to scan and authorize the payment.',
    _meta: {
      // NO outputTemplate here - widget is triggered by ui:// resource in tool RESULT only
      'openai/widgetCSP': WIDGET_CSP,
      'openai/widgetDomain': WIDGET_DOMAIN,
      'openai/toolInvocation/invoking': 'Processing payment...',
      'openai/toolInvocation/invoked': 'Payment authorization ready',
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
  sessionId: string
): Promise<{
  jsonrpc: string;
  id?: string | number;
  result?: unknown;
  error?: { code: number; message: string };
}> {
  const { method, params, id } = request;

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
              version: '1.5.15',
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

        const result = await executeTool(toolName, args);
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
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32000, message },
    };
  }
}

// Content types for MCP tool results
type TextContent = { type: 'text'; text: string };
type ResourceContent = {
  type: 'resource';
  resource: { uri: string; mimeType: string; text: string };
};
type ContentItem = TextContent | ResourceContent;

/**
 * Execute a tool and return the result
 */
async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<{
  content: ContentItem[];
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
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

      const response = await fetch(
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

      const response = await fetch(
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

    // === Checkout ===
    case 'create_checkout': {
      const items = args.items as Array<{ product_id: string; quantity: number }>;

      const response = await fetch(`${SSIM_BASE_URL}/api/agent/v1/sessions`, {
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

      const response = await fetch(
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

      const response = await fetch(
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
      const checkoutResponse = await fetch(
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

      // Call WSIM device authorization endpoint
      const deviceAuthResponse = await fetch(
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

      // Build text content
      const notificationSent = deviceAuth.notification_sent === true;
      let textContent = `Checkout Ready for Payment\n`;
      textContent += `==========================\n\n`;
      textContent += `Items: ${itemNames}\n`;
      textContent += `Total: ${currency} ${amount.toFixed(2)}\n\n`;

      if (notificationSent) {
        textContent += `Push notification sent to your phone.\n\n`;
      }

      textContent += `Authorize at: ${authorizationUrl}\n`;
      textContent += `Code: ${deviceAuth.user_code}\n`;
      textContent += `Expires in: ${Math.floor(deviceAuth.expires_in / 60)} minutes`;

      // Payment data for widget - duplicated in _meta as workaround for SDK toolOutput bug
      // Widget can access via toolResponseMetadata when toolOutput is null
      const paymentData = {
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
      };

      // Method B (result-driven): Include ui:// resource in result to trigger widget mount
      // Widget only appears when this result arrives (not during tool invocation)
      return {
        content: [
          {
            type: 'text',
            text: textContent,
          },
          {
            type: 'resource',
            resource: {
              uri: WIDGET_URI,
              mimeType: WIDGET_MIME_TYPE,
              text: widgetTemplate,
            },
          },
        ],
        // structuredContent -> toolOutput (widget reads from here)
        structuredContent: {
          ...paymentData,
        },
        // Widget CSP/domain metadata (no outputTemplate - that's Method A)
        _meta: {
          'openai/widgetCSP': WIDGET_CSP,
          'openai/widgetDomain': WIDGET_DOMAIN,
        },
      };
    }

    case 'cancel_checkout': {
      const sessionId = args.session_id as string;

      const response = await fetch(
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

      const response = await fetch(
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

      // Call WSIM device authorization endpoint
      const deviceAuthResponse = await fetch(
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

      // Build text content for non-widget clients
      const notificationSent = deviceAuth.notification_sent === true;
      let textContent = `Payment Authorization Required\n`;
      textContent += `Amount: ${currency} ${amount.toFixed(2)}\n`;
      textContent += `Merchant: ${merchantName}\n\n`;

      if (notificationSent) {
        textContent += `Push notification sent to your phone.\n\n`;
      }

      textContent += `Authorize at: ${authorizationUrl}\n`;
      textContent += `Code: ${deviceAuth.user_code}\n`;
      textContent += `Expires in: ${Math.floor(deviceAuth.expires_in / 60)} minutes`;

      // Payment data for widget - duplicated in _meta as workaround for SDK toolOutput bug
      // Widget can access via toolResponseMetadata when toolOutput is null
      const paymentData = {
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
      };

      // Method B (result-driven): Include ui:// resource in result to trigger widget mount
      // Widget only appears when this result arrives (not during tool invocation)
      return {
        content: [
          {
            type: 'text',
            text: textContent,
          },
          {
            type: 'resource',
            resource: {
              uri: WIDGET_URI,
              mimeType: WIDGET_MIME_TYPE,
              text: widgetTemplate,
            },
          },
        ],
        // structuredContent -> toolOutput (widget reads from here)
        structuredContent: {
          ...paymentData,
        },
        // Widget CSP/domain metadata (no outputTemplate - that's Method A)
        _meta: {
          'openai/widgetCSP': WIDGET_CSP,
          'openai/widgetDomain': WIDGET_DOMAIN,
        },
      };
    }

    case 'device_authorize_status': {
      const deviceCode = args.device_code as string;

      // Poll WSIM token endpoint
      const tokenResponse = await fetch(`${WSIM_BASE_URL}/api/agent/v1/oauth/token`, {
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

      // Success - return the access token
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
    console.log(`Session ${sessionId} closed`);
  });

  console.log(`Session ${sessionId} connected`);
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

  // Handle the MCP request
  const result = await handleMcpRequest(request, sessionId);

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
      version: '1.5.15',
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
    'Access-Control-Allow-Headers': 'Content-Type, X-Session-Id',
    'Access-Control-Max-Age': '86400',
  });
  res.end();
}

// Create HTTP server
const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  console.log(`${req.method} ${url.pathname}`);

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
  console.log(`SACP MCP Apps Server running at http://localhost:${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
