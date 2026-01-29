---
phase: "06"
plan: "02"
subsystem: "attachments"
tags: ["mcp-tools", "jmap-email", "attachment-metadata"]

dependency_graph:
  requires:
    - "03-03"  # Email MCP Tools (pattern reference)
  provides:
    - "get_attachments tool for listing email attachment metadata"
  affects:
    - "Future download_attachment tool (06-03)"

tech_stack:
  added: []
  patterns:
    - "RFC 8621 isInline detection (cid + disposition check)"
    - "Email/get with bodyProperties for attachment metadata"

file_tracking:
  key_files:
    created:
      - src/mcp/tools/attachment.ts
      - src/mcp/tools/attachment.test.ts
    modified:
      - src/mcp/tools/index.ts

decisions:
  - id: "ATTACH-INLINE"
    choice: "isInline = has cid AND disposition !== 'attachment'"
    reason: "Per RFC 8621 algorithm for inline detection"

metrics:
  duration: "2m 15s"
  completed: "2026-01-29"
---

# Phase 6 Plan 02: Attachment MCP Tool Summary

**One-liner:** get_attachments tool listing email attachment metadata with isInline detection and filtering by excludeInline/mimeTypeFilter.

## What Was Built

### get_attachments MCP Tool (ATTACH-01, ATTACH-02)
- **Purpose:** List all attachments for an email without downloading content
- **Input parameters:**
  - `emailId` (required): Email to get attachments from
  - `excludeInline` (optional, default false): Exclude inline attachments
  - `mimeTypeFilter` (optional): Filter by MIME type prefix (e.g., "image/", "application/pdf")
- **Output:** `{ emailId, attachments: AttachmentMetadata[], total, filtered }`

### AttachmentMetadata Interface
```typescript
interface AttachmentMetadata {
  blobId: string;      // For future download
  name: string | null; // Filename
  type: string;        // MIME type
  size: number;        // Size in bytes
  isInline: boolean;   // Embedded in HTML body
}
```

### isInline Detection (RFC 8621)
Per RFC 8621 algorithm:
- `isInline = true` when: has `cid` AND `disposition !== 'attachment'`
- This correctly identifies:
  - Images embedded in HTML (`cid:logo123`)
  - Regular attachments (downloadable files)

## Key Implementation Details

### JMAP Request Pattern
```typescript
['Email/get', {
  accountId,
  ids: [emailId],
  properties: ['attachments'],
  bodyProperties: ['blobId', 'name', 'type', 'size', 'disposition', 'cid'],
}, 'getAttachments']
```

### Filter Logic
1. Transform all attachments to metadata with `isInline` flag
2. Apply `excludeInline` filter (remove if `isInline && excludeInline`)
3. Apply `mimeTypeFilter` (startsWith check for prefix matching)
4. Return both `total` (before filtering) and `filtered` (after filtering) counts

## Test Coverage

**20 new tests** covering:
- `isInlineAttachment()` function (8 test cases for cid/disposition combinations)
- get_attachments with mixed inline/regular attachments
- Email with no attachments (returns empty array)
- Email not found error handling
- `excludeInline` filter behavior
- `mimeTypeFilter` with prefix and exact matching
- Combined filter application

## Verification Results

- [x] `npm run build` completes without errors
- [x] `npm test` passes all 290 tests
- [x] get_attachments tool has correct input schema
- [x] AttachmentMetadata includes all required properties
- [x] Filtering works correctly
- [x] Tool registered in registerAllTools()

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 1c76b53 | feat | Implement get_attachments MCP tool with isInline detection |
| 3b9bed7 | test | Add 20 unit tests and register tool in index.ts |

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

**Ready for 06-03 (Download Attachment Tool):**
- AttachmentMetadata provides `blobId` for blob download
- Tool pattern established for attachment operations
- isInline flag helps distinguish downloadable attachments

**AI Assistant Use Cases Enabled:**
- "You have 3 PDF attachments in this email"
- "There's an image embedded inline in the HTML body"
- "Show me only the image attachments"
- "List attachments excluding inline images"
