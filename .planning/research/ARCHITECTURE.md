# Architecture Patterns: MCP JMAP Email Server

**Domain:** MCP server for JMAP email operations
**Researched:** 2026-01-29
**Confidence:** HIGH (based on mcp-twake-dav reference implementation, JMAP specifications, and client libraries)

## Recommended Architecture

MCP JMAP email servers should follow a **layered architecture with clear separation of concerns**, mirroring the proven structure of mcp-twake-dav while adapting to JMAP's stateless, session-based protocol design.

```
┌─────────────────────────────────────────────────────────┐
│  Entry Point (index.ts)                                 │
│  - CLI routing (setup wizard vs server mode)            │
│  - Startup validation sequence                          │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│  MCP Server Setup (server.ts)                           │
│  - McpServer initialization with metadata               │
│  - Tool registration orchestration                      │
│  - Stdio transport connection                           │
└────────────────┬────────────────────────────────────────┘
                 │
    ┌────────────┴───────────────┬─────────────────┐
    │                            │                 │
┌───▼──────────────┐  ┌──────────▼──────────┐  ┌──▼─────────────┐
│ Configuration    │  │ Logging             │  │ JMAP Client    │
│ - Zod schemas    │  │ - Pino to stderr    │  │ - Session mgmt │
│ - Env validation │  │ - Structured logs   │  │ - Auth layer   │
│ - HTTPS enforce  │  │                     │  │ - Request API  │
└──────────────────┘  └─────────────────────┘  └────┬───────────┘
                                                     │
                              ┌──────────────────────┴────────────┐
                              │                                   │
                   ┌──────────▼─────────────┐      ┌─────────────▼────────────┐
                   │ Email Service          │      │ Mailbox Service          │
                   │ - Message operations   │      │ - Folder operations      │
                   │ - State management     │      │ - Hierarchy management   │
                   │ - Search & filter      │      │ - Role detection         │
                   │ - Thread handling      │      │                          │
                   └───────────┬────────────┘      └──────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                │                             │
    ┌───────────▼──────────┐      ┌──────────▼──────────┐
    │ Transformers         │      │ Tools (MCP layer)   │
    │ - JMAP → DTO         │      │ - One file per tool │
    │ - DTO → User format  │      │ - Zod input schemas │
    │ - Type conversions   │      │ - MCP annotations   │
    │ - Date handling      │      │ - Error handling    │
    └──────────────────────┘      └─────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With | Dependencies |
|-----------|---------------|-------------------|--------------|
| **index.ts** | Entry point, CLI routing, startup orchestration | server.ts, config, logger, JMAP client, services | @modelcontextprotocol/sdk, config, logger |
| **server.ts** | MCP server factory, tool registration | tools/*, services | @modelcontextprotocol/sdk |
| **config/schema.ts** | Environment validation, Zod schemas | None (pure validation) | zod |
| **config/logger.ts** | Pino logger configuration | None (stderr output) | pino |
| **jmap/client.ts** | JMAP session management, authentication | JMAP server (HTTP) | jmap-jam or jmap-client-ts |
| **jmap/email-service.ts** | Email operations, state tracking | JMAP client, transformers | JMAP client |
| **jmap/mailbox-service.ts** | Mailbox operations, hierarchy | JMAP client, transformers | JMAP client |
| **transformers/** | Data transformation, DTO creation | Services, tools | None |
| **tools/** | MCP tool implementations | Services, transformers | @modelcontextprotocol/sdk, zod |
| **types/** | TypeScript interfaces, DTOs | All components | None |
| **errors.ts** | AI-friendly error formatting | All components | None |

### Data Flow

**Startup Flow:**
```
1. index.ts validates config (Zod schema)
2. Initialize logger (Pino → stderr)
3. Create JMAP client with session URL + auth
4. Fetch JMAP session (validates connection + capabilities)
5. Initialize services (EmailService, MailboxService)
6. Create MCP server via server.ts factory
7. Register all tools (tools/index.ts)
8. Connect stdio transport
```

**Tool Invocation Flow (Read Operation):**
```
1. MCP client → stdio → MCP server
2. Tool handler validates params (Zod)
3. Tool calls service method
4. Service calls JMAP client
5. JMAP client builds method call JSON
6. HTTP POST to JMAP API endpoint
7. Parse JMAP response
8. Service returns raw JMAP objects
9. Transformer converts to DTO
10. Tool formats for AI consumption
11. Return via MCP protocol
```

**Tool Invocation Flow (Write Operation):**
```
1. MCP client → stdio → MCP server
2. Tool handler validates params (Zod)
3. Tool calls service method
4. Service may fetch current state (for updates)
5. Transformer builds JMAP object
6. JMAP client executes Email/set or Mailbox/set
7. Parse response (created/updated/notCreated)
8. Service invalidates any cached state
9. Tool returns success or conflict error
10. Return via MCP protocol
```

**State Synchronization Flow:**
```
1. Service maintains JMAP state token
2. On operations, check if state changed
3. If changed: call Email/changes or Mailbox/changes
4. Update local state representation
5. Return delta to caller
```

## Patterns to Follow

### Pattern 1: Session-Based Client Initialization

**What:** JMAP uses stateless HTTP with session objects containing capabilities and endpoints.

**When:** Always required for JMAP communication.

**Why:** Session object provides account IDs, capability URIs, and API endpoints needed for all subsequent requests.

**Example:**
```typescript
import { Client } from 'jmap-jam';

