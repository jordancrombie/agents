# Questions for OpenAI: Apps SDK & MCP OAuth Support

**Context**: We're building an MCP-based payment authorization flow for ChatGPT Apps. Currently using Device Authorization Grant (QR codes + polling). Exploring OAuth Embedded flow for better desktop UX.

**Our Setup**:
- MCP Server at `sacp.banksim.ca`
- Authorization Server at `wsim.banksim.ca` (OAuth 2.1 + Passkeys)
- Widget rendered via `outputTemplate` with `text/html+skybridge` MIME type

---

## Critical Questions

### 1. Widget Popup Capability

**Question**: Can widgets rendered via `outputTemplate` open popup windows using `window.open()`?

**Context**: We want to open a popup to `wsim.banksim.ca/oauth/authorize` for OAuth authentication. The popup would allow users to authenticate with passkeys (WebAuthn), which are bound to the `wsim.banksim.ca` domain.

**Specific asks**:
- Is `window.open()` allowed from widgets in the `*.web-sandbox.oaiusercontent.com` sandbox?
- If not, is there a recommended pattern for OAuth flows from widgets?
- Would you consider adding an `openai.openAuthPopup(url)` API for OAuth use cases?

---

### 2. MCP OAuth Support (401 Pattern)

**Question**: Does ChatGPT's MCP implementation support the OAuth flow described in the MCP specification?

**From MCP spec**: When a tool requires authorization, the server returns a `401 Unauthorized` with OAuth metadata, and the client handles the OAuth flow.

**Specific asks**:
- Does ChatGPT's MCP client recognize and handle `401 + OAuth metadata` responses from `tools/call`?
- If yes, what's the expected response format?
- If no, what's the recommended pattern for tools that require user authorization?

**Alternative we're considering**: Return authorization info in the tool result itself:
```json
{
  "content": [{ "type": "text", "text": "Authorization required" }],
  "structuredContent": {
    "requires_authorization": true,
    "authorization_endpoint": "https://wsim.banksim.ca/oauth/authorize",
    "payment_context": { "amount": "21.46", "currency": "CAD" }
  }
}
```

---

### 3. PostMessage from External Domains

**Question**: Can widgets receive `postMessage` events from popup windows on external domains?

**Context**: After OAuth authorization in the popup (`wsim.banksim.ca`), we need to communicate the result back to the widget. Standard pattern is `window.opener.postMessage()`.

**Specific asks**:
- Can widgets listen for `message` events from external origins?
- Are there CSP or sandbox restrictions that would block this?
- If blocked, what's the recommended callback pattern?

---

### 4. OAuth Token Management

**Question**: Does ChatGPT handle OAuth token storage and refresh for MCP servers?

**Context**: After the OAuth flow completes, something needs to store the access token and attach it to subsequent MCP requests.

**Specific asks**:
- Does ChatGPT's MCP client have built-in token management?
- If yes, how does it associate tokens with specific MCP servers?
- If no, should we store tokens server-side (in our MCP server)?

---

### 5. Session Affinity Across Tool Calls

**Question**: Are MCP tool calls from the same conversation guaranteed to use the same session/connection?

**Context**: We need to associate OAuth tokens with subsequent requests. If each tool call creates a new MCP session, we lose the token context.

**Specific asks**:
- Is there a session ID or conversation ID we can use to correlate requests?
- Are there headers or parameters passed to MCP servers that identify the conversation?
- What's the lifecycle of an MCP connection in ChatGPT?

---

## Nice-to-Have Questions

### 6. Widget-to-Host Communication

**Question**: Is there a way for widgets to communicate back to ChatGPT (beyond `openai.callTool`)?

**Use cases**:
- Notify ChatGPT that authorization completed successfully
- Request ChatGPT to retry the original tool call
- Update conversation state based on widget events

---

### 7. Recommended OAuth Pattern

**Question**: What's OpenAI's recommended pattern for MCP tools that require user authorization?

**Our current approach** (Device Authorization Grant):
1. Tool returns QR code + polling code
2. User scans QR or clicks link → new tab opens
3. User authenticates on external site
4. Widget polls for completion

**Proposed approach** (OAuth Embedded):
1. Tool returns "authorization required"
2. Widget shows "Authorize" button
3. User clicks → popup opens to OAuth server
4. User authenticates with passkey
5. Popup closes, widget receives token
6. Widget notifies ChatGPT to retry

Is there a better pattern you'd recommend?

---

## Technical Details (For Reference)

**Our MCP Server Info**:
```json
{
  "name": "sacp-mcp-apps",
  "version": "1.5.21",
  "protocolVersion": "2024-11-05"
}
```

**Widget CSP** (current):
```json
{
  "connect_domains": [],
  "resource_domains": []
}
```

**Would need for OAuth**:
```json
{
  "connect_domains": ["wsim.banksim.ca"],
  "resource_domains": []
}
```

---

## Contact

If you need more context or want to discuss implementation options, we're happy to set up a call.

**Team**: SACP / BankSim
**MCP Server**: `https://sacp.banksim.ca/mcp`
