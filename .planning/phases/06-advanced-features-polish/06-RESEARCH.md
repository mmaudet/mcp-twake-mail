# Phase 6: Advanced Features & Polish - Research

**Researched:** 2026-01-29
**Domain:** JMAP Threads/Attachments, CLI Framework, Test Coverage, Linting
**Confidence:** HIGH

## Summary

This phase adds thread operations, attachment metadata, a CLI wizard for setup, and quality tooling (coverage, linting). The research covers:

1. **JMAP Thread/get** - Standard RFC 8621 method for retrieving threads with email lists
2. **JMAP Attachments** - EmailBodyPart structure with blobId, name, type, size, and inline detection
3. **CLI Framework** - Commander.js is the lightweight choice with zero dependencies
4. **Interactive Prompts** - @inquirer/prompts for modern TypeScript-first prompts
5. **Test Coverage** - Vitest v8 coverage with 80% thresholds
6. **ESLint** - Flat config with typescript-eslint for TypeScript linting

**Primary recommendation:** Use Commander.js + @inquirer/prompts for CLI, vitest coverage-v8 for coverage, and typescript-eslint flat config for linting.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| commander | ^13.x | CLI argument parsing | Zero dependencies, TypeScript types, Git-style subcommands |
| @inquirer/prompts | ^7.x | Interactive prompts | Modern API, TypeScript-first, individual imports |
| @vitest/coverage-v8 | ^4.x | Coverage reporting | Native v8 (fast), AST-based accuracy since v3.2 |
| typescript-eslint | ^8.x | TypeScript linting | Official ESLint TypeScript integration |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @eslint/js | ^9.x | ESLint recommended rules | Always with ESLint flat config |
| eslint | ^9.x | Core linting engine | Required for typescript-eslint |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| commander | yargs | More features but 16 dependencies, less type-safe |
| @inquirer/prompts | enquirer | Faster but less maintained, different API |
| v8 coverage | istanbul | More precise but 300% slower |

**Installation:**
```bash
npm install commander @inquirer/prompts
npm install -D @vitest/coverage-v8 eslint @eslint/js typescript-eslint
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── cli/
│   ├── index.ts          # CLI entry point, commander setup
│   ├── commands/
│   │   ├── setup.ts      # setup wizard command
│   │   ├── auth.ts       # auth-only command
│   │   └── check.ts      # connection check command
│   └── prompts/
│       └── setup-wizard.ts  # inquirer prompts for setup
├── mcp/
│   └── tools/
│       ├── thread.ts     # Thread MCP tools (get_thread, get_thread_emails)
│       └── attachment.ts # Attachment MCP tool (get_attachments)
└── index.ts              # Entry point router (CLI vs MCP server)
```

### Pattern 1: CLI Entry Point Router
**What:** Single entry point that routes to CLI or MCP server based on arguments
**When to use:** When npx can start either interactive CLI or stdio server
**Example:**
```typescript
#!/usr/bin/env node
// src/index.ts - Entry point router
import { Command } from 'commander';
import { startServer } from './mcp/server.js';

const program = new Command();

program
  .name('mcp-twake-mail')
  .description('MCP server for JMAP mail operations')
  .version('0.1.0');

// Default command: start MCP server (no subcommand)
program
  .action(async () => {
    // No arguments = start MCP server on stdio
    await startServer();
  });

// Setup wizard subcommand
program
  .command('setup')
  .description('Interactive configuration wizard')
  .action(async () => {
    const { runSetupWizard } = await import('./cli/commands/setup.js');
    await runSetupWizard();
  });

// Auth-only subcommand
program
  .command('auth')
  .description('Re-run OIDC authentication')
  .action(async () => {
    const { runAuth } = await import('./cli/commands/auth.js');
    await runAuth();
  });

// Check subcommand
program
  .command('check')
  .description('Verify configuration and connection')
  .action(async () => {
    const { runCheck } = await import('./cli/commands/check.js');
    await runCheck();
  });

program.parse();
```

