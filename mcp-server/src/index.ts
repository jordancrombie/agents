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

import { SsimClient, CartItem } from './clients/ssim.js';
import { WsimClient } from './clients/wsim.js';

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
];

// Create the MCP server
const server = new Server(
  {
    name: 'sacp-mcp',
    version: '1.0.0',
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
