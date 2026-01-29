# Project Research Summary

**Project:** mcp-twake-mail
**Domain:** MCP server for JMAP email operations
**Researched:** 2026-01-29
**Confidence:** HIGH

## Executive Summary

mcp-twake-mail is an MCP server that integrates Claude with email systems using the modern JMAP protocol (RFC 8620/8621). Research confirms this is a viable technical approach with significant differentiation potential — JMAP is the only modern, stateless email protocol designed for mobile-first, AI-optimized email workflows. The recommended stack centers on Node.js 20+ with native fetch, TypeScript 5.9, the official @modelcontextprotocol/sdk, and a lightweight custom JMAP client. This positions the project as the first JMAP-based MCP server in the ecosystem, filling a gap between legacy IMAP integrations and proprietary Gmail/Outlook APIs.

The architecture follows proven patterns from mcp-twake-dav: layered services with clear separation between JMAP protocol operations, domain transformers, and MCP tool implementations. Critical success factors include: (1) rigorous JMAP state management to avoid cache desynchronization, (2) aggressive context window optimization via minimal tool descriptions and default-to-preview responses, and (3) secure OIDC+PKCE authentication with proper token lifecycle management. The MVP should focus on 8 essential tools (auth, send, reply, get, search, list mailboxes, mark read/unread, config wizard) that enable the core "search-read-reply" workflow.

Key risks center on JMAP's stateful synchronization model (unfamiliar to REST developers), MCP context window saturation from verbose tools, and Apache James's partial RFC-8621 support requiring capability checks. Mitigation strategies are well-documented in the research, with specific implementation patterns proven in reference codebases.

## Key Findings

### Recommended Stack

The 2026 standard stack for MCP+JMAP integrations maximizes Node.js built-ins while minimizing dependencies. Node.js 20 LTS provides native fetch, WebCryptoAPI for PKCE, and stable ESM support. TypeScript 5.9 with `Node16` module resolution ensures predictable ESM output. The official @modelcontextprotocol/sdk v1.25.3 handles MCP protocol concerns, while Zod 4 validates environment variables and tool inputs as a peer dependency. For authentication, openid-client v6 provides industry-standard OIDC+PKCE implementation requiring Node 20+.

**Core technologies:**
- **Node.js 20+**: Native fetch, WebCryptoAPI, ESM stability — required by openid-client v6
- **TypeScript 5.9**: Node20 module resolution, deferred imports, stable ES2023 target
- **@modelcontextprotocol/sdk ^1.25.3**: Official TypeScript SDK for MCP protocol with stdio transport
- **Zod ^4.3.6**: Runtime validation for config and tool inputs, MCP SDK peer dependency
- **openid-client ^6.6.0**: OIDC+OAuth2+PKCE implementation, requires Node 20+
- **Pino ^10.3.0**: Structured JSON logging to stderr (stdout reserved for MCP JSON-RPC)
- **Vitest ^4.0.18**: Native ESM/TypeScript testing, 10x faster than Jest, stable browser mode
- **Custom JMAP client**: Fetch-based implementation for full control over batching, session management, error handling (~100 LOC core)

**Critical versions:**
- Node.js >=20.0.0 (hard requirement for openid-client v6, native fetch, WebCryptoAPI)
- TypeScript ^5.9.0 (Node20 module resolution)
- Zod ^4.3.6 (unified error API, matches MCP SDK peer dependency)

### Expected Features

Research reveals 17 table stakes features that users expect from any MCP email server. Missing any of these makes the product feel incomplete. JMAP-specific capabilities (thread operations, efficient sync, push-readiness) provide differentiation against Gmail/Outlook/IMAP competitors.

**Must have (table stakes):**
- **Core operations**: send_email, reply_email, get_email, search_emails
- **Inbox management**: mark_as_read, mark_as_unread, delete_email
- **Organization**: list_mailboxes, get_mailbox, move_email
- **Labels**: add_label, remove_label, get_email_labels
- **Attachments**: list_attachments, download_attachment
- **Auth & config**: Authentication (Basic/Bearer/OIDC), error handling, configuration wizard

