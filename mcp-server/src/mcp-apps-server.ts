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

// Widget template configuration
const WIDGET_URI = 'ui://widget/authorization.html';
const WIDGET_MIME_TYPE = 'text/html+skybridge';

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
function getToolMeta() {
  return {
    'openai/outputTemplate': WIDGET_URI,
    'openai/toolInvocation/invoking': 'Processing payment authorization...',
    'openai/toolInvocation/invoked': 'Authorization widget ready',
    'openai/widgetAccessible': true,
  };
}

const tools = [
  {
    name: 'device_authorize',
    description:
      'Initiate device authorization for payment. Returns a QR code widget for the user to scan and authorize the payment.',
    _meta: getToolMeta(),
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
              version: '1.5.0-beta.2',
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

/**
 * Execute a tool and return the result
 */
async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<{
  content: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}> {
  switch (name) {
    case 'device_authorize': {
      const amount = args.amount as number;
      const currency = (args.currency as string) || 'CAD';
      const merchantName = args.merchant_name as string;
      const description =
        (args.description as string) || `Payment to ${merchantName}`;
      const buyerEmail = args.buyer_email as string | undefined;

      // Call WSIM device authorization endpoint
      const deviceAuthResponse = await fetch(
        `${WSIM_BASE_URL}/api/agent/v1/device_authorization`,
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

      // Return both text content and structured content for widget
      return {
        content: [
          {
            type: 'text',
            text: textContent,
          },
        ],
        // Structured content for widget consumption
        structuredContent: {
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
        // Widget template reference
        _meta: {
          'openai/outputTemplate': WIDGET_URI,
        },
      };
    }

    case 'device_authorize_status': {
      const deviceCode = args.device_code as string;

      // Poll WSIM token endpoint
      const tokenResponse = await fetch(`${WSIM_BASE_URL}/api/agent/v1/token`, {
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
      version: '1.5.0-beta.2',
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
