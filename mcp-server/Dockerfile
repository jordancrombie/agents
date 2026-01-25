# SACP MCP Server & HTTP Gateway - Multi-stage Docker Build
#
# Supports two modes:
# - MCP: Traditional stdio-based MCP server (default)
# - Gateway: HTTP API for external AI agents (ChatGPT, Gemini, etc.)

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

# Environment variables
ENV PORT=3000
ENV WSIM_BASE_URL=https://wsim.banksim.ca
ENV SSIM_BASE_URL=https://ssim.banksim.ca

# Expose port for HTTP gateway mode
EXPOSE 3000

# Default to MCP mode; override with CMD for gateway mode
# MCP mode:     docker run sacp-mcp
# Gateway mode: docker run -p 3000:3000 sacp-mcp node dist/http-gateway.js
ENTRYPOINT ["node"]
CMD ["dist/index.js"]