export async function createJMAPClient(config: Config): Promise<Client> {
  const client = new Client({
    bearerToken: config.JMAP_TOKEN,
    sessionUrl: config.JMAP_SESSION_URL,
  });

  // Fetch session to validate connection and get capabilities
  await client.fetchSession();

  return client;
}
```

**Reference:** JMAP Core RFC 8620 Section 2 (Session Resource)

### Pattern 2: Method Call Batching

**What:** JMAP supports multiple method calls in a single HTTP request.

**When:** Operations that require related data or sequential updates.

**Why:** Reduces round trips, maintains consistency, enables result references between method calls.

**Example:**
```typescript
// Batch mailbox list + email query in one request
const response = await client.requestMany([
  ['Mailbox/get', { accountId }, 'r1'],
  ['Email/query', {
    accountId,
    filter: { inMailbox: '#r1.list[0].id' }  // Reference first mailbox
  }, 'r2']
]);
```

**Reference:** JMAP Core RFC 8620 Section 3.2 (Method Calls and Responses)

### Pattern 3: State-Based Synchronization

**What:** JMAP uses state tokens to track changes since last fetch.

**When:** Maintaining consistency with server state, especially for long-lived sessions.

**Why:** Enables efficient delta synchronization without re-fetching all data.

**Example:**
```typescript
export class EmailService {
  private emailState: string | null = null;

  async syncChanges(): Promise<EmailChanges> {
    const response = await client.request('Email/changes', {
      accountId: this.accountId,
      sinceState: this.emailState,
    });

    this.emailState = response.newState;
    return response;
  }
}
```

**Reference:** JMAP Core RFC 8620 Section 5.2 (Changes)

### Pattern 4: Parse-Modify-Serialize for Updates

**What:** Fetch → Transform → Modify → Serialize → Update pattern preserving properties.

**When:** Updating existing JMAP objects (emails with keywords, mailboxes).

**Why:** JMAP allows partial updates via `/set` patches, but client-side transformations need original data.

**Example:**
```typescript
async updateEmailKeywords(emailId: string, keywords: string[]): Promise<void> {
  // Fetch current state
  const current = await this.fetchEmailById(emailId);

  // Build patch
  const patch = {
    keywords: Object.fromEntries(keywords.map(k => [k, true]))
  };

  // Update via Email/set
  await client.request('Email/set', {
    accountId: this.accountId,
    update: {
      [emailId]: patch
    }
  });
}
```

**Reference:** JMAP Mail RFC 8621 Section 4.4 (Email/set)

### Pattern 5: Transformer Layer Abstraction

**What:** Separate transformation logic from service layer and MCP tools.

**When:** Converting between JMAP objects, DTOs, and AI-friendly formats.

**Why:** Keeps services focused on protocol operations, tools focused on MCP concerns.

**Example:**
```typescript
// transformers/email.ts
export function transformEmail(jmapEmail: JMAPEmail): EmailDTO {
  return {
    id: jmapEmail.id,
    threadId: jmapEmail.threadId,
    subject: jmapEmail.subject,
    from: parseEmailAddresses(jmapEmail.from),
    receivedAt: new Date(jmapEmail.receivedAt),
    keywords: Object.keys(jmapEmail.keywords || {}),
    // ... additional transformations
  };
}

