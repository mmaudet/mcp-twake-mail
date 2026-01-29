# Phase 3: Core Read Operations - Research

**Researched:** 2026-01-29
**Domain:** MCP Server with JMAP Email/Mailbox read operations
**Confidence:** HIGH

## Summary

This phase implements the MCP (Model Context Protocol) server for email read operations, integrating with the existing JMAPClient from Phase 2. Research focused on three key areas: MCP SDK patterns for TypeScript server implementation, JMAP RFC 8621 methods for Email and Mailbox queries, and DTO transformation patterns for simplifying JMAP data.

The @modelcontextprotocol/sdk v1.25.3 (already installed) provides the `McpServer` class with `registerTool()` for defining tools with annotations. The SDK uses `StdioServerTransport` for stdio communication, which aligns with MCP-03 requirement. JMAP RFC 8621 defines comprehensive Email/query and Mailbox/get methods with rich filtering capabilities that map directly to the required search functionality.

**Primary recommendation:** Use `McpServer.registerTool()` with Zod schemas for input validation and explicit `ToolAnnotations` for all read-only tools. Transform JMAP responses to simplified DTOs that expose boolean flags instead of keyword objects.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @modelcontextprotocol/sdk | ^1.25.3 | MCP server implementation | Official Anthropic SDK, already installed |
| zod | ^4.3.6 | Input schema validation | Required peer dependency of MCP SDK, already installed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pino | ^10.3.0 | Logging (stderr only) | Already configured in Phase 1, required for stdio safety |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| McpServer class | Low-level Server class | Server requires manual handler registration, McpServer provides higher-level API |
| registerTool() | deprecated tool() | tool() works but is deprecated in v1.25.3 |

**Installation:**
All required packages already installed. No additional installation needed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── mcp/
│   ├── server.ts           # MCP server setup and initialization
│   ├── tools/
│   │   ├── index.ts        # Tool registration aggregator
│   │   ├── email.ts        # get_email, search_emails, get_email_labels tools
│   │   └── mailbox.ts      # get_mailbox, list_mailboxes tools
│   └── schemas/
│       ├── email.ts        # Zod schemas for email tool inputs
│       └── mailbox.ts      # Zod schemas for mailbox tool inputs
├── transformers/
│   ├── email.ts            # JMAP Email -> SimplifiedEmail DTO
│   └── mailbox.ts          # JMAP Mailbox -> SimplifiedMailbox DTO
└── types/
    └── dto.ts              # SimplifiedEmail, SimplifiedMailbox interfaces
```

### Pattern 1: MCP Server with StdioServerTransport
**What:** Initialize McpServer and connect via stdio for Claude/LLM communication
**When to use:** Always for this project (MCP-03 requirement)
**Example:**
```typescript
// Source: MCP SDK documentation + official examples
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: 'mcp-twake-mail',
  version: '0.1.0',
});

// Register tools before connecting...

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Pattern 2: Tool Registration with Annotations
**What:** Use registerTool() with explicit annotations for AI behavior hints
**When to use:** All tool definitions (MCP-02 requirement)
**Example:**
```typescript
// Source: MCP SDK types.d.ts, official docs
import { z } from 'zod';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

const annotations: ToolAnnotations = {
  title: 'Get Email',
  readOnlyHint: true,        // Does not modify data
  destructiveHint: false,    // Cannot destroy data
  idempotentHint: true,      // Same result for same input
  openWorldHint: true,       // Interacts with external JMAP server
};

server.registerTool(
  'get_email',
  {
    title: 'Get Email by ID',
    description: 'Retrieve a specific email by its ID with full content',
    inputSchema: {
      emailId: z.string().describe('The unique email identifier'),
      properties: z.array(z.string()).optional()
        .describe('Optional list of properties to fetch'),
    },
    annotations,
  },
  async ({ emailId, properties }, extra) => {
    // Implementation...
    return {
      content: [{ type: 'text', text: JSON.stringify(simplifiedEmail) }],
    };
  }
);
```

