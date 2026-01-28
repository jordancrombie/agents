# Design Document: MCP Image Content for QR Codes

**Author**: SACP Team
**Date**: 2026-01-28
**Status**: Implemented (v1.5.0-beta.1)
**Branch**: feature/mcp-ui-authorization

---

## Executive Summary

ChatGPT Custom GPTs cannot render external images due to platform security restrictions. However, MCP-compliant clients (like Claude Desktop) support **ImageContent** in tool results, allowing QR codes to be displayed natively.

This document outlines how to enhance the SACP MCP Server to return QR codes as ImageContent, enabling proper QR code rendering in capable clients.

---

## Problem Statement

### Current Situation
- HTTP Gateway generates QR codes and returns `qr_code_url` (HTTPS URL to PNG)
- ChatGPT **cannot** render external images (platform restriction)
- Claude Desktop (MCP client) **can** render ImageContent in tool results
- MCP server currently only returns TextContent

### Root Cause
This is a **UI transport capability mismatch**:
- ChatGPT only understands text/markdown
- MCP clients can understand structured UI primitives (text, image, audio)

---

## Solution: MCP ImageContent

### MCP Specification Support

Per the [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), tool results can include ImageContent:

```json
{
  "type": "image",
  "data": "base64-encoded-data",
  "mimeType": "image/png",
  "annotations": {
    "audience": ["user"],
    "priority": 0.9
  }
}
```

### Proposed Response Format

When the `complete_checkout` tool requires device authorization, return both text and image content:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Payment authorization required.\n\nAuthorization URL: https://wsim.banksim.ca/api/m/device?code=WSIM-A3J2K9\nUser Code: WSIM-A3J2K9\n\nScan the QR code below or click the authorization URL."
    },
    {
      "type": "image",
      "data": "iVBORw0KGgoAAAANSUhEUg...(base64 PNG)...",
      "mimeType": "image/png",
      "annotations": {
        "audience": ["user"],
        "priority": 1.0
      }
    }
  ]
}
```

### Client Behavior

| Client | ImageContent Support | Expected Behavior |
|--------|---------------------|-------------------|
| Claude Desktop | ✅ Yes | Renders QR code image inline |
| ChatGPT | ❌ No (HTTP Gateway only) | Falls back to authorization URL link |
| Custom MCP Client | ✅ Yes | Renders QR code image inline |
| Gemini | ❌ No (HTTP only) | Falls back to authorization URL link |

---

## Implementation Plan

### 1. Add Guest Checkout Tool to MCP Server

Add a new tool `guest_checkout_complete` that:
- Takes checkout session info and buyer details
- Initiates device authorization with WSIM
- Generates QR code for authorization URL
- Returns both text explanation and QR code image

### 2. Generate QR Code as Base64

```typescript
import * as QRCode from 'qrcode';

async function generateQRCodeBase64(url: string): Promise<string> {
  const buffer = await QRCode.toBuffer(url, {
    type: 'png',
    width: 200,
    margin: 2,
  });
  return buffer.toString('base64');
}
```

### 3. Return Multi-Content Response

```typescript
case 'guest_checkout_complete': {
  // ... device authorization logic ...

  // Generate QR code
  const qrCodeBase64 = await generateQRCodeBase64(authorizationUrl);

  return {
    content: [
      {
        type: 'text',
        text: `Payment authorization required for $${total}.\n\n` +
              `Authorization URL: ${authorizationUrl}\n` +
              `User Code: ${userCode}\n` +
              `Poll Endpoint: ${pollEndpoint}\n\n` +
              `Scan the QR code or use the authorization URL.`,
      },
      {
        type: 'image',
        data: qrCodeBase64,
        mimeType: 'image/png',
        annotations: {
          audience: ['user'],
          priority: 1.0,
        },
      },
    ],
  };
}
```

---

## Authorization Fallback Hierarchy

For maximum compatibility across clients, use this fallback hierarchy:

| Priority | Method | Client Support | User Action |
|----------|--------|----------------|-------------|
| 1 | Push Notification | WSIM Mobile App | Tap notification |
| 2 | QR Code (MCP ImageContent) | Claude Desktop, MCP clients | Scan with phone |
| 3 | Clickable Authorization URL | All clients | Click link |
| 4 | Manual Code Entry | All clients | Type WSIM-XXXXXX |

---

## Testing

### Claude Desktop
1. Configure MCP server in Claude Desktop
2. Run guest checkout flow
3. Verify QR code image appears inline
4. Scan QR code with phone
5. Complete authorization

### HTTP Gateway (ChatGPT)
1. Existing flow unchanged
2. Authorization URL is primary method
3. QR code URL provided but won't render

---

## Implementation (v1.5.0-beta.1)

### New MCP Tools

Two new tools were added to `mcp-server/src/index.ts`:

1. **`device_authorize`** - Initiates device authorization for payment
   - Input: `amount`, `currency`, `merchant_name`, `description`, `buyer_email`
   - Returns: Text content with authorization details + ImageContent with QR code
   - Calls WSIM `/api/agent/v1/device_authorization` endpoint

2. **`device_authorize_status`** - Polls for authorization status
   - Input: `device_code`
   - Returns: Status (pending, approved, denied, expired) + access_token if approved
   - Calls WSIM `/api/agent/v1/token` endpoint

### Response Format

```typescript
return {
  content: [
    {
      type: 'text',
      text: responseText, // Includes authorization URL, user code, etc.
    },
    {
      type: 'image',
      data: qrCodeBase64, // Base64-encoded PNG
      mimeType: 'image/png',
    },
  ],
};
```

### Key Insight

**This is not a payments problem, not a QR problem, not a markdown problem - it's a UI transport capability mismatch.**

- ChatGPT: Text-only transport → cannot render images
- MCP: Structured content transport → can render images, audio, etc.

The solution is to use the appropriate content type for each transport:
- HTTP/OpenAPI clients: Use authorization URL (clickable link)
- MCP clients: Use ImageContent (native QR code rendering)

---

## Related Documentation

- [MCP Specification - Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [MCP Apps Blog Post](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)
- [GPT Instructions v1.4.10](../GPT_INSTRUCTIONS.md)
- [CHANGELOG](../../mcp-server/CHANGELOG.md)
