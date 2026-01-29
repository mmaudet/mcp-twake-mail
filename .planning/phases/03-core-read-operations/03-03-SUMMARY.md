---
phase: 03-core-read-operations
plan: 03
subsystem: api
tags: [mcp, email, jmap, zod, tools]

# Dependency graph
requires:
  - phase: 03-01
    provides: transformEmail() for JMAP to SimplifiedEmail DTO conversion
  - phase: 03-02
    provides: MCP server foundation with createMCPServer() and startServer()
provides:
  - get_email tool retrieving email by ID with full content (EMAIL-03)
  - search_emails tool with comprehensive filter support (EMAIL-04)
  - get_email_labels tool returning mailbox IDs for email (EMAIL-11)
  - registerAllTools() aggregator for tool registration
affects: [04-write-operations, 05-compose, 06-production]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - MCP tool registration with registerTool() API
    - JMAP back-reference pattern (Email/query -> Email/get with '#ids')
    - Zod schemas for MCP tool input validation

key-files:
  created:
    - src/mcp/tools/email.ts
    - src/mcp/tools/index.ts
  modified:
    - src/mcp/server.ts

key-decisions:
  - "MCP registerTool() API used (newer, non-deprecated method)"
  - "JMAP back-reference pattern for search_emails (query+get in single request)"
  - "Separate FULL_EMAIL_PROPERTIES vs SUMMARY_EMAIL_PROPERTIES lists"
  - "Common EMAIL_READ_ANNOTATIONS constant for all email tools"

patterns-established:
  - "MCP tool registration: registerTool(name, {title, description, inputSchema, annotations}, callback)"
  - "Tool error format: { isError: true, content: [{type: 'text', text: error}] }"
  - "Tool aggregation via registerAllTools() in src/mcp/tools/index.ts"

# Metrics
duration: 2m 31s
completed: 2026-01-29
---

# Phase 03 Plan 03: Email MCP Tools Summary

**Three email MCP tools (get_email, search_emails, get_email_labels) with Zod validation, MCP annotations, and JMAP back-reference pattern for efficient search**

## Performance

- **Duration:** 2m 31s
- **Started:** 2026-01-29T18:37:23Z
- **Completed:** 2026-01-29T18:39:54Z
- **Tasks:** 2/2
- **Files modified:** 3

## Accomplishments
- get_email tool retrieves single email by ID with full body content (textBody, htmlBody, attachments)
- search_emails tool supports 10 filter parameters: mailboxId, from, to, subject, text, before, after, hasAttachment, unreadOnly, flagged, limit
- get_email_labels tool returns array of mailbox IDs for email organization queries
- All tools use MCP annotations marking them as read-only and idempotent

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Email Tools Module** - `6e338cd` (feat)
2. **Task 2: Create Tool Registration Aggregator and Wire to Server** - `d305b4a` (feat)

## Files Created/Modified
- `src/mcp/tools/email.ts` - Email tools: get_email, search_emails, get_email_labels
- `src/mcp/tools/index.ts` - Tool registration aggregator with registerAllTools()
- `src/mcp/server.ts` - Wired registerAllTools() before MCP connect

## Decisions Made
- Used registerTool() API (newer, non-deprecated) instead of deprecated tool() method
- Implemented JMAP back-reference pattern for search_emails: Email/query returns IDs, Email/get uses '#ids' reference to fetch details in single request
- Separated property lists: FULL_EMAIL_PROPERTIES (20 props with body content) vs SUMMARY_EMAIL_PROPERTIES (11 props for search results)
- Created shared EMAIL_READ_ANNOTATIONS constant to ensure consistent tool hints

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Stale TypeScript build cache caused misleading error about non-existent JMAPMailbox type. Resolved with clean rebuild (rm -rf build && npm run build)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Email read operations complete for MCP integration
- Phase 3 now complete with all 3 plans finished
- Ready for Phase 4: Write Operations (move_email, mark_read, mark_flagged, delete_email)

---
*Phase: 03-core-read-operations*
*Completed: 2026-01-29*