### Pattern 3: JMAP Request via JMAPClient
**What:** Use existing JMAPClient.request() for batched JMAP calls
**When to use:** All JMAP operations
**Example:**
```typescript
// Source: Existing src/jmap/client.ts
const session = client.getSession();
const response = await client.request([
  ['Email/query', {
    accountId: session.accountId,
    filter: { inMailbox: mailboxId, text: searchText },
    sort: [{ property: 'receivedAt', isAscending: false }],
    limit: 50,
  }, 'q1'],
  ['Email/get', {
    accountId: session.accountId,
    '#ids': { resultOf: 'q1', name: 'Email/query', path: '/ids' },
    properties: ['id', 'threadId', 'mailboxIds', 'keywords', 'from', 'to', 'subject', 'receivedAt', 'preview', 'hasAttachment'],
  }, 'g1'],
]);
```

### Pattern 4: DTO Transformation with Keyword Mapping
**What:** Transform JMAP keywords object to explicit boolean flags
**When to use:** All transformer functions (TRANS-03 requirement)
**Example:**
```typescript
// Source: RFC 8621 Section 4.1.1 keywords
interface JMAPKeywords {
  '$seen'?: boolean;
  '$flagged'?: boolean;
  '$draft'?: boolean;
  '$answered'?: boolean;
  '$forwarded'?: boolean;
  [key: string]: boolean | undefined;
}

function transformKeywords(keywords: JMAPKeywords = {}): {
  isRead: boolean;
  isFlagged: boolean;
  isDraft: boolean;
  isAnswered: boolean;
  isForwarded: boolean;
} {
  return {
    isRead: keywords['$seen'] === true,
    isFlagged: keywords['$flagged'] === true,
    isDraft: keywords['$draft'] === true,
    isAnswered: keywords['$answered'] === true,
    isForwarded: keywords['$forwarded'] === true,
  };
}
```

### Anti-Patterns to Avoid
- **Writing to stdout in server code:** Console.log corrupts MCP JSON-RPC. Use pino with stderr.
- **Using deprecated tool() method:** Use registerTool() for consistency and future compatibility.
- **Exposing raw JMAP objects:** Always transform to simplified DTOs for AI consumption.
- **Missing tool annotations:** All tools must have readOnlyHint, destructiveHint, idempotentHint, openWorldHint.
- **Synchronous JMAP operations:** Always use async/await with proper error handling.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP JSON-RPC protocol | Custom JSON-RPC parser | @modelcontextprotocol/sdk | Complex protocol with versioning, transport abstraction |
| Input validation | Manual type checking | Zod schemas with SDK | SDK integrates Zod, automatic error messages |
| Stdio transport | Raw stdin/stdout handling | StdioServerTransport | Handles newline delimiters, buffering, JSON parsing |
| Tool annotations | Custom metadata format | ToolAnnotations type | Standard MCP format, recognized by Claude |

**Key insight:** The MCP SDK provides all the building blocks; the work is in correctly wiring JMAP operations to MCP tools with proper transformations.

## Common Pitfalls

### Pitfall 1: Stdout Corruption
**What goes wrong:** Any console.log() or stdout write corrupts MCP JSON-RPC messages
**Why it happens:** MCP stdio uses stdout exclusively for JSON-RPC; logs mix with protocol
**How to avoid:** Use pino configured with `pino.destination(2)` (stderr). Never use console.log().
**Warning signs:** MCP client reports "invalid JSON" or connection drops

### Pitfall 2: Missing Session Initialization
**What goes wrong:** JMAP requests fail with "session not initialized"
**Why it happens:** MCP server starts but JMAPClient.fetchSession() wasn't called
**How to avoid:** Validate JMAP connection at startup (MCP-04), call fetchSession() before accepting requests
**Warning signs:** First tool call fails with session error

### Pitfall 3: JMAP Back-Reference Syntax Errors
**What goes wrong:** Email/get returns empty list despite Email/query finding results
**Why it happens:** Incorrect back-reference path or resultOf value
**How to avoid:** Use exact syntax: `'#ids': { resultOf: 'callId', name: 'Email/query', path: '/ids' }`
**Warning signs:** Empty results when query clearly matches

### Pitfall 4: Keyword Case Sensitivity
**What goes wrong:** isRead always false despite emails being read
**Why it happens:** Using 'seen' instead of '$seen' (JMAP keywords have $ prefix)
**How to avoid:** Always use dollar-sign prefix: '$seen', '$flagged', '$draft'
**Warning signs:** All boolean flags have incorrect values

### Pitfall 5: Large Response Handling
**What goes wrong:** Memory issues or timeouts with large email searches
**Why it happens:** No pagination, requesting too many properties
**How to avoid:** Always use `limit` parameter in Email/query; fetch minimal properties for lists
**Warning signs:** Slow responses, timeouts on busy mailboxes

