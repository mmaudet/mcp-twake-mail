---
phase: 05-email-creation-sending
plan: 02
subsystem: mcp
tags: [jmap, email, reply, threading, rfc8621, mcp-tools]

# Dependency graph
requires:
  - phase: 05-01
    provides: send_email tool with two-phase JMAP sending pattern
provides:
  - reply_email MCP tool with proper threading headers
  - Unit tests for send_email and reply_email tools
affects: [06-testing-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Threading headers as arrays (inReplyTo, references) per RFC 8621"
    - "ReplyTo fallback to From for reply recipients"
    - "Self-exclusion from replyAll using case-insensitive email comparison"

key-files:
  created:
    - tests/unit/mcp/tools/email-sending.test.ts
  modified:
    - src/mcp/tools/email-sending.ts

key-decisions:
  - "inReplyTo and references as string arrays per RFC 8621 (not single values)"
  - "Case-insensitive Re: prefix check to avoid Re: Re: duplication"
  - "Self excluded from replyAll using case-insensitive email comparison"
  - "Primary recipient from replyTo if available, fallback to from"

patterns-established:
  - "Threading headers: inReplyTo = original.messageId, references = original.references + original.messageId"
  - "ReplyAll: include all to/cc except self, using case-insensitive email matching"

# Metrics
duration: 4min
completed: 2026-01-29
---

# Phase 5 Plan 2: Reply Email Tool Summary

**reply_email MCP tool with RFC 8621 threading headers (inReplyTo, references as arrays) and replyAll recipient expansion**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-29T19:14:50Z
- **Completed:** 2026-01-29T19:18:43Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- reply_email tool fetches original email for threading metadata
- Proper In-Reply-To and References headers built as arrays (RFC 8621)
- Subject handling preserves or adds "Re:" prefix (case-insensitive check)
- replyAll includes all original recipients except self
- 16 unit tests covering send_email and reply_email tools

## Task Commits

Each task was committed atomically:

1. **Task 1: Add reply_email tool to email-sending.ts** - `e422a66` (feat)
2. **Task 2: Add unit tests for email sending tools** - `c576802` (test)

## Files Created/Modified
- `src/mcp/tools/email-sending.ts` - Added reply_email tool with threading headers
- `tests/unit/mcp/tools/email-sending.test.ts` - 16 unit tests for both send_email and reply_email

## Decisions Made
- **inReplyTo/references as arrays:** RFC 8621 specifies these as arrays of message-ID strings, not single values
- **Case-insensitive Re: check:** Avoids "Re: Re:" duplication when subject already has Re: prefix
- **Self exclusion from replyAll:** Uses case-insensitive email comparison to handle different case variants
- **Primary recipient priority:** Uses replyTo[0] if available, falls back to from[0]

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- EMAIL-02 (reply_email) requirement fulfilled
- All email sending tools (send_email, reply_email) now available
- Phase 5 complete, ready for Phase 6 testing and polish
- Total: 226 tests passing (16 new)

---
*Phase: 05-email-creation-sending*
*Completed: 2026-01-29*
