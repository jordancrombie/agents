#!/usr/bin/env node
/**
 * SACP MCP Server
 *
 * A Model Context Protocol server that enables AI agents to:
 * - Discover and browse stores (SSIM)
 * - Create checkout sessions and complete purchases
 * - Request payment authorization (WSIM)
 * - Handle step-up approvals for large purchases
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import * as QRCode from 'qrcode';

import { SsimClient, CartItem } from './clients/ssim.js';
import { WsimClient } from './clients/wsim.js';

/**
 * Generate a QR code as a base64-encoded PNG
 * Used for MCP ImageContent to render QR codes in capable clients (e.g., Claude Desktop)
 * HTTP-only clients (ChatGPT) cannot render MCP ImageContent and should use authorization URLs instead
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

// Configuration from environment
const config = {
  wsim: {
    baseUrl: process.env.WSIM_BASE_URL || 'https://wsim-dev.banksim.ca',
    clientId: process.env.WSIM_CLIENT_ID || '',
    clientSecret: process.env.WSIM_CLIENT_SECRET || '',
  },
  ssim: {
    baseUrl: process.env.SSIM_BASE_URL || 'https://ssim-dev.banksim.ca',
  },
};

// Initialize clients (will be created when credentials are available)
let wsimClient: WsimClient | null = null;
let ssimClient: SsimClient | null = null;

// Tool definitions
const tools: Tool[] = [
  // === Store Discovery & Browsing ===
  {
    name: 'discover_store',
    description: 'Discover a store\'s capabilities and API endpoints via UCP (Universal Commerce Protocol). Returns merchant info and available features.',
    inputSchema: {
      type: 'object',
      properties: {
        store_url: {
          type: 'string',
          description: 'The base URL of the store (e.g., https://ssim-dev.banksim.ca)',
        },
      },
      required: ['store_url'],
    },
  },
  {
    name: 'browse_products',
    description: 'Search and browse products in the store. Returns a list of available products.',
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
  },
  {
    name: 'get_product',
    description: 'Get detailed information about a specific product.',
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
  },

  // === Checkout ===
  {
    name: 'create_checkout',
    description: 'Create a new checkout session with items to purchase.',
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
  },
  {
    name: 'get_checkout',
    description: 'Get the current status and details of a checkout session.',
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
  },
  {
    name: 'update_checkout',
    description: 'Update items in an existing checkout session.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'The checkout session ID',
        },
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
          description: 'Updated array of items',
        },
      },
      required: ['session_id', 'items'],
    },
  },
  {
    name: 'complete_checkout',
    description: 'Complete a checkout session with a payment token. The payment token must be obtained from get_payment_token first.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'The checkout session ID',
        },
        payment_token: {
          type: 'string',
          description: 'Payment token from WSIM',
        },
        mandate_id: {
          type: 'string',
          description: 'Optional mandate ID for the payment',
        },
      },
      required: ['session_id', 'payment_token'],
    },
  },
  {
    name: 'cancel_checkout',
    description: 'Cancel a checkout session.',
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
  },

  // === Wallet / Payments ===
  {
    name: 'check_spending_limits',
    description: 'Check the agent\'s current spending limits and remaining balance.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_payment_token',
    description: 'Request a payment token from the wallet. If the amount exceeds limits, returns a step_up_id for human approval. Use check_step_up_status to poll for approval.',
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
        merchant_id: {
          type: 'string',
          description: 'Merchant ID from store discovery',
        },
        session_id: {
          type: 'string',
          description: 'Checkout session ID',
        },
      },
      required: ['amount', 'merchant_id', 'session_id'],
    },
  },
  {
    name: 'check_step_up_status',
    description: 'Check the status of a step-up approval request. Returns pending, approved (with payment_token), rejected, or expired.',
    inputSchema: {
      type: 'object',
      properties: {
        step_up_id: {
          type: 'string',
          description: 'The step-up request ID from get_payment_token',
        },
      },
      required: ['step_up_id'],
    },
  },
  {
    name: 'get_order_status',
    description: 'Get the status of a completed order.',
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
  },

  // === Device Authorization (Guest Checkout) ===
  {
    name: 'device_authorize',
    description: 'Initiate device authorization for payment. Returns a user code and QR code for the user to scan. Use device_authorize_status to poll for approval. This is useful for guest checkout scenarios where the agent does not have pre-configured credentials.',
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
          description: 'Optional buyer email - if known, WSIM may send a push notification',
        },
      },
      required: ['amount', 'merchant_name'],
    },
  },
  {
    name: 'device_authorize_status',
    description: 'Check the status of a device authorization request. Returns pending, approved (with access_token), denied, or expired.',
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
  },
];

// Create the MCP server
const server = new Server(
  {
    name: 'sacp-mcp',
    version: '1.5.0', // Added MCP ImageContent support for QR codes
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper to ensure clients are initialized
function ensureClients(): { wsim: WsimClient; ssim: SsimClient } {
  if (!wsimClient || !ssimClient) {
    if (!config.wsim.clientId || !config.wsim.clientSecret) {
      throw new Error(
        'WSIM credentials not configured. Set WSIM_CLIENT_ID and WSIM_CLIENT_SECRET environment variables.'
      );
    }

    wsimClient = new WsimClient(
      config.wsim.baseUrl,
      config.wsim.clientId,
      config.wsim.clientSecret
    );

    // SSIM client needs agent token from WSIM
    // We'll initialize it lazily when we have a token
  }

  return { wsim: wsimClient, ssim: ssimClient! };
}

async function ensureSsimClient(): Promise<SsimClient> {
  if (!ssimClient) {
    const { wsim } = ensureClients();
    const token = await wsim.getAccessToken();
    ssimClient = new SsimClient(config.ssim.baseUrl, token);
  }
  return ssimClient;
}

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      // === Store Discovery & Browsing ===
      case 'discover_store': {
        const ssim = await ensureSsimClient();
        const result = await ssim.discoverStore(args.store_url as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'browse_products': {
        const ssim = await ensureSsimClient();
        const result = await ssim.browseProducts(
          args.query as string | undefined,
          args.category as string | undefined,
          args.limit as number | undefined
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'get_product': {
        const ssim = await ensureSsimClient();
        const result = await ssim.getProduct(args.product_id as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      // === Checkout ===
      case 'create_checkout': {
        const ssim = await ensureSsimClient();
        const result = await ssim.createCheckout(args.items as CartItem[]);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'get_checkout': {
        const ssim = await ensureSsimClient();
        const result = await ssim.getCheckout(args.session_id as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'update_checkout': {
        const ssim = await ensureSsimClient();
        const result = await ssim.updateCheckout(
          args.session_id as string,
          args.items as CartItem[]
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'complete_checkout': {
        const ssim = await ensureSsimClient();
        const result = await ssim.completeCheckout(
          args.session_id as string,
          args.payment_token as string,
          args.mandate_id as string | undefined
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'cancel_checkout': {
        const ssim = await ensureSsimClient();
        await ssim.cancelCheckout(args.session_id as string);
        return {
          content: [{ type: 'text', text: 'Checkout cancelled successfully.' }],
        };
      }

      // === Wallet / Payments ===
      case 'check_spending_limits': {
        const { wsim } = ensureClients();
        const result = await wsim.getSpendingLimits();
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'get_payment_token': {
        const { wsim } = ensureClients();
        const result = await wsim.requestPaymentToken({
          amount: args.amount as number,
          currency: (args.currency as string) || 'CAD',
          merchant_id: args.merchant_id as string,
          session_id: args.session_id as string,
        });

        if (result.step_up_required) {
          return {
            content: [
              {
                type: 'text',
                text: `Step-up approval required. The purchase amount exceeds your auto-approve limit.\n\nStep-up ID: ${result.step_up_id}\n\nThe user will receive a push notification on their phone to approve this purchase. Use check_step_up_status to poll for approval.`,
              },
            ],
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'check_step_up_status': {
        const { wsim } = ensureClients();
        const result = await wsim.getStepUpStatus(args.step_up_id as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'get_order_status': {
        const ssim = await ensureSsimClient();
        const result = await ssim.getOrder(args.order_id as string);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      // === Device Authorization (Guest Checkout) ===
      case 'device_authorize': {
        const amount = args.amount as number;
        const currency = (args.currency as string) || 'CAD';
        const merchantName = args.merchant_name as string;
        const description = (args.description as string) || `Payment to ${merchantName}`;
        const buyerEmail = args.buyer_email as string | undefined;

        // Call WSIM device authorization endpoint
        const deviceAuthResponse = await fetch(
          `${config.wsim.baseUrl}/api/agent/v1/device_authorization`,
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
          throw new Error(`Device authorization failed: ${deviceAuthResponse.status} ${errorText}`);
        }

        const deviceAuth = await deviceAuthResponse.json() as {
          device_code: string;
          user_code: string;
          verification_uri: string;
          verification_uri_complete?: string;
          expires_in: number;
          notification_sent?: boolean;
        };

        // Build the authorization URL (use complete URI if available)
        const authorizationUrl = deviceAuth.verification_uri_complete ||
          `${deviceAuth.verification_uri}?code=${deviceAuth.user_code}`;

        // Generate QR code for the authorization URL
        // This will render as an image in MCP-capable clients (Claude Desktop)
        const qrCodeBase64 = await generateQRCodeBase64(authorizationUrl);

        // Build response text
        const notificationSent = deviceAuth.notification_sent === true;
        let responseText = `Payment Authorization Required\n`;
        responseText += `================================\n\n`;
        responseText += `Amount: ${currency} ${amount.toFixed(2)}\n`;
        responseText += `Merchant: ${merchantName}\n\n`;

        if (notificationSent) {
          responseText += `A push notification has been sent to the user's phone.\n\n`;
        }

        responseText += `Authorization Options:\n`;
        responseText += `1. Scan the QR code below with your WSIM wallet app\n`;
        responseText += `2. Click: ${authorizationUrl}\n`;
        responseText += `3. Enter code: ${deviceAuth.user_code}\n\n`;
        responseText += `Device Code (for polling): ${deviceAuth.device_code}\n`;
        responseText += `Expires in: ${deviceAuth.expires_in} seconds\n\n`;
        responseText += `Use device_authorize_status with the device_code to poll for approval.`;

        // Return both text and image content
        // MCP-capable clients (Claude Desktop) will render the QR code image
        return {
          content: [
            {
              type: 'text',
              text: responseText,
            },
            {
              type: 'image',
              data: qrCodeBase64,
              mimeType: 'image/png',
            },
          ],
        };
      }

      case 'device_authorize_status': {
        const deviceCode = args.device_code as string;

        // Poll WSIM token endpoint
        const tokenResponse = await fetch(
          `${config.wsim.baseUrl}/api/agent/v1/token`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
              device_code: deviceCode,
            }),
          }
        );

        const tokenResult = await tokenResponse.json() as {
          error?: string;
          error_description?: string;
          access_token?: string;
          token_type?: string;
          expires_in?: number;
        };

        if (tokenResult.error) {
          // Handle RFC 8628 error responses
          switch (tokenResult.error) {
            case 'authorization_pending':
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    status: 'pending',
                    message: 'Authorization pending - user has not yet approved or denied',
                  }, null, 2),
                }],
              };
            case 'slow_down':
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    status: 'pending',
                    message: 'Slow down - polling too frequently, wait longer between requests',
                  }, null, 2),
                }],
              };
            case 'access_denied':
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    status: 'denied',
                    message: 'User denied the authorization request',
                  }, null, 2),
                }],
              };
            case 'expired_token':
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    status: 'expired',
                    message: 'Authorization request expired - start a new device_authorize flow',
                  }, null, 2),
                }],
              };
            default:
              throw new Error(`Token error: ${tokenResult.error} - ${tokenResult.error_description}`);
          }
        }

        // Success - return the access token
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'approved',
              access_token: tokenResult.access_token,
              token_type: tokenResult.token_type,
              expires_in: tokenResult.expires_in,
              message: 'Authorization approved! Use this access_token for payment.',
            }, null, 2),
          }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('SACP MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
