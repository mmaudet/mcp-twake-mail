# Phase 1: Foundation & JMAP Client - Research

**Researched:** 2026-01-29
**Domain:** TypeScript ESM project infrastructure + JMAP client implementation
**Confidence:** HIGH

## Summary

Phase 1 establishes the foundational architecture for an MCP server with JMAP email integration. The research reveals that successful implementation requires three critical elements: (1) a custom JMAP client built on native fetch with strict state management, (2) fail-fast configuration validation using Zod 4, and (3) careful timeout and error handling to prevent production issues. The standard 2026 approach uses TypeScript 5.9+ with Node16 module resolution for stable ESM output, Pino for stderr-only logging (critical for stdio MCP servers), and a layered architecture separating concerns (config → client → services → transformers → tools).

The JMAP protocol (RFC 8620/8621) is stateless HTTP with session-based discovery, making it simpler than IMAP but requiring careful state tracking to avoid cache desynchronization. Custom client implementation is preferred over libraries because: (1) JMAP is JSON-RPC over HTTP (~100 LOC core), (2) existing libraries are inactive or too heavy, and (3) custom implementation allows tight integration with MCP error patterns.

**Primary recommendation:** Build Phase 1 in this sequence: config/validation → logger → JMAP client with state tracking → connection validation → error formatting. Test against real jmap.linagora.com from day 1, not mocks.

## Standard Stack

The established libraries/tools for this domain:

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **Node.js** | >=20.0.0 | Runtime platform | Native fetch, WebCryptoAPI, ESM stability; openid-client v6 requires Node 20+; 2026 baseline |
| **TypeScript** | ^5.9.0 | Type safety + transpilation | Node16 module resolution stable, deferred imports, ES2023 target, improved DX |
| **Zod** | ^4.3.6 | Runtime validation | MCP SDK peer dependency; unified error API; validates env vars, JMAP responses, tool inputs |
| **Pino** | ^10.3.0 | Structured logging to stderr | Fast, JSON-native, pretty-print in dev; stderr output critical for stdio MCP servers |
| **@modelcontextprotocol/sdk** | ^1.25.3 | MCP server implementation | Official TypeScript SDK; stdio transport built-in; v1.x stable (v2 expected Q1 2026) |

**Rationale:** Node 20 provides native fetch (no node-fetch), WebCryptoAPI for PKCE, and stable ESM. TypeScript 5.9's `node16` module resolution eliminates ESM/CJS complexity. Zod 4 is required by MCP SDK. Pino is the 2026 standard for Node.js logging and matches mcp-twake-dav pattern. All dependencies verified via official docs and release notes.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **Vitest** | ^4.0.18 | Unit & integration tests | Native ESM/TypeScript, 10x faster than Jest, stable browser mode |
| **vitest-fetch-mock** | ^0.4.0 | Mock native fetch API | Mocks global fetch for testing JMAP client |
| **@types/node** | ^25.0.10 | Node.js type definitions | Current types for Node.js 20+ APIs |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native fetch | axios | Axios adds 11.7KB + features (interceptors, auto-retry) not needed for simple JSON-RPC |
| Custom JMAP client | linagora/jmap-client-ts | Library inactive since 2022; adds dependency; less control over batching/errors |
| Custom JMAP client | jmap-jam | Good alternative if proven reliable; adds 2KB dependency; consider for Phase 2+ optimization |
| Vitest | Jest | Jest ESM support still experimental in v30; requires `--experimental-vm-modules`; 10x slower |
| Pino | winston | Winston slower and heavier; more features than needed for MCP server |
| node:readline/promises | inquirer | inquirer is 400KB+; overkill for simple setup wizard |

**Installation:**
```bash
# Core dependencies
npm install @modelcontextprotocol/sdk zod pino

# Dev dependencies
npm install -D typescript @types/node vitest vitest-fetch-mock

# Total: 3 production deps, 4 dev deps (maximize Node.js built-ins)
```

