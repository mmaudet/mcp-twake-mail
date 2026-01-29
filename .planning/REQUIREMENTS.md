# Requirements: mcp-twake-mail

**Defined:** 2026-01-29
**Core Value:** AI assistants can interact with JMAP email servers through natural language

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [ ] **FOUND-01**: Project initializes with TypeScript ESM, Node 20+ compatibility
- [ ] **FOUND-02**: Zod validates configuration from environment variables (fail-fast)
- [ ] **FOUND-03**: Pino logger writes to stderr only (stdout reserved for MCP)
- [ ] **FOUND-04**: Custom error classes with AI-friendly messages ("What went wrong" + "How to fix it")
- [ ] **FOUND-05**: HTTPS enforced except localhost for development

### Authentication

- [ ] **AUTH-01**: User can authenticate with Basic auth (username/password)
- [ ] **AUTH-02**: User can authenticate with Bearer token (JWT)
- [ ] **AUTH-03**: User can authenticate with OIDC (OAuth2 + PKCE flow)
- [ ] **AUTH-04**: OIDC uses S256 code challenge method (not plain)
- [ ] **AUTH-05**: Tokens stored securely in ~/.mcp-twake-mail/tokens.json with 0600 permissions
- [ ] **AUTH-06**: Access tokens auto-refresh using refresh token
- [ ] **AUTH-07**: Token refresh failures prompt user to re-authenticate

### JMAP Client

- [ ] **JMAP-01**: Client fetches JMAP session to discover apiUrl, accountId, capabilities
- [ ] **JMAP-02**: Client supports request batching (multiple methodCalls in single request)
- [ ] **JMAP-03**: Client handles JMAP errors at request, method, and record levels
- [ ] **JMAP-04**: Client implements configurable fetch timeout (default 30s)
- [ ] **JMAP-05**: Client tracks JMAP state strings for incremental operations

### Email Tools

- [ ] **EMAIL-01**: send_email tool sends new email with to, cc, bcc, subject, body, htmlBody
- [ ] **EMAIL-02**: reply_email tool replies to email with proper threading headers (In-Reply-To, References)
- [ ] **EMAIL-03**: get_email tool retrieves email by ID with configurable properties
- [ ] **EMAIL-04**: search_emails tool queries emails with filters (mailbox, from, to, subject, text, date range, hasAttachment, unreadOnly, flagged, limit)
- [ ] **EMAIL-05**: delete_email tool destroys email by ID
- [ ] **EMAIL-06**: mark_as_read tool sets $seen keyword on email
- [ ] **EMAIL-07**: mark_as_unread tool removes $seen keyword from email
- [ ] **EMAIL-08**: move_email tool changes email's mailboxIds to target mailbox
- [ ] **EMAIL-09**: add_label tool adds mailbox to email's mailboxIds
- [ ] **EMAIL-10**: remove_label tool removes mailbox from email's mailboxIds
- [ ] **EMAIL-11**: get_email_labels tool returns mailboxes associated with email
- [ ] **EMAIL-12**: create_draft tool creates email in Drafts mailbox with $draft keyword

### Mailbox Tools

- [ ] **MBOX-01**: get_mailbox tool retrieves mailbox by ID with metadata (name, role, counts)
- [ ] **MBOX-02**: list_mailboxes tool returns all mailboxes, optionally filtered by role

### Thread Tools

- [ ] **THREAD-01**: get_thread tool retrieves thread by ID
- [ ] **THREAD-02**: get_thread_emails tool returns all emails in a thread

### Attachment Tools

- [ ] **ATTACH-01**: get_attachments tool lists attachment metadata for an email (blobId, name, type, size, isInline)
- [ ] **ATTACH-02**: Attachments can be filtered by excludeInline and mimeTypeFilter parameters

### MCP Server

- [ ] **MCP-01**: Server initializes with @modelcontextprotocol/sdk
- [ ] **MCP-02**: All tools include MCP annotations (readOnlyHint, destructiveHint, idempotentHint, openWorldHint)
- [ ] **MCP-03**: Server connects via stdio transport
- [ ] **MCP-04**: Server validates JMAP connection at startup before accepting requests

### CLI

- [ ] **CLI-01**: `npx mcp-twake-mail` starts MCP server (default mode)
- [ ] **CLI-02**: `npx mcp-twake-mail setup` launches interactive configuration wizard
- [ ] **CLI-03**: Setup wizard prompts for JMAP URL and auth method
- [ ] **CLI-04**: Setup wizard triggers OIDC browser flow when selected
- [ ] **CLI-05**: Setup wizard tests JMAP connection and displays account info
- [ ] **CLI-06**: Setup wizard generates Claude Desktop config JSON
- [ ] **CLI-07**: Setup wizard offers to write config to claude_desktop_config.json
- [ ] **CLI-08**: `npx mcp-twake-mail auth` re-runs OIDC authentication only
- [ ] **CLI-09**: `npx mcp-twake-mail check` verifies configuration and connection
- [ ] **CLI-10**: `npx mcp-twake-mail --version` displays version
- [ ] **CLI-11**: `npx mcp-twake-mail --help` displays usage

