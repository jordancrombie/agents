# SACP Gateway Privacy Policy

**Last Updated:** January 2026
**Version:** 1.0

---

## Important: This is a Simulation

**SACP (SimToolBox Agent Commerce Protocol) is an educational sandbox environment for demonstrating AI agent commerce capabilities. This is NOT a production financial service.**

### Please Treat This Like a Simulation

This platform is designed for:
- Learning and experimenting with AI-driven commerce
- Demonstrating agent-to-agent payment flows
- Testing MCP (Model Context Protocol) integrations
- Educational purposes and proof-of-concept development

This platform is **NOT** designed for:
- Real financial transactions
- Storing sensitive personal information
- Production use cases requiring robust security

---

## Do NOT Use Real Personal Information

**We strongly advise against entering any real personal information.**

When using SACP Gateway, please use:
- **Fake email addresses** (e.g., `testuser123@fake.com`, `demo@example.com`)
- **Fictional names** (e.g., "Test User", "Demo Buyer")
- **Made-up addresses** (e.g., "123 Test St, Toronto, ON")
- **Test data only** for all fields

**Why?** This platform does not implement the security measures that real banks, financial institutions, or payment networks use to protect sensitive data. We do not encrypt data at rest with bank-grade security, we do not have SOC 2 compliance, and we do not monitor for data breaches like a production system would.

---

## What Data We Collect

For the purpose of demonstrating AI commerce functionality, we may store:

| Data Type | Purpose | Retention |
|-----------|---------|-----------|
| Email address (provided) | Identifying checkout sessions, push notifications | Session duration |
| Name (provided) | Simulated order fulfillment | Session duration |
| Shipping address (provided) | Simulated order fulfillment | Session duration |
| Cart/order data | Demonstrating checkout flow | Session duration |
| AI agent identifiers | Session management | Session duration |

**Note:** Most data is stored in-memory and is lost when the server restarts. We do not maintain long-term databases of user information.

---

## Data Security Limitations

**This is an educational platform.** We explicitly disclaim robust production-grade security:

- Data may be stored in-memory without encryption
- No SOC 2, PCI-DSS, or similar compliance
- No dedicated security team monitoring for breaches
- No formal incident response procedures
- Server logs may contain request data

**If you enter real personal information against our advice, you do so at your own risk.**

---

## Third-Party Services

SACP Gateway interacts with other SimToolBox simulation services:

- **WSIM** (Wallet Simulator) - Simulated wallet and payment authorization
- **SSIM** (Store Simulator) - Simulated merchant/store backend
- **BSIM** (Bank Simulator) - Simulated banking infrastructure

All of these are educational sandbox services with similar security limitations.

---

## AI Agent Access

This platform is specifically designed for AI agent access:

- AI agents (ChatGPT, Claude, Gemini, etc.) may make API calls on your behalf
- OAuth device authorization codes are used to authorize AI agent actions
- Payment authorization requests may be sent to your mobile device
- All transactions are simulated - no real money is involved

---

## Your Rights

You may:
- **Stop using the service** at any time
- **Request information** about data associated with your session
- **Clear your session** by closing your browser/app

Since most data is session-based and in-memory, it is automatically cleared when sessions expire or the server restarts.

---

## Contact

For questions about this privacy policy or the SACP project:

- **GitHub Issues:** [github.com/jordancrombie/SimToolBox](https://github.com/jordancrombie/SimToolBox/issues)
- **Project Documentation:** See the `docs/` directory in the repository

---

## Changes to This Policy

We may update this privacy policy as the platform evolves. Changes will be reflected in the "Last Updated" date above.

---

## Summary

**This is a simulation. Please treat it like one.**

- Use fake/test data only
- Do not enter real personal information
- No real money is ever transacted
- Security is educational-grade, not production-grade
- You assume all risk for any real data you choose to enter

Thank you for exploring AI-driven commerce with SimToolBox!