**Should have (competitive differentiators):**
- **JMAP protocol**: Modern, stateless, mobile-optimized — only JMAP MCP server found in research
- **Thread operations**: get_thread, get_thread_emails with explicit thread-awareness
- **Batch operations**: Process up to 50 emails at once (Gmail MCP pattern)
- **OIDC authentication**: Enterprise SSO integration with PKCE flow
- **Token auto-refresh**: Zero-friction re-auth prevents interruptions
- **Stateless architecture**: Better battery life and intermittent network handling vs IMAP
- **Standards compliance**: RFC 8620/8621 certified (Apache James)
- **Sovereign stack**: Self-hosted LINAGORA ecosystem for privacy-conscious enterprises

**Defer (v2+):**
- Push notifications (EventSource/RFC 8887) — JMAP-ready but out of scope for v1
- Attachment upload (security-sensitive, focus on download first)
- Mailbox CRUD (create/update/delete mailboxes)
- Multiple account management (complicates auth)
- Advanced filtering/rules management
- Email forwarding (redundant with send_email)

### Architecture Approach

Follow layered architecture with clear separation of concerns, mirroring mcp-twake-dav's proven structure while adapting to JMAP's stateless, session-based protocol. The pattern is: Entry point → MCP server setup → Config/Logging/JMAP Client → Services (Email/Mailbox) → Transformers → Tools.

**Major components:**
1. **JMAP Client Layer** (jmap/client.ts) — Session management, authentication, request batching, state tracking; wraps fetch with timeouts
2. **Service Layer** (jmap/email-service.ts, jmap/mailbox-service.ts) — Domain operations mapped to JMAP methods (Email/get, Email/query, Email/set, Mailbox/get, Mailbox/query)
3. **Transformer Layer** (transformers/) — Convert between JMAP objects, DTOs, and AI-friendly formats; handle keyword mapping ($seen → isRead)
4. **Tool Layer** (tools/) — MCP tool implementations with Zod validation, one file per tool, proper annotations (readOnlyHint, destructiveHint)
5. **Config & Logging** (config/) — Zod-based env validation, Pino logger to stderr
6. **Entry Point** (index.ts) — CLI routing (setup wizard vs server mode), startup validation sequence

**Key architectural patterns:**
- **Session-based initialization**: Fetch JMAP session at startup to validate connection and get capabilities
- **Method call batching**: JMAP supports multiple operations in single HTTP request with result references
- **State-based synchronization**: Track state tokens for delta updates (Email/changes, Mailbox/changes)
- **Parse-modify-serialize**: Fetch → Transform → Modify → Serialize → Update pattern for email updates
- **Transformer abstraction**: Separate transformation logic from services and tools
- **Passive state management**: Services check state changes, don't cache-drive fetches
- **Tool annotations**: Use MCP metadata hints (readOnlyHint, destructiveHint, openWorldHint) for AI guidance

### Critical Pitfalls

Research identified 14 domain-specific pitfalls ranging from critical (data loss, rewrites) to minor (annoyances). The top 5 require architectural attention from day 1.

1. **JMAP State Desynchronization** — Client cache becomes stale, causing "state mismatch" errors and infinite refresh loops. Prevention: Track state strings religiously, handle cannotCalculateChanges, implement 30-day window, use delta updates. Address in Phase 1 (Core JMAP Client).

2. **MCP Context Window Saturation** — Tool definitions consume 20K-60K+ tokens before any work begins, leaving insufficient context for email content. Prevention: Minimize tool descriptions (1-2 sentences), use focused schemas, aggressive pagination (default 10 emails), strip bloat, default to preview over body. Address in Phase 1 + Phase 3 (Tool Design).

3. **OIDC+PKCE Implementation Vulnerabilities** — Tokens leaked to logs/stdout, stored with wrong permissions, or using deprecated "plain" challenge method. Prevention: Always use S256, state parameter for CSRF, chmod 0600 on token files, never log tokens, validate aud/iss claims. Address in Phase 2 (Authentication).

4. **Fetch API Timeout Mismanagement** — Native fetch has no timeout, can hang 90-300 seconds on network issues. Prevention: Use AbortSignal.timeout() for all requests, tiered timeouts (5s session, 8s queries, 30s attachments), catch AbortError explicitly. Address in Phase 1 (Core JMAP Client).

5. **Apache James Partial RFC-8621 Support** — Server implementation is experimental with known limitations (no push notifications, unsupportedFilter on some queries). Prevention: Check session capabilities, avoid naive implementations, test against production James instance, handle unsupportedFilter gracefully. Address in Phase 1 (Core JMAP Client).

