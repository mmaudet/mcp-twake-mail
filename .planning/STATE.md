# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-29)

**Core value:** AI assistants can interact with JMAP email servers through natural language — searching emails, composing replies, organizing messages — without users leaving their AI workflow.
**Current focus:** Phase 5 In Progress - Email Creation & Sending

## Current Position

Phase: 5 of 6 (Email Creation & Sending)
Plan: 1 of 2 in phase
Status: In progress
Last activity: 2026-01-29 - Completed 05-01-PLAN.md

Progress: [█████████████░] 93% (13 of 14 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 13
- Average duration: 2.5 minutes
- Total execution time: 0.54 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 2/2 | 7m | 3.5m |
| 02 | 4/4 | 9m 15s | 2.3m |
| 03 | 4/4 | 10m | 2.5m |
| 04 | 2/2 | 5m 35s | 2.8m |
| 05 | 1/2 | 2m | 2.0m |

**Recent Trend:**
- Last 5 plans: 03-03 (2m 31s), 03-04 (2m 18s), 04-01 (2m 25s), 04-02 (3m 10s), 05-01 (2m)
- Trend: Steady velocity, consistent execution times

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Phase 1: Custom JMAP client for full control over batching, session management, and error handling
- Phase 1: All auth methods (Basic, Bearer, OIDC) built in parallel for v1 scope
- Phase 1: Zod 4 for validation matching mcp-twake-dav patterns
- 01-01: Pure ESM with type:module (MCP SDK is ESM-only)
- 01-01: Pino with stderr-only output (MCP stdio requires clean stdout)
- 01-01: Fail-fast config validation (catch misconfigurations early)
- 01-02: State tracking in JMAPClient (coupled to request lifecycle)
- 01-02: JMAPError static factories for consistent error creation
- 01-02: request() accepts methodCalls array for natural batching
- 02-01: Token file at ~/.mcp-twake-mail/tokens.json with 0600 permissions
- 02-01: OIDC requires issuer and client ID; token comes from OAuth flow
- 02-02: Public client with PKCE instead of client secret
- 02-02: S256 code challenge method enforced (never plain)
- 02-02: 2-minute timeout for user browser authentication
- 02-03: 60-second expiry buffer for proactive token refresh
- 02-03: Promise-based mutex for concurrent refresh serialization
- 02-03: Keep old refresh token if server doesn't rotate
- 02-04: getAuthHeaders() made async - internal change only
- 02-04: TokenRefresher created in constructor for OIDC auth method
- 02-04: Fresh token retrieved on every request via ensureValidToken()
- 03-01: Separate JMAPEmail interface in transformer (not reusing jmap.ts)
- 03-01: Unknown mailbox roles treated as null (defensive)
- 03-01: Body content extraction uses first body part only (simplified)
- 03-02: JMAP validation before MCP connect (ensures valid session before requests)
- 03-02: Server version hardcoded (0.1.0) matching package.json
- 03-02: Minimal entry point - all startup logic in server.ts
- 03-03: MCP registerTool() API used (newer, non-deprecated method)
- 03-03: JMAP back-reference pattern for search_emails (query+get in single request)
- 03-03: Separate FULL_EMAIL_PROPERTIES vs SUMMARY_EMAIL_PROPERTIES lists
- 03-03: Common EMAIL_READ_ANNOTATIONS constant for all email tools
- 03-04: Client-side role filtering after Mailbox/get (JMAP doesn't support server-side mailbox filtering)
- 04-01: JMAP patch syntax for keyword updates ('keywords/$seen': true/null)
- 04-01: Soft delete by default (move to Trash), permanent=true for destroy
- 04-01: Fallback to permanent delete if Trash mailbox not found
- 04-02: move_email uses full mailboxIds replacement (true move semantics)
- 04-02: add_label/remove_label use JMAP patch syntax (`mailboxIds/[id]`)
- 04-02: Friendly error message for last-mailbox constraint
- 04-02: create_draft uses EMAIL_CREATE_ANNOTATIONS (not idempotent)
- 05-01: Two-phase sending pattern (Email/set create + EmailSubmission/set)
- 05-01: First Identity from Identity/get used for sending
- 05-01: Multipart/alternative bodyStructure when both text and HTML provided

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-01-29T19:12:56Z
Stopped at: Completed 05-01-PLAN.md (Send Email Tool)
Resume file: None

## Phase 2 Summary (COMPLETE)

Plan 02-01 (Auth Foundation) complete with:
- OIDC config validation (issuer, clientId, scope, redirectUri)
- Token store with secure 0600 permissions
- Auth-specific error factories with re-auth instructions
- 57 passing tests (47 + 10 new)

Plan 02-02 (PKCE OAuth Flow) complete with:
- performOIDCFlow() with full PKCE S256 implementation
- Browser-based auth via oauth-callback and open packages
- State validation for CSRF protection
- Token exchange and secure persistence
- 87 passing tests (76 + 11 new)

Plan 02-03 (Token Refresh) complete with:
- TokenRefresher class with ensureValidToken()
- 60-second expiry buffer for proactive refresh
- Promise-based mutex prevents concurrent refresh races
- 76 passing tests (57 + 19 new)

Plan 02-04 (Auth Provider Integration) complete with:
- JMAPClient.getAuthHeaders() async with OIDC support
- TokenRefresher integration for automatic token refresh
- All three auth methods (basic, bearer, oidc) working
- 92 passing tests (87 + 5 new)

**Phase 2 Deliverables:**
- Complete authentication system supporting Basic, Bearer, and OIDC
- PKCE S256 OAuth flow with browser-based authentication
- Automatic token refresh with 60-second expiry buffer
- Secure token storage with 0600 permissions
- 92 tests covering all auth components

## Phase 3 Summary (COMPLETE)

Plan 03-01 (Email and Mailbox Transformers) complete with:
- SimplifiedEmail DTO with boolean flags (isRead, isFlagged, isDraft, isAnswered, isForwarded)
- SimplifiedMailbox DTO with typed role and myRights
- transformEmail() converting JMAP keywords to boolean flags (TRANS-03)
- transformMailbox() with role validation
- 42 new tests (134 total passing)

Plan 03-02 (MCP Server Foundation) complete with:
- createMCPServer() function returning { server, jmapClient }
- startServer() with JMAP validation before MCP connect
- StdioServerTransport for stdio communication
- Fail-fast error handling with exit code 1

Plan 03-03 (Email MCP Tools) complete with:
- get_email tool retrieving email by ID with full content (EMAIL-03)
- search_emails tool with 10 filter parameters (EMAIL-04)
- get_email_labels tool returning mailbox IDs (EMAIL-11)
- registerAllTools() aggregator for tool registration
- All tools use MCP annotations (readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true)

Plan 03-04 (Mailbox MCP Tools) complete with:
- get_mailbox tool for retrieving mailbox by ID (MBOX-01)
- list_mailboxes tool with role filtering (MBOX-02)
- Zod input validation for all tools
- transformMailbox() for response formatting
- 176 tests passing

**Phase 3 Deliverables:**
- SimplifiedEmail and SimplifiedMailbox DTOs optimized for AI assistants
- MCP server with JMAP validation on startup
- Email tools: get_email, search_emails, get_email_labels
- Mailbox tools: get_mailbox, list_mailboxes
- Tool registration aggregator for clean server initialization
- 176 tests covering all components

## Phase 4 Summary (COMPLETE)

Plan 04-01 (Email Write Operations) complete with:
- EmailSetResponse type for Email/set responses (RFC 8621 Section 4.3)
- mark_as_read tool using patch syntax 'keywords/$seen': true (EMAIL-06)
- mark_as_unread tool using patch syntax 'keywords/$seen': null (EMAIL-07)
- delete_email tool with soft delete (Trash) and permanent delete (EMAIL-05)
- EMAIL_WRITE_ANNOTATIONS and EMAIL_DESTRUCTIVE_ANNOTATIONS constants
- registerEmailOperationTools() integrated in index.ts

Plan 04-02 (Move, Label, and Draft Operations) complete with:
- move_email tool using full mailboxIds replacement (EMAIL-08)
- add_label tool using JMAP patch syntax (EMAIL-09)
- remove_label tool with friendly last-mailbox error (EMAIL-10)
- create_draft tool with $draft/$seen keywords (EMAIL-12)
- EMAIL_CREATE_ANNOTATIONS constant (not idempotent)
- 17 unit tests for all email operation tools

**Phase 4 Deliverables:**
- Complete email write operations: mark_as_read, mark_as_unread, delete_email
- Mailbox manipulation: move_email, add_label, remove_label
- Draft creation: create_draft with proper JMAP structure
- 7 email operation tools with proper MCP annotations
- 193 total tests passing

## Phase 5 Summary (IN PROGRESS)

Plan 05-01 (Send Email Tool) complete with:
- Identity type for RFC 8621 Section 6 (Identity/get responses)
- EmailSubmissionSetResponse type for RFC 8621 Section 7.5
- send_email tool with two-phase JMAP sending (Email/set + EmailSubmission/set)
- Support for to, cc, bcc, subject, body, htmlBody inputs
- Multipart/alternative bodyStructure for text+HTML
- onSuccessUpdateEmail for atomic Drafts-to-Sent transition
- urn:ietf:params:jmap:submission capability included
- 210 total tests passing (no regressions)

Next: Plan 05-02 (Reply Email Tool)
