---
phase: 02-authentication-system
plan: 03
subsystem: auth
tags: [oidc, openid-client, token-refresh, mutex, concurrency]

# Dependency graph
requires:
  - phase: 02-01
    provides: token-store with loadTokens/saveTokens, JMAPError factories
provides:
  - TokenRefresher class with mutex pattern for concurrent access
  - ensureValidToken() function for automatic token refresh
  - 60-second expiry buffer for proactive refresh
affects: [02-04, jmap-client-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Promise-based mutex for concurrent operation serialization
    - Proactive token refresh with expiry buffer
    - Cached OIDC configuration discovery

key-files:
  created:
    - src/auth/token-refresh.ts
    - tests/auth/token-refresh.test.ts
  modified:
    - src/auth/index.ts

key-decisions:
  - "60-second expiry buffer for proactive refresh before token expires"
  - "Promise-based mutex pattern to serialize concurrent refresh requests"
  - "Keep old refresh token if server doesn't rotate on refresh"
  - "Cached OIDC configuration to avoid repeated discovery calls"

patterns-established:
  - "Mutex via shared promise: store ongoing operation promise, all concurrent callers await same promise"
  - "Expiry buffer: refresh tokens before actual expiry to avoid races"

# Metrics
duration: 1m 45s
completed: 2026-01-29
---

# Phase 2 Plan 3: Token Refresh with Mutex Summary

**Automatic token refresh with 60-second expiry buffer and Promise-based mutex preventing concurrent refresh races**

## Performance

- **Duration:** 1m 45s
- **Started:** 2026-01-29T15:19:09Z
- **Completed:** 2026-01-29T15:20:54Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments

- TokenRefresher class with ensureValidToken() for automatic refresh
- 60-second expiry buffer (TOKEN_EXPIRY_BUFFER) for proactive token refresh
- Promise-based mutex prevents "invalid_grant" errors from concurrent refreshes
- Comprehensive test suite (19 tests) including concurrent access verification

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement token refresh with mutex** - `c5d3a1d` (feat)

## Files Created/Modified

- `src/auth/token-refresh.ts` - TokenRefresher class with mutex, ensureValidToken(), createTokenRefresher()
- `src/auth/index.ts` - Export token-refresh module
- `tests/auth/token-refresh.test.ts` - 19 tests including concurrent access verification

## Decisions Made

- **60-second expiry buffer:** Refresh tokens when they will expire in less than 60 seconds, not when already expired. This proactive approach prevents request failures from nearly-expired tokens.
- **Promise-based mutex:** Store the ongoing refresh promise and have all concurrent callers await the same promise. This is simpler and more reliable than traditional mutex locks for async operations.
- **Preserve non-rotated refresh tokens:** If the OIDC provider doesn't return a new refresh token during refresh, keep the existing one. Some providers don't rotate refresh tokens.
- **Cached OIDC discovery:** Cache the issuer configuration after first discovery to avoid repeated network calls.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - implementation proceeded smoothly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Token refresh module ready for integration with JMAP client
- ensureValidToken() can be called before any JMAP request to ensure valid credentials
- 02-04 (Auth Provider Integration) will wire token refresh into the client authentication flow

---
*Phase: 02-authentication-system*
*Plan: 03*
*Completed: 2026-01-29*