**Additional moderate pitfalls:**
- JMAP error handling granularity mismatch (3-tier errors: HTTP/method/record)
- Tool naming convention violations (must use snake_case, not camelCase/kebab-case)
- JMAP blob lifecycle mismanagement (unreferenced blobs deleted after 1 hour)
- Result reference resolution failures in batch operations
- Session refetch thrashing (re-fetching session on every request)
- Rate limiting ignored (server bans IP after 500 requests in 10s)

## Implications for Roadmap

Based on research, the project naturally divides into 6 phases ordered by dependency structure and risk mitigation.

### Phase 1: Foundation & JMAP Client
**Rationale:** Zero dependencies; required by all other components. JMAP state management and fetch timeouts are architectural decisions that cannot be retrofitted — they must be correct from day 1.

**Delivers:**
- Config schema with Zod validation (JMAP_SESSION_URL, JMAP_TOKEN, JMAP_AUTH_METHOD)
- Pino logger configured for stderr (stdout reserved for MCP)
- Core TypeScript types and DTOs
- JMAP client with session management, request batching, state tracking
- AbortSignal.timeout() wrapper for all fetch calls
- AI-friendly error formatting

**Addresses:**
- Critical pitfall #1 (state desynchronization) via state token tracking
- Critical pitfall #4 (fetch timeouts) via AbortSignal wrapper
- Critical pitfall #5 (Apache James limitations) via capability checks

**Stack elements:** Node 20, TypeScript 5.9, Zod 4, Pino, native fetch

**Research flag:** SKIP — JMAP specs (RFC 8620/8621) are comprehensive, mcp-twake-dav provides proven patterns

### Phase 2: Authentication System
**Rationale:** Security cannot be retrofitted. All subsequent operations depend on valid authentication tokens. OIDC+PKCE complexity requires focus before building on top of it.

**Delivers:**
- Basic authentication (username:password base64)
- Bearer token authentication (JWT in Authorization header)
- OIDC+PKCE flow (openid-client v6 with S256 challenge)
- Token storage with proper permissions (chmod 0600)
- Token auto-refresh with retry logic
- Configuration wizard for interactive setup

**Addresses:**
- Critical pitfall #3 (OIDC vulnerabilities) via S256, state validation, secure storage
- Pitfall #10 (token leakage) via Pino redaction, no stdout logging

**Stack elements:** openid-client v6, node:readline/promises, WebCryptoAPI

**Research flag:** SKIP — OpenID Connect and PKCE specs are well-documented, openid-client v6 provides proven implementation

### Phase 3: Core Read Operations (MVP Foundation)
**Rationale:** Read operations have zero side effects, safe to iterate on. Establishes service layer patterns, transformer layer, and MCP tool structure that write operations will reuse. Enables core "search-read" workflow.

**Delivers:**
- EmailService (Email/get, Email/query) with state management
- MailboxService (Mailbox/get, Mailbox/query)
- Transformers (JMAP → DTO with keyword mapping)
- MCP tools: get_email, search_emails, list_mailboxes, get_mailbox, get_email_labels
- Service and tool tests with mocked JMAP client

**Addresses:**
- Critical pitfall #2 (context window) via minimal descriptions, default-to-preview, aggressive pagination
- Pitfall #6 (tool naming) via snake_case enforcement
- Pitfall #11 (session refetch thrashing) via session caching

**Features:** 5 of 17 table stakes tools (get, search, list operations)

**Research flag:** SKIP — Standard CRUD patterns, JMAP method calls are straightforward

### Phase 4: Email Management Operations (MVP Core)
**Rationale:** Write operations proven; these follow same service pattern as reads. Grouping state-modification operations together allows consistent transaction handling.

**Delivers:**
- Email/set methods in EmailService (update keywords, mailboxIds, destroy)
- MCP tools: mark_as_read, mark_as_unread, delete_email, move_email, add_label, remove_label
- Partial success handling for batch operations
- Record-level error reporting (notUpdated, notDestroyed)

**Addresses:**
- Pitfall #5 (JMAP error granularity) via 3-tier error handling
- Pitfall #9 (result reference failures) via validation before batch
- Features: 6 of 17 table stakes tools (management operations)

**Research flag:** SKIP — Follows Phase 3 patterns, Email/set is well-documented in RFC 8621

### Phase 5: Email Creation & Sending (MVP Complete)
**Rationale:** Core use case ("search email, read it, reply") requires this phase. More complex than management operations due to EmailSubmission protocol and threading headers.