### Pattern 2: Interactive Setup Wizard
**What:** Prompt-driven configuration that generates Claude Desktop config
**When to use:** For user-friendly initial setup
**Example:**
```typescript
// src/cli/commands/setup.ts
import { input, select, confirm } from '@inquirer/prompts';

export async function runSetupWizard(): Promise<void> {
  console.log('MCP Twake Mail Setup Wizard\n');

  // Step 1: JMAP URL
  const jmapUrl = await input({
    message: 'JMAP Session URL:',
    default: 'https://jmap.example.com/.well-known/jmap',
    validate: (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return 'Please enter a valid URL';
      }
    },
  });

  // Step 2: Auth method
  const authMethod = await select({
    message: 'Authentication method:',
    choices: [
      { value: 'oidc', name: 'OIDC (recommended for Twake)' },
      { value: 'basic', name: 'Basic Auth (username/password)' },
      { value: 'bearer', name: 'Bearer Token' },
    ],
  });

  // Step 3: Auth-specific prompts...
  // Step 4: Test connection
  // Step 5: Generate and optionally write config
}
```

### Pattern 3: JMAP Thread Retrieval
**What:** Two-step pattern - Thread/get then Email/get with thread's emailIds
**When to use:** For get_thread and get_thread_emails tools
**Example:**
```typescript
// Get thread with email IDs
const threadResponse = await jmapClient.request([
  ['Thread/get', {
    accountId: session.accountId,
    ids: [threadId],
  }, 'getThread'],
]);

// Thread object contains emailIds sorted oldest-first
const thread = threadResponse.methodResponses[0][1].list[0];
// thread = { id: 'T123', emailIds: ['E1', 'E2', 'E3'] }

// Then fetch full emails using the emailIds
const emailsResponse = await jmapClient.request([
  ['Email/get', {
    accountId: session.accountId,
    ids: thread.emailIds,
    properties: FULL_EMAIL_PROPERTIES,
    fetchTextBodyValues: true,
  }, 'getEmails'],
]);
```

### Pattern 4: Attachment Metadata Extraction
**What:** Use Email/get with attachments property, filter by disposition/type
**When to use:** For get_attachments tool
**Example:**
```typescript
// Request attachments property
const response = await jmapClient.request([
  ['Email/get', {
    accountId: session.accountId,
    ids: [emailId],
    properties: ['attachments'],
    bodyProperties: ['blobId', 'name', 'type', 'size', 'disposition', 'cid'],
  }, 'getAttachments'],
]);

// Transform and filter attachments
interface AttachmentMetadata {
  blobId: string;
  name: string | null;
  type: string;
  size: number;
  isInline: boolean;
}

function transformAttachment(part: JMAPBodyPart): AttachmentMetadata {
  // isInline: has cid AND disposition is not 'attachment'
  const isInline = !!part.cid && part.disposition !== 'attachment';
  return {
    blobId: part.blobId,
    name: part.name,
    type: part.type,
    size: part.size,
    isInline,
  };
}

// Filter based on tool parameters
function filterAttachments(
  attachments: AttachmentMetadata[],
  excludeInline?: boolean,
  mimeTypeFilter?: string
): AttachmentMetadata[] {
  return attachments.filter((att) => {
    if (excludeInline && att.isInline) return false;
    if (mimeTypeFilter && !att.type.startsWith(mimeTypeFilter)) return false;
    return true;
  });
}
```

### Pattern 5: Claude Desktop Config Generation
**What:** Generate JSON config for Claude Desktop mcpServers
**When to use:** In setup wizard to output ready-to-use config
**Example:**
```typescript
interface ClaudeDesktopConfig {
  mcpServers: {
    [name: string]: {
      command: string;
      args?: string[];
      env?: Record<string, string>;
    };
  };
}

function generateClaudeConfig(
  serverName: string,
  env: Record<string, string>
): ClaudeDesktopConfig {
  return {
    mcpServers: {
      [serverName]: {
        command: 'npx',
        args: ['-y', 'mcp-twake-mail'],
        env,
      },
    },
  };
}

// Config file locations:
// macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
// Windows: %APPDATA%\Claude\claude_desktop_config.json
import { homedir } from 'node:os';
import { join } from 'node:path';

function getClaudeConfigPath(): string {
  const home = homedir();
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  } else if (process.platform === 'win32') {
    return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  }
  // Linux fallback (unofficial)
  return join(home, '.config', 'claude', 'claude_desktop_config.json');
}
```

