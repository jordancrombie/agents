# SimToolBox Agent Commerce Protocol (SACP)

An open protocol enabling AI agents to discover products, initiate purchases, and complete transactions within the SimToolBox ecosystem.

## Overview

This repository contains the design documentation, specifications, and coordination materials for implementing AI agent commerce capabilities across the SimToolBox suite of simulators.

### Goals

1. **Enable AI agents** to make purchases on behalf of human users
2. **Integrate with WSIM** (Wallet) for authentication, authorization, and spending controls
3. **Align with industry standards** (UCP, AP2, ACP) for future interoperability
4. **Support tiered approval** - auto-approve small purchases, step-up auth for larger ones

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           AI AGENT                                   │
│                (ChatGPT, Claude, Custom Agents)                      │
└──────────┬───────────────────┬───────────────────────┬──────────────┘
           │                   │                       │
    1. DISCOVER          2. SHOP                 3. PAY
    (UCP/MCP)           (REST API)              (AP2-style)
           │                   │                       │
           ▼                   ▼                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                            SSIM                                       │
│                    (Store Simulator)                                  │
│   • /.well-known/ucp discovery      • Agent checkout sessions        │
│   • Product catalog API             • MCP tools for AI               │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                            WSIM                                       │
│               (Wallet - Credentials Provider)                         │
│   • Agent registration             • Spending limit enforcement       │
│   • Payment token issuance         • Step-up authentication          │
│   • Mandate signing                • Human approval flow             │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                            NSIM                                       │
│                    (Payment Network)                                  │
│   • Agent context in transactions  • Risk signal forwarding          │
│   • Webhook notifications          • Transaction reporting           │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                            BSIM                                       │
│                    (Banking Simulator)                                │
│   • Agent transaction visibility   • Account history integration     │
└──────────────────────────────────────────────────────────────────────┘
```

## Documentation

| Document | Description |
|----------|-------------|
| [Protocol Design](docs/PROTOCOL_DESIGN.md) | Full protocol specification |
| [SSIM Requirements](docs/teams/SSIM_REQUIREMENTS.md) | Store team deliverables |
| [WSIM Requirements](docs/teams/WSIM_REQUIREMENTS.md) | Wallet team deliverables |
| [NSIM Requirements](docs/teams/NSIM_REQUIREMENTS.md) | Payment network deliverables |
| [BSIM Requirements](docs/teams/BSIM_REQUIREMENTS.md) | Banking deliverables |

## Key Flows

### Flow 1: Agent Registration
Human registers an agent in their wallet (WSIM):
1. Navigate to Settings > AI Agents
2. Configure name, permissions, spending limits
3. Confirm with passkey authentication
4. Receive OAuth client credentials

### Flow 2: Auto-Approved Purchase
Agent makes a small purchase within limits:
1. Agent discovers store via `/.well-known/ucp`
2. Agent creates checkout session with items
3. Agent requests payment token from WSIM
4. WSIM validates limits → approved
5. SSIM completes payment via NSIM
6. Order confirmed

### Flow 3: Step-Up Purchase
Agent makes a purchase exceeding limits:
1. Same as above, but WSIM detects limit exceeded
2. WSIM sends push notification to human
3. Human reviews and approves in wallet app
4. WSIM issues payment token with signed mandate
5. Purchase completes

## Industry Alignment

This protocol aligns with emerging standards:

| Protocol | Source | Alignment |
|----------|--------|-----------|
| [UCP](https://developers.googleblog.com/under-the-hood-universal-commerce-protocol-ucp/) | Google + Shopify | Merchant discovery via `/.well-known/ucp` |
| [AP2](https://ap2-protocol.org/) | Google + Visa/Mastercard | Mandate structure, credentials provider pattern |
| [ACP](https://developers.openai.com/commerce/) | OpenAI + Stripe | Checkout session REST API |
| [MCP](https://modelcontextprotocol.io/) | Anthropic | AI model tool integration |

## Project Structure

```
agents/
├── docs/
│   ├── PROTOCOL_DESIGN.md      # Full protocol specification
│   └── teams/
│       ├── SSIM_REQUIREMENTS.md
│       ├── WSIM_REQUIREMENTS.md
│       ├── NSIM_REQUIREMENTS.md
│       └── BSIM_REQUIREMENTS.md
├── scripts/                     # Helper scripts
├── .buildkite/                  # CI/CD pipelines
├── .gitignore
└── README.md
```

## Timeline

### Phase 1: Core Protocol (Target: ~8 weeks)
- [ ] WSIM: Agent registration and OAuth
- [ ] WSIM: Payment token issuance with limits
- [ ] WSIM: Step-up authentication flow
- [ ] SSIM: UCP discovery endpoint
- [ ] SSIM: Agent checkout session API
- [ ] NSIM: Agent context in transactions
- [ ] BSIM: Agent transaction visibility

### Phase 2: Enhanced Capabilities
- [ ] SSIM: MCP server for AI tools
- [ ] WSIM: Intent mandates (pre-authorization)
- [ ] WSIM: Agent dashboard
- [ ] Mandate signing with cryptographic verification

### Phase 3: Ecosystem Expansion
- [ ] Agent-to-Agent (A2A) payments
- [ ] ContractSim integration (escrow)
- [ ] TransferSim integration (P2P)
- [ ] Direct BSIM/NSIM access for trusted agents

## Related Projects

| Project | Description | Repository |
|---------|-------------|------------|
| BSIM | Banking Simulator | [jordancrombie/bsim](https://github.com/jordancrombie/bsim) |
| SSIM | Store Simulator | [jordancrombie/ssim](https://github.com/jordancrombie/ssim) |
| WSIM | Wallet Simulator | [jordancrombie/wsim](https://github.com/jordancrombie/wsim) |
| NSIM | Payment Network | [jordancrombie/nsim](https://github.com/jordancrombie/nsim) |
| SimToolBox | Ecosystem Overview | [jordancrombie/SimToolBox](https://github.com/jordancrombie/SimToolBox) |

## Contributing

This is a coordination repository. Implementation work happens in the individual component repositories (SSIM, WSIM, NSIM, BSIM).

### Design Reviews
- Review protocol design document
- Comment on team requirements
- Propose changes via issues

## License

MIT

## Repository

https://github.com/jordancrombie/agents
