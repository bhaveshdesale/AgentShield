# Contributing to AgentShield

Thanks for your interest in contributing to AgentShield! This project is intended to evolve as an open-source project, and contributions, ideas, bug reports, and improvements are all welcome.

## Ways to Contribute

- 🐛 **Report bugs** — open an issue describing the problem, how to reproduce it, and what you expected instead.
- 💡 **Suggest features** — open an issue describing the use case before writing code, especially for larger changes.
- 📝 **Improve documentation** — fixes to the README, SRS, or code comments are always welcome.
- 🔧 **Submit code** — bug fixes, new policy rules, tests, or new features.

## Before You Start

For **larger changes** (new features, architectural changes, new policy types), please open an issue first to discuss the proposed direction before investing time in a pull request. This avoids duplicated effort and helps make sure the change fits the project's scope and safety model.

For **small fixes** (typos, minor bugs, small refactors), feel free to go straight to a pull request.

## Development Setup

Follow the [Getting Started](./README.md#getting-started) section in the README to get the backend and frontend running locally.

## Workflow

1. **Fork** the repository and clone your fork locally.
2. **Create a branch** for your change:
   ```bash
   git checkout -b feature/your-feature
   ```
3. **Make your changes.** Keep commits focused and descriptive.
4. **Test your changes:**
   ```bash
   # Backend
   cd server
   npm test
   npm run typecheck

   # Frontend
   cd client
   npm run typecheck
   npm run build
   ```
5. **Commit and push:**
   ```bash
   git add .
   git commit -m "Describe your change clearly"
   git push origin feature/your-feature
   ```
6. **Open a pull request** against the `main` branch, describing:
   - What the change does
   - Why it's needed
   - How you tested it

## Code Guidelines

- Match the existing TypeScript style used in `client/` and `server/`.
- Keep the **AI proposes, deterministic system authorizes** boundary intact — new features should not give the LLM the ability to bypass policy validation, approval gates, or authoritative order totals.
- Add or update tests for any behavior you change, especially anything in the policy engine or payment flow.
- Avoid introducing new dependencies unless necessary; keep the prototype lightweight.

## Security

Please **never** commit or include in a pull request:

- API keys
- Razorpay secrets
- Database credentials
- `.env` files
- Access tokens
- Any other private credentials

If you discover a security vulnerability, please report it privately rather than opening a public issue with exploit details.

## Code of Conduct

Be respectful and constructive. This project is meant to be a welcoming space for anyone interested in the safety and reliability of agentic commerce systems.

---

Thanks again for helping improve AgentShield! 🚀