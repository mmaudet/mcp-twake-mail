# Domain Pitfalls: MCP JMAP Email Servers

**Domain:** MCP servers with JMAP email backends
**Researched:** 2026-01-29
**Confidence:** MEDIUM — based on MCP best practices (HIGH), JMAP spec (HIGH), implementation examples (MEDIUM)

## Executive Summary

Building an MCP server with a JMAP backend combines two relatively young technologies (MCP launched 2024, JMAP RFC 8621 finalized 2019) where domain expertise is scarce. The primary failure modes cluster around three areas: (1) JMAP state management complexity leading to stale or lost data, (2) MCP context window saturation from verbose tool definitions and bloated responses, and (3) authentication flow vulnerabilities in OIDC+PKCE implementations. Teams commonly underestimate JMAP's stateful nature, treating it like a REST API when it requires careful state tracking. MCP servers also suffer from tool description sprawl that consumes context before any work begins.

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or major production issues.

### Pitfall 1: JMAP State Desynchronization

**What goes wrong:** Client cache becomes stale or inconsistent with server state, causing users to see outdated emails, miss new messages, or encounter "state mismatch" errors on every operation. In worst cases, clients enter an infinite refresh loop, hammering the server.

**Why it happens:** Developers treat JMAP like a stateless REST API, ignoring the `state` and `sessionState` properties. They cache responses without tracking state strings, or they fail to handle `stateMismatch` errors by refetching data. Root cause: JMAP's delta update mechanism is unfamiliar to teams coming from IMAP or REST backgrounds.

**Consequences:**
- Users see emails that were already deleted
- Search results show stale data
- Operations fail with `stateMismatch` requiring full data refresh
- Cache invalidation becomes unreliable
- Production load increases from unnecessary full refetches

**Prevention:**
1. **Track state religiously:** Store `state` strings from every `Foo/get` response and include them in `Foo/changes` calls
2. **Monitor sessionState:** Watch for `sessionState` changes in API responses and refetch session when it changes
3. **Handle cannotCalculateChanges:** When server returns this error (state too old), invalidate cache and do full refetch
4. **Implement 30-day window:** Design cache to support JMAP's 30-day state retention requirement
5. **Use delta updates:** Always call `Foo/changes` before full refetch to minimize data transfer

**Detection warning signs:**
- `stateMismatch` errors appearing in logs
- Users reporting stale data
- Repeated full refetches instead of delta updates
- Cache hit rate below 70%
- Server load spikes from unnecessary full queries

**Phase to address:** Phase 1 (Core JMAP Client) — state management is foundational, cannot be bolted on later