**Delivers:**
- EmailSubmission/set in EmailService
- Email/import for drafts
- Threading header logic (In-Reply-To, References)
- MCP tools: send_email, reply_email, create_draft
- Integration with Identity/get for sender addresses

**Addresses:**
- Features: 3 of 17 table stakes tools (creation operations)
- Pitfall #12 (email encoding) via UTF-8 handling

**Research flag:** CONSIDER — Email threading headers and EmailSubmission flow may need deeper research if complexity emerges

### Phase 6: Advanced Features (Post-MVP)
**Rationale:** Core functionality complete (17 table stakes tools). These enhance UX but aren't blocking for launch.

**Delivers:**
- ThreadService with Thread/get and email expansion
- Attachment handling (list_attachments, download_attachment with streaming)
- MCP tools: get_thread, get_thread_emails
- Batch operations (up to 50 emails)
- Real-time sync via Email/changes polling

**Addresses:**
- Pitfall #8 (blob lifecycle) via immediate reference pattern
- Pitfall #14 (rate limiting) via client-side throttle
- Differentiators: thread operations, batch operations

**Research flag:** CONSIDER — Attachment security, blob lifecycle, streaming downloads may need validation research

### Phase Ordering Rationale

**Dependency chain:**
- Phase 1 → Phase 2: Auth depends on JMAP client session management
- Phase 2 → Phase 3: Read operations require valid auth tokens
- Phase 3 → Phase 4: Write operations reuse service/tool patterns from reads
- Phase 4 → Phase 5: Sending depends on email update capabilities (drafts)
- Phase 5 → Phase 6: Threads and attachments are additive enhancements

**Risk mitigation:**
- Critical pitfalls addressed in Phases 1-2 (state, timeouts, auth security)
- Context window optimization built into Phase 3 (affects all tools)
- Apache James compatibility validated in Phase 1 (capability checks)

**MVP boundary:**
- Phases 1-5 deliver all 17 table stakes features
- Enable core workflow: "Search for email, read it, reply"
- Phase 6 is post-MVP enhancement

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 5 (Email Creation)**: If threading header logic or EmailSubmission flow proves complex, run targeted research on RFC 5322 threading, JMAP EmailSubmission examples, and reference implementations
- **Phase 6 (Advanced Features)**: Attachment security patterns, blob lifecycle edge cases, streaming download implementations may need validation research

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Foundation)**: JMAP specs are comprehensive, patterns proven in mcp-twake-dav
- **Phase 2 (Authentication)**: OIDC/PKCE specs well-documented, openid-client v6 handles complexity
- **Phase 3 (Read Operations)**: Standard CRUD, JMAP method calls straightforward
- **Phase 4 (Management Operations)**: Follows Phase 3 patterns, Email/set well-specified

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified via official docs (Node.js, TypeScript, MCP SDK, openid-client). Zod 4 migration guide confirms compatibility. Native fetch stable since Node 18. |
| Features | HIGH | 17 table stakes validated against Gmail MCP, IMAP/SMTP MCP, and industry research. JMAP differentiators verified via RFC 8620/8621 and Apache James docs. |
| Architecture | HIGH | Layered pattern proven in mcp-twake-dav reference implementation. JMAP architectural patterns verified via RFC specs and jmap-client-ts library. |
| Pitfalls | MEDIUM-HIGH | Critical pitfalls (state, context window, auth) verified via official specs and community discussions. Production pitfalls (rate limiting, observability) inferred from best practices — not JMAP/MCP specific. |

**Overall confidence:** HIGH

Research sources span official specifications (JMAP RFC 8620/8621, OIDC RFC 7636, MCP docs), verified implementations (mcp-twake-dav, openid-client v6, Apache James), and community consensus (MCP discussions, security best practices). Custom JMAP client approach is MEDIUM confidence (pattern validated in similar projects but not production-proven in MCP context).

### Gaps to Address

**JMAP client library trade-off:**
- Research recommends custom fetch-based client for full control (~100 LOC core)
- Alternatives (jmap-client-ts, jmap-jam) exist but have trade-offs (inactive since 2022, opinionated APIs)
- **Resolution during Phase 1:** Start with custom client following jmap-client-ts patterns; pivot to library if complexity exceeds estimates

**Apache James production readiness:**
- Official docs mark JMAP implementation as "experimental" in v3.6+
- Known limitations exist but not fully enumerated
- **Resolution during Phase 1:** Validate against production Apache James instance (jmap.linagora.com or local), document unsupported features in README

