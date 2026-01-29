---
phase: 02
plan: 01
subsystem: authentication
tags: [oidc, config, tokens, error-handling]
dependency-graph:
  requires: [01-01, 01-02]
  provides: [oidc-config-validation, token-storage, auth-errors]
  affects: [02-02, 02-03, 06-01]
tech-stack:
  added: []
  patterns: [secure-file-permissions, conditional-validation]
key-files:
  created:
    - src/auth/token-store.ts
    - src/auth/index.ts
    - tests/auth/token-store.test.ts
  modified:
    - src/config/schema.ts
    - src/errors.ts
decisions:
  - "Token file at ~/.mcp-twake-mail/tokens.json with 0600 permissions"
  - "OIDC requires issuer and client ID; token comes from OAuth flow"
metrics:
  duration: 2m 38s
  completed: 2026-01-29
---

# Phase 02 Plan 01: Auth Foundation Components Summary

OIDC config validation, secure token persistence (0600 permissions), auth-specific error factories with re-auth instructions.

## What Was Built

### 1. Extended Config Schema for OIDC

Extended `src/config/schema.ts` with OIDC-specific environment variables:

- `JMAP_OIDC_ISSUER` - OIDC provider URL (required for oidc auth)
- `JMAP_OIDC_CLIENT_ID` - OAuth2 client ID (required for oidc auth)
- `JMAP_OIDC_SCOPE` - OAuth2 scopes (default: openid email offline_access)
- `JMAP_OIDC_REDIRECT_PORT` - Localhost callback port (default: 3000)

Conditional validation:
- `bearer` auth requires `JMAP_TOKEN`
- `oidc` auth requires `JMAP_OIDC_ISSUER` and `JMAP_OIDC_CLIENT_ID`
- `basic` auth requires `JMAP_USERNAME` and `JMAP_PASSWORD`

### 2. Token Store with Secure Permissions

Created `src/auth/token-store.ts` with:

```typescript
interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;  // Unix timestamp
  idToken?: string;
}
```

Functions:
- `saveTokens(tokens)` - Write to ~/.mcp-twake-mail/tokens.json with 0600 permissions
- `loadTokens()` - Read tokens, return null if not found
- `clearTokens()` - Delete token file (for logout)

Security:
- Parent directory created with 0700 permissions
- Token file written with 0600 permissions (owner read/write only)
- chmod called after write to ensure permissions even for existing files

### 3. Auth-Specific Error Factories

Added to `src/errors.ts`:

- `JMAPError.tokenExpired(refreshAvailable)` - Expired token with guidance
- `JMAPError.refreshFailed(reason?)` - Token refresh failure
- `JMAPError.oidcFlowError(stage, details?)` - OIDC flow errors
- `JMAPError.noStoredTokens()` - Missing authentication state

Updated `formatStartupError()` to handle:
- Token expiration errors
- OIDC/OAuth errors
- OIDC auth method in configuration hints

All error messages include actionable fix guidance pointing to `npx mcp-twake-mail auth`.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 139ec58 | Extend config schema for OIDC authentication |
| 2 | f0f63c2 | Create token store with secure permissions |
| 3 | 54df941 | Add auth-specific error factories |

## Test Results

- **Before:** 47 tests passing
- **After:** 57 tests passing (+10 token store tests)

Token store tests:
- saveTokens creates file with correct content
- saveTokens creates file with 0600 permissions
- saveTokens creates parent directory if not exists
- loadTokens returns null when no file exists
- loadTokens returns tokens when file exists
- loadTokens returns tokens without optional fields
- clearTokens removes file when it exists
- clearTokens does not throw when file does not exist
- clearTokens can be called multiple times safely
- TOKEN_PATH points to expected location

## Deviations from Plan

None - plan executed exactly as written.

## Dependencies for Next Plans

This plan provides:
- **For 02-02 (PKCE OAuth Flow):** OIDC config fields, token store for persistence
- **For 02-03 (Token Refresh):** Token store, refreshFailed error, tokenExpired error
- **For 06-01 (CLI Auth):** noStoredTokens error, token store for CLI-initiated auth

## What's Next

02-02: PKCE OAuth Flow - Implement the OAuth2 PKCE flow using openid-client, discovery, local callback server, and token exchange.
