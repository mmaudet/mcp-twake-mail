# Phase 2: Authentication System - Research

**Researched:** 2026-01-29
**Domain:** OAuth2/OIDC Authentication with PKCE, Token Storage, Token Refresh
**Confidence:** MEDIUM (openid-client v6 is recent rewrite; some patterns verified, some inferred)

## Summary

This research investigates implementing a complete authentication system supporting Basic, Bearer, and OIDC methods for a Node.js MCP server. The OIDC implementation requires OAuth2 Authorization Code flow with PKCE (S256 code challenge), secure token storage with 0600 file permissions, and automatic token refresh.

The primary library for OIDC is `openid-client` v6.x, a complete rewrite (October 2024) that is OpenID Certified and provides native PKCE support. For CLI OAuth callback handling, the `oauth-callback` package provides a lightweight localhost server approach that is RFC 8252 compliant. Token storage uses native Node.js `fs` APIs with explicit 0600 permissions, storing in `~/.mcp-twake-mail/tokens.json` per requirements.

The existing codebase (Phase 1) already has a `getAuthHeaders()` method in `JMAPClient` that returns `Authorization: Bearer {token}` for OIDC. Phase 2 extends this with token persistence, OIDC flow implementation, and automatic refresh.

**Primary recommendation:** Use `openid-client` v6 for OIDC flows with built-in PKCE, `oauth-callback` for CLI authorization code capture, and native `fs` APIs with `chmod 0o600` for secure token storage.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| openid-client | ^6.8 | OIDC/OAuth2 client | OpenID Certified, PKCE built-in, multi-runtime, active maintenance by Filip Skokan |
| oauth-callback | ^1.2 | CLI OAuth callback capture | Lightweight localhost server, RFC 8252 compliant, zero dependencies |
| open | ^10.x | Launch browser for auth | Cross-platform browser launching, peer of oauth-callback |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (native crypto) | Node.js 20+ | PKCE code verifier/challenge | Built into openid-client, no external dep needed |
| (native fs) | Node.js 20+ | Token file storage with permissions | Native APIs sufficient for 0600 file permissions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| openid-client | simple-oauth2 | simple-oauth2 lacks built-in PKCE generators and OIDC discovery |
| oauth-callback | @node-cli-toolkit/oauth-cli | oauth-cli uses Express, heavier dependency footprint |
| File storage | keytar (OS keychain) | keytar requires native compilation, adds complexity; file storage meets requirements |
| File storage | configstore | configstore doesn't enforce 0600 permissions |

**Installation:**
```bash
npm install openid-client oauth-callback open
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── auth/
│   ├── index.ts           # Auth module exports
│   ├── token-store.ts     # Token persistence with 0600 permissions
│   ├── oidc-flow.ts       # OIDC authorization code + PKCE flow
│   └── token-refresh.ts   # Automatic token refresh logic
├── config/
│   └── schema.ts          # Extended with OIDC config (issuer URL, client ID)
├── jmap/
│   └── client.ts          # Updated getAuthHeaders() to use token store
└── errors.ts              # Extended with auth-specific errors
```

### Pattern 1: Token Store with Secure Permissions
**What:** Encapsulated token storage that enforces 0600 permissions on every write
**When to use:** Always for OIDC token persistence
**Example:**
```typescript
// Source: Node.js fs documentation + requirements
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;  // Unix timestamp in seconds
  idToken?: string;
}

const TOKEN_PATH = join(homedir(), '.mcp-twake-mail', 'tokens.json');

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  const dir = dirname(TOKEN_PATH);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2), {
    mode: 0o600,
    encoding: 'utf-8',
  });
  // Ensure permissions even if file existed
  await fs.chmod(TOKEN_PATH, 0o600);
}

export async function loadTokens(): Promise<StoredTokens | null> {
  try {
    const content = await fs.readFile(TOKEN_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
```