**Context window token consumption:**
- Research provides estimates (400-500 tokens per tool, 20K-60K total) but varies by MCP client
- **Resolution during Phase 3:** Measure actual token consumption via MCP Inspector, iterate on tool descriptions

**Rate limiting thresholds:**
- No public documentation of jmap.linagora.com rate limits
- Apache James configuration is deployment-specific
- **Resolution during Phase 6:** Implement conservative client-side throttle (10 req/s), adjust based on production behavior

## Sources

### Primary (HIGH confidence)

**JMAP Specifications:**
- [JMAP Core Specification (RFC 8620)](https://jmap.io/spec-core.html) — Protocol architecture, state management, batching, error handling
- [JMAP Mail Specification (RFC 8621)](https://jmap.io/spec-mail.html) — Email/Mailbox/Thread data models and methods
- [JMAP Official Site](https://jmap.io/) — Crash course, server implementations

**MCP Framework:**
- [MCP TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk) — Official SDK v1.25.3, stdio transport, tool registration
- [MCP Documentation](https://modelcontextprotocol.io/docs/develop/build-server) — Server implementation patterns
- [MCP Architecture Overview](https://modelcontextprotocol.io/docs/learn/architecture) — Protocol design

**Authentication:**
- [RFC 7636 - PKCE](https://datatracker.ietf.org/doc/html/rfc7636) — Proof Key for Code Exchange specification
- [openid-client GitHub](https://github.com/panva/openid-client) — v6 implementation details, Node 20 requirement

**Node.js & TypeScript:**
- [TypeScript 5.9 Release Notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-9.html) — Node20 module resolution, deferred imports
- [Node.js Fetch API Guide](https://blog.logrocket.com/fetch-api-node-js/) — Native fetch stability

**Reference Implementation:**
- mcp-twake-dav codebase (/Users/mmaudet/work/mcp-twake-dav) — Proven layered architecture, config patterns, CLI wizard, transformer layer

### Secondary (MEDIUM confidence)

**JMAP Client Libraries:**
- [jmap-client-ts GitHub](https://github.com/linagora/jmap-client-ts) — TypeScript JMAP 1.0 client (inactive since 2022, good reference)
- [jmap-jam npm](https://www.npmjs.com/package/jmap-jam) — TypeScript client with fluent APIs

**MCP Best Practices:**
- [MCP Context Window Discussion](https://github.com/orgs/modelcontextprotocol/discussions/532) — Community reports of context overflow
- [MCP Context Window Lessons](https://medium.com/@pekastel/mcp-and-context-windows-lessons-learned-during-development-590e0b047916) — 20K-60K token consumption patterns
- [MCP Server Best Practices 2026](https://www.cdata.com/blog/mcp-server-best-practices-2026) — Tool naming, annotations

**Email MCP Servers:**
- [Gmail MCP Server GitHub](https://github.com/GongRzhe/Gmail-MCP-Server) — 17 tools, batch operations (up to 50), OAuth2
- [IMAP/SMTP MCP Server GitHub](https://github.com/ai-zerolab/mcp-email-server) — Multi-account, threading disabled by default

**Security & Pitfalls:**
- [OIDC Integration Mistakes](https://blog.gitguardian.com/oidc-for-developers-auth-integration/) — Common auth vulnerabilities
- [API Security Best Practices 2026](https://www.aikido.dev/blog/api-security-best-practices) — $6.1M breach cost statistics

**Apache James:**
- [Apache James JMAP Configuration](https://james.apache.org/server/config-jmap.html) — Experimental status, known limitations
- [Apache James 3.6.0 Release](https://james.apache.org/james/update/2021/03/16/james-3.6.0.html) — JMAP implementation status

### Tertiary (LOW confidence, needs validation)

**Production Deployment:**
- [MCP Observability Guide](https://zeo.org/resources/blog/mcp-server-observability-monitoring-testing-performance-metrics) — Vendor documentation on metrics
- [Rate Limiting Best Practices](https://learn.microsoft.com/en-us/exchange/mail-flow/message-rate-limits) — General email server patterns

**Email Industry:**
- [Email Industry Report 2026](https://clean.email/blog/insights/email-industry-report-2026) — 40% AI adoption statistics
- [Email Deliverability 2026](https://expertsender.com/blog/email-deliverability-in-2026-key-observations-trends-challenges-for-marketers/) — DMARC enforcement trends

---
*Research completed: 2026-01-29*
*Ready for roadmap: yes*