## Code Examples

Verified patterns from official sources:

### MCP Server Initialization with JMAP Validation
```typescript
// Source: MCP SDK docs + project requirements (MCP-04)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { JMAPClient } from './jmap/client.js';
import { createLogger } from './config/logger.js';
import { loadConfig } from './config/schema.js';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);

  // Initialize JMAP client and validate connection (MCP-04)
  const jmapClient = new JMAPClient(config, logger);
  try {
    await jmapClient.fetchSession();
    logger.info('JMAP connection validated');
  } catch (error) {
    logger.error({ error }, 'JMAP connection failed at startup');
    process.exit(1);
  }

  // Create MCP server
  const server = new McpServer({
    name: 'mcp-twake-mail',
    version: '0.1.0',
  });

  // Register tools (pass jmapClient via closure)
  registerEmailTools(server, jmapClient, logger);
  registerMailboxTools(server, jmapClient, logger);

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

### search_emails Tool Implementation
```typescript
// Source: RFC 8621 Section 4.4 Email/query, MCP SDK
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const searchEmailsSchema = {
  mailboxId: z.string().optional().describe('Filter by mailbox ID'),
  from: z.string().optional().describe('Filter by sender address'),
  to: z.string().optional().describe('Filter by recipient address'),
  subject: z.string().optional().describe('Filter by subject text'),
  text: z.string().optional().describe('Full-text search in email'),
  before: z.string().optional().describe('Emails before this date (ISO 8601)'),
  after: z.string().optional().describe('Emails after this date (ISO 8601)'),
  hasAttachment: z.boolean().optional().describe('Filter by attachment presence'),
  unreadOnly: z.boolean().optional().describe('Only unread emails'),
  flagged: z.boolean().optional().describe('Only flagged/starred emails'),
  limit: z.number().min(1).max(100).default(20).describe('Maximum results'),
};