// tools/email/search.ts - uses transformer
const emails = rawResults.map(transformEmail);
```

**Reference:** mcp-twake-dav pattern (src/transformers/*)

### Pattern 6: Tool Annotations for AI Clients

**What:** MCP tool metadata hints (readOnlyHint, destructiveHint, openWorldHint).

**When:** Every tool registration.

**Why:** AI clients can make better decisions about tool usage and confirmation prompts.

**Example:**
```typescript
server.tool(
  'delete_email',
  'Delete an email by moving it to trash',
  {
    emailId: z.string().describe('Email ID to delete'),
  },
  {
    readOnlyHint: false,      // Modifies state
    destructiveHint: true,    // Potentially irreversible
    openWorldHint: false,     // Closed operation
  },
  async (params) => { /* ... */ }
);
```

**Reference:** MCP Best Practices 2026

### Pattern 7: Passive State Management

**What:** Services check state changes, don't cache-drive fetches.

**When:** Email and mailbox operations.

**Why:** JMAP's state tokens make server authoritative; clients verify freshness rather than assume validity.

**Example:**
```typescript
export class EmailService {
  private cachedEmails: Map<string, EmailDTO> = new Map();
  private emailState: string | null = null;

  async fetchEmails(mailboxId: string): Promise<EmailDTO[]> {
    // Check if state changed
    const currentState = await this.getCurrentState();

    if (this.emailState !== currentState) {
      // State changed, re-fetch
      this.cachedEmails.clear();
      const emails = await this.fetchFromServer(mailboxId);
      this.emailState = currentState;
      return emails;
    }

    // State unchanged, return cached
    return Array.from(this.cachedEmails.values());
  }
}
```

**Reference:** mcp-twake-dav cache pattern (src/caldav/cache.ts)

## Anti-Patterns to Avoid

### Anti-Pattern 1: Treating JMAP Like IMAP

**What:** Using stateful connection patterns, assuming push-based updates.

**Why bad:** JMAP is stateless HTTP/REST; connections don't maintain server state. No persistent session like IMAP.

**Instead:** Use session tokens and state strings. Poll for changes or use EventSource for push (RFC 8887).

**Detection:** If you're maintaining "connection state" beyond authentication tokens, you're doing it wrong.

### Anti-Pattern 2: Monolithic Service Classes

**What:** Single "JMAPService" handling emails, mailboxes, threads, identities, submissions.

**Why bad:** Violates single responsibility, makes testing difficult, tight coupling.

**Instead:** Separate services per JMAP data type: EmailService, MailboxService, ThreadService, etc.

**Detection:** Service class with >500 lines or >10 public methods.

### Anti-Pattern 3: Direct JMAP Objects in MCP Tools

**What:** Passing raw JMAP Email objects directly to MCP tool responses.

**Why bad:** JMAP structure is verbose (headers split across multiple properties), not AI-optimized.

**Instead:** Transform to DTOs with flattened, semantic structure before formatting for MCP.

**Detection:** Tool response contains fields like `bodyValues`, `header:from:asAddresses`.

### Anti-Pattern 4: Ignoring JMAP Capabilities

**What:** Hardcoding method calls without checking session capabilities.

**Why bad:** Different JMAP servers support different extensions (JMAP Sieve, JMAP Contacts, etc.).

**Instead:** Check `session.capabilities` before calling extension methods.

**Example:**
```typescript
// BAD
await client.request('SieveScript/get', { ... });

// GOOD
const hasSieve = 'urn:ietf:params:jmap:sieve' in session.capabilities;
if (hasSieve) {
  await client.request('SieveScript/get', { ... });
}
```

### Anti-Pattern 5: Synchronous Error Propagation

**What:** Letting JMAP client errors bubble up as generic HTTP errors.

**Why bad:** MCP clients (AI) need actionable error messages, not "HTTP 401".

**Instead:** Format errors with "what went wrong" + "how to fix it" pattern.

**Example:**
```typescript
// From mcp-twake-dav errors.ts pattern
export function formatStartupError(error: Error, jmapUrl?: string): string {
  if (error.message.includes('401')) {
    return `
What went wrong:
  Authentication failed with the JMAP server at ${jmapUrl}

How to fix it:
  1. Verify your JMAP_TOKEN is valid and not expired
  2. Check that the token has permission to access this account
  3. Ensure the session URL is correct
    `;
  }
  // ... more error cases
}
```

### Anti-Pattern 6: Not Handling Method-Level Errors

**What:** Only checking HTTP response status, not `notCreated`/`notUpdated` in `/set` responses.

**Why bad:** JMAP returns 200 OK even if individual operations fail at method or record level.

**Instead:** Check `created`, `updated`, `notCreated`, `notUpdated` maps in responses.

**Example:**
```typescript
const response = await client.request('Email/set', {
  create: { 'draft1': draftObject }
});

if (response.notCreated?.draft1) {
  throw new Error(`Failed to create draft: ${response.notCreated.draft1.type}`);
}

