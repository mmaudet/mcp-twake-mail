# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-29)

**Core value:** AI assistants can interact with JMAP email servers through natural language — searching emails, composing replies, organizing messages — without users leaving their AI workflow.
**Current focus:** Phase 2 - Authentication System (OIDC)

## Current Position

Phase: 2 of 6 (Authentication System)
Plan: 3 of 4 in phase
Status: In progress
Last activity: 2026-01-29 — Completed 02-02-PLAN.md

Progress: [█████░░░░░] 50% (5 of 10 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: 2.8 minutes
- Total execution time: 0.23 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 2/2 | 7m | 3.5m |
| 02 | 3/4 | 7m 01s | 2.3m |

**Recent Trend:**
- Last 5 plans: 01-01 (3m), 01-02 (4m), 02-01 (2m 38s), 02-03 (1m 45s), 02-02 (2m 38s)
- Trend: Good velocity maintained, consistent ~2.5m on auth plans

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

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-01-29T15:21:14Z
Stopped at: Completed 02-02-PLAN.md (PKCE OAuth Flow)
Resume file: None

## Phase 2 Progress

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

Next: 02-04 (Auth Provider Integration)