## Architecture Patterns

### Recommended Project Structure

Based on mcp-twake-dav reference implementation:

```
mcp-twake-mail/
├── src/
│   ├── config/
│   │   ├── schema.ts        # Zod env validation (fail-fast)
│   │   └── logger.ts        # Pino logger to stderr
│   ├── jmap/
│   │   ├── client.ts        # Session management, auth, request wrapper
│   │   ├── email-service.ts # Email/get, Email/query, Email/set
│   │   └── mailbox-service.ts # Mailbox operations
│   ├── transformers/
│   │   ├── email.ts         # JMAP Email → EmailDTO
│   │   └── mailbox.ts       # JMAP Mailbox → MailboxDTO
│   ├── tools/
│   │   ├── email/           # MCP tools for email operations
│   │   ├── mailbox/         # MCP tools for mailbox operations
│   │   └── index.ts         # Tool registration aggregator
│   ├── types/
│   │   ├── dtos.ts          # Data transfer objects
│   │   └── jmap.ts          # JMAP protocol types
│   ├── errors.ts            # AI-friendly error formatting
│   ├── server.ts            # MCP server factory
│   └── index.ts             # Entry point + startup sequence
├── package.json             # "type": "module" for ESM
├── tsconfig.json            # Node16 module resolution
└── vitest.config.ts         # Vitest configuration
```