### Pattern 2: OIDC Flow with PKCE
**What:** Authorization Code flow with S256 PKCE challenge
**When to use:** When JMAP_AUTH_METHOD is 'oidc' and no valid token exists
**Example:**
```typescript
// Source: openid-client v6 API + oauth-callback
import * as client from 'openid-client';
import { getAuthCode } from 'oauth-callback';
import open from 'open';

interface OIDCConfig {
  issuerUrl: string;      // e.g., https://auth.example.com
  clientId: string;
  redirectUri: string;    // e.g., http://localhost:3000/callback
  scope: string;          // e.g., 'openid email profile offline_access'
}

export async function performOIDCFlow(config: OIDCConfig): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}> {
  // 1. Discover OIDC configuration
  const issuer = await client.discovery(
    new URL(config.issuerUrl),
    config.clientId
  );

  // 2. Generate PKCE code verifier and challenge
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();

  // 3. Build authorization URL
  const authUrl = client.buildAuthorizationUrl(issuer, {
    redirect_uri: config.redirectUri,
    scope: config.scope,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });

  // 4. Launch browser and capture callback
  const result = await getAuthCode({
    authorizationUrl: authUrl.href,
    port: 3000,
    callbackPath: '/callback',
    timeout: 120000,  // 2 minutes for user to complete
    launch: open,
  });

  // 5. Validate state
  if (result.state !== state) {
    throw new Error('State mismatch - possible CSRF attack');
  }

  // 6. Exchange code for tokens
  const tokens = await client.authorizationCodeGrant(issuer, {
    redirect_uri: config.redirectUri,
    code: result.code,
    pkceCodeVerifier: codeVerifier,
  });

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expires_at,
  };
}
```

### Pattern 3: Automatic Token Refresh
**What:** Check token expiry before requests, refresh silently using refresh token
**When to use:** Before any authenticated JMAP request
**Example:**
```typescript
// Source: openid-client v6 API
import * as client from 'openid-client';

const TOKEN_EXPIRY_BUFFER = 60; // Refresh 60 seconds before expiry

export async function ensureValidToken(
  issuer: client.Configuration,
  tokens: StoredTokens
): Promise<StoredTokens> {
  const now = Math.floor(Date.now() / 1000);

  // Check if token is still valid (with buffer)
  if (tokens.expiresAt && tokens.expiresAt > now + TOKEN_EXPIRY_BUFFER) {
    return tokens;  // Token still valid
  }

  // Token expired or expiring soon - refresh
  if (!tokens.refreshToken) {
    throw new AuthError(
      'Access token expired and no refresh token available',
      'tokenExpired',
      'Re-authenticate using the OIDC flow. Run the authentication command again.'
    );
  }

  try {
    const refreshed = await client.refreshTokenGrant(issuer, tokens.refreshToken);

    const newTokens: StoredTokens = {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token || tokens.refreshToken,
      expiresAt: refreshed.expires_at,
      idToken: refreshed.id_token,
    };

    await saveTokens(newTokens);
    return newTokens;
  } catch (error) {
    throw new AuthError(
      'Token refresh failed',
      'refreshFailed',
      'Your session has expired. Re-authenticate using the OIDC flow.'
    );
  }
}
```

### Pattern 4: Integrated Auth Headers with Token Management
**What:** Update JMAPClient.getAuthHeaders() to use token store for OIDC
**When to use:** Every authenticated request when using OIDC
**Example:**
```typescript
// Source: Existing client.ts pattern
private async getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (this.config.JMAP_AUTH_METHOD === 'basic') {
    const credentials = `${this.config.JMAP_USERNAME}:${this.config.JMAP_PASSWORD}`;
    headers['Authorization'] = `Basic ${Buffer.from(credentials).toString('base64')}`;
  } else if (this.config.JMAP_AUTH_METHOD === 'bearer') {
    headers['Authorization'] = `Bearer ${this.config.JMAP_TOKEN}`;
  } else if (this.config.JMAP_AUTH_METHOD === 'oidc') {
    const tokens = await this.ensureValidOIDCToken();
    headers['Authorization'] = `Bearer ${tokens.accessToken}`;
  }

  return headers;
}
```