export function registerSearchEmailsTool(
  server: McpServer,
  jmapClient: JMAPClient,
  logger: Logger
) {
  server.registerTool(
    'search_emails',
    {
      title: 'Search Emails',
      description: 'Search emails with various filters including mailbox, sender, recipient, subject, text, date range, attachment status, and read/flagged state',
      inputSchema: searchEmailsSchema,
      annotations: {
        title: 'Search Emails',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args, extra) => {
      const session = jmapClient.getSession();

      // Build JMAP filter from args
      const filter: Record<string, unknown> = {};
      if (args.mailboxId) filter.inMailbox = args.mailboxId;
      if (args.from) filter.from = args.from;
      if (args.to) filter.to = args.to;
      if (args.subject) filter.subject = args.subject;
      if (args.text) filter.text = args.text;
      if (args.before) filter.before = args.before;
      if (args.after) filter.after = args.after;
      if (args.hasAttachment !== undefined) filter.hasAttachment = args.hasAttachment;
      if (args.unreadOnly) filter.notKeyword = '$seen';
      if (args.flagged) filter.hasKeyword = '$flagged';

      try {
        const response = await jmapClient.request([
          ['Email/query', {
            accountId: session.accountId,
            filter,
            sort: [{ property: 'receivedAt', isAscending: false }],
            limit: args.limit,
          }, 'q1'],
          ['Email/get', {
            accountId: session.accountId,
            '#ids': { resultOf: 'q1', name: 'Email/query', path: '/ids' },
            properties: ['id', 'threadId', 'mailboxIds', 'keywords', 'from', 'to', 'subject', 'receivedAt', 'preview', 'hasAttachment'],
          }, 'g1'],
        ]);

        const queryResult = jmapClient.parseMethodResponse(response.methodResponses[0]);
        const getResult = jmapClient.parseMethodResponse(response.methodResponses[1]);

        if (!queryResult.success || !getResult.success) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Search failed: ${queryResult.error?.description || getResult.error?.description}` }],
          };
        }

        const emails = (getResult.data?.list as JMAPEmail[]) || [];
        const simplified = emails.map(transformEmail);

        return {
          content: [{ type: 'text', text: JSON.stringify(simplified, null, 2) }],
        };
      } catch (error) {
        logger.error({ error }, 'search_emails failed');
        return {
          isError: true,
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        };
      }
    }
  );
}
```

### SimplifiedEmail DTO and Transformer
```typescript
// Source: RFC 8621 Section 4.1, project requirements
export interface SimplifiedEmail {
  id: string;
  threadId: string;
  mailboxIds: string[];
  // Boolean flags from keywords
  isRead: boolean;
  isFlagged: boolean;
  isDraft: boolean;
  isAnswered: boolean;
  isForwarded: boolean;
  // Header fields
  from: EmailAddress[];
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  // Dates
  receivedAt: string;
  sentAt?: string;
  // Content
  preview: string;
  hasAttachment: boolean;
  // Full body (when fetched)
  textBody?: string;
  htmlBody?: string;
  attachments?: SimplifiedAttachment[];
}

export interface EmailAddress {
  name?: string;
  email: string;
}

export interface SimplifiedAttachment {
  partId: string;
  blobId: string;
  name?: string;
  type: string;
  size: number;
}

// JMAP Email as returned from server
interface JMAPEmail {
  id: string;
  threadId: string;
  mailboxIds: Record<string, boolean>;
  keywords?: Record<string, boolean>;
  from?: Array<{ name?: string; email: string }>;
  to?: Array<{ name?: string; email: string }>;
  cc?: Array<{ name?: string; email: string }>;
  bcc?: Array<{ name?: string; email: string }>;
  subject: string;
  receivedAt: string;
  sentAt?: string;
  preview: string;
  hasAttachment: boolean;
  bodyValues?: Record<string, { value: string }>;
  textBody?: Array<{ partId: string }>;
  htmlBody?: Array<{ partId: string }>;
  attachments?: Array<{
    partId: string;
    blobId: string;
    name?: string;
    type: string;
    size: number;
  }>;
}

export function transformEmail(jmapEmail: JMAPEmail): SimplifiedEmail {
  const keywords = jmapEmail.keywords || {};

  return {
    id: jmapEmail.id,
    threadId: jmapEmail.threadId,
    mailboxIds: Object.keys(jmapEmail.mailboxIds),
    // TRANS-03: Convert keywords to boolean flags
    isRead: keywords['$seen'] === true,
    isFlagged: keywords['$flagged'] === true,
    isDraft: keywords['$draft'] === true,
    isAnswered: keywords['$answered'] === true,
    isForwarded: keywords['$forwarded'] === true,
    // Header fields
    from: jmapEmail.from || [],
    to: jmapEmail.to || [],
    cc: jmapEmail.cc,
    bcc: jmapEmail.bcc,
    subject: jmapEmail.subject,
    // Dates
    receivedAt: jmapEmail.receivedAt,
    sentAt: jmapEmail.sentAt,
    // Content
    preview: jmapEmail.preview,
    hasAttachment: jmapEmail.hasAttachment,
    // Extract body text if available
    textBody: extractBodyText(jmapEmail, 'textBody'),
    htmlBody: extractBodyText(jmapEmail, 'htmlBody'),
    attachments: jmapEmail.attachments?.map(att => ({
      partId: att.partId,
      blobId: att.blobId,
      name: att.name,
      type: att.type,
      size: att.size,
    })),
  };
}

function extractBodyText(
  email: JMAPEmail,
  bodyType: 'textBody' | 'htmlBody'
): string | undefined {
  const parts = email[bodyType];
  if (!parts || parts.length === 0 || !email.bodyValues) return undefined;

  const partId = parts[0].partId;
  return email.bodyValues[partId]?.value;
}
```

### SimplifiedMailbox DTO and Transformer
```typescript
// Source: RFC 8621 Section 2
export interface SimplifiedMailbox {
  id: string;
  name: string;
  parentId: string | null;
  role: MailboxRole | null;
  sortOrder: number;
  totalEmails: number;
  unreadEmails: number;
  totalThreads: number;
  unreadThreads: number;
}

export type MailboxRole =
  | 'inbox'
  | 'drafts'
  | 'sent'
  | 'trash'
  | 'archive'
  | 'spam'
  | 'junk'
  | 'important'
  | 'all';

interface JMAPMailbox {
  id: string;
  name: string;
  parentId: string | null;
  role: string | null;
  sortOrder: number;
  totalEmails: number;
  unreadEmails: number;
  totalThreads: number;
  unreadThreads: number;
  myRights?: Record<string, boolean>;
  isSubscribed?: boolean;
}

export function transformMailbox(jmapMailbox: JMAPMailbox): SimplifiedMailbox {
  return {
    id: jmapMailbox.id,
    name: jmapMailbox.name,
    parentId: jmapMailbox.parentId,
    role: jmapMailbox.role as MailboxRole | null,
    sortOrder: jmapMailbox.sortOrder,
    totalEmails: jmapMailbox.totalEmails,
    unreadEmails: jmapMailbox.unreadEmails,
    totalThreads: jmapMailbox.totalThreads,
    unreadThreads: jmapMailbox.unreadThreads,
  };
}
```

### list_mailboxes Tool
```typescript
// Source: RFC 8621 Section 2.2, MCP SDK
export function registerListMailboxesTool(
  server: McpServer,
  jmapClient: JMAPClient,
  logger: Logger
) {
  server.registerTool(
    'list_mailboxes',
    {
      title: 'List Mailboxes',
      description: 'List all mailboxes with their metadata (name, role, message counts). Optionally filter by role.',
      inputSchema: {
        role: z.enum(['inbox', 'drafts', 'sent', 'trash', 'archive', 'spam', 'junk', 'important', 'all'])
          .optional()
          .describe('Filter mailboxes by role'),
      },
      annotations: {
        title: 'List Mailboxes',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ role }, extra) => {
      const session = jmapClient.getSession();

      try {
        const response = await jmapClient.request([
          ['Mailbox/get', {
            accountId: session.accountId,
            properties: ['id', 'name', 'parentId', 'role', 'sortOrder', 'totalEmails', 'unreadEmails', 'totalThreads', 'unreadThreads'],
          }, 'm1'],
        ]);

        const result = jmapClient.parseMethodResponse(response.methodResponses[0]);

        if (!result.success) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Failed to list mailboxes: ${result.error?.description}` }],
          };
        }

        let mailboxes = ((result.data?.list as JMAPMailbox[]) || []).map(transformMailbox);

        // Filter by role if specified
        if (role) {
          mailboxes = mailboxes.filter(mb => mb.role === role);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(mailboxes, null, 2) }],
        };
      } catch (error) {
        logger.error({ error }, 'list_mailboxes failed');
        return {
          isError: true,
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }],
        };
      }
    }
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| server.tool() | server.registerTool() | MCP SDK 1.x | tool() deprecated, registerTool() is preferred |
| HTTP+SSE transport | Streamable HTTP | MCP 2025 | SSE deprecated for new implementations |
| Manual JSON schema | Zod integration | MCP SDK 1.x | Automatic schema generation from Zod |

