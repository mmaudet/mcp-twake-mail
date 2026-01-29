# mcp-twake-mail

## What This Is

An MCP (Model Context Protocol) server exposing JMAP email operations for Twake Mail and Apache James. It enables AI assistants like Claude Desktop and Claude CLI to natively read, search, send, and manage emails through a standards-compliant interface. This complements mcp-twake-dav (calendar/contacts) to form a complete sovereign productivity suite for LINAGORA's ecosystem.

## Core Value

AI assistants can interact with JMAP email servers through natural language — searching emails, composing replies, organizing messages — without users leaving their AI workflow.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] MCP server exposing JMAP operations via stdio transport
- [ ] Full JMAP email operations: send, reply, get, search, delete, mark read/unread, move, labels
- [ ] JMAP mailbox operations: get, list
- [ ] JMAP thread operations: get, get emails in thread
- [ ] Attachment handling: list and download attachments
- [ ] Basic authentication (username/password)
- [ ] Bearer token authentication (JWT)
- [ ] OIDC authentication with OAuth2 + PKCE flow
- [ ] Secure token storage with auto-refresh
- [ ] Interactive CLI wizard (`npx mcp-twake-mail setup`)
- [ ] CLI auth command for OIDC re-authentication
- [ ] CLI check command for configuration verification
- [ ] Zod-validated configuration from environment variables
- [ ] Claude Desktop config auto-update in wizard
- [ ] AI-friendly error messages with fix suggestions
- [ ] Compatible with Apache James (jmap.linagora.com)
- [ ] Published npm package installable via `npx mcp-twake-mail`

### Out of Scope

- Claude CLI config auto-update — Desktop only for v1
- JMAP EventSource push notifications — polling sufficient for v1
- Mailbox create/delete/rename — focus on email operations
- Email forwarding as separate tool — can be done via send_email
- Rich text editor in CLI — plain text/HTML body only
- Attachment upload — focus on download in v1
- Multiple account management — single account per config

## Context

**Reference implementations:**
- `mcp-twake-dav` (github.com/mmaudet/mcp-twake-dav) — architecture patterns, ESM setup, error handling, CLI wizard
- `n8n-nodes-jmap` (github.com/mmaudet/n8n-nodes-jmap) — JMAP protocol implementation, session management, request batching

**Target server:**
- Production: `https://jmap.linagora.com/jmap` (Apache James)
- Standards: RFC 8620 (JMAP Core), RFC 8621 (JMAP Mail)

**JMAP capabilities used:**
- `urn:ietf:params:jmap:core`
- `urn:ietf:params:jmap:mail`
- `urn:ietf:params:jmap:submission` (for sending)

**Integration target:**
- Claude Desktop via `claude_desktop_config.json`
- Claude CLI via manual config

## Constraints

- **Runtime**: Node.js >= 18.0.0 — required for native fetch, ESM support
- **License**: AGPL-3.0 — matches mcp-twake-dav and LINAGORA policy
- **MCP Transport**: stdio only — standard for local MCP servers
- **Logging**: stderr only — stdout reserved for MCP JSON-RPC
- **Auth storage**: `~/.mcp-twake-mail/tokens.json` with 0600 permissions
- **HTTPS**: Required except localhost for development
- **Architecture**: Must mirror mcp-twake-dav patterns for maintainability

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Custom JMAP client (not library) | Full control, match PRD spec, lightweight | — Pending |
| All auth methods in v1 | User requested parallel build | — Pending |
| openid-client for OIDC | Mature, well-maintained, PKCE support | — Pending |
| Zod 4 for validation | Matches mcp-twake-dav, excellent TypeScript DX | — Pending |
| Pino for logging | Matches mcp-twake-dav, fast, JSON-native | — Pending |
| Desktop-only config update | User decision to limit v1 scope | — Pending |

---
*Last updated: 2026-01-29 after initialization*