**Component boundaries:**
- **config/** - Zero dependencies, validates environment, creates logger
- **jmap/client.ts** - HTTP layer, session management, auth, timeouts
- **jmap/*-service.ts** - JMAP protocol operations, state tracking
- **transformers/** - Convert JMAP objects to AI-friendly DTOs
- **tools/** - MCP layer, Zod input validation, error handling
- **errors.ts** - "What went wrong" + "How to fix it" pattern

### Pattern 1: Fail-Fast Configuration with Zod

**What:** Validate environment variables at startup, exit immediately on error.

**When to use:** Always. First operation in main().

**Why:** Prevents running with invalid configuration. Clear error messages in dev/CI. Matches mcp-twake-dav pattern.

**Example:**
```typescript
// src/config/schema.ts
import { z } from 'zod';

export const envSchema = z.object({
  JMAP_SESSION_URL: z
    .string()
    .url('JMAP_SESSION_URL must be a valid URL')
    .refine(
      (url) => {
        const parsed = new URL(url);
        return (
          parsed.protocol === 'https:' ||
          parsed.hostname === 'localhost' ||
          parsed.hostname === '127.0.0.1'
        );
      },
      { message: 'URL must use HTTPS. Only localhost allowed over HTTP for development.' }
    ),
  JMAP_AUTH_METHOD: z.enum(['basic', 'bearer', 'oidc']).default('basic'),
  JMAP_USERNAME: z.string().optional(),
  JMAP_PASSWORD: z.string().optional(),
  JMAP_TOKEN: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
}).superRefine((data, ctx) => {
  // Conditional validation: basic auth requires username+password
  if (data.JMAP_AUTH_METHOD === 'basic') {
    if (!data.JMAP_USERNAME) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JMAP_USERNAME'],
        message: 'JMAP_USERNAME is required when using basic auth',
      });
    }
    if (!data.JMAP_PASSWORD) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JMAP_PASSWORD'],
        message: 'JMAP_PASSWORD is required when using basic auth',
      });
    }
  } else if (!data.JMAP_TOKEN) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['JMAP_TOKEN'],
      message: `JMAP_TOKEN is required when using ${data.JMAP_AUTH_METHOD} auth`,
    });
  }
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
  return envSchema.parse(process.env); // Throws ZodError on failure
}
```

**Source:** [Validating Environment Variables in Node.js with Zod](https://dev.to/roshan_ican/validating-environment-variables-in-nodejs-with-zod-2epn), [mcp-twake-dav config pattern](file:///Users/mmaudet/work/mcp-twake-dav/src/config/schema.ts)

### Pattern 2: Stderr-Only Logging for MCP Servers

**What:** Configure Pino to write exclusively to stderr (fd 2), never stdout (fd 1).

**When to use:** Always. MCP stdio servers reserve stdout for JSON-RPC protocol.

**Why:** Any stdout contamination breaks MCP protocol and causes client errors.

**Example:**
```typescript
// src/config/logger.ts
import pino from 'pino';

export type Logger = pino.Logger;

export function createLogger(level: string = 'info'): Logger {
  return pino(
    {
      name: 'mcp-twake-mail',
      level,
    },
    pino.destination(2) // CRITICAL: fd 2 = stderr. NEVER use stdout.
  );
}
```

**Source:** [mcp-twake-dav logger pattern](file:///Users/mmaudet/work/mcp-twake-dav/src/config/logger.ts)

### Pattern 3: JMAP Session-Based Client Initialization

**What:** Fetch JMAP session at startup to discover apiUrl, accountId, capabilities.

**When to use:** Always. Required for all JMAP communication.

**Why:** JMAP is stateless HTTP. Session object provides endpoints and capabilities needed for operations.

**Example:**
```typescript
// src/jmap/client.ts
import type { Config } from '../config/schema.js';
import type { Logger } from '../config/logger.js';

export interface JMAPSession {
  apiUrl: string;
  accountId: string;
  capabilities: Record<string, any>;
  state: string;
}

export class JMAPClient {
  private session: JMAPSession | null = null;
  private config: Config;
  private logger: Logger;

  constructor(config: Config, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async fetchSession(): Promise<JMAPSession> {
    this.logger.info({ url: this.config.JMAP_SESSION_URL }, 'Fetching JMAP session...');

    const response = await fetch(this.config.JMAP_SESSION_URL, {
      method: 'GET',
      headers: this.getAuthHeaders(),
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (!response.ok) {
      throw new Error(`Session fetch failed: ${response.status} ${response.statusText}`);
    }

    const session = await response.json();

    // Extract primary account for mail capability
    const accountId = session.primaryAccounts['urn:ietf:params:jmap:mail'];
    if (!accountId) {
      throw new Error('No mail account found in JMAP session');
    }

    this.session = {
      apiUrl: session.apiUrl,
      accountId,
      capabilities: session.capabilities,
      state: session.state,
    };

    this.logger.info({ accountId, apiUrl: session.apiUrl }, 'JMAP session established');
    return this.session;
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.JMAP_AUTH_METHOD === 'basic') {
      const token = Buffer.from(
        `${this.config.JMAP_USERNAME}:${this.config.JMAP_PASSWORD}`
      ).toString('base64');
      headers['Authorization'] = `Basic ${token}`;
    } else if (this.config.JMAP_AUTH_METHOD === 'bearer') {
      headers['Authorization'] = `Bearer ${this.config.JMAP_TOKEN}`;
    }

    return headers;
  }

  getSession(): JMAPSession {
    if (!this.session) {
      throw new Error('Session not initialized. Call fetchSession() first.');
    }
    return this.session;
  }
}
```

**Source:** [JMAP Core RFC 8620 Section 2](https://datatracker.ietf.org/doc/html/rfc8620), [jmap-jam documentation](https://github.com/htunnicliff/jmap-jam)

### Pattern 4: Fetch Timeout with AbortSignal

**What:** Use AbortSignal.timeout() to prevent indefinite hangs on network issues.

**When to use:** Every fetch call. Tiered timeouts: session 5s, queries 8s, searches 12s.

**Why:** Native fetch has no timeout parameter. Can hang for 90-300 seconds. MCP server becomes unresponsive.

**Example:**
```typescript
// Recommended pattern
try {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(8000), // 8 second timeout
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
} catch (error) {
  if (error.name === 'TimeoutError' || error.name === 'AbortError') {
    throw new Error('JMAP server timeout - please check connection');
  }
  throw error;
}
```

**Source:** [AbortSignal.timeout() MDN](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static), [Understanding AbortController in Node.js](https://betterstack.com/community/guides/scaling-nodejs/understanding-abortcontroller/)

### Pattern 5: JMAP State Tracking

**What:** Store state strings from JMAP responses, use in Foo/changes calls for delta updates.

**When to use:** All services that cache JMAP objects (EmailService, MailboxService).

**Why:** JMAP uses state tokens for efficient synchronization. Prevents stale data, stateMismatch errors.

**Example:**
```typescript
// src/jmap/email-service.ts
export class EmailService {
  private emailState: string | null = null;
  private logger: Logger;
  private client: JMAPClient;

  constructor(client: JMAPClient, logger: Logger) {
    this.client = client;
    this.logger = logger;
  }

  async fetchEmails(mailboxId: string): Promise<Email[]> {
    const session = this.client.getSession();

    const requestBody = {
      using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
      methodCalls: [
        [
          'Email/query',
          {
            accountId: session.accountId,
            filter: { inMailbox: mailboxId },
          },
          'q1',
        ],
      ],
    };

    const response = await this.client.request(requestBody);
    const [methodResponse] = response.methodResponses;

    // Extract state from response
    if (methodResponse[1].state) {
      this.emailState = methodResponse[1].state;
      this.logger.debug({ state: this.emailState }, 'Updated email state');
    }

    return methodResponse[1].ids || [];
  }

  async syncChanges(): Promise<{ created: string[]; updated: string[]; destroyed: string[] }> {
    if (!this.emailState) {
      throw new Error('No email state available. Call fetchEmails() first.');
    }

    const session = this.client.getSession();

    const requestBody = {
      using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
      methodCalls: [
        [
          'Email/changes',
          {
            accountId: session.accountId,
            sinceState: this.emailState,
          },
          'c1',
        ],
      ],
    };

    const response = await this.client.request(requestBody);
    const [methodResponse] = response.methodResponses;

    if (methodResponse[0] === 'error') {
      if (methodResponse[1].type === 'cannotCalculateChanges') {
        // State too old, must refetch all
        this.logger.warn('Cannot calculate changes, state too old. Refetching all.');
        this.emailState = null;
        return { created: [], updated: [], destroyed: [] };
      }
      throw new Error(`Email/changes failed: ${methodResponse[1].type}`);
    }

    // Update to new state
    this.emailState = methodResponse[1].newState;

    return {
      created: methodResponse[1].created || [],
      updated: methodResponse[1].updated || [],
      destroyed: methodResponse[1].destroyed || [],
    };
  }
}
```

**Source:** [JMAP Core RFC 8620 Section 5.2 (Changes)](https://datatracker.ietf.org/doc/html/rfc8620), PITFALLS.md Pitfall 1

### Pattern 6: AI-Friendly Error Formatting

**What:** Format errors with "What went wrong" + "How to fix it" structure.

**When to use:** Startup errors, JMAP errors, MCP tool errors.

**Why:** AI clients need actionable messages, not generic HTTP codes. Helps Claude diagnose issues.

**Example:**
```typescript
// src/errors.ts
import { ZodError } from 'zod';

export function formatStartupError(error: Error, sessionUrl?: string): string {
  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const issues = error.issues.map((issue) => {
      const field = issue.path.join('.');
      return `  ${field}: ${issue.message}`;
    });
    return [
      'Configuration validation failed:',
      ...issues,
      '',
      'Fix: Check your environment variables.',
      'For basic auth: JMAP_SESSION_URL, JMAP_USERNAME, JMAP_PASSWORD',
      'For bearer auth: JMAP_SESSION_URL, JMAP_AUTH_METHOD=bearer, JMAP_TOKEN',
    ].join('\n');
  }

  const message = error.message.toLowerCase();

  // Authentication failures
  if (message.includes('401') || message.includes('unauthorized')) {
    return [
      'Authentication failed for JMAP server.',
      '',
      'Fix: Verify your credentials are correct.',
      'If using basic auth: check JMAP_USERNAME and JMAP_PASSWORD.',
      'If using bearer: check JMAP_TOKEN is valid and not expired.',
    ].join('\n');
  }

  // Timeout errors
  if (message.includes('timeout')) {
    const urlContext = sessionUrl ? ` ${sessionUrl}` : '';
    return [
      `Connection to${urlContext} timed out.`,
      '',
      'Fix: Check the JMAP server is running and accessible.',
      'Try accessing the session URL in a browser to verify it responds.',
    ].join('\n');
  }

  // Fallback
  return [
    `Unexpected error: ${error.message}`,
    '',
    'Fix: Check your configuration and try again.',
    'Verify JMAP_SESSION_URL and authentication settings.',
  ].join('\n');
}
```

**Source:** [mcp-twake-dav error pattern](file:///Users/mmaudet/work/mcp-twake-dav/src/errors.ts)

### Anti-Patterns to Avoid

- **Don't log to stdout:** MCP protocol uses stdout for JSON-RPC. Always use stderr (Pino destination 2).
- **Don't skip timeout on fetch:** Native fetch can hang indefinitely. Always use AbortSignal.timeout().
- **Don't ignore JMAP state strings:** Leads to stale data and stateMismatch errors. Track state in services.
- **Don't use generic error messages:** Format errors with "what went wrong" + "how to fix it" for AI clients.
- **Don't hardcode account IDs:** Fetch from session.primaryAccounts['urn:ietf:params:jmap:mail'].
- **Don't assume HTTPS:** Enforce HTTPS in Zod validation, allow localhost for development.
- **Don't use CommonJS:** Pure ESM with "type": "module" in package.json. Node16 module resolution.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Environment validation | Custom parser with if statements | Zod schemas with superRefine | Zod provides type inference, clear error messages, conditional validation; MCP SDK requires it |
| Structured logging | console.error with timestamps | Pino | Pino is fast, JSON-native, supports log levels, pretty-print in dev; stderr output built-in |
| Fetch timeouts | Custom timeout wrapper with Promise.race | AbortSignal.timeout() | Native API, cleaner syntax, handles cleanup automatically; Node 18+ built-in |
| Module system | Dual ESM/CJS packages | Pure ESM | ESM is 2026 standard; dual packages add complexity; TypeScript 5.9 Node16 resolution is stable |
| Test framework | Jest with ESM experimental flags | Vitest | Vitest native ESM, 10x faster, zero config for TypeScript; Jest ESM still experimental |

**Key insight:** Node.js 20+ has mature built-ins (fetch, readline, WebCrypto). Avoid npm dependencies that duplicate native functionality. The only production dependencies should be: MCP SDK, Zod, Pino (and auth libraries in Phase 2).

## Common Pitfalls

### Pitfall 1: JMAP State Desynchronization

**What goes wrong:** Client cache becomes stale, users see outdated emails, stateMismatch errors on operations.

**Why it happens:** Developers treat JMAP like stateless REST API, ignore state strings. Don't handle stateMismatch errors.

**How to avoid:**
1. Store state strings from every Foo/get response
2. Use state in Foo/changes calls for delta updates
3. Handle cannotCalculateChanges error (state too old) by refetching all data
4. Watch for sessionState changes in responses, refetch session when changed

**Warning signs:**
- stateMismatch errors in logs
- Users reporting stale data
- Repeated full refetches instead of delta updates
- Cache hit rate below 70%

**Source:** PITFALLS.md Pitfall 1, [JMAP Core RFC 8620](https://jmap.io/spec-core.html)

### Pitfall 2: Fetch Timeout Not Implemented

**What goes wrong:** JMAP requests hang indefinitely on network issues. MCP server becomes unresponsive for 90+ seconds.

**Why it happens:** Native fetch has no timeout parameter. Developers assume it fails fast, but it can hang forever.

**How to avoid:**
1. Use AbortSignal.timeout() on all fetch calls
2. Tiered timeouts: session 5s, simple queries 8s, searches 12s
3. Catch AbortError explicitly, provide clear message
4. Retry once with exponential backoff, then fail

**Warning signs:**
- Requests taking 60+ seconds in logs
- Users reporting frozen MCP server
- No timeout values in fetch calls
- Missing AbortController/AbortSignal usage

**Source:** PITFALLS.md Pitfall 4, [AbortSignal MDN](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal)

### Pitfall 3: Logging Token Leakage

**What goes wrong:** Debug logs contain bearer tokens, refresh tokens, or OIDC codes. Credentials exposed.

**Why it happens:** Verbose logging during auth debugging. Forget to redact before shipping.

**How to avoid:**
1. Configure Pino redaction for Authorization header, access_token, refresh_token fields
2. Never log token values - log "token present: yes/no"
3. Sanitize errors from auth libraries before logging
4. Use DEBUG env var for verbose auth logging only when needed

**Warning signs:**
- Bearer tokens visible in stderr
- Authorization headers in logs
- Refresh tokens in error messages
- No redaction patterns in logger config

**Source:** PITFALLS.md Pitfall 10

### Pitfall 4: HTTPS Not Enforced

**What goes wrong:** Production deployment uses HTTP, credentials transmitted in plaintext.

**Why it happens:** Developer forgets to enforce HTTPS. Works in dev with localhost HTTP, ships to production.

**How to avoid:**
1. Zod refine() validates URL scheme is https:// or localhost/127.0.0.1
2. Clear error message: "URL must use HTTPS. Only localhost allowed over HTTP for development."
3. Document HTTPS requirement in README

**Warning signs:**
- http:// URLs in production config
- No URL scheme validation in Zod schema
- Security audit finds plaintext credentials

**Source:** [mcp-twake-dav schema pattern](file:///Users/mmaudet/work/mcp-twake-dav/src/config/schema.ts)

## Code Examples

Verified patterns from official sources:

### TypeScript ESM Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "build"]
}
```

```json
// package.json
{
  "name": "mcp-twake-mail",
  "version": "0.1.0",
  "type": "module",
  "main": "./build/index.js",
  "bin": {
    "mcp-twake-mail": "./build/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node build/index.js",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

**Source:** [mcp-twake-dav tsconfig](file:///Users/mmaudet/work/mcp-twake-dav/tsconfig.json), [TypeScript Node16 module resolution](https://www.typescriptlang.org/tsconfig/moduleResolution.html)

### Startup Sequence with Validation

```typescript
// src/index.ts
#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config/schema.js';
import { createLogger } from './config/logger.js';
import { JMAPClient } from './jmap/client.js';
import { formatStartupError } from './errors.js';
import { createServer } from './server.js';

async function main() {
  let sessionUrl: string | undefined;

  try {
    // Step 1: Load and validate configuration (fail-fast)
    const config = loadConfig();
    sessionUrl = config.JMAP_SESSION_URL;

    // Step 2: Initialize logger (uses config.LOG_LEVEL)
    const logger = createLogger(config.LOG_LEVEL);
    logger.info({ version: '0.1.0' }, 'Starting mcp-twake-mail server');

    // Step 3: Create JMAP client
    const client = new JMAPClient(config, logger);

    // Step 4: Validate connection (fetch session, verify credentials)
    await client.fetchSession();
    logger.info('JMAP client ready');

    // Step 5: Initialize services (EmailService, MailboxService)
    // ... service initialization

    // Step 6: Initialize MCP server with tools registered
    const server = createServer(/* services */, logger);
    logger.info('MCP server initialized');

    // Step 7: Connect stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info('MCP server connected via stdio transport');
  } catch (error) {
    // Format error with AI-friendly message and exit
    const errorMessage = formatStartupError(
      error instanceof Error ? error : new Error(String(error)),
      sessionUrl
    );
    console.error(`\n${errorMessage}\n`);
    process.exit(1);
  }
}