### Anti-Patterns to Avoid
- **Writing to stdout in MCP mode:** MCP uses stdio JSON-RPC; any console.log breaks the protocol. Use stderr for all logging.
- **Blocking prompts in server mode:** Interactive prompts only work in CLI mode, never in MCP server mode.
- **Hardcoding config paths:** Always use os.homedir() and proper path joining for cross-platform support.
- **Single flat command structure:** Use subcommands (setup, auth, check) rather than flags for distinct operations.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CLI argument parsing | Manual process.argv parsing | commander | Handles help, version, validation, subcommands |
| Interactive prompts | readline-based prompts | @inquirer/prompts | Input validation, types, cancellation support |
| Coverage reporting | Manual instrumentation | @vitest/coverage-v8 | Automatic, threshold enforcement, multiple reporters |
| TypeScript linting | Custom rules | typescript-eslint | Comprehensive rules, maintained, type-aware |
| isInline detection | Custom MIME logic | RFC 8621 algorithm | Disposition + cid check per spec |

**Key insight:** CLI tooling is mature and well-tested. Hand-rolling prompts or argument parsing leads to missing edge cases (Ctrl+C handling, terminal width, validation).

## Common Pitfalls

### Pitfall 1: stdout Pollution in MCP Server Mode
**What goes wrong:** Console.log output breaks MCP JSON-RPC protocol
**Why it happens:** Developers use console.log for debugging without realizing stdout is reserved
**How to avoid:** All logging to stderr via pino logger; console.log only in CLI mode
**Warning signs:** "Parse error" in Claude Desktop logs, server disconnections

### Pitfall 2: Commander Parse Without Async Handling
**What goes wrong:** Program exits before async actions complete
**Why it happens:** program.parse() returns immediately, doesn't await actions
**How to avoid:** Use program.parseAsync() or handle promises in actions properly
**Warning signs:** CLI exits immediately, no output from commands

### Pitfall 3: Coverage Threshold Violations in CI
**What goes wrong:** Build passes locally but fails in CI due to coverage
**Why it happens:** Different file counts, missing test files, or threshold drift
**How to avoid:** Set coverage.include explicitly, run coverage locally before push
**Warning signs:** CI failures with "Coverage below threshold"

### Pitfall 4: ESLint Config File Extension
**What goes wrong:** ESLint doesn't load TypeScript config properly
**Why it happens:** Using .js extension without jiti, or wrong export format
**How to avoid:** Use eslint.config.mjs with ES modules, or install jiti for .ts
**Warning signs:** "Cannot find module" or "Unexpected token" errors

### Pitfall 5: Thread Email Order Assumptions
**What goes wrong:** Emails displayed in wrong order in UI
**Why it happens:** RFC 8621 specifies emailIds sorted "oldest first" but UI might expect newest first
**How to avoid:** Document order in tool response, let consumer decide on reversal
**Warning signs:** Thread conversations appear backwards

### Pitfall 6: Inline Attachment Misclassification
**What goes wrong:** Inline images shown as attachments or vice versa
**Why it happens:** Only checking disposition, not considering cid
**How to avoid:** isInline = has cid AND disposition !== 'attachment' (per RFC 8621 algorithm)
**Warning signs:** Email body shows broken images, attachment list includes embedded images

## Code Examples

Verified patterns from official sources:

### Commander.js Subcommand Setup
```typescript
// Source: https://github.com/tj/commander.js
import { Command } from 'commander';

const program = new Command();

program
  .name('mcp-twake-mail')
  .version('0.1.0')
  .description('MCP server for Twake Mail');

program
  .command('setup')
  .description('Run interactive setup wizard')
  .action(async () => {
    // Wizard logic
  });

program
  .command('auth')
  .description('Re-authenticate with OIDC')
  .action(async () => {
    // Auth logic
  });

program
  .command('check')
  .description('Verify configuration')
  .action(async () => {
    // Check logic
  });

// Default action when no subcommand
program
  .action(async () => {
    // Start MCP server
  });

await program.parseAsync(process.argv);
```

### @inquirer/prompts Select and Input
```typescript
// Source: https://github.com/SBoudrias/Inquirer.js
import { input, select, confirm, password } from '@inquirer/prompts';

// Text input with validation
const url = await input({
  message: 'JMAP Session URL:',
  validate: (value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return 'Invalid URL format';
    }
  },
});

// Selection from choices
const authMethod = await select({
  message: 'Authentication method:',
  choices: [
    { value: 'oidc', name: 'OIDC (Browser flow)' },
    { value: 'basic', name: 'Basic (Username/Password)' },
    { value: 'bearer', name: 'Bearer Token' },
  ],
});

// Password (masked input)
const token = await password({
  message: 'Enter your API token:',
  mask: '*',
});

// Confirmation
const proceed = await confirm({
  message: 'Write config to file?',
  default: true,
});
```

