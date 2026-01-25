# SACP MCP Server & HTTP Gateway - Deployment Specification

**For**: Build Team
**Date**: 2026-01-24
**Version**: 1.1.0
**Status**: Ready for Pipeline Creation

---

## Overview

The SACP server now supports **two modes**:

| Mode | Transport | Use Case | Runs As |
|------|-----------|----------|---------|
| **MCP** | stdio | Claude Desktop, MCP-compatible clients | Subprocess |
| **HTTP Gateway** | REST API | ChatGPT, Gemini, any HTTP client | Web Service |

**Key Change**: The HTTP Gateway is the primary deployment target for production. It enables any AI agent to interact with SACP via standard HTTP calls.

---

## What Was Built

### New File: `src/http-gateway.ts`

An Express.js HTTP server that exposes SACP functionality as a REST API:

```
Endpoints:
├── GET  /tools              - Discovery (list all tools)
├── GET  /health             - Health check
├── POST /auth/register      - Start pairing code registration
├── GET  /auth/status/:id    - Poll registration status
├── GET  /auth/session       - Get current session info
├── GET  /products           - Browse products (no auth)
├── GET  /products/:id       - Get product details
├── POST /checkout           - Create checkout (requires session)
├── PATCH /checkout/:id      - Update checkout
├── POST /checkout/:id/complete - Complete purchase
├── GET  /checkout/:id/step-up/:id - Poll step-up status
├── GET  /orders/:id         - Get order status
└── POST /execute            - MCP-style tool execution
```

### Updated Files

| File | Changes |
|------|---------|
| `package.json` | Added express, cors dependencies; new scripts |
| `Dockerfile` | Supports both MCP and HTTP Gateway modes |

### New Dependencies

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17"
  }
}
```

### New npm Scripts

```json
{
  "scripts": {
    "start:gateway": "node dist/http-gateway.js",
    "dev:gateway": "tsx src/http-gateway.ts"
  }
}
```

---

## Docker Specification

### Dockerfile (Updated)

```dockerfile
# SACP MCP Server & HTTP Gateway - Multi-stage Docker Build
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

ENV PORT=3000
ENV WSIM_BASE_URL=https://wsim.banksim.ca
ENV SSIM_BASE_URL=https://ssim.banksim.ca

EXPOSE 3000

# Default: MCP mode. Override CMD for Gateway mode.
ENTRYPOINT ["node"]
CMD ["dist/index.js"]
```

### Running Modes

```bash
# MCP Mode (default) - for distribution
docker run -it sacp-mcp

# HTTP Gateway Mode - for production deployment
docker run -p 3000:3000 sacp-mcp node dist/http-gateway.js
```

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `PORT` | No | HTTP Gateway port | `3000` |
| `WSIM_BASE_URL` | No | WSIM API endpoint | `https://wsim.banksim.ca` |
| `SSIM_BASE_URL` | No | SSIM API endpoint | `https://ssim.banksim.ca` |
| `WSIM_CLIENT_ID` | MCP only | Agent OAuth client ID | - |
| `WSIM_CLIENT_SECRET` | MCP only | Agent OAuth client secret | - |

**Note**: HTTP Gateway mode does NOT require pre-configured credentials. It handles agent registration dynamically via the pairing code flow.

### Image Tags

| Tag | Description |
|-----|-------------|
| `sacp-gateway:latest` | Latest stable HTTP Gateway build |
| `sacp-gateway:dev` | Development builds |
| `sacp-gateway:v{version}` | Versioned releases (e.g., `v1.1.0`) |
| `sacp-mcp:latest` | MCP-only image (for backward compatibility) |

### Registry

Push to: `ghcr.io/jordancrombie/sacp-gateway` (GitHub Container Registry)

### Production URL

**Live Gateway**: https://sacp.banksim.ca

---

## Buildkite Pipeline Requirements

### Pipeline: `sacp-gateway`

```yaml
# .buildkite/pipeline.yml
steps:
  - label: ":npm: Install Dependencies"
    key: "install"
    command: "npm ci"
    plugins:
      - docker#v5.10.0:
          image: "node:20-alpine"
          workdir: "/app"
          mount-checkout: true

  - label: ":typescript: Build"
    key: "build"
    command: "npm run build"
    depends_on: "install"
    plugins:
      - docker#v5.10.0:
          image: "node:20-alpine"
          workdir: "/app"
          mount-checkout: true

  - label: ":test_tube: Test"
    key: "test"
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

  - label: ":docker: Build Image"
    key: "docker-build"
    commands:
      - "docker build -t sacp-gateway:${BUILDKITE_BUILD_NUMBER} ."
      - "docker tag sacp-gateway:${BUILDKITE_BUILD_NUMBER} ghcr.io/jordancrombie/sacp-gateway:${BUILDKITE_BUILD_NUMBER}"
      - "docker tag sacp-gateway:${BUILDKITE_BUILD_NUMBER} ghcr.io/jordancrombie/sacp-gateway:dev"
    depends_on: "test"

  - label: ":rocket: Push to Registry"
    key: "push"
    commands:
      - "echo $GHCR_TOKEN | docker login ghcr.io -u jordancrombie --password-stdin"
      - "docker push ghcr.io/jordancrombie/sacp-gateway:${BUILDKITE_BUILD_NUMBER}"
      - "docker push ghcr.io/jordancrombie/sacp-gateway:dev"
    depends_on: "docker-build"
    branches: "main"

  - label: ":ship: Deploy to Production"
    key: "deploy"
    command: ".buildkite/deploy.sh"
    depends_on: "push"
    branches: "main"
    concurrency: 1
    concurrency_group: "sacp-gateway-deploy"
```