### Anti-Patterns to Avoid
- **Storing tokens in memory only:** Tokens will be lost on process restart, requiring re-auth every time
- **Using plain code challenge:** Always use S256, never 'plain' - it's required by the spec for security
- **Ignoring state parameter:** Always validate state to prevent CSRF attacks
- **Not setting offline_access scope:** Without it, no refresh token is issued
- **Hardcoding redirect URI port:** Allow configuration for environments where port 3000 is unavailable
- **Blocking on token refresh:** Use pre-emptive refresh with buffer to avoid request delays

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PKCE code verifier generation | Custom random string | `openid-client.randomPKCECodeVerifier()` | Cryptographic requirements (43-128 chars, URL-safe alphabet) |
| S256 code challenge | Manual SHA256 + base64url | `openid-client.calculatePKCECodeChallenge()` | Base64url encoding edge cases, async WebCrypto |
| OIDC discovery | Manual .well-known fetch | `openid-client.discovery()` | Caching, validation, endpoint extraction |
| Localhost callback server | Express/http server | `oauth-callback.getAuthCode()` | Cleanup, timeout, error handling, browser launch |
| State parameter generation | `Math.random()` | `openid-client.randomState()` | Cryptographic randomness requirement |
| Token expiry calculation | Manual timestamp math | Trust `expires_at` from token response | Accounts for clock skew, server authority |

**Key insight:** OAuth2/OIDC security depends on precise implementation of cryptographic primitives. The openid-client library is OpenID Certified, meaning it has passed conformance tests. Hand-rolling these components introduces subtle security vulnerabilities.

## Common Pitfalls

### Pitfall 1: Not Requesting offline_access Scope
**What goes wrong:** No refresh token is returned, user must re-authenticate when access token expires
**Why it happens:** The `offline_access` scope is required to receive refresh tokens per OIDC spec
**How to avoid:** Always include `offline_access` in scope for OIDC flow
**Warning signs:** `refresh_token` is undefined in token response

### Pitfall 2: Storing Tokens with Wrong Permissions
**What goes wrong:** Other users/processes can read tokens from disk
**Why it happens:** Default file permissions are often 0644 (world-readable)
**How to avoid:** Use `mode: 0o600` on write AND `chmod` after write (handles existing files)
**Warning signs:** Run `ls -la ~/.mcp-twake-mail/tokens.json` to verify permissions

### Pitfall 3: Confusing Authorization with Authentication
**What goes wrong:** Treating "has access token" as "user is authenticated"
**Why it happens:** OAuth2 is authorization, OIDC adds authentication via ID token
**How to avoid:** For OIDC, validate the ID token to confirm user identity
**Warning signs:** Security review flags "no ID token validation"

### Pitfall 4: Race Condition on Token Refresh
**What goes wrong:** Multiple concurrent requests each trigger refresh, causing conflicts
**Why it happens:** Token expiry check happens in parallel for each request
**How to avoid:** Use a mutex/lock around token refresh, or queue requests
**Warning signs:** "invalid_grant" errors during high-concurrency periods

### Pitfall 5: Token Refresh Without Error Handling
**What goes wrong:** Refresh failure causes silent auth failure or crash
**Why it happens:** Refresh can fail if refresh token is revoked/expired
**How to avoid:** Catch refresh errors, prompt user to re-authenticate with clear message
**Warning signs:** User reports "suddenly stopped working" without error message

### Pitfall 6: Hardcoded Issuer URL Discovery
**What goes wrong:** Works with one OIDC provider, fails with another
**Why it happens:** Different providers have different endpoint paths
**How to avoid:** Always use OIDC discovery via `.well-known/openid-configuration`
**Warning signs:** Works with Lemonldap, fails with Keycloak

### Pitfall 7: Not Validating ID Token Claims
**What goes wrong:** Accepting tokens from wrong issuer or audience
**Why it happens:** Trusting decoded JWT without claim validation
**How to avoid:** openid-client handles this - trust the library, don't decode manually
**Warning signs:** Security audit finds "no iss/aud claim validation"

## Code Examples

Verified patterns from official sources:

### OIDC Discovery
```typescript
// Source: openid-client v6 API
import * as client from 'openid-client';

const config = await client.discovery(
  new URL('https://auth.example.com'),
  'my-client-id'
);
// config now contains all endpoints from .well-known/openid-configuration
```

### PKCE Generation
```typescript
// Source: openid-client v6 API
import * as client from 'openid-client';

const codeVerifier = client.randomPKCECodeVerifier();
// Returns 43-128 character URL-safe random string

const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
// Returns base64url(SHA256(codeVerifier))
```

### Token Refresh
```typescript
// Source: openid-client v6 API
import * as client from 'openid-client';

const tokens = await client.refreshTokenGrant(config, refreshToken);
// tokens.access_token, tokens.refresh_token, tokens.expires_at
```

