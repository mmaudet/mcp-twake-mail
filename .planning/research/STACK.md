# Technology Stack

**Project:** mcp-twake-mail
**Researched:** 2026-01-29
**Domain:** MCP server for JMAP email operations

## Executive Summary

The standard 2025/2026 stack for building MCP servers with JMAP email integration centers on the official MCP TypeScript SDK with native Node.js features. Modern Node.js (18+) provides built-in fetch, ESM support, and readline for CLI interactions, eliminating the need for many external dependencies. TypeScript 5.9+ with Zod 4 provides type safety and runtime validation. Vitest replaces Jest for ESM-native testing. The pattern is: **maximize Node.js built-ins, minimize dependencies, optimize for ESM.**

---

## Recommended Stack

### Core Runtime & Language

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Node.js** | **>=20.0.0** | Runtime platform | v20 LTS with native fetch, ESM stability, WebCryptoAPI; required by openid-client v6; baseline for 2026 |
| **TypeScript** | **^5.9.0** | Type safety | Node20 module resolution, deferred imports, stable target ES2023, improved DX with MDN summaries |
| **ESM** | Native | Module system | Industry standard for 2026; eliminates CommonJS complexity; required by modern tooling |

**Rationale:**
Node.js 20 is the 2026 baseline - it provides native fetch (no node-fetch), WebCryptoAPI (required for PKCE), and ESM stability. TypeScript 5.9's `node20` module setting provides predictable ESM/CJS interop. **HIGH confidence** - verified via [Node.js docs](https://nodejs.org/), [TypeScript 5.9 release](https://devblogs.microsoft.com/typescript/announcing-typescript-5-9/), and [openid-client requirements](https://github.com/panva/openid-client).

### MCP Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **@modelcontextprotocol/sdk** | **^1.25.3** | MCP server implementation | Official TypeScript SDK; stdio transport built-in; v1.x stable for production (v2 expected Q1 2026); peer-depends on Zod |