**Sources:**
- [JMAP Core Specification](https://jmap.io/spec-core.html)
- [JMAP state synchronization best practices](https://jmap.io/)

---

### Pitfall 2: MCP Context Window Saturation

**What goes wrong:** Tool definitions consume 20,000-60,000+ tokens before any user conversation begins, leaving insufficient context for actual email content. Claude refuses to work, returns truncated responses, or fails to process email threads. Users experience degraded performance or complete failures on complex tasks.

**Why it happens:** Each MCP tool consumes ~400-500 tokens for its JSON schema definition. With 15-20 email operations (send, reply, search, get, delete, mark, move, thread operations, attachment handling), the server burns 6,000-10,000 tokens on tool definitions alone. Add verbose tool responses (full email bodies, large thread dumps, attachment lists) and context fills rapidly.

**Consequences:**
- 30-50% of available context consumed before user interaction
- Email threads truncated or dropped from responses
- Search results limited to avoid overflow
- Complex multi-step operations fail
- User frustration with "context limit exceeded" errors

**Prevention:**
1. **Minimize tool descriptions:** Each tool's `description` field should be 1-2 sentences max. Avoid examples in descriptions — LLM learns from parameter schemas
2. **Use focused parameter schemas:** Don't expose every JMAP property. For email retrieval, default to `subject`, `from`, `to`, `receivedAt`, `preview` — require explicit request for `bodyValues`
3. **Implement pagination aggressively:** Default limits: 10 emails per search, 5 emails per thread. Expose `limit` and `position` parameters but keep defaults low
4. **Strip bloat from responses:** Remove JMAP metadata (`blobId`, `size`, `threadId`) unless explicitly needed. Return only fields MCP client requested
5. **Batch strategically:** Group related operations (get mailbox + search emails) to reduce round trips, but avoid mega-batches that return walls of text
6. **Preview over body:** Default to email `preview` (256 chars) instead of full `bodyValues` unless user asks for "full email"

**Detection warning signs:**
- Context overflow errors in logs
- Users complaining about truncated responses
- Tool success rate below 85%
- Average response token count above 5,000
- Claude refusing complex multi-email operations

**Phase to address:** Phase 1 (Core JMAP Client) + Phase 3 (Tool Design) — architectural decision affecting all tools

**Sources:**
- [MCP Context Window Overflow Discussion](https://github.com/orgs/modelcontextprotocol/discussions/532)
- [MCP and Context Windows: Lessons Learned](https://medium.com/@pekastel/mcp-and-context-windows-lessons-learned-during-development-590e0b047916)
- [Context as the New Currency: Designing Effective MCP Servers](https://www.itential.com/blog/company/ai-networking/context-as-the-new-currency-designing-effective-mcp-servers-for-ai/)

---

### Pitfall 3: OIDC+PKCE Implementation Vulnerabilities

**What goes wrong:** Authorization codes intercepted, tokens leaked to logs/stdout, refresh tokens stored in plaintext, or PKCE implementation uses deprecated "plain" challenge method. Security audit fails, or worse, production breach exposes user email access.

**Why it happens:** OIDC+PKCE is complex with many subtle security requirements. Developers copy outdated examples using "plain" challenge method, log tokens for debugging and forget to remove it, or store tokens in `~/.mcp-twake-mail/tokens.json` with world-readable permissions (0644 instead of 0600).

**Consequences:**
- Authorization code interception attacks
- Token leakage through logs visible to other processes
- Refresh tokens stolen from disk
- CSRF vulnerabilities if state parameter mishandled
- Failed security compliance (GDPR, SOC2)
- User trust violation if breach occurs

**Prevention:**
1. **Always use S256:** PKCE code challenge method MUST be "S256" (SHA-256), never "plain"
2. **State parameter for CSRF:** Generate cryptographically random `state` parameter, store it securely, validate on callback
3. **Token storage security:**
   - Store in `~/.mcp-twake-mail/tokens.json` with `fs.chmod(0o600)` immediately after creation
   - Never log tokens or include them in error messages
   - Use `[REDACTED]` placeholders in debug logs
4. **Validate tokens properly:** Check `aud` (audience) claim matches your client ID, verify `iss` (issuer), check expiration
5. **Secrets in environment:** Never hardcode client secrets. Use environment variables or platform keychain
6. **stdout isolation:** MCP uses stdout for JSON-RPC protocol. Token acquisition MUST write only to stderr or files, never stdout
7. **Auto-refresh implementation:** Detect 401 responses, refresh token, retry request. Limit to 1 retry to avoid loops

**Detection warning signs:**
- Tokens visible in stderr logs
- `tokens.json` has permissions other than 0600
- PKCE implementation uses `method: "plain"`
- No `aud` validation in token verification
- Refresh token rotation not implemented
- State parameter validation missing

**Phase to address:** Phase 2 (Authentication) — security cannot be retrofitted, must be correct from start

**Sources:**
- [RFC 7636 - Proof Key for Code Exchange](https://datatracker.ietf.org/doc/html/rfc7636)
- [OIDC for Developers: Common Auth Integration Mistakes](https://blog.gitguardian.com/oidc-for-developers-auth-integration/)
- [OAuth 2.0 Security Best Practices](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce)

---

### Pitfall 4: Fetch API Timeout Mismanagement

**What goes wrong:** JMAP requests hang indefinitely on network issues, degraded server response, or firewall interference. MCP server becomes unresponsive, blocking all subsequent operations. Users force-quit Claude Desktop or wait minutes for timeout.

**Why it happens:** Native `fetch()` has no timeout parameter — it waits until browser/Node.js default timeout (90-300 seconds). Developers assume fetch will fail fast, but it can hang forever waiting for response. JMAP session fetches at `/.well-known/jmap` are particularly vulnerable during server maintenance or network issues.

**Consequences:**
- MCP server hangs for 90+ seconds on network issues
- Claude Desktop becomes unresponsive
- Users kill process, losing work
- Poor user experience during server degradation
- No graceful degradation path

**Prevention:**
1. **AbortSignal.timeout() for all requests:**
   ```typescript
   const response = await fetch(url, {
     signal: AbortSignal.timeout(8000) // 8 second timeout
   });
   ```
2. **Tiered timeouts:** Session fetch: 5s, simple queries: 8s, search: 12s, large attachments: 30s
3. **Catch AbortError explicitly:**
   ```typescript
   try {
     const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
   } catch (error) {
     if (error.name === 'AbortError') {
       throw new Error('JMAP server timeout - please check connection');
     }
     throw error;
   }
   ```
4. **Retry with exponential backoff:** On timeout, retry once with 2x timeout, then fail with clear message
5. **Never log full error stack on timeout:** Generic "connection timeout" message prevents log spam

**Detection warning signs:**
- Requests taking 60+ seconds in logs
- Users reporting frozen MCP server
- No timeout values in fetch calls
- Missing AbortController/AbortSignal usage
- No retry logic for transient failures

**Phase to address:** Phase 1 (Core JMAP Client) — foundational for all network operations

**Sources:**
- [Fetch API Timeout Implementation](https://dmitripavlutin.com/timeout-fetch-request/)
- [How to Handle API Timeouts in JavaScript](https://medium.com/@rihab.beji099/how-to-handle-api-timeouts-in-javascript-and-optimize-fetch-requests-29bd17103b3a)
- [Request Timeouts With the Fetch API](https://lowmess.com/blog/fetch-with-timeout/)

---

## Moderate Pitfalls

Mistakes that cause delays, technical debt, or reduced reliability.

### Pitfall 5: JMAP Error Handling Granularity Mismatch

**What goes wrong:** Server returns multi-level errors (request-level HTTP errors, method-level JMAP errors like `stateMismatch`, record-level errors in batch operations), but client only handles HTTP layer. User sees generic "request failed" instead of actionable "mailbox not found" or "message already deleted."

**Why it happens:** Developers familiar with REST APIs expect single error per request. JMAP's three-tier error model (request/method/record) is unfamiliar. They parse HTTP status but ignore JMAP error types in response body.

**Prevention:**
1. **Parse all three error levels:**
   - HTTP status (network/auth failures)
   - Method-level `error` property (invalidArguments, stateMismatch, forbidden)
   - Record-level `notCreated`, `notUpdated`, `notDestroyed` maps
2. **Map JMAP errors to user messages:**
   - `stateMismatch` → "Data changed on server, refreshing..."
   - `invalidArguments` → "Invalid request: {description}"
   - `forbidden` → "Permission denied for this mailbox"
   - `accountNotFound` → "Account configuration invalid, run setup again"
3. **Partial success handling:** When batch has some successes and some failures, report both clearly
4. **Use error type enums:** Create TypeScript enum for JMAP error types to avoid string matching

**Detection warning signs:**
- Generic "operation failed" errors in logs
- No distinction between different JMAP error types
- Users unable to diagnose permission vs. validation errors
- Batch operations fail entirely on single record error

**Phase to address:** Phase 1 (Core JMAP Client) — impacts all operations

**Sources:**
- [JMAP Crash Course](https://jmap.io/crash-course.html)
- [JMAP Error Handling Patterns](https://github.com/SebastianKrupinski/jmap-client-php)

---

### Pitfall 6: Tool Naming Convention Violations

**What goes wrong:** MCP tools named with camelCase or kebab-case get ignored by Claude, failing silently. Tools appear in server logs but Claude never invokes them. Users think features don't exist.

**Why it happens:** MCP clients expect `snake_case` tool names by convention. Using `sendEmail`, `send-email`, or `Send_Email` breaks tool discovery in some MCP clients. Documentation is ambiguous on this requirement.

**Prevention:**
1. **Always use snake_case:** `send_email`, `search_emails`, `get_thread`, `download_attachment`
2. **Validate naming during development:** Write test that fails if tool name doesn't match `/^[a-z][a-z0-9_]*$/`
3. **Avoid underscores at start/end:** Not `_search` or `search_`, just `search_emails`
4. **Use verb_noun pattern:** `send_email`, `list_mailboxes`, `mark_as_read` (not `email_send`)

**Detection warning signs:**
- Tools visible in MCP server logs but never called
- Claude doesn't list tools in available operations
- Tool invocation fails with "unknown method"
- Inconsistent naming across tools

**Phase to address:** Phase 3 (Tool Design) — caught early via code review + tests

**Sources:**
- [MCP Server Best Practices 2026](https://www.cdata.com/blog/mcp-server-best-practices-2026)
- [Common Challenges in MCP Server Development](https://dev.to/nishantbijani/common-challenges-in-mcp-server-development-and-how-to-solve-them-35ne)

---

### Pitfall 7: Apache James Partial RFC-8621 Support Assumptions

**What goes wrong:** Client uses JMAP features from RFC-8621 that Apache James hasn't implemented yet (push notifications, certain mailbox operations, some query filters). Operations fail at runtime with `unsupportedFilter` or `unknownMethod` errors despite being in the spec.

**Why it happens:** Apache James JMAP implementation is marked "experimental" with partial RFC-8621 support as of version 3.6+. Developers assume full spec compliance because JMAP is an IETF standard, but server documentation warns "users are invited to read these limitations before using actively."

**Prevention:**
1. **Read server capabilities:** Check `session.capabilities['urn:ietf:params:jmap:mail']` for supported features
2. **Avoid naive implementations:** Apache James docs explicitly warn about naive implementations of certain operations
3. **No push notifications:** EventSource/push is not supported, must use polling
4. **Test against jmap.linagora.com:** Always validate against production Apache James, not just spec
5. **Handle unsupportedFilter gracefully:** Fall back to broader query or client-side filtering
6. **Check version:** Require Apache James 3.6+ minimum, document known limitations in README

**Detection warning signs:**
- `unsupportedFilter` errors on search queries
- `unknownMethod` for operations in RFC-8621
- Push notification attempts failing
- Cassandra backend consistency issues if using that backend

**Phase to address:** Phase 1 (Core JMAP Client) — server compatibility is foundational

**Sources:**
- [Apache James JMAP Configuration](https://james.apache.org/server/config-jmap.html)
- [Apache James 3.6.0 Release Notes](https://james.apache.org/james/update/2021/03/16/james-3.6.0.html)
- [Apache James Known Issues](https://issues.apache.org/jira/browse/JAMES-1861)

---

### Pitfall 8: JMAP Blob Lifecycle Mismanagement

**What goes wrong:** User uploads attachment, client stores `blobId` reference, but blob gets deleted after 1 hour because no message references it. Later attempt to send draft with attachment fails with "blob not found." User must re-upload.

**Why it happens:** JMAP spec allows unreferenced blobs to be deleted after one hour. Developers assume blobs persist like files in S3, but they're temporary until referenced by a message. Draft workflow uploads attachment → stores blobId → later creates message, but if "later" is 61+ minutes, blob is gone.

**Prevention:**
1. **Create message immediately after blob upload:** Don't store blobIds for long periods
2. **Re-upload strategy:** If blob upload and message creation are separated, keep reference to local file for re-upload
3. **Reference blobs promptly:** Upload → create draft message → attach blob, all in same request batch if possible
4. **Handle blobNotFound:** Catch this error, prompt for re-upload with clear message
5. **Don't cache blobIds long-term:** They're ephemeral references, not permanent IDs

**Detection warning signs:**
- `blobNotFound` errors on send operations
- Users reporting "attachment disappeared"
- Delay between blob upload and message creation exceeds 30 minutes
- No re-upload logic in error handling

**Phase to address:** Phase 4 (Attachment Handling) — specific to blob operations

**Sources:**
- [JMAP Core Specification - Blob Lifecycle](https://jmap.io/spec-core.html)
- [JMAP Mail Specification](https://jmap.io/spec-mail.html)

---

### Pitfall 9: Result Reference Resolution Failures

**What goes wrong:** JMAP request batches multiple operations using `#` result references (create draft → add to mailbox using `#draft` reference), but reference fails to resolve. Entire method is rejected with `invalidResultReference`, not just the dependent operation.

**Why it happens:** Result references fail if: (1) referenced method hasn't executed yet (order dependency), (2) referenced method failed, (3) creation ID doesn't match, or (4) path traversal is incorrect. Developers assume partial failure, but spec says "whole method MUST be rejected."

**Prevention:**
1. **Respect method execution order:** Methods execute in array order, reference only prior methods
2. **Check for method-level errors before using references:** If Email/set failed, don't reference its creation IDs
3. **Use consistent creation IDs:** Don't reuse IDs across request — JMAP maps to "most recently created item" which may not be what you want
4. **Test reference paths:** `#draft/id` for created object ID, `#search/ids/0` for first search result
5. **Validate before batch:** Ensure all prerequisite data exists before creating reference chain

**Detection warning signs:**
- `invalidResultReference` errors in logs
- Batch operations failing entirely
- Complex multi-step operations (create → move → send) unreliable
- Inconsistent behavior based on operation order

**Phase to address:** Phase 1 (Core JMAP Client) — impacts batching strategy

**Sources:**
- [JMAP Core Specification - References](https://jmap.io/spec-core.html)
- [JMAP Server Implementation Guide](https://jmap.io/server.html)

---

## Minor Pitfalls

Mistakes that cause annoyance but are easily fixable.

### Pitfall 10: Logging Token Leakage

**What goes wrong:** Debug logs contain bearer tokens, refresh tokens, or OIDC codes. Logs viewed by support staff or exported for debugging expose credentials.

**Why it happens:** Developers add verbose logging during auth debugging, logging entire request headers or response bodies. Forget to remove or redact before shipping.

**Prevention:**
1. **Redact by default:** Use Pino redaction for `Authorization` header, `access_token`, `refresh_token`, `code` fields
2. **Never log token values:** Log "token present: yes/no" not actual token
3. **Sanitize errors:** Catch errors from `openid-client`, remove token fields before logging
4. **Use DEBUG env var:** Verbose auth logging only when `DEBUG=mcp-twake-mail:auth` set

**Detection warning signs:**
- Bearer tokens visible in stderr
- Authorization headers in logs
- Refresh tokens in error messages
- No redaction patterns in logger config

**Phase to address:** Phase 2 (Authentication) — security hygiene

---

### Pitfall 11: Session Refetch Thrashing

**What goes wrong:** Client refetches session from `/.well-known/jmap` on every request instead of caching. Each operation makes 2 requests: session + actual operation. Doubles latency and server load.

**Why it happens:** Developers follow examples that fetch session for every operation. Don't realize session is stable until `sessionState` changes.

**Prevention:**
1. **Cache session object:** Fetch once at startup, store in memory
2. **Watch sessionState:** Only refetch when response includes different `sessionState`
3. **TTL for paranoia:** Refetch after 1 hour even if sessionState unchanged
4. **Explicit refresh method:** Expose `refreshSession()` for post-auth re-fetch

**Detection warning signs:**
- Every operation logs "fetching session"
- Double request count in metrics
- Latency consistently 2x expected
- Session endpoint sees same traffic as operation endpoints

**Phase to address:** Phase 1 (Core JMAP Client) — performance optimization

---

### Pitfall 12: Email Encoding Assumptions

**What goes wrong:** Email contains non-ASCII characters (emojis, Chinese characters), client assumes UTF-8, displays as mojibake or corrupts on send.

**Why it happens:** JMAP RFC-8621 uses UTF-8 for JSON, but email RFC-5322 messages can use various encodings. Developers don't decode `Content-Type: charset=iso-8859-1` headers.

**Prevention:**
1. **Respect charset in bodyValues:** JMAP server decodes to UTF-8, but verify
2. **Test with international emails:** Chinese, Arabic, emoji-heavy threads
3. **Send as UTF-8:** Use `Content-Type: text/plain; charset=utf-8` in email submissions
4. **Handle encoding errors gracefully:** If decode fails, show "[unreadable content]" not crash

**Detection warning signs:**
- Mojibake in email previews
- Non-ASCII characters rendered as `?` or boxes
- Sending fails for emails with emojis
- No charset handling in bodyValues parsing

**Phase to address:** Phase 3 (Tool Design - Email Display) — caught during testing

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 1: Core JMAP Client | State management treated as optional, manual state tracking skipped | Build state tracking into base client class, make it impossible to skip |
| Phase 1: Core JMAP Client | Fetch timeout not implemented, hangs on network issues | Require AbortSignal.timeout() in base fetch wrapper, no raw fetch calls |
| Phase 2: Authentication | PKCE "plain" method used instead of S256 | Code review checklist item, validate in test suite |
| Phase 2: Authentication | Tokens logged during debugging, not redacted before ship | Pino redaction configured from day 1, never raw console.log |
| Phase 3: Tool Design | Tool descriptions too verbose, context window bloat | Character limit on descriptions (200 chars max), enforce in tests |
| Phase 3: Tool Design | Default to returning full email bodies in searches | Always default to preview, require explicit `include_body: true` parameter |
| Phase 4: Attachment Handling | Blob lifecycle misunderstood, 1-hour deletion window ignored | Document blob lifecycle in comments, example code shows immediate reference |
| Phase 5: Error Handling | Only HTTP errors handled, JMAP method/record errors ignored | Require error handler to return JMAP-specific error messages, test each error type |
| Phase 6: Testing | Only test against mock server, not real Apache James | CI must include integration test against jmap.linagora.com or local James instance |

---

## Production Deployment Pitfalls

### Pitfall 13: Missing Observability in Production

**What goes wrong:** MCP server runs in production, tools fail intermittently, but no metrics/logs/traces exist to diagnose. Support team blind to what's happening.

**Why it happens:** MCP servers run as local stdio processes in Claude Desktop. Developers don't instrument because "it's just a local tool." No centralized logging, no error tracking, no performance monitoring.

**Prevention:**
1. **Structured logging:** Pino with JSON output to stderr, rotated daily
2. **Tool call metrics:** Log every tool invocation: name, parameters (redacted), duration, success/failure
3. **Error tracking:** Log stack traces with context (which tool, which JMAP method, server response)
4. **Performance monitoring:** Track p50/p95/p99 latency for JMAP operations
5. **Health check endpoint:** Consider HTTP server for /health if running as daemon (future SSE transport)

**Detection warning signs:**
- No way to debug user-reported issues
- "It works on my machine" syndrome
- No visibility into production error rates
- Unable to detect performance degradation

**Phase to address:** Phase 0 (Project Setup) — logging infrastructure from start

**Sources:**
- [MCP Server Observability Guide](https://zeo.org/resources/blog/mcp-server-observability-monitoring-testing-performance-metrics)
- [MCP Observability Best Practices](https://www.merge.dev/blog/mcp-observability)
- [Real-Time MCP Monitoring](https://www.stainless.com/mcp/real-time-mcp-monitoring-and-logging)

---

### Pitfall 14: Rate Limiting Ignored

**What goes wrong:** User asks Claude to "search all emails from this year", MCP server fires 500 JMAP requests in 10 seconds, jmap.linagora.com rate limits or bans the IP. All operations fail for hours.

**Why it happens:** Developers don't implement backpressure or rate limiting. Server has no throttle, fires requests as fast as LLM generates them. Apache James or reverse proxy has undocumented rate limits.

**Prevention:**
1. **Client-side rate limit:** Max 10 JMAP requests per second, queue excess
2. **Respect Retry-After:** If server returns 429 Too Many Requests, honor Retry-After header
3. **Exponential backoff:** On 429, wait 1s, 2s, 4s, 8s before failing
4. **Batch when possible:** Combine multiple Email/get into single request
5. **Pagination limits:** Never query for 1000+ emails, cap at 100 per query

**Detection warning signs:**
- 429 errors in logs
- Sudden flood of requests in short time window
- Operations succeed in development but fail in production
- No rate limiting or backoff logic

**Phase to address:** Phase 1 (Core JMAP Client) — foundational for production stability

**Sources:**
- [Email Server Rate Limiting Best Practices](https://learn.microsoft.com/en-us/exchange/mail-flow/message-rate-limits)
- [Backpressure in Distributed Systems](https://www.geeksforgeeks.org/computer-networks/back-pressure-in-distributed-systems/)
- [Traffic Shedding, Rate Limiting, Backpressure](https://medium.com/expedia-group-tech/traffic-shedding-rate-limiting-backpressure-oh-my-21f95c403b29)

---

## Summary: Top 5 Critical Mistakes to Avoid

1. **Ignoring JMAP state management** → Stale data, infinite refresh loops, cache corruption
2. **Oversized MCP tool responses** → Context window overflow, truncated results, poor UX
3. **Insecure OIDC+PKCE implementation** → Token leakage, auth code interception, compliance failures
4. **No fetch timeouts** → Hanging operations, frozen UI, poor reliability
5. **Missing production observability** → Blind to failures, unable to debug, support nightmare

## Recommended Reading Order for Implementation

1. Read this document first, before writing code
2. Review JMAP Core spec focusing on state management and error handling sections
3. Study MCP best practices on context window optimization
4. Examine reference implementation (wyattjoh/jmap-mcp) for proven patterns
5. Implement Phase 1 with state tracking and timeout handling from day 1
6. Return to this document before each phase to review phase-specific warnings

---

## Sources & Confidence Levels

**HIGH Confidence Sources:**
- [JMAP Core Specification (RFC 8620)](https://jmap.io/spec-core.html) — Official IETF standard
- [JMAP Mail Specification (RFC 8621)](https://jmap.io/spec-mail.html) — Official IETF standard
- [RFC 7636 - PKCE](https://datatracker.ietf.org/doc/html/rfc7636) — Official IETF standard
- [Apache James JMAP Configuration](https://james.apache.org/server/config-jmap.html) — Official docs
- [MCP Specification](https://modelcontextprotocol.io/specification/draft/basic/security_best_practices) — Official spec

**MEDIUM Confidence Sources:**
- [MCP Context Window Discussion](https://github.com/orgs/modelcontextprotocol/discussions/532) — Community discussion
- [MCP Best Practices Articles](https://www.cdata.com/blog/mcp-server-best-practices-2026) — Third-party analysis
- [JMAP MCP Reference Implementation](https://github.com/wyattjoh/jmap-mcp) — Working example
- [OIDC Security Best Practices](https://blog.gitguardian.com/oidc-for-developers-auth-integration/) — Security vendor guidance
- [MCP Observability Guides](https://zeo.org/resources/blog/mcp-server-observability-monitoring-testing-performance-metrics) — Vendor documentation

**LOW Confidence (Needs Validation):**
- Specific rate limits for jmap.linagora.com (not publicly documented)
- Apache James Cassandra backend consistency specifics (version-dependent)
- Exact context window consumption per tool (varies by MCP client)

---

*Research completed: 2026-01-29*
*Overall confidence: MEDIUM — strong on specs (JMAP, PKCE, MCP), moderate on production deployment patterns*