main();
```

**Source:** [mcp-twake-dav startup pattern](file:///Users/mmaudet/work/mcp-twake-dav/src/index.ts)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| node-fetch library | Native fetch (Node 18+) | Node 18.0.0 (Apr 2022) | Zero deps, native timeout support, stable API |
| Jest with --experimental-vm-modules | Vitest native ESM | Vitest 1.0 (Dec 2023) | 10x faster, zero config, TypeScript native |
| TypeScript Node10 resolution | Node16/NodeNext resolution | TypeScript 4.7 (May 2022) | Stable ESM output, correct import extensions |
| Zod 3.x | Zod 4.x | Zod 4.0 (Feb 2025) | Unified error API, better DX, MCP SDK peer dep |
| CommonJS or dual packages | Pure ESM | Industry shift 2023-2024 | Simpler, matches MCP SDK, eliminates dual package complexity |
| JMAP Draft (pre-2019) | JMAP RFC 8620/8621 (2019) | July 2019 | Standard protocol, production-ready, Apache James support |

**Deprecated/outdated:**
- **node-fetch**: Maintainers recommend native fetch for Node 18+. ESM-only since v3. No reason to add dependency.
- **Jest for new projects**: ESM support still experimental in v30. Vitest is native ESM, 10x faster.
- **axios for JMAP**: Adds 11.7KB + features (interceptors, auto-retry) not needed for simple JSON-RPC.
- **linagora/jmap-client-ts**: Inactive since 2022. Good reference but outdated patterns.
- **dotenv in 2026**: Modern deployments use environment variables directly. Adds startup overhead.

## Open Questions

Things that couldn't be fully resolved:

1. **jmap-jam vs custom client**
   - What we know: jmap-jam is tiny (2KB), strongly-typed, zero deps, actively maintained (2024-2025)
   - What's unclear: Production stability with Apache James, error handling completeness, state management quality
   - Recommendation: Start with custom client for Phase 1 (full control, learning experience). Evaluate jmap-jam for Phase 2+ optimization if custom client proves complex.

2. **Apache James feature completeness**
   - What we know: Marked "experimental", partial RFC-8621 support, no push notifications
   - What's unclear: Exact list of unsupported features, stability under load, rate limiting behavior
   - Recommendation: Test against jmap.linagora.com from day 1. Document known limitations in README. Handle unsupportedFilter gracefully.

3. **Context window optimization threshold**
   - What we know: Tool definitions consume 400-500 tokens each, email bodies bloat responses
   - What's unclear: Exact token limits for different Claude models, optimal pagination defaults
   - Recommendation: Start with conservative defaults (10 emails per search, preview over body). Add telemetry in Phase 3 to measure token usage.

## Sources

### Primary (HIGH confidence)

**MCP Framework:**
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) - Official SDK, v1.25.3 verified
- [MCP Documentation](https://modelcontextprotocol.io/docs/develop/build-server) - Official docs

**JMAP Specifications:**
- [JMAP Core RFC 8620](https://datatracker.ietf.org/doc/html/rfc8620) - Official IETF standard
- [JMAP Mail RFC 8621](https://datatracker.ietf.org/doc/html/rfc8621) - Official email extension
- [JMAP Crash Course](https://jmap.io/crash-course.html) - Official tutorial

**JMAP Client Libraries:**
- [jmap-jam GitHub](https://github.com/htunnicliff/jmap-jam) - Modern TypeScript client
- [jmap-jam npm](https://www.npmjs.com/package/jmap-jam) - Package documentation
- [linagora/jmap-client-ts](https://github.com/linagora/jmap-client-ts) - Reference implementation

**Node.js & TypeScript:**
- [TypeScript 5.9 Release](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-9.html) - Official docs
- [TypeScript moduleResolution](https://www.typescriptlang.org/tsconfig/moduleResolution.html) - Node16 resolution docs
- [Node.js Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) - MDN documentation
- [AbortSignal.timeout()](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static) - MDN documentation

**Validation:**
- [Zod v4 Changelog](https://zod.dev/v4/changelog) - Official migration guide
- [Validating Environment Variables with Zod](https://dev.to/roshan_ican/validating-environment-variables-in-nodejs-with-zod-2epn) - Tutorial

**Logging:**
- [Pino GitHub](https://github.com/pinojs/pino) - Official repository

**Testing:**
- [Vitest Documentation](https://vitest.dev/) - Official docs
- [Vitest vs Jest 2026](https://dev.to/dataformathub/vitest-vs-jest-30-why-2026-is-the-year-of-browser-native-testing-2fgb) - Comparison

**Reference Implementation:**
- [mcp-twake-dav GitHub](https://github.com/mmaudet/mcp-twake-dav) - Proven architecture for MCP + DAV protocols
- Local files: `/Users/mmaudet/work/mcp-twake-dav/src/` - Startup sequence, config patterns, error handling

### Secondary (MEDIUM confidence)

**MCP Best Practices:**
- [MCP Server Best Practices 2026](https://www.cdata.com/blog/mcp-server-best-practices-2026) - Community guidance
- [MCP Context Window Overflow Discussion](https://github.com/orgs/modelcontextprotocol/discussions/532) - Known issue
- [MCP and Context Windows: Lessons Learned](https://medium.com/@pekastel/mcp-and-context-windows-lessons-learned-during-development-590e0b047916) - Production experience

**HTTP Clients:**
- [Axios vs Fetch 2026](https://iproyal.com/blog/axios-vs-fetch/) - Comparison article
- [Farewell, node-fetch](https://medium.com/illumination/farewell-node-fetch-2ee28bfd1c72) - Deprecation context

**AbortController:**
- [Understanding AbortController in Node.js](https://betterstack.com/community/guides/scaling-nodejs/understanding-abortcontroller/) - Tutorial
- [Using AbortSignal in Node.js](https://nearform.com/insights/using-abortsignal-in-node-js/) - Best practices

### Tertiary (LOW confidence - marked for validation)

- Specific rate limits for jmap.linagora.com (not publicly documented)
- Apache James Cassandra backend consistency specifics (version-dependent)
- Exact context window consumption per MCP tool (varies by client)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All versions verified via official docs (GitHub releases, npm, TypeScript docs)
- Architecture patterns: HIGH - Based on proven mcp-twake-dav implementation + JMAP RFC specs
- JMAP client approach: MEDIUM-HIGH - Custom vs jmap-jam decision needs validation in implementation
- Pitfalls: MEDIUM - Based on MCP community discussions + JMAP spec + security best practices

**Research date:** 2026-01-29
**Valid until:** 2026-04-29 (90 days - stable technology stack, slow-moving RFCs)
**Phase 1 implementation estimate:** 3-5 days for experienced TypeScript developer

---

## Ready for Planning

Research complete. Key findings:

1. **Custom JMAP client preferred** over libraries for Phase 1 - full control, ~100 LOC, matches MCP error patterns
2. **State management is critical** - must track state strings from day 1, cannot be retrofitted
3. **Timeouts are non-negotiable** - AbortSignal.timeout() on all fetch calls prevents production hangs
4. **Fail-fast validation** - Zod schema validation at startup catches misconfigurations early
5. **Reference implementation available** - mcp-twake-dav provides proven patterns for all Phase 1 components

Planner can now create PLAN.md with confidence. All architectural decisions grounded in official specs, proven patterns, and 2026 best practices.