**Rationale:**
The official SDK is the only recommended option for MCP servers in 2026. v1.25.3 (Jan 20, 2026) is latest stable. Provides server/client separation, stdio/HTTP transports, tool/resource/prompt primitives. **HIGH confidence** - verified via [official GitHub](https://github.com/modelcontextprotocol/typescript-sdk) and [npm package](https://www.npmjs.com/package/@modelcontextprotocol/sdk).

**Alternatives considered:**
- Platformatic MCP server (Fastify-based) - too opinionated for lightweight stdio server
- Custom implementation - reinventing the wheel, no ecosystem benefits

### Validation & Configuration

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Zod** | **^4.3.6** | Runtime validation & types | Required peer dependency of MCP SDK; validates env vars, JMAP responses, tool inputs; unified error API in v4 |

**Rationale:**
Zod 4 is the current stable release (matches mcp-twake-dav pattern). MCP SDK imports from `zod/v4` internally but maintains backward compat with Zod 3.25+. Pattern: define schema → parse at startup → fail fast on invalid config. **HIGH confidence** - verified via [Zod migration guide](https://zod.dev/v4/changelog), [MCP SDK peer deps](https://github.com/modelcontextprotocol/typescript-sdk).

**Migration notes:**
- Zod 4 breaking changes: unified `error` param replaces `message`/`invalid_type_error`
- Defaults inside optional properties now applied (was not in v3)
- Use `z.strictObject()` instead of `.strict()` method
- Community codemod available: `zod-v3-to-v4`

**Environment variable pattern:**
```typescript
// src/config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  JMAP_SESSION_URL: z.string().url(),
  JMAP_AUTH_METHOD: z.enum(['basic', 'bearer', 'oidc']),
  // ... more vars
});

export const env = envSchema.parse(process.env);
```

### JMAP Client

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Custom fetch-based client** | N/A | JMAP protocol implementation | Full control over request batching, session management, error handling; lightweight; matches PRD spec |
| **Reference: linagora/jmap-client-ts** | 1.0.0 | Pattern reference | TypeScript JMAP 1.0 client; demonstrates session management, method calls; MIT licensed |

**Rationale:**
Custom implementation preferred over library dependency. JMAP is JSON-RPC over HTTP - fetch-native approach is ~100 LOC for core client. Allows custom error mapping to MCP error format. Reference implementation exists but has been inactive since 2022. **MEDIUM confidence** - custom client approach validated by similar projects (n8n-nodes-jmap); linagora/jmap-client-ts confirmed via [GitHub](https://github.com/linagora/jmap-client-ts).

**Alternatives considered:**
- `jmap-client` (linagora/jmap-client) - ES6 transpiled to ES5, outdated pattern for 2026
- `@jmapio/jmap-js` - full data model implementation, too heavy for MCP server use case
- linagora/jmap-client-ts - inactive since 2022, but good reference

**JMAP specs:**
- RFC 8620 (JMAP Core) - base protocol, session discovery
- RFC 8621 (JMAP Mail) - email data model
- RFC 8887 (JMAP WebSocket) - NOT needed for v1
- RFC 9404 (JMAP Blob) - for attachments

### Authentication

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **openid-client** | **^6.6.0** | OIDC + OAuth2 + PKCE | Industry standard; built-in PKCE (S256); requires Node.js 20+; Universal ESM; powers major platforms |
| **Node.js crypto** | Native | Token generation | `crypto.randomBytes()` for basic auth tokens; WebCryptoAPI for PKCE verifier/challenge |

**Rationale:**
openid-client v6 is the 2026 standard for OIDC/OAuth2 in Node.js. Handles PKCE generation (`randomPKCECodeVerifier()`, `calculatePKCECodeChallenge()`), token exchange, refresh flows. Requires Node.js 20+. **HIGH confidence** - verified via [openid-client GitHub](https://github.com/panva/openid-client), [Okta tutorial (2025)](https://developer.okta.com/blog/2025/07/28/express-oauth-pkce).

**Auth methods:**
1. **Basic** - username:password, encode as base64 Authorization header
2. **Bearer** - JWT token in Authorization header
3. **OIDC + PKCE** - OAuth2 Authorization Code flow with PKCE

**Token storage:**
`~/.mcp-twake-mail/tokens.json` with `fs.chmodSync(path, 0o600)` for read/write owner-only permissions.

**Alternatives considered:**
- `oidc-client-ts` - browser-focused, not ideal for Node.js CLI
- `passport` + `passport-oauth2` - too heavyweight for CLI tool

### Logging

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Pino** | **^10.3.0** | Structured logging to stderr | Fast, JSON-native, pretty-print in dev; writes to stderr (stdout reserved for MCP JSON-RPC); matches mcp-twake-dav |

**Rationale:**
Pino is the 2026 standard for Node.js logging. Critical for stdio-based MCP servers: **never log to stdout** (corrupts JSON-RPC). Pino defaults to stderr, structured JSON in prod, pretty in dev. **HIGH confidence** - matches mcp-twake-dav pattern, verified via [Pino docs](https://github.com/pinojs/pino).

**Configuration:**
```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { destination: 2 } } // stderr
    : undefined
});
```

**Alternatives considered:**
- `winston` - more features, slower, heavier
- `console.error()` - works but no structure, no levels, no pretty-print

### Testing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Vitest** | **^4.0.18** | Unit & integration tests | Native ESM/TypeScript, 10x faster than Jest, stable browser mode, Vite dev server reuse; matches mcp-twake-dav |
| **vitest-fetch-mock** | **^0.4.0** | Mock native fetch API | Mocks global fetch; supports Vitest 2+ and Node.js 18+ |

**Rationale:**
Vitest is the 2026 standard for ESM/TypeScript testing. Jest 30 improved ESM support but still experimental. Vitest 4.0 (late 2025) has stable browser mode, native ESM, zero config for TypeScript. 10-20x faster in watch mode. **HIGH confidence** - verified via [Vitest vs Jest 2026 comparison](https://dev.to/dataformathub/vitest-vs-jest-30-why-2026-is-the-year-of-browser-native-testing-2fgb), [performance benchmarks](https://dev.to/saswatapal/why-i-chose-vitest-over-jest-10x-faster-tests-native-esm-support-13g6).

**Testing strategy:**
- Unit tests: JMAP client, auth flows, config parsing
- Integration tests: MCP tool execution, session management
- Mock fetch for JMAP API calls
- No need for MCP client tests (integration via MCP Inspector)

**Alternatives considered:**
- Jest - ESM support still experimental in v30, requires `--experimental-vm-modules`
- Node.js test runner - too minimal, lacks ecosystem

### CLI Interaction

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **node:readline/promises** | Native (Node 18+) | Interactive prompts | Built-in, zero deps, supports hidden password input via muted output; matches mcp-twake-dav pattern |

**Rationale:**
Node.js 18+ includes `readline/promises` with async/await support. Zero dependencies for setup wizard. Hidden password input via muted Writable stream (see mcp-twake-dav implementation). **HIGH confidence** - verified in [mcp-twake-dav source](file:///Users/mmaudet/work/mcp-twake-dav/src/cli/prompt.ts).

**Pattern:**
```typescript
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const rl = readline.createInterface({ input: stdin, output: stdout });
const answer = await rl.question('JMAP Session URL: ');
```

**Alternatives considered:**
- `inquirer` - 400KB+, feature-heavy, not needed for simple wizard
- `commander` - for complex CLI apps, overkill for setup wizard
- `prompts` - good alternative, but adds dependency when native works

### HTTP Client

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Native fetch** | Node.js 18+ built-in | HTTP requests to JMAP server | Zero deps, stable since Node 18, powered by Undici, sufficient for JMAP JSON-RPC |

**Rationale:**
Native fetch is the 2026 standard for Node.js 18+. node-fetch is deprecated (ESM-only since v3, recommends native fetch). Axios adds 11.7KB and features (interceptors, auto-retry) not needed for JMAP. JMAP is stateless JSON-RPC, no need for complex HTTP client. **HIGH confidence** - verified via [Node.js Fetch API guide](https://blog.logrocket.com/fetch-api-node-js/), [node-fetch deprecation notice](https://medium.com/illumination/farewell-node-fetch-2ee28bfd1c72).

**JMAP request pattern:**
```typescript
const response = await fetch(session.apiUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({
    using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
    methodCalls: [['Email/query', { /* ... */ }, 'call-1']],
  }),
});
const data = await response.json();
```

**Alternatives considered:**
- `axios` - automatic JSON parsing, interceptors, but 11.7KB overhead
- `node-fetch` - deprecated in favor of native fetch
- `undici` - native fetch uses Undici under the hood

---

## Build & Development Tools

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **TypeScript Compiler** | ^5.9.3 | Transpilation | Official compiler, declaration file generation, source maps |
| **@types/node** | ^25.0.10 | Node.js type definitions | Current types for Node.js APIs |

**Scripts pattern (from mcp-twake-dav):**
```json
{
  "scripts": {
    "build": "tsc",
    "start": "node build/index.js",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepublishOnly": "npm run build && npm test"
  }
}
```

**tsconfig.json:**
```json
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

**Rationale:**
TypeScript 5.9 with `Node16` module resolution provides stable ESM output. Matches mcp-twake-dav pattern. Simple tsc build (no bundlers) keeps dependencies minimal. **HIGH confidence** - verified via [mcp-twake-dav tsconfig](file:///Users/mmaudet/work/mcp-twake-dav/tsconfig.json).

---

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **chrono-node** | ^2.9.0 | Natural language date parsing | For tools like "get emails from last week" - if implementing NLP queries |

**Conditional dependencies:**
- `chrono-node` only if implementing natural language date queries (seen in mcp-twake-dav for calendar)
- Otherwise avoid - keep dependencies minimal

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| **MCP SDK** | @modelcontextprotocol/sdk | Custom implementation | Reinventing wheel, no ecosystem benefits |
| **MCP SDK** | @modelcontextprotocol/sdk | Platformatic MCP | Too opinionated, Fastify overhead for stdio |
| **HTTP client** | Native fetch | axios | 11.7KB overhead, features not needed for JMAP |
| **HTTP client** | Native fetch | node-fetch | Deprecated, recommends native fetch |
| **JMAP client** | Custom (fetch-based) | linagora/jmap-client-ts | Inactive since 2022, adds dependency |
| **JMAP client** | Custom (fetch-based) | @jmapio/jmap-js | Too heavy, full data model not needed |
| **Testing** | Vitest | Jest | ESM support still experimental, 10x slower |
| **Testing** | Vitest | Node test runner | Too minimal, lacks ecosystem |
| **CLI prompts** | node:readline/promises | inquirer | 400KB+, overkill for simple wizard |
| **CLI prompts** | node:readline/promises | commander | For complex CLIs, not needed |
| **Validation** | Zod | io-ts | Zod has better DX, required by MCP SDK |
| **Validation** | Zod | yup | Zod is TypeScript-first, better inference |
| **Logging** | Pino | winston | Slower, heavier, more features than needed |
| **Logging** | Pino | console.error | No structure, no levels, no filtering |
| **OIDC** | openid-client | oidc-client-ts | Browser-focused, not for Node.js CLI |
| **OIDC** | openid-client | passport + passport-oauth2 | Too heavyweight for CLI |

---

## What NOT to Use

### DON'T: Install node-fetch
**Why:** Native fetch is built into Node.js 18+. node-fetch maintainers recommend native fetch for Node 18+. ESM-only since v3, no reason to add dependency.

**Instead:** Use native `fetch()` - stable, performant, zero deps.

### DON'T: Use Jest for new projects
**Why:** ESM support still experimental in Jest 30. Requires `--experimental-vm-modules` flag. 10-20x slower than Vitest. Complex config for TypeScript + ESM.

**Instead:** Use Vitest - native ESM, native TypeScript, 10x faster, zero config.

### DON'T: Add axios for JMAP calls
**Why:** JMAP is simple JSON-RPC over HTTP. Native fetch handles it perfectly. Axios adds 11.7KB and features (interceptors, auto-retry, request/response transforms) you won't use.

**Instead:** Use native fetch with manual JSON parsing. It's explicit and sufficient.

### DON'T: Use inquirer or commander for the setup wizard
**Why:** Node.js 18+ includes `readline/promises` with async/await. Zero dependencies for simple Q&A wizard. mcp-twake-dav proves the pattern works.

**Instead:** Use `node:readline/promises` with custom helpers (see mcp-twake-dav pattern).

### DON'T: Install dotenv in 2026
**Why:** Modern deployments use environment variables directly (Docker, systemd, cloud platforms). For local dev, use shell rc files or Claude Desktop/CLI config. dotenv adds startup overhead for a feature you don't need.

**Instead:** Validate `process.env` directly with Zod. Document env vars in README.

**Exception:** If users demand .env file support, add dotenv conditionally.

### DON'T: Use CommonJS or dual ESM/CJS packages
**Why:** It's 2026. ESM is the standard. MCP SDK is ESM. TypeScript 5.9 with Node16 resolution is stable. CommonJS creates complexity.

**Instead:** Pure ESM via `"type": "module"` in package.json.

### DON'T: Use JMAP libraries from 2019-2022
**Why:** Most JMAP libraries predate ESM, TypeScript 5, native fetch. They're abandoned or use outdated patterns (Babel transpilation, CommonJS).

**Instead:** Custom fetch-based JMAP client. JMAP is JSON-RPC - it's ~100 LOC for core functionality.

### DON'T: Add bundlers (webpack, rollup, esbuild)
**Why:** Node.js server code doesn't need bundling. TypeScript compiles to .js files in build/. npm publish includes build/. Simple, debuggable, fast.

**Instead:** Use tsc directly. Matches mcp-twake-dav pattern.

---

## Installation Commands

```bash
# Core dependencies
npm install @modelcontextprotocol/sdk zod pino openid-client

# Dev dependencies
npm install -D typescript @types/node vitest

# Optional (if implementing natural language date queries)
npm install chrono-node

# Testing utilities (if mocking fetch)
npm install -D vitest-fetch-mock
```

**Total production dependencies:** 4-5 packages
**Total dev dependencies:** 3-4 packages

**Philosophy:** Maximize Node.js built-ins, minimize npm dependencies.

---

## Confidence Assessment

| Area | Confidence | Rationale |
|------|------------|-----------|
| MCP SDK | HIGH | Official SDK v1.25.3 verified via GitHub/npm; v1.x stable for production |
| Node.js/TypeScript | HIGH | Node 20 LTS baseline, TypeScript 5.9 verified, ESM standard for 2026 |
| Zod validation | HIGH | MCP SDK peer dependency, v4 verified via migration guide |
| openid-client | HIGH | v6 verified via GitHub, Okta tutorial, Node 20 requirement confirmed |
| Pino logging | HIGH | Matches mcp-twake-dav pattern, stderr best practice verified |
| Vitest | HIGH | v4.0 stable, performance benchmarks verified, ESM-native confirmed |
| Native fetch | HIGH | Node 18+ stable fetch verified, node-fetch deprecation confirmed |
| Custom JMAP client | MEDIUM | Pattern verified via n8n-nodes-jmap, linagora reference confirmed but inactive |
| readline/promises | HIGH | Verified in mcp-twake-dav source, Node 18+ built-in confirmed |

**Overall:** HIGH confidence. All recommendations verified via official docs, recent tutorials (2025-2026), or reference implementation (mcp-twake-dav).

---

## Sources

**MCP Framework:**
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Documentation](https://modelcontextprotocol.io/docs/develop/build-server)
- [MCP Best Practices 2026](https://nearform.com/digital-community/implementing-model-context-protocol-mcp-tips-tricks-and-pitfalls/)

**Node.js & TypeScript:**
- [TypeScript 5.9 Release Notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-9.html)
- [TypeScript 5.9 Announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-5-9/)
- [Node.js Fetch API Guide](https://blog.logrocket.com/fetch-api-node-js/)
- [Node.js Security Best Practices 2026](https://www.sparkleweb.in/blog/node.js_security_best_practices_for_2026)

**JMAP:**
- [RFC 8620 - JMAP Core](https://datatracker.ietf.org/doc/html/rfc8620)
- [RFC 8621 - JMAP Mail](https://datatracker.ietf.org/doc/html/rfc8621)
- [Apache James JMAP Config](https://james.apache.org/server/config-jmap.html)
- [linagora/jmap-client-ts](https://github.com/linagora/jmap-client-ts)
- [JMAP Software Implementations](https://jmap.io/software.html)

**Authentication:**
- [openid-client GitHub](https://github.com/panva/openid-client)
- [openid-client npm](https://www.npmjs.com/package/openid-client)
- [OAuth 2.0 with PKCE in Express (2025)](https://developer.okta.com/blog/2025/07/28/express-oauth-pkce)

**Validation:**
- [Zod v4 Migration Guide](https://zod.dev/v4/changelog)
- [Validating Environment Variables with Zod](https://dev.to/roshan_ican/validating-environment-variables-in-nodejs-with-zod-2epn)
- [Zod 3 to 4 Codemod](https://docs.codemod.com/guides/migrations/zod-3-4)

**Testing:**
- [Vitest vs Jest 2026](https://dev.to/dataformathub/vitest-vs-jest-30-why-2026-is-the-year-of-browser-native-testing-2fgb)
- [Why I Chose Vitest Over Jest](https://dev.to/saswatapal/why-i-chose-vitest-over-jest-10x-faster-tests-native-esm-support-13g6)
- [Vitest Documentation](https://vitest.dev/)
- [vitest-fetch-mock](https://www.npmjs.com/package/vitest-fetch-mock)

**Logging:**
- [Pino GitHub](https://github.com/pinojs/pino)

**HTTP Clients:**
- [Axios vs Fetch 2026](https://iproyal.com/blog/axios-vs-fetch/)
- [Axios vs Fetch (2025 update)](https://blog.logrocket.com/axios-vs-fetch-2025/)
- [Farewell, node-fetch](https://medium.com/illumination/farewell-node-fetch-2ee28bfd1c72)

**CLI:**
- [Commander.js Guide](https://betterstack.com/community/guides/scaling-nodejs/commander-explained/)
- [Inquirer.js](https://github.com/SBoudrias/Inquirer.js)

**Reference Implementation:**
- [mcp-twake-dav](https://github.com/mmaudet/mcp-twake-dav) - package.json, tsconfig.json, CLI patterns

---

**Last updated:** 2026-01-29
**Research confidence:** HIGH
**Verification:** All versions verified via official sources (GitHub releases, npm, official docs) or recent tutorials (2025-2026)