### Secure File Write with 0600 Permissions
```typescript
// Source: Node.js fs documentation
import { promises as fs } from 'node:fs';

await fs.writeFile(filepath, content, { mode: 0o600 });
await fs.chmod(filepath, 0o600);  // Ensure perms even if file existed
```

### CLI OAuth Callback Capture
```typescript
// Source: oauth-callback documentation
import { getAuthCode, OAuthError } from 'oauth-callback';
import open from 'open';

try {
  const result = await getAuthCode({
    authorizationUrl: 'https://auth.example.com/oauth2/authorize?...',
    port: 3000,
    callbackPath: '/callback',
    timeout: 120000,
    launch: open,
  });
  console.log('Authorization code:', result.code);
} catch (error) {
  if (error instanceof OAuthError) {
    console.error('OAuth error:', error.error_description);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| openid-client v5.x API | openid-client v6.x complete rewrite | Oct 2024 | New functional API, tree-shakeable, multi-runtime |
| Implicit Flow | Authorization Code + PKCE | OAuth 2.1 (2024) | Implicit flow removed from spec |
| Optional PKCE | Required PKCE | OAuth 2.1 (2024) | PKCE mandatory for all clients |
| Client secrets in SPAs | PKCE for public clients | OAuth 2.0 BCP (2021) | Never embed secrets in public clients |

**Deprecated/outdated:**
- openid-client v5.x: Still works but v6 is actively maintained, v5 discontinued
- Implicit flow (response_type=token): Removed from OAuth 2.1, security risk
- Plain PKCE challenge: Always use S256, plain offers no security benefit

## Open Questions

Things that couldn't be fully resolved:

1. **Lemonldap-specific PKCE support version**
   - What we know: Lemonldap 2.0.4+ supports PKCE (from documentation)
   - What's unclear: Whether the target Linagora instance is 2.0.4+
   - Recommendation: Use discovery to detect PKCE support; fall back gracefully

2. **openid-client v6 complete API documentation**
   - What we know: API overview and function signatures from README
   - What's unclear: Full parameter options for each function (v6 is new)
   - Recommendation: Refer to TypeScript types in node_modules; test iteratively

3. **Concurrent token refresh handling**
   - What we know: Race conditions possible with parallel requests
   - What's unclear: Best pattern for mutex in Node.js async context
   - Recommendation: Implement simple promise-based lock for refresh operation

4. **Config schema extension for OIDC**
   - What we know: Need issuer URL, client ID, optional client secret
   - What's unclear: Exact env var names matching project conventions
   - Recommendation: Follow existing patterns (JMAP_OIDC_ISSUER, JMAP_OIDC_CLIENT_ID)

## Sources

### Primary (HIGH confidence)
- [openid-client v6 GitHub](https://github.com/panva/openid-client) - API overview, PKCE functions
- [openid-client npm](https://www.npmjs.com/package/openid-client) - Version 6.8.1, feature list
- [oauth-callback GitHub](https://github.com/kriasoft/oauth-callback) - Full API, CLI usage
- [LemonLDAP::NG 2.0 OIDC Provider docs](https://lemonldap-ng.org/documentation/2.0/idpopenidconnect) - Endpoints, PKCE support
- [Node.js fs documentation](https://nodejs.org/api/fs.html) - File permissions, chmod

### Secondary (MEDIUM confidence)
- [OWASP OAuth2 Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html) - Security best practices
- [Auth0 PKCE documentation](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce) - Flow explanation
- [RFC 8252 OAuth for Native Apps](https://datatracker.ietf.org/doc/html/rfc8252) - Localhost redirect legitimacy

### Tertiary (LOW confidence)
- [Doyensec OAuth Vulnerabilities blog (2025)](https://blog.doyensec.com/2025/01/30/oauth-common-vulnerabilities.html) - Recent attack patterns
- Various Medium articles on OIDC implementation - General patterns, need verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - openid-client is OpenID Certified, oauth-callback is well-documented
- Architecture: MEDIUM - Patterns derived from v6 API, not production-tested in this context
- Pitfalls: HIGH - Well-documented security issues from OWASP and security research
- Code examples: MEDIUM - Based on v6 API docs, may need adjustment for exact usage

**Research date:** 2026-01-29
**Valid until:** 2026-03-01 (30 days - openid-client v6 is stabilizing but still relatively new)
