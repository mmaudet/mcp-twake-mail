# Contributing to mcp-twake-mail

Thank you for your interest in contributing to mcp-twake-mail! This document provides guidelines and instructions for contributing.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/<your-username>/mcp-twake-mail.git
   cd mcp-twake-mail
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Build the project:
   ```bash
   npm run build
   ```
5. Run tests to verify your setup:
   ```bash
   npm test
   ```

## Development Workflow

### Branch naming

Use descriptive branch names:
- `feat/email-filtering` for new features
- `fix/auth-timeout` for bug fixes
- `docs/readme-update` for documentation changes
- `refactor/jmap-client` for refactoring
- `test/attachment-download` for test additions

### Making changes

1. Create a feature branch from `master`:
   ```bash
   git checkout -b feat/your-feature
   ```
2. Make your changes following the code style guidelines below
3. Run the build to check for TypeScript errors:
   ```bash
   npm run build
   ```
4. Run tests:
   ```bash
   npm test
   ```
5. Commit your changes with a clear message (see commit conventions below)
6. Push to your fork and open a Pull Request

### Watch mode

For rapid iteration during development:
```bash
npm run dev
```
This runs the TypeScript compiler in watch mode, recompiling on file changes.

## Code Style Guidelines

### TypeScript

- **Strict mode** is enabled -- all code must pass strict type checking
- Use **ESM imports** with `.js` extensions (required by the MCP SDK):
  ```typescript
  import { JMAPClient } from './jmap/client.js';
  ```
- Use `type` imports when importing only types:
  ```typescript
  import type { Logger } from 'pino';
  ```
- Prefer `interface` over `type` for object shapes
- Use explicit return types on exported functions

### Project structure

```
src/
  auth/            # OIDC flow, token storage, token refresh
  config/          # Environment validation (Zod), logger setup
  jmap/            # JMAP client, session management
  mcp/             # MCP server setup
    tools/         # MCP tool implementations
  transformers/    # Email/Mailbox data transformation
  types/           # Shared TypeScript types
tests/
  unit/            # Unit tests
  integration/     # Integration tests (if any)
```

### Conventions

- All logs go to **stderr** (stdout is reserved for MCP JSON-RPC protocol)
- JMAP responses are transformed to AI-friendly DTOs in the tools layer
- Tools use Zod schemas for parameter validation
- Error messages follow "What went wrong" + "How to fix it" pattern

## Commit Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short description>

[optional body]
```

Types:
- `feat:` -- new feature
- `fix:` -- bug fix
- `docs:` -- documentation changes
- `test:` -- adding or updating tests
- `refactor:` -- code refactoring (no functional change)
- `chore:` -- build, CI, dependency updates

Examples:
```
feat: add attachment download with auto-save for large files
fix: use textBody instead of bodyStructure for draft creation
docs: update README with OIDC configuration
test: add unit tests for email-sending tools
```

## Pull Request Guidelines

- Keep PRs focused on a single concern
- Include a clear description of what changes and why
- Ensure all tests pass (`npm test`)
- Ensure the build succeeds (`npm run build`)
- Update documentation if your change affects the public API or configuration
- Link related issues in the PR description

## Reporting Bugs

Use the [Bug Report](https://github.com/linagora/mcp-twake-mail/issues/new?template=bug_report.md) issue template. Include:
- Steps to reproduce
- Expected vs actual behavior
- Environment details (Node.js version, OS, JMAP server)

## Requesting Features

Use the [Feature Request](https://github.com/linagora/mcp-twake-mail/issues/new?template=feature_request.md) issue template. Describe:
- The use case or problem
- Your proposed solution
- Any alternatives you considered

## License

By contributing to mcp-twake-mail, you agree that your contributions will be licensed under the [AGPL-3.0 license](LICENSE). All modifications must be shared under the same terms.
