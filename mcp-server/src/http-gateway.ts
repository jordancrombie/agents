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
import { SsimClient, CartItem } from './clients/ssim.js';
import { WsimClient } from './clients/wsim.js';

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
};

// Session storage (in-memory for demo, use Redis for production)
interface Session {
  id: string;
  clientId: string;
  clientSecret: string;
  agentId: string;
  accessToken?: string;
  tokenExpiresAt?: number;
  createdAt: Date;
}

const sessions = new Map<string, Session>();
const pendingRegistrations = new Map<string, { requestId: string; pollUrl: string; expiresAt: string }>();

// Generate a simple session ID
function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
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
    description: 'Complete checkout - automatically gets payment token and finalizes purchase',
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

// Session middleware - extracts session from header
function sessionMiddleware(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.headers['x-session-id'] as string;
  if (sessionId) {
    const session = sessions.get(sessionId);
    if (session) {
      (req as any).session = session;
    }
  }
  next();
}

app.use(sessionMiddleware);

// Helper to get authenticated clients
async function getClients(session: Session): Promise<{ wsim: WsimClient; ssim: SsimClient }> {
  const wsim = new WsimClient(config.wsim.baseUrl, session.clientId, session.clientSecret);
  const token = await wsim.getAccessToken();
  const ssim = new SsimClient(config.ssim.baseUrl, token);
  return { wsim, ssim };
}

// ============================================================================
// Routes
// ============================================================================

// Discovery - list available tools
app.get('/tools', (req, res) => {
  res.json({
    name: 'SACP Agent Gateway',
    version: '1.0.0',
    description: 'HTTP gateway for AI agents to browse and purchase from SimToolBox stores',
    base_url: `${req.protocol}://${req.get('host')}`,
    authentication: {
      type: 'session',
      flow: 'Register with pairing code, receive session_id, include as X-Session-Id header',
    },
    tools,
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
      error_description: 'Session required. Include X-Session-Id header.',
    });
  }
  next();
}

// Create checkout
app.post('/checkout', requireSession, async (req, res) => {
  try {
    const session = (req as any).session as Session;
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'items array is required',
      });
    }

    const { ssim } = await getClients(session);
    const checkout = await ssim.createCheckout(items);

    res.json({
      ...checkout,
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

// Update checkout
app.patch('/checkout/:session_id', requireSession, async (req, res) => {
  try {
    const session = (req as any).session as Session;
    const { session_id } = req.params;
    const { buyer, fulfillment, items } = req.body;

    const { wsim } = await getClients(session);
    const token = await wsim.getAccessToken();

    const response = await fetch(
      `${config.ssim.baseUrl}/api/agent/v1/sessions/${session_id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ buyer, fulfillment, items }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
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

// Get checkout
app.get('/checkout/:session_id', requireSession, async (req, res) => {
  try {
    const session = (req as any).session as Session;
    const { session_id } = req.params;
    const { ssim } = await getClients(session);
    const checkout = await ssim.getCheckout(session_id);
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
app.post('/checkout/:session_id/complete', requireSession, async (req, res) => {
  try {
    const session = (req as any).session as Session;
    const { session_id } = req.params;
    const { wsim, ssim } = await getClients(session);

    // Get checkout to find total
    const checkout = await ssim.getCheckout(session_id);

    if (checkout.status !== 'ready_for_payment') {
      return res.status(400).json({
        error: 'invalid_state',
        error_description: `Checkout is not ready for payment. Current status: ${checkout.status}`,
        next_step: 'Update checkout with buyer and fulfillment info first',
      });
    }

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

    res.json({
      status: 'completed',
      order_id: order.id,
      transaction_id: order.transaction_id,
      total: checkout.cart.total,
      currency: checkout.cart.currency,
      message: 'Purchase completed successfully!',
    });
  } catch (error) {
    console.error('Complete checkout error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: error instanceof Error ? error.message : 'Unknown error',
    });
  }
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
║    GET  /tools           - List available tools               ║
║    POST /auth/register   - Register with pairing code         ║
║    GET  /auth/status/:id - Check registration status          ║
║    GET  /products        - Browse products                    ║
║    POST /checkout        - Create checkout                    ║
║    POST /execute         - Execute any tool (MCP-style)       ║
╚═══════════════════════════════════════════════════════════════╝
`);
});
