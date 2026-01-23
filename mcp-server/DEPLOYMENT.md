# SACP MCP Server - Deployment Specification

**For**: Build Team
**Date**: 2026-01-22
**Status**: Ready for Pipeline Creation

---

## Overview

The SACP MCP server is a Node.js application that runs as a stdio-based MCP server. It does NOT run as a web service - it's invoked by AI clients (Claude Desktop, etc.) as a subprocess.

However, we need to:
1. Build and publish a Docker image for distribution
2. Publish to npm registry (optional, for direct installation)
3. Run integration tests in CI

---

## Docker Specification

### Base Image

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Build TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# MCP servers run via stdio, not as a web service
# This image is for distribution, not for running as a service
ENTRYPOINT ["node", "dist/index.js"]
```

### Build Arguments

None required - all configuration is via environment variables at runtime.

### Runtime Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `WSIM_BASE_URL` | No | WSIM API endpoint | `https://wsim-dev.banksim.ca` |
| `WSIM_CLIENT_ID` | **Yes** | Agent OAuth client ID | - |
| `WSIM_CLIENT_SECRET` | **Yes** | Agent OAuth client secret | - |
| `SSIM_BASE_URL` | No | SSIM API endpoint | `https://ssim-dev.banksim.ca` |

### Image Tags

| Tag | Description |
|-----|-------------|
| `sacp-mcp:latest` | Latest stable build |
| `sacp-mcp:dev` | Development builds |
| `sacp-mcp:v{version}` | Versioned releases (e.g., `v1.0.0`) |

### Registry

Push to: `ghcr.io/jordancrombie/sacp-mcp` (GitHub Container Registry)

---

## Buildkite Pipeline Requirements

### Pipeline: `sacp-mcp`

```yaml
# .buildkite/pipeline.yml
steps:
  - label: ":npm: Install Dependencies"
    command: "npm ci"
    plugins:
      - docker#v5.10.0:
          image: "node:20-alpine"
          workdir: "/app"
          mount-checkout: true

  - label: ":typescript: Build"
    command: "npm run build"
    depends_on: "install"
    plugins:
      - docker#v5.10.0:
          image: "node:20-alpine"
          workdir: "/app"
          mount-checkout: true

  - label: ":docker: Build Image"
    commands:
      - "docker build -t sacp-mcp:${BUILDKITE_BUILD_NUMBER} ."
      - "docker tag sacp-mcp:${BUILDKITE_BUILD_NUMBER} ghcr.io/jordancrombie/sacp-mcp:${BUILDKITE_BUILD_NUMBER}"
      - "docker tag sacp-mcp:${BUILDKITE_BUILD_NUMBER} ghcr.io/jordancrombie/sacp-mcp:dev"
    depends_on: "build"

  - label: ":rocket: Push to Registry"
    commands:
      - "docker push ghcr.io/jordancrombie/sacp-mcp:${BUILDKITE_BUILD_NUMBER}"
      - "docker push ghcr.io/jordancrombie/sacp-mcp:dev"
    depends_on: "docker-build"
    branches: "main"

  - label: ":test_tube: Integration Test"
    command: "npm test"
    depends_on: "build"
    plugins:
      - docker#v5.10.0:
          image: "node:20-alpine"
          workdir: "/app"
          mount-checkout: true
          environment:
            - "WSIM_BASE_URL=https://wsim-dev.banksim.ca"
            - "SSIM_BASE_URL=https://ssim-dev.banksim.ca"
            - "WSIM_CLIENT_ID"
            - "WSIM_CLIENT_SECRET"
```

### Required Buildkite Secrets

| Secret Name | Description |
|-------------|-------------|
| `WSIM_CLIENT_ID` | Test agent client ID for integration tests |
| `WSIM_CLIENT_SECRET` | Test agent client secret for integration tests |
| `GHCR_TOKEN` | GitHub Container Registry push token |

### Trigger Conditions

- **On push to `main`**: Full build + push to registry
- **On PR**: Build + test only (no push)

---

## Usage After Deployment

### Option 1: Direct from Docker

Users can run the MCP server directly from Docker:

```bash
# Pull the image
docker pull ghcr.io/jordancrombie/sacp-mcp:latest

# Run (for testing - MCP uses stdio)
docker run -it \
  -e WSIM_CLIENT_ID=agent_xxx \
  -e WSIM_CLIENT_SECRET=secret \
  ghcr.io/jordancrombie/sacp-mcp:latest
```

### Option 2: Claude Desktop Config

```json
{
  "mcpServers": {
    "sacp": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "WSIM_CLIENT_ID=agent_xxx",
        "-e", "WSIM_CLIENT_SECRET=secret",
        "ghcr.io/jordancrombie/sacp-mcp:latest"
      ]
    }
  }
}
```

### Option 3: Local Node Installation

```bash
# Clone and build locally
cd mcp-server
npm install
npm run build

# Run
WSIM_CLIENT_ID=agent_xxx WSIM_CLIENT_SECRET=secret node dist/index.js
```

---

## Testing Requirements

### Pre-requisites for Integration Tests

1. A registered test agent in WSIM dev environment
2. Test agent credentials (client_id, client_secret)
3. Network access to:
   - `https://wsim-dev.banksim.ca`
   - `https://ssim-dev.banksim.ca`

### Test Coverage

| Test | Description |
|------|-------------|
| `test:auth` | Verify OAuth token acquisition from WSIM |
| `test:discovery` | Verify UCP discovery from SSIM |
| `test:products` | Verify product browsing |
| `test:checkout` | Verify checkout session creation |
| `test:payment` | Verify payment token request |

---

## File Structure

```
mcp-server/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── clients/
│   │   ├── ssim.ts           # SSIM API client
│   │   └── wsim.ts           # WSIM API client
│   └── tools/                # (reserved for future tool modules)
├── dist/                     # Compiled output (gitignored)
├── package.json
├── tsconfig.json
├── Dockerfile                # (to be created by build team)
├── README.md
└── DEPLOYMENT.md             # This file
```

---

## Questions for Build Team

1. **Registry**: Confirm `ghcr.io/jordancrombie/sacp-mcp` is acceptable, or should we use a different registry?

2. **Secrets**: Should test agent credentials be created specifically for CI, or reuse existing dev credentials?

3. **Versioning**: Should we auto-increment version from `package.json` or use build numbers?

---

## Contact

**MCP Server Owner**: PM
**Build Team Contact**: [TBD]
