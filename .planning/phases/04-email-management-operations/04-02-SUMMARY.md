---
phase: 04
plan: 02
subsystem: email-operations
tags: [mcp, jmap, email-set, mailbox-operations, draft-creation]

dependency_graph:
  requires: [04-01]
  provides: [move_email, add_label, remove_label, create_draft]
  affects: []

tech_stack:
  added: []
  patterns: [jmap-patch-syntax, jmap-mailboxids-manipulation, email-set-create]

key_files:
  created:
    - src/mcp/tools/email-operations.test.ts
  modified:
    - src/mcp/tools/email-operations.ts

decisions:
  - key: move-replaces-all-mailboxids
    choice: move_email uses full mailboxIds replacement (not additive)
    rationale: True move semantics - email ends up in exactly one mailbox
  - key: patch-syntax-for-labels
    choice: add_label/remove_label use JMAP patch syntax (`mailboxIds/[id]`)
    rationale: Additive/subtractive without fetching current mailboxIds
  - key: last-mailbox-error-handling
    choice: Friendly error message for invalidProperties when removing last label
    rationale: Better UX than raw JMAP error
  - key: create-draft-not-idempotent
    choice: create_draft uses EMAIL_CREATE_ANNOTATIONS (idempotentHint: false)
    rationale: Each call creates a new draft, unlike updates which are idempotent

metrics:
  duration: 3m 10s
  completed: 2026-01-29
---

# Phase 4 Plan 2: Move and Label Operations Summary

Mailbox manipulation tools (move_email, add_label, remove_label) and draft creation (create_draft) using JMAP Email/set with correct patch syntax and create operations.

## What Was Built

### Mailbox Manipulation Tools (src/mcp/tools/email-operations.ts)

**move_email (EMAIL-08)**
- Input: `emailId` (string), `targetMailboxId` (string)
- Uses full `mailboxIds` replacement: `{ mailboxIds: { [targetMailboxId]: true } }`
- True move semantics - removes email from all previous mailboxes
- Annotations: `EMAIL_WRITE_ANNOTATIONS` (idempotent - moving to same place is safe)
- Returns: `{ success: true, emailId, targetMailboxId }`

**add_label (EMAIL-09)**
- Input: `emailId` (string), `mailboxId` (string)
- Uses JMAP patch syntax: `{ [`mailboxIds/${mailboxId}`]: true }`
- Adds mailbox without removing existing associations
- Annotations: `EMAIL_WRITE_ANNOTATIONS`
- Returns: `{ success: true, emailId, addedMailboxId: mailboxId }`

**remove_label (EMAIL-10)**
- Input: `emailId` (string), `mailboxId` (string)
- Uses JMAP patch syntax: `{ [`mailboxIds/${mailboxId}`]: null }`
- Handles last-mailbox constraint with friendly error message
- When `invalidProperties` error, returns: "Cannot remove label: email must belong to at least one mailbox"
- Annotations: `EMAIL_WRITE_ANNOTATIONS`
- Returns: `{ success: true, emailId, removedMailboxId: mailboxId }`

### Draft Creation Tool

**create_draft (EMAIL-12)**
- Input schema:
  - `to`: array of email addresses (optional)
  - `cc`: array of email addresses (optional)
  - `bcc`: array of email addresses (optional)
  - `subject`: string (optional)
  - `body`: plain text content (optional)
  - `inReplyTo`: Message-ID for replies (optional)
- Queries Drafts mailbox by role (`{ role: 'drafts' }`)
- Creates email with:
  - `mailboxIds: { [draftsMailboxId]: true }`
  - `keywords: { '$draft': true, '$seen': true }`
  - `bodyStructure: { type: 'text/plain', partId: '1' }`
  - Address fields mapped from strings to `{ email: string }[]`
- Annotations: `EMAIL_CREATE_ANNOTATIONS` (not idempotent - each call creates new draft)
- Returns: `{ success: true, draftId: created.id, threadId: created.threadId }`

### Annotation Constants

Added new constant:
- `EMAIL_CREATE_ANNOTATIONS`: For create operations (idempotentHint: false)

### Unit Tests (src/mcp/tools/email-operations.test.ts)

Comprehensive test suite with 17 test cases:
- mark_as_read: success and error cases
- mark_as_unread: success and error cases
- delete_email: soft delete, permanent delete, fallback when no Trash
- move_email: success and notUpdated error
- add_label: success and error cases
- remove_label: success and friendly "must belong to at least one mailbox" error
- create_draft: success, no Drafts mailbox, notCreated error
- Tool registration: verifies all 7 tools registered

## Integration Points

| From | To | Via | Pattern |
|------|-----|-----|---------|
| email-operations.ts | client.ts | jmapClient.request() | Email/set update |
| email-operations.ts | client.ts | jmapClient.request() | Email/set create |
| email-operations.ts | client.ts | jmapClient.request() | Mailbox/query (drafts role) |
| create_draft | jmap.ts | EmailSetResponse.created | Created email info |

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| move_email semantics | Replace all mailboxIds | True move - email in exactly one mailbox after |
| Label patch syntax | `mailboxIds/[id]` format | JMAP patch for additive/subtractive updates |
| Last mailbox error | Custom friendly message | Better UX than raw "invalidProperties" |
| Draft annotations | idempotentHint: false | Each create_draft produces new draft |
| Draft keywords | $draft + $seen | Standard draft flags, mark as read to avoid notification |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

1. TypeScript compilation: `npx tsc --noEmit` passes
2. All 193 tests pass including 17 new email operation tests
3. move_email uses full mailboxIds replacement (move semantics)
4. add_label/remove_label use patch syntax (additive/subtractive)
5. create_draft includes $draft and $seen keywords
6. All tools have proper MCP annotations

## Commits

| Commit | Description |
|--------|-------------|
| b97a7b9 | Implement move_email, add_label, remove_label tools |
| 35adb6b | Implement create_draft tool |
| e2d5021 | Add unit tests for email operation tools |

## Phase 4 Complete

Phase 4 Email Management Operations is now complete:
- Plan 01: mark_as_read, mark_as_unread, delete_email
- Plan 02: move_email, add_label, remove_label, create_draft

All 7 email write operation tools are implemented with:
- Proper JMAP patterns (patch syntax, create, destroy)
- MCP annotations for AI behavior hints
- Comprehensive error handling
- 17 unit tests for email operations
