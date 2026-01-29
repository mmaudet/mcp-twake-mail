---
phase: 06-advanced-features-polish
plan: 01
subsystem: mcp-tools
tags: [jmap, thread, mcp, email-conversation]

dependency-graph:
  requires: [05-02]  # Relies on email patterns from Phase 5
  provides: [thread-retrieval, conversation-navigation]
  affects: []  # No future phases depend on this

tech-stack:
  added: []
  patterns:
    - "Thread/get JMAP method for thread metadata"
    - "Two-step pattern: Thread/get then Email/get"
    - "Order preservation for oldest-first emailIds"

key-files:
  created:
    - src/mcp/tools/thread.ts
    - src/mcp/tools/thread.test.ts
  modified:
    - src/mcp/tools/index.ts

decisions:
  - id: "thread-two-step"
    choice: "Thread/get then Email/get pattern for get_thread_emails"
    reason: "JMAP Thread objects only contain emailIds, need separate Email/get for full content"
  - id: "order-preservation"
    choice: "Map-based lookup to preserve emailIds order"
    reason: "Email/get may return emails in different order than requested; need to reorder"

metrics:
  duration: "3m"
  completed: "2026-01-29"
---

# Phase 6 Plan 1: Thread MCP Tools Summary

Thread retrieval tools using JMAP Thread/get with order preservation for conversation navigation

## What Was Built

### Thread Tools (THREAD-01, THREAD-02)

1. **get_thread** - Retrieves thread metadata by ID
   - Input: threadId (string)
   - JMAP call: Thread/get with ids: [threadId]
   - Returns: { id, emailIds } where emailIds is oldest-first per RFC 8621
   - Handles notFound with friendly error message

2. **get_thread_emails** - Retrieves all emails in a thread with full content
   - Input: threadId (string)
   - Two-step pattern:
     a. Thread/get to get emailIds
     b. Email/get with FULL_EMAIL_PROPERTIES for content
   - Returns: { threadId, emails: SimplifiedEmail[] }
   - Emails returned in oldest-first order (preserved from Thread/get)
   - Empty thread returns empty array (not error)

### Implementation Details

- THREAD_READ_ANNOTATIONS constant: readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=true
- Full email properties fetched: id, blobId, threadId, mailboxIds, keywords, from, to, cc, bcc, replyTo, subject, receivedAt, sentAt, preview, hasAttachment, size, bodyValues, textBody, htmlBody, attachments
- transformEmail() used to convert JMAP emails to SimplifiedEmail DTOs

## Key Implementation Details

### Order Preservation Strategy

```typescript
// JMAP Email/get may return emails in different order than requested
// Create map for O(1) lookup, then rebuild in original order
const emailMap = new Map<string, unknown>();
for (const email of emails) {
  emailMap.set(emailObj.id, email);
}
// Preserve the order from emailIds (oldest-first per RFC 8621)
const orderedEmails = emailIds
  .map((id) => emailMap.get(id))
  .filter((email) => email !== undefined)
  .map((email) => transformEmail(email));
```

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 6dc538b | feat | Implement thread MCP tools (get_thread, get_thread_emails) |
| e3751ab | test | Add comprehensive thread tool tests (12 tests) |

## Test Coverage

12 unit tests added covering:
- get_thread success with emailIds array
- get_thread not found (notFound array and empty list)
- get_thread JMAP error handling
- get_thread exception handling
- get_thread_emails success with transformed emails
- get_thread_emails not found
- get_thread_emails empty thread returns empty array
- get_thread_emails order preservation (oldest-first)
- get_thread_emails Email/get failure after Thread/get success
- get_thread_emails exception handling
- Tool registration verification

## Metrics

- **Files created:** 2
- **Lines added:** 768 (334 implementation + 434 tests)
- **Tests:** 290 total passing (12 new)
- **Duration:** ~3 minutes

## Deviations from Plan

None - plan executed exactly as written.

## Success Criteria Verification

- [x] THREAD-01: get_thread tool retrieves thread by ID returning { id, emailIds }
- [x] THREAD-02: get_thread_emails tool returns all emails in a thread as SimplifiedEmail[]
- [x] Both tools follow established error handling patterns and have unit test coverage
