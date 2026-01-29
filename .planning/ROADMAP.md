# Roadmap: mcp-twake-mail

## Overview

This roadmap delivers an MCP server that enables AI assistants to interact with JMAP email servers through natural language. We start with foundation (TypeScript setup, JMAP client with state management), build authentication (Basic/Bearer/OIDC with secure token storage), implement core read operations (search, get, list), add write operations (mark read, delete, move, labels), enable email creation (send, reply, drafts), and finish with advanced features (threads, attachments). Each phase delivers observable user capabilities following dependency order.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation & JMAP Client** - TypeScript setup, JMAP client with session management and state tracking
- [x] **Phase 2: Authentication System** - Basic, Bearer, and OIDC authentication with secure token storage
- [x] **Phase 3: Core Read Operations** - MCP server with read-only email and mailbox tools
- [ ] **Phase 4: Email Management Operations** - Write operations for marking, deleting, moving, and labeling emails
- [ ] **Phase 5: Email Creation & Sending** - Send, reply, and draft creation capabilities
- [ ] **Phase 6: Advanced Features & Polish** - Threads, attachments, CLI commands, and quality gates

## Phase Details

### Phase 1: Foundation & JMAP Client
**Goal**: Project infrastructure and JMAP client ready for authentication integration
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, JMAP-01, JMAP-02, JMAP-03, JMAP-04, JMAP-05
**Success Criteria** (what must be TRUE):
  1. Project builds without TypeScript errors using ESM output
  2. Configuration validates from environment variables and fails fast with clear error messages
  3. JMAP client fetches session, discovers capabilities, and validates connection to jmap.linagora.com
  4. JMAP client handles errors at request, method, and record levels with AI-friendly messages
  5. JMAP client tracks state strings for incremental operations
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md — Project infrastructure with TypeScript ESM, config validation, logging, error formatting
- [x] 01-02-PLAN.md — JMAP client with session management, batching, timeouts, error handling, state tracking

### Phase 2: Authentication System
**Goal**: Users can authenticate via Basic, Bearer, or OIDC with secure token management
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07
**Success Criteria** (what must be TRUE):
  1. User can authenticate with username/password using Basic auth
  2. User can authenticate with JWT using Bearer token auth
  3. User can authenticate with OIDC using OAuth2 + PKCE flow with S256 code challenge
  4. Tokens are stored in ~/.mcp-twake-mail/tokens.json with 0600 permissions
  5. Access tokens auto-refresh using refresh token without user intervention
  6. Token refresh failures prompt user to re-authenticate with clear instructions
**Plans**: 4 plans

Plans:
- [x] 02-01-PLAN.md — Config extension for OIDC, secure token store, auth error factories
- [x] 02-02-PLAN.md — OIDC authorization code flow with PKCE S256
- [x] 02-03-PLAN.md — Token refresh with expiry buffer and mutex for concurrency
- [x] 02-04-PLAN.md — JMAPClient integration with token store and auto-refresh

### Phase 3: Core Read Operations
**Goal**: AI assistant can search, read, and navigate emails and mailboxes
**Depends on**: Phase 2
**Requirements**: EMAIL-03, EMAIL-04, EMAIL-11, MBOX-01, MBOX-02, MCP-01, MCP-02, MCP-03, MCP-04, TRANS-01, TRANS-02, TRANS-03
**Success Criteria** (what must be TRUE):
  1. MCP server initializes via stdio transport and validates JMAP connection at startup
  2. AI assistant can search emails with filters (from, to, subject, text, date range, unread, flagged)
  3. AI assistant can retrieve specific email by ID with full content
  4. AI assistant can list all mailboxes with metadata (name, role, message counts)
  5. Email and mailbox data transforms JMAP objects to simplified DTOs with boolean flags ($seen → isRead)
**Plans**: 4 plans

Plans:
- [x] 03-01-PLAN.md — DTO types and transformers for Email/Mailbox with TDD
- [x] 03-02-PLAN.md — MCP server foundation with JMAP validation at startup
- [x] 03-03-PLAN.md — Email tools: get_email, search_emails, get_email_labels
- [x] 03-04-PLAN.md — Mailbox tools: get_mailbox, list_mailboxes

### Phase 4: Email Management Operations
**Goal**: AI assistant can mark, delete, move, and label emails
**Depends on**: Phase 3
**Requirements**: EMAIL-05, EMAIL-06, EMAIL-07, EMAIL-08, EMAIL-09, EMAIL-10, EMAIL-12
**Success Criteria** (what must be TRUE):
  1. AI assistant can mark emails as read or unread
  2. AI assistant can delete emails permanently
  3. AI assistant can move emails between mailboxes
  4. AI assistant can add or remove labels (mailboxes) from emails
  5. AI assistant can create drafts in Drafts mailbox with $draft keyword
**Plans**: TBD

Plans:
- [ ] TBD during planning

### Phase 5: Email Creation & Sending
**Goal**: AI assistant can send new emails and reply to existing threads
**Depends on**: Phase 4
**Requirements**: EMAIL-01, EMAIL-02
**Success Criteria** (what must be TRUE):
  1. AI assistant can send new email with to, cc, bcc, subject, plain text body, and HTML body
  2. AI assistant can reply to email with proper threading headers (In-Reply-To, References)
  3. Sent emails appear in Sent mailbox and maintain thread relationships
**Plans**: TBD

Plans:
- [ ] TBD during planning

### Phase 6: Advanced Features & Polish
**Goal**: Full feature set with threads, attachments, CLI wizard, and quality validation
**Depends on**: Phase 5
**Requirements**: THREAD-01, THREAD-02, ATTACH-01, ATTACH-02, CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, CLI-06, CLI-07, CLI-08, CLI-09, CLI-10, CLI-11, QUAL-01, QUAL-02, QUAL-03, QUAL-04
**Success Criteria** (what must be TRUE):
  1. AI assistant can retrieve threads and list all emails within a thread
  2. AI assistant can list and filter attachments for any email
  3. User can run `npx mcp-twake-mail setup` to configure connection via interactive wizard
  4. Setup wizard tests connection, generates Claude Desktop config JSON, and offers to write it
  5. Package installs via `npx mcp-twake-mail` without errors and passes quality gates (80%+ test coverage, no TypeScript/ESLint errors, <2s response time)
**Plans**: TBD

Plans:
- [ ] TBD during planning

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & JMAP Client | 2/2 | Complete | 2026-01-29 |
| 2. Authentication System | 4/4 | Complete | 2026-01-29 |
| 3. Core Read Operations | 4/4 | Complete | 2026-01-29 |
| 4. Email Management Operations | 0/TBD | Not started | - |
| 5. Email Creation & Sending | 0/TBD | Not started | - |
| 6. Advanced Features & Polish | 0/TBD | Not started | - |