const createdId = response.created.draft1.id;
```

**Reference:** JMAP Core RFC 8620 Section 5.3 (Set)

## Scalability Considerations

| Concern | Initial (MVP) | At 1K users | At 10K+ users |
|---------|--------------|-------------|---------------|
| **Session caching** | In-memory session per instance | Redis-backed session cache | Distributed session store with TTL |
| **State tracking** | Per-service state tokens | Per-account state in DB | Event-driven state sync via queue |
| **Request batching** | Manual batch in tools | Automatic batch aggregation | Request coalescing with debounce |
| **Connection pooling** | Native fetch | HTTP agent with keepalive | Connection pool manager |
| **Rate limiting** | Client-side retry with backoff | Token bucket per account | Distributed rate limiter (Redis) |
| **Push notifications** | Polling only | EventSource per account | WebSocket fanout via message broker |

## JMAP-Specific Architectural Decisions

### 1. Account ID Resolution

**Decision:** Store primary account ID from session at service initialization.

**Rationale:** JMAP session can expose multiple accounts; most MCP operations target primary account.

**Implementation:**
```typescript
export class EmailService {
  private readonly accountId: string;

  constructor(client: JMAPClient, session: Session) {
    // Use first account or configured primary
    this.accountId = session.primaryAccounts['urn:ietf:params:jmap:mail'];
  }
}
```

### 2. Method Call Fluency vs Batching

**Decision:** Services expose single-operation methods; tools may batch internally.

**Rationale:** Service API clarity over premature optimization; batching complexity at tool layer where context exists.

**Example:**
```typescript
// Service: Simple methods
class EmailService {
  async fetchEmail(id: string): Promise<Email> { ... }
  async searchEmails(filter: Filter): Promise<Email[]> { ... }
}

// Tool: Batch when semantically grouped
async function get_email_with_thread(params) {
  // Batch email fetch + thread fetch in one request
  const [emailResponse, threadResponse] = await client.requestMany([
    ['Email/get', { ids: [params.emailId] }, 'r1'],
    ['Email/get', {
      filter: { threadId: '#r1.list[0].threadId' }
    }, 'r2']
  ]);
}
```

### 3. Thread vs Email Retrieval

**Decision:** EmailService returns emails; separate ThreadService for thread operations.

**Rationale:** JMAP Thread is a distinct type; mixing responsibilities violates SRP.

**Implementation:**
```
EmailService:
  - Email/get, Email/query, Email/set
  - Returns Email DTOs

ThreadService:
  - Thread/get (returns thread structure)
  - Email/get with threadId filter (returns emails in thread)
  - Returns Thread DTOs with email references
```

### 4. Keyword Mapping

**Decision:** Transform JMAP keywords to semantic flags in DTOs.

**Rationale:** JMAP uses `{ "$seen": true, "$draft": true }` format; DTOs should use `isRead: boolean, isDraft: boolean`.

**Implementation:**
```typescript
export interface EmailDTO {
  id: string;
  isRead: boolean;      // from keywords.$seen
  isFlagged: boolean;   // from keywords.$flagged
  isDraft: boolean;     // from keywords.$draft
  isAnswered: boolean;  // from keywords.$answered
  labels: string[];     // from non-system keywords
}
```

### 5. Mailbox Hierarchy Representation

**Decision:** Services return flat arrays; transformers build hierarchical trees if needed.

**Rationale:** JMAP Mailbox/get returns flat list with `parentId`; tree construction is presentation logic.

**Implementation:**
```typescript
// Service returns flat
async listMailboxes(): Promise<Mailbox[]> {
  const response = await client.request('Mailbox/get', { ... });
  return response.list;
}