### Vitest Coverage Configuration
```typescript
// Source: https://vitest.dev/guide/coverage
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
```

### ESLint Flat Config with TypeScript
```javascript
// Source: https://typescript-eslint.io/getting-started/
// eslint.config.mjs
import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'warn',
    },
  },
  {
    ignores: ['build/**', 'node_modules/**', 'coverage/**'],
  }
);
```

### JMAP Thread/get Request
```typescript
// Source: RFC 8621 Section 3.1
// Thread/get is standard /get method per RFC 8620 Section 5.1
const response = await jmapClient.request([
  ['Thread/get', {
    accountId: session.accountId,
    ids: [threadId],
    // No additional properties - Thread only has id and emailIds
  }, 'getThread'],
]);

// Response structure:
// {
//   accountId: "...",
//   state: "...",
//   list: [{ id: "T123", emailIds: ["E1", "E2", "E3"] }],
//   notFound: []
// }
```

### JMAP Attachment Properties
```typescript
// Source: RFC 8621 Section 4.1.4
// EmailBodyPart properties for attachments
const response = await jmapClient.request([
  ['Email/get', {
    accountId: session.accountId,
    ids: [emailId],
    properties: ['attachments'],
    // Specify which bodyPart properties to include
    bodyProperties: [
      'blobId',      // Id for downloading the attachment
      'name',        // Filename from Content-Disposition
      'type',        // MIME type from Content-Type
      'size',        // Size in octets after decoding
      'disposition', // 'attachment' | 'inline' | null
      'cid',         // Content-Id for inline references
    ],
  }, 'getAttachments'],
]);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| inquirer (legacy) | @inquirer/prompts | 2023 | Smaller bundles, modern API, tree-shakeable |
| istanbul coverage | v8 coverage | vitest v3.2+ | Same accuracy, 10x faster |
| .eslintrc.* | eslint.config.mjs | ESLint v9 (2024) | Flat config default, defineConfig helper |
| TypeScript + ESLint manual | typescript-eslint | 2024+ | Simplified setup, single import |

**Deprecated/outdated:**
- inquirer (the old package): Use @inquirer/prompts instead
- .eslintrc.js/.json: Use eslint.config.mjs (flat config)
- @typescript-eslint/eslint-plugin + @typescript-eslint/parser: Use unified typescript-eslint package

## Open Questions

Things that couldn't be fully resolved:

1. **Linux Claude Desktop config path**
   - What we know: macOS and Windows paths are documented
   - What's unclear: Linux path is unofficial/undocumented
   - Recommendation: Use ~/.config/claude/ as fallback, document as unsupported

2. **JMAP isInline exact algorithm**
   - What we know: RFC 8621 provides suggested algorithm in JavaScript
   - What's unclear: Server implementations may vary
   - Recommendation: Use disposition + cid check; test with actual Twake server

## Sources

### Primary (HIGH confidence)
- RFC 8621 - JMAP for Mail (https://www.rfc-editor.org/rfc/rfc8621.html) - Thread/get, EmailBodyPart
- Commander.js GitHub (https://github.com/tj/commander.js) - CLI API
- Inquirer.js GitHub (https://github.com/SBoudrias/Inquirer.js) - Prompts API
- typescript-eslint Getting Started (https://typescript-eslint.io/getting-started/) - ESLint setup
- Vitest Coverage Guide (https://vitest.dev/guide/coverage) - Coverage configuration

### Secondary (MEDIUM confidence)
- Claude Desktop MCP docs (https://modelcontextprotocol.io/docs/develop/connect-local-servers) - Config format
- npm-compare commander vs yargs (https://npm-compare.com/commander,yargs) - Dependency comparison

### Tertiary (LOW confidence)
- Various blog posts on CLI structure - Validated against official docs

## Metadata

**Confidence breakdown:**
- JMAP Thread/Attachments: HIGH - RFC 8621 is authoritative
- CLI Framework: HIGH - Official commander/inquirer docs verified
- Test Coverage: HIGH - Vitest official documentation
- ESLint Setup: HIGH - typescript-eslint official guide
- Claude Desktop Config: MEDIUM - Official MCP docs, but limited detail

**Research date:** 2026-01-29
**Valid until:** 2026-03-01 (60 days - stable ecosystem)