### Transformers

- [ ] **TRANS-01**: Email transformer converts JMAP Email to SimplifiedEmail DTO
- [ ] **TRANS-02**: Mailbox transformer converts JMAP Mailbox to SimplifiedMailbox DTO
- [ ] **TRANS-03**: Transformers convert JMAP keywords ($seen, $flagged, $draft) to boolean flags

### Quality

- [ ] **QUAL-01**: Test coverage > 80%
- [ ] **QUAL-02**: No TypeScript errors or ESLint warnings
- [ ] **QUAL-03**: Response time < 2s for simple operations
- [ ] **QUAL-04**: Package installable via `npx mcp-twake-mail` without errors

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Attachments

- **ATTACH-03**: User can download attachment content via blob endpoint
- **ATTACH-04**: User can upload attachments when sending email

### Advanced

- **ADV-01**: User can forward email (via send_email with original content)
- **ADV-02**: Batch operations process up to 50 emails at once
- **ADV-03**: JMAP EventSource push notifications for real-time updates
- **ADV-04**: Multiple account support in single config

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Mailbox create/delete/rename | Focus on email operations, not folder management |
| Email forwarding as separate tool | Can be done via send_email with original content |
| Rich text editor in CLI | Wrong UI paradigm for MCP stdio transport |
| Claude CLI config auto-update | Desktop only for v1 per user decision |
| Multiple accounts | Complicates auth, token storage; defer to v2 |
| Attachment upload | Security-sensitive, focus on download first |
| Training AI on user emails | Privacy violation, zero-retention policy |
| Automatic email sending without confirmation | Over-automation anti-pattern |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Pending |
| FOUND-02 | Phase 1 | Pending |
| FOUND-03 | Phase 1 | Pending |
| FOUND-04 | Phase 1 | Pending |
| FOUND-05 | Phase 1 | Pending |
| JMAP-01 | Phase 1 | Pending |
| JMAP-02 | Phase 1 | Pending |
| JMAP-03 | Phase 1 | Pending |
| JMAP-04 | Phase 1 | Pending |
| JMAP-05 | Phase 1 | Pending |
| AUTH-01 | Phase 2 | Pending |
| AUTH-02 | Phase 2 | Pending |
| AUTH-03 | Phase 2 | Pending |
| AUTH-04 | Phase 2 | Pending |
| AUTH-05 | Phase 2 | Pending |
| AUTH-06 | Phase 2 | Pending |
| AUTH-07 | Phase 2 | Pending |
| EMAIL-03 | Phase 3 | Pending |
| EMAIL-04 | Phase 3 | Pending |
| EMAIL-11 | Phase 3 | Pending |
| MBOX-01 | Phase 3 | Pending |
| MBOX-02 | Phase 3 | Pending |
| MCP-01 | Phase 3 | Pending |
| MCP-02 | Phase 3 | Pending |
| MCP-03 | Phase 3 | Pending |
| MCP-04 | Phase 3 | Pending |
| TRANS-01 | Phase 3 | Pending |
| TRANS-02 | Phase 3 | Pending |
| TRANS-03 | Phase 3 | Pending |
| EMAIL-05 | Phase 4 | Pending |
| EMAIL-06 | Phase 4 | Pending |
| EMAIL-07 | Phase 4 | Pending |
| EMAIL-08 | Phase 4 | Pending |
| EMAIL-09 | Phase 4 | Pending |
| EMAIL-10 | Phase 4 | Pending |
| EMAIL-12 | Phase 4 | Pending |
| EMAIL-01 | Phase 5 | Pending |
| EMAIL-02 | Phase 5 | Pending |
| THREAD-01 | Phase 6 | Pending |
| THREAD-02 | Phase 6 | Pending |
| ATTACH-01 | Phase 6 | Pending |
| ATTACH-02 | Phase 6 | Pending |
| CLI-01 | Phase 6 | Pending |
| CLI-02 | Phase 6 | Pending |
| CLI-03 | Phase 6 | Pending |
| CLI-04 | Phase 6 | Pending |
| CLI-05 | Phase 6 | Pending |
| CLI-06 | Phase 6 | Pending |
| CLI-07 | Phase 6 | Pending |
| CLI-08 | Phase 6 | Pending |
| CLI-09 | Phase 6 | Pending |
| CLI-10 | Phase 6 | Pending |
| CLI-11 | Phase 6 | Pending |
| QUAL-01 | Phase 6 | Pending |
| QUAL-02 | Phase 6 | Pending |
| QUAL-03 | Phase 6 | Pending |
| QUAL-04 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 54 total
- Mapped to phases: 54
- Unmapped: 0 ✓

---
*Requirements defined: 2026-01-29*
*Last updated: 2026-01-29 after roadmap creation*