### Deployment Script (`.buildkite/deploy.sh`)

```bash
#!/bin/bash
set -euo pipefail

# Example for Kubernetes deployment
kubectl set image deployment/sacp-gateway \
  sacp-gateway=ghcr.io/jordancrombie/sacp-gateway:${BUILDKITE_BUILD_NUMBER} \
  -n sacp

# Or for Docker Compose / Swarm
# docker service update --image ghcr.io/jordancrombie/sacp-gateway:${BUILDKITE_BUILD_NUMBER} sacp-gateway
```

### Required Buildkite Secrets

| Secret Name | Description |
|-------------|-------------|
| `GHCR_TOKEN` | GitHub Container Registry push token |

**Note**: No WSIM credentials needed for HTTP Gateway deployment - credentials are handled per-session via the pairing flow.

---

## Production Deployment Options

### Option 1: Kubernetes

```yaml
# kubernetes/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sacp-gateway
  namespace: sacp
spec:
  replicas: 2
  selector:
    matchLabels:
      app: sacp-gateway
  template:
    metadata:
      labels:
        app: sacp-gateway
    spec:
      containers:
      - name: sacp-gateway
        image: ghcr.io/jordancrombie/sacp-gateway:latest
        command: ["node", "dist/http-gateway.js"]
        ports:
        - containerPort: 3000
        env:
        - name: PORT
          value: "3000"
        - name: WSIM_BASE_URL
          value: "https://wsim.banksim.ca"
        - name: SSIM_BASE_URL
          value: "https://ssim.banksim.ca"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: sacp-gateway
  namespace: sacp
spec:
  selector:
    app: sacp-gateway
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: sacp-gateway
  namespace: sacp
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - sacp.banksim.ca
    secretName: sacp-gateway-tls
  rules:
  - host: sacp.banksim.ca
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: sacp-gateway
            port:
              number: 80
```

### Option 2: Docker Compose

```yaml
# docker-compose.yml
version: '3.8'
services:
  sacp-gateway:
    image: ghcr.io/jordancrombie/sacp-gateway:latest
    command: ["node", "dist/http-gateway.js"]
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - WSIM_BASE_URL=https://wsim.banksim.ca
      - SSIM_BASE_URL=https://ssim.banksim.ca
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped
```

### Option 3: Railway / Fly.io / Render

For PaaS deployments, set:
- **Build Command**: `npm ci && npm run build`
- **Start Command**: `node dist/http-gateway.js`
- **Port**: `3000`
- **Health Check**: `GET /health`

---

## Production Considerations

### Session Storage

Currently, sessions are stored in-memory. For production with multiple replicas:

```typescript
// Future enhancement: Redis session store
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

// Replace Map with Redis operations
```

### CORS Configuration

The gateway allows all origins by default. For production, restrict:

```typescript
app.use(cors({
  origin: ['https://chat.openai.com', 'https://gemini.google.com'],
  credentials: true,
}));
```

### Rate Limiting

Add rate limiting for production:

```bash
npm install express-rate-limit
```

### Logging

Consider adding structured logging:

```bash
npm install pino pino-http
```

---

## Testing

### Local Testing

```bash
# Start gateway locally
npm run dev:gateway

# Test endpoints
curl http://localhost:3000/health
curl http://localhost:3000/tools
curl http://localhost:3000/products
```

### Integration Test

```bash
# Full flow test
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"pairing_code":"WSIM-XXXXXX-XXXXXX","agent_name":"Test Agent"}'
```

---

## File Structure

```
mcp-server/
├── src/
│   ├── index.ts              # MCP server (stdio)
│   ├── http-gateway.ts       # HTTP Gateway (Express)
│   └── clients/
│       ├── ssim.ts           # SSIM API client
│       └── wsim.ts           # WSIM API client
├── dist/                     # Compiled output
├── package.json
├── tsconfig.json
├── Dockerfile
├── README.md
└── DEPLOYMENT.md             # This file
```

---

## Rollback Procedure

```bash
# Kubernetes
kubectl rollout undo deployment/sacp-gateway -n sacp

# Docker
docker service update --rollback sacp-gateway
```

---

## Monitoring Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness/readiness probe |
| `GET /tools` | Verify API is responding |

---

## Contact

**MCP Server Owner**: PM
**Build Team Contact**: [TBD]
**Slack Channel**: #sacp-gateway
