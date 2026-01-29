---
phase: 04
plan: 01
subsystem: email-operations
tags: [mcp, jmap, email-set, write-operations]

dependency_graph:
  requires: [03-03, 03-04]
  provides: [mark_as_read, mark_as_unread, delete_email]
  affects: [04-02]

tech_stack:
  added: []
  patterns: [jmap-patch-syntax, email-set, mcp-write-annotations]

key_files:
  created:
    - src/mcp/tools/email-operations.ts
  modified:
    - src/types/jmap.ts
    - src/mcp/tools/index.ts

decisions:
  - key: patch-syntax-for-keywords
    choice: Use JMAP patch syntax ('keywords/$seen': true/null)
    rationale: More efficient than full object replacement, avoids race conditions
  - key: soft-delete-default
    choice: delete_email moves to Trash by default, permanent=true for destroy
    rationale: User-friendly and recoverable, matches standard email client behavior
  - key: fallback-to-permanent-delete
    choice: If no Trash mailbox found, fall back to permanent delete
    rationale: Ensures delete operation always succeeds

metrics:
  duration: 2m 25s
  completed: 2026-01-29
---

# Phase 4 Plan 1: Email Write Operations Summary

Email write operations using JMAP Email/set with patch syntax for keyword manipulation and soft/hard delete support.

## What Was Built

### EmailSetResponse Type (src/types/jmap.ts)
Added `EmailSetResponse` interface for Email/set responses per RFC 8621 Section 4.3:
- `accountId`, `oldState`, `newState` for state tracking
- `created`, `updated`, `destroyed` for success results
- `notCreated`, `notUpdated`, `notDestroyed` for error details

### Email Operation Tools (src/mcp/tools/email-operations.ts)

**mark_as_read (EMAIL-06)**
- Input: `emailId` (string)
- Uses patch syntax: `'keywords/$seen': true`
- Annotations: `EMAIL_WRITE_ANNOTATIONS` (readOnlyHint: false, destructiveHint: false, idempotentHint: true)
- Returns: `{ success: true, emailId, marked: 'read' }`

**mark_as_unread (EMAIL-07)**
- Input: `emailId` (string)
- Uses patch syntax: `'keywords/$seen': null` to remove keyword
- Annotations: `EMAIL_WRITE_ANNOTATIONS`
- Returns: `{ success: true, emailId, marked: 'unread' }`

**delete_email (EMAIL-05)**
- Input: `emailId` (string), `permanent` (boolean, default: false)
- Soft delete (default): Queries Trash mailbox by role, moves email to Trash
- Hard delete (permanent=true): Uses Email/set destroy
- Fallback: If no Trash mailbox found, performs permanent delete with warning
- Annotations: `EMAIL_DESTRUCTIVE_ANNOTATIONS` (readOnlyHint: false, destructiveHint: true, idempotentHint: false)
- Returns: `{ success: true, emailId, action: 'moved_to_trash' | 'permanently_deleted' }`

### Annotation Constants
- `EMAIL_WRITE_ANNOTATIONS`: For non-destructive operations (mark read/unread)
- `EMAIL_DESTRUCTIVE_ANNOTATIONS`: For delete operations

### Tool Registration (src/mcp/tools/index.ts)
- Added import for `registerEmailOperationTools`
- Added call in `registerAllTools()` function

## Integration Points

| From | To | Via | Pattern |
|------|-----|-----|---------|
| email-operations.ts | client.ts | jmapClient.request() | Email/set |
| email-operations.ts | jmap.ts | EmailSetResponse type | Type assertion |
| index.ts | email-operations.ts | registerEmailOperationTools() | Tool registration |

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Keyword modification | JMAP patch syntax | Granular updates without fetching/replacing full object |
| Delete behavior | Soft delete by default | Recoverable, matches user expectations |
| Missing Trash handling | Fall back to permanent delete | Operation always succeeds, logged as warning |
| Annotation hints | Explicit per operation type | Proper AI behavior hints for write vs destructive |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

1. TypeScript compilation: `npx tsc --noEmit` passes
2. Tool signatures match research patterns from 04-RESEARCH.md
3. All three tools use correct MCP annotations
4. Error handling follows existing tool patterns

## Commits

| Commit | Description |
|--------|-------------|
| 714306b | Add EmailSetResponse type and email-operations.ts |
| a7633cb | Register email operation tools in index.ts |

## Next Phase Readiness

Phase 4 Plan 2 can proceed:
- All write operation infrastructure is in place
- EMAIL_WRITE_ANNOTATIONS can be reused for move_email, add_label, remove_label
- Pattern for Email/set with patch syntax established