**Deprecated/outdated:**
- `server.tool()`: Still works but deprecated, use `registerTool()` instead
- `server.resource()`: Use `registerResource()` instead
- HTTP+SSE transport: Use Streamable HTTP for production (stdio for local)

## Open Questions

Things that couldn't be fully resolved:

1. **Email/get property list optimization**
   - What we know: Email/get can specify exactly which properties to fetch
   - What's unclear: Optimal property list for different use cases (list view vs detail view)
   - Recommendation: Use minimal properties for search results, full properties for single email fetch

2. **Error message formatting for AI**
   - What we know: MCP errors should be in content with isError: true
   - What's unclear: Best format for AI to understand and relay to user
   - Recommendation: Use structured messages with actionable guidance (leverage existing JMAPError patterns)

## Sources

### Primary (HIGH confidence)
- MCP SDK v1.25.3 type definitions (`node_modules/@modelcontextprotocol/sdk/dist/esm/types.d.ts`)
- MCP Official Documentation: https://modelcontextprotocol.io/docs/concepts/tools
- MCP Official Transport Docs: https://modelcontextprotocol.io/docs/concepts/transports
- RFC 8621 JMAP for Mail: https://www.rfc-editor.org/rfc/rfc8621.html
- JMAP Mail Specification: https://jmap.io/spec-mail.html

### Secondary (MEDIUM confidence)
- MCP TypeScript SDK Repository: https://github.com/modelcontextprotocol/typescript-sdk
- MCP Build Server Guide: https://modelcontextprotocol.io/docs/develop/build-server

### Tertiary (LOW confidence)
- Community patterns for MCP tool implementations (various sources)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - SDK already installed, types verified directly
- Architecture: HIGH - Based on official docs and SDK types
- JMAP methods: HIGH - Based on RFC 8621 specification
- Pitfalls: MEDIUM - Based on documented patterns and MCP requirements

**Research date:** 2026-01-29
**Valid until:** 2026-03-29 (60 days - stable APIs)
