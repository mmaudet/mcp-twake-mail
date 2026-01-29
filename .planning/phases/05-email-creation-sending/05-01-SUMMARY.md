---
phase: 05-email-creation-sending
plan: 01
subsystem: api
tags: [jmap, email-submission, identity, mcp-tools]

# Dependency graph
requires:
  - phase: 04-email-management
    provides: EmailSetResponse type, MCP tool patterns
provides:
  - send_email MCP tool for composing and sending new emails
  - Identity type for JMAP Identity/get responses
  - EmailSubmissionSetResponse type for EmailSubmission/set responses
affects: [05-email-creation-sending, integration-testing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Two-phase JMAP sending (Email/set create + EmailSubmission/set)
    - JMAP back-references (#email, #submission) for request batching
    - onSuccessUpdateEmail for atomic Drafts-to-Sent transition

key-files:
  created:
    - src/mcp/tools/email-sending.ts
  modified:
    - src/types/jmap.ts
    - src/mcp/tools/index.ts

key-decisions:
  - "Two-phase sending pattern: Email/set create draft, then EmailSubmission/set with onSuccessUpdateEmail"
  - "First Identity from Identity/get used for sending (matches user's primary identity)"
  - "Multipart/alternative bodyStructure when both text and HTML provided"

patterns-established:
  - "SUBMISSION_USING constant for urn:ietf:params:jmap:submission capability"
  - "EMAIL_SEND_ANNOTATIONS with idempotentHint: false (each call sends new email)"

# Metrics
duration: 2min
completed: 2026-01-29
---

# Phase 5 Plan 01: Send Email Tool Summary

**send_email MCP tool with two-phase JMAP sending (Email/set + EmailSubmission/set), Identity discovery, and Drafts-to-Sent transition via onSuccessUpdateEmail**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-29T19:11:04Z
- **Completed:** 2026-01-29T19:12:56Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Added Identity and EmailSubmissionSetResponse types for JMAP RFC 8621 compliance
- Implemented send_email tool with full addressing (to, cc, bcc), subject, body, and htmlBody support
- Two-phase JMAP sending: draft creation + email submission in batched request
- Automatic Drafts-to-Sent mailbox transition via onSuccessUpdateEmail pattern
- User-friendly error messages for forbiddenFrom, forbiddenToSend, tooManyRecipients

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Identity and EmailSubmission types** - `a65ca2c` (feat)
2. **Task 2: Create send_email MCP tool** - `f62d62b` (feat)
3. **Task 3: Register email sending tools** - `22348f2` (feat)

## Files Created/Modified
- `src/types/jmap.ts` - Added Identity and EmailSubmissionSetResponse interfaces
- `src/mcp/tools/email-sending.ts` - New file with send_email tool implementation
- `src/mcp/tools/index.ts` - Registered email sending tools in registerAllTools

## Decisions Made
- Two-phase sending pattern following RFC 8621: Create email in Drafts, submit via EmailSubmission/set
- First Identity from Identity/get used as sender (primary identity pattern)
- Multipart/alternative bodyStructure only when both body and htmlBody provided
- Single part text/plain or text/html for single content type
- onSuccessUpdateEmail removes $draft keyword and moves email from Drafts to Sent atomically

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- send_email tool ready for integration testing
- Foundation laid for reply_email tool (Plan 05-02)
- All 210 existing tests passing, no regressions

---
*Phase: 05-email-creation-sending*
*Completed: 2026-01-29*