// Transformer builds tree for tools that need hierarchy
export function buildMailboxTree(mailboxes: Mailbox[]): MailboxTree {
  const roots = mailboxes.filter(m => !m.parentId);
  const buildChildren = (parent: Mailbox) => ({
    ...parent,
    children: mailboxes.filter(m => m.parentId === parent.id)
      .map(buildChildren)
  });
  return roots.map(buildChildren);
}
```

## Build Order (Dependency Sequence)

The following order minimizes rework by building foundation before dependent layers:

### Phase 1: Foundation
1. **config/schema.ts** - Environment validation (JMAP_SESSION_URL, JMAP_TOKEN)
2. **config/logger.ts** - Pino logger to stderr
3. **types/** - Core TypeScript interfaces and DTOs
4. **errors.ts** - AI-friendly error formatting

**Why first:** Zero dependencies; required by all other components.

### Phase 2: JMAP Client Layer
1. **jmap/client.ts** - Session management, authentication, request wrapper
2. **jmap/client.test.ts** - Validate session fetch, auth headers

**Why second:** Foundation established; services depend on client.

**Validation:** Successfully fetch session object from real JMAP server.

### Phase 3: Service Layer (Read Operations)
1. **jmap/mailbox-service.ts** - Mailbox/get, Mailbox/query
2. **jmap/email-service.ts** - Email/get, Email/query, Email/changes
3. **Service tests** - Mock JMAP client responses

**Why third:** Client ready; transformers and tools depend on services.

**Validation:** Services return raw JMAP objects correctly.

### Phase 4: Transformers
1. **transformers/mailbox.ts** - JMAP Mailbox → MailboxDTO
2. **transformers/email.ts** - JMAP Email → EmailDTO (with keyword mapping)
3. **transformers/thread.ts** - JMAP Thread → ThreadDTO
4. **Transformer tests** - Verify transformations preserve data

**Why fourth:** Services provide raw data; tools need transformed data.

**Validation:** DTOs have semantic, AI-friendly structure.

### Phase 5: MCP Tools (Read-Only)
1. **tools/mailbox/list.ts** - List all mailboxes
2. **tools/email/search.ts** - Search emails by query
3. **tools/email/get.ts** - Get single email by ID
4. **tools/thread/get.ts** - Get thread with all emails
5. **tools/index.ts** - Tool registration aggregator

**Why fifth:** All dependencies ready; write operations can reuse patterns.

**Validation:** Tools return formatted text via MCP protocol.

### Phase 6: MCP Server Setup
1. **server.ts** - McpServer factory with tool registration
2. **index.ts** - Entry point with startup sequence
3. **Integration test** - Full MCP request/response cycle

**Why sixth:** All tools implemented; ready for stdio transport.

**Validation:** MCP client can invoke tools successfully.

### Phase 7: Service Layer (Write Operations)
1. **jmap/email-service.ts** - Email/set (create, update, destroy)
2. **jmap/mailbox-service.ts** - Mailbox/set
3. **Service tests** - Verify create/update/destroy operations

**Why seventh:** Read operations proven; write uses same service pattern.

**Validation:** Operations modify server state correctly.

### Phase 8: MCP Tools (Write Operations)
1. **tools/email/create-draft.ts** - Create draft email
2. **tools/email/send.ts** - Send email via EmailSubmission
3. **tools/email/update.ts** - Update email (keywords, mailbox)
4. **tools/email/delete.ts** - Destroy email
5. **tools/mailbox/create.ts** - Create mailbox
6. **tools/mailbox/delete.ts** - Destroy mailbox

**Why eighth:** Write services ready; tools follow read tool patterns.

**Validation:** Write operations succeed and return confirmation.

### Phase 9: Advanced Features
1. **jmap/thread-service.ts** - Thread/get with email expansion
2. **tools/email/thread-view.ts** - Get threaded conversation
3. **State synchronization** - Email/changes, Mailbox/changes polling
4. **Push notifications** - EventSource for real-time updates (optional)

**Why last:** Core functionality complete; these enhance UX.

**Validation:** Threads display correctly; state stays synchronized.

## Sources

**JMAP Specifications (HIGH Confidence):**
- [JMAP: A modern, open email protocol](https://www.ietf.org/blog/jmap/) - IETF official overview
- [JMAP Core Specification (RFC 8620)](https://jmap.io/spec-core.html) - Protocol architecture and request/response patterns
- [JMAP Mail Specification](https://jmap.io/spec-mail.html) - Email, Mailbox, Thread data models and methods
- [JSON Meta Application Protocol Specification](https://jmap.io/) - Official JMAP website

**JMAP Client Libraries (MEDIUM-HIGH Confidence):**
- [jmap-jam - npm](https://www.npmjs.com/package/jmap-jam) - TypeScript client with fluent APIs
- [GitHub - linagora/jmap-client-ts](https://github.com/linagora/jmap-client-ts) - JMAP 1.0 client library in TypeScript
- [GitHub - jmapio/jmap-js](https://github.com/jmapio/jmap-js) - Full JavaScript implementation of JMAP data model

**MCP Best Practices (HIGH Confidence):**
- [MCP Server Best Practices for 2026](https://www.cdata.com/blog/mcp-server-best-practices-2026)
- [Architecture overview - Model Context Protocol](https://modelcontextprotocol.io/docs/learn/architecture)
- [MCP Best Practices: Architecture & Implementation Guide](https://modelcontextprotocol.info/docs/best-practices/)

**Reference Implementation (HIGH Confidence):**
- mcp-twake-dav codebase at /Users/mmaudet/work/mcp-twake-dav - Proven layered architecture for MCP + DAV protocols
