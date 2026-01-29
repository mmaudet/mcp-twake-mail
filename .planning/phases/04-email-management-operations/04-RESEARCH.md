# Phase 4: Email Management Operations - Research

**Researched:** 2026-01-29
**Domain:** JMAP Email/set operations for email modification (keywords, mailboxIds, create, destroy)
**Confidence:** HIGH

## Summary

This phase implements write operations for email management using JMAP's Email/set method (RFC 8621 Section 4.3). Research focused on four key areas: (1) JMAP Email/set method for updates and destroys, (2) keyword manipulation with JMAP patch syntax, (3) mailboxIds management for move/label operations, and (4) MCP tool annotations for write operations.

The Email/set method supports three operation types in a single request: create, update, and destroy. Updates use JMAP patch syntax (RFC 8620 Section 5.3) allowing granular property changes like `"keywords/$seen": true` to add a keyword or `"mailboxIds/mailboxId123": null` to remove from a mailbox. This is more efficient than replacing entire objects.

For MCP tools, write operations require different annotations than read operations: `readOnlyHint: false`, `destructiveHint: true` for delete_email, and `idempotentHint: true` for mark_as_read/mark_as_unread (setting same value twice has no additional effect). The existing codebase already demonstrates the pattern in `src/mcp/tools/email.ts`.

**Primary recommendation:** Implement all tools using Email/set with patch syntax for efficiency. Use separate annotation constants for write operations (`EMAIL_WRITE_ANNOTATIONS`) vs destructive operations (`EMAIL_DESTRUCTIVE_ANNOTATIONS`). Create a shared helper function for Email/set requests to reduce code duplication.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @modelcontextprotocol/sdk | ^1.25.3 | MCP server with tool annotations | Already installed, provides ToolAnnotations type |
| zod | ^4.3.6 | Input schema validation | Required peer dependency, already installed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pino | ^10.3.0 | Structured logging to stderr | Error logging for failed operations |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Patch syntax for updates | Full object replacement | Full replacement requires fetching current state first, more network overhead |
| Individual tool per operation | Single "update_email" tool | Individual tools clearer for AI, better annotations, more focused validation |

**Installation:**
All required packages already installed. No additional installation needed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── mcp/
│   └── tools/
│       ├── email.ts           # Existing read tools + new write tools
│       └── email-operations.ts # Optional: separate file for write operations
├── jmap/
│   └── client.ts              # Existing JMAPClient.request() used for Email/set
└── types/
    └── jmap.ts                # Add Email/set response types
```

### Pattern 1: Email/set with JMAP Patch Syntax
**What:** Use patch paths to modify individual properties instead of replacing entire objects
**When to use:** All update operations (keywords, mailboxIds)
**Example:**
```typescript
// Source: RFC 8620 Section 5.3, RFC 8621 Section 4.3
const response = await jmapClient.request([
  ['Email/set', {
    accountId: session.accountId,
    update: {
      [emailId]: {
        // Add keyword using patch syntax
        'keywords/$seen': true,
        // Remove from mailbox using patch syntax
        'mailboxIds/oldMailboxId': null,
        // Add to mailbox using patch syntax
        'mailboxIds/newMailboxId': true,
      }
    }
  }, 'setEmail'],
]);
```

### Pattern 2: MCP Tool Annotations for Write Operations
**What:** Use appropriate annotation hints based on operation semantics
**When to use:** All tool registrations
**Example:**
```typescript
// Source: MCP SDK types.d.ts, MCP specification

// For non-destructive write operations (mark_as_read, add_label)
const EMAIL_WRITE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,       // Modifies environment
  destructiveHint: false,    // Does not destroy data
  idempotentHint: true,      // Same result on repeated calls
  openWorldHint: true,       // Interacts with JMAP server
};

// For destructive operations (delete_email)
const EMAIL_DESTRUCTIVE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,       // Modifies environment
  destructiveHint: true,     // Permanently destroys data
  idempotentHint: false,     // Can only delete once
  openWorldHint: true,       // Interacts with JMAP server
};

// For move operations (move_email)
const EMAIL_MOVE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,       // Modifies environment
  destructiveHint: false,    // Does not destroy data (moves it)
  idempotentHint: true,      // Moving to same destination is idempotent
  openWorldHint: true,       // Interacts with JMAP server
};
```

### Pattern 3: Email/set Response Handling
**What:** Parse Email/set responses for updated/notUpdated/destroyed/notDestroyed status
**When to use:** All Email/set operations
**Example:**
```typescript
// Source: RFC 8620 Section 5.3
interface EmailSetResponse {
  accountId: string;
  oldState: string;
  newState: string;
  created?: Record<string, { id: string; blobId: string; threadId: string }>;
  updated?: Record<string, null>;  // null means success
  destroyed?: string[];
  notCreated?: Record<string, { type: string; description?: string }>;
  notUpdated?: Record<string, { type: string; description?: string }>;
  notDestroyed?: Record<string, { type: string; description?: string }>;
}

function handleSetResponse(
  response: EmailSetResponse,
  operation: 'update' | 'destroy' | 'create',
  ids: string[]
): { success: boolean; errors: string[] } {
  const errors: string[] = [];

  if (operation === 'update') {
    const notUpdated = response.notUpdated || {};
    for (const id of ids) {
      if (notUpdated[id]) {
        errors.push(`Failed to update ${id}: ${notUpdated[id].type} - ${notUpdated[id].description || ''}`);
      }
    }
  } else if (operation === 'destroy') {
    const notDestroyed = response.notDestroyed || {};
    for (const id of ids) {
      if (notDestroyed[id]) {
        errors.push(`Failed to delete ${id}: ${notDestroyed[id].type} - ${notDestroyed[id].description || ''}`);
      }
    }
  }

  return { success: errors.length === 0, errors };
}
```

### Pattern 4: Creating Draft Emails
**What:** Use Email/set create with $draft keyword and Drafts mailbox
**When to use:** create_draft tool (EMAIL-12)
**Example:**
```typescript
// Source: RFC 8621 Section 4.3, Section 4.1.1
const draftResponse = await jmapClient.request([
  // First get the Drafts mailbox ID
  ['Mailbox/query', {
    accountId: session.accountId,
    filter: { role: 'drafts' }
  }, 'findDrafts'],
  // Then create the draft
  ['Email/set', {
    accountId: session.accountId,
    create: {
      'draft1': {
        // MUST include mailboxIds - email must belong to at least one mailbox
        mailboxIds: {
          '#draftsMailboxId': true  // Use back-reference or actual ID
        },
        // MUST include $draft keyword
        keywords: {
          '$draft': true,
          '$seen': true  // Drafts are typically marked as read
        },
        // Required headers
        from: [{ email: 'sender@example.com', name: 'Sender Name' }],
        to: args.to?.map(email => ({ email })),
        cc: args.cc?.map(email => ({ email })),
        subject: args.subject || '',
        // Body content
        bodyStructure: {
          type: 'text/plain',
          partId: '1'
        },
        bodyValues: {
          '1': {
            value: args.body || '',
            isEncodingProblem: false,
            isTruncated: false
          }
        }
      }
    }
  }, 'createDraft'],
]);
```

### Pattern 5: Move to Trash (Soft Delete)
**What:** Instead of destroying, move email to Trash mailbox
**When to use:** delete_email should support both soft delete (default) and permanent delete
**Example:**
```typescript
// Source: RFC 8621 Section 4.3 notes on deleting to trash
// "To delete an Email to trash, simply change the mailboxIds property"

async function moveToTrash(emailId: string): Promise<void> {
  // Get trash mailbox ID first
  const mailboxResponse = await jmapClient.request([
    ['Mailbox/query', {
      accountId: session.accountId,
      filter: { role: 'trash' }
    }, 'findTrash'],
  ]);

  const trashIds = (mailboxResponse.methodResponses[0][1] as { ids: string[] }).ids;
  if (!trashIds || trashIds.length === 0) {
    throw new Error('Trash mailbox not found');
  }
  const trashMailboxId = trashIds[0];

  // Replace all mailboxIds with just Trash
  await jmapClient.request([
    ['Email/set', {
      accountId: session.accountId,
      update: {
        [emailId]: {
          mailboxIds: { [trashMailboxId]: true }
        }
      }
    }, 'moveToTrash'],
  ]);
}
```

### Anti-Patterns to Avoid
- **Replacing entire keywords/mailboxIds objects:** Use patch syntax (`"keywords/$seen": true`) instead of setting full `keywords` property. Avoids race conditions and overwrites.
- **Forgetting mailboxIds constraint:** An email MUST belong to at least one mailbox. Moving without adding new mailbox first will fail.
- **Not checking operation results:** Email/set may partially succeed. Always check `notUpdated`/`notDestroyed` in response.
- **Using wrong annotation defaults:** `destructiveHint` defaults to `true` if `readOnlyHint` is `false`. Explicitly set it for clarity.
- **Hardcoding Drafts/Trash mailbox IDs:** Query by role instead (role: 'drafts', role: 'trash').

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Finding Drafts/Trash mailbox | Hardcode mailbox ID | Mailbox/query with role filter | IDs vary per server/account |
| Tracking operation success | Boolean return value | Parse notUpdated/notDestroyed | JMAP provides detailed error info |
| Batch operations | Loop with individual requests | Single Email/set with multiple IDs | More efficient, atomic |
| Keyword normalization | Case conversion logic | Use standard keywords exactly | $seen, $flagged, $draft are case-sensitive |

**Key insight:** JMAP Email/set is designed for batch operations. A single request can update/destroy multiple emails atomically. Design tool handlers to support both single and batch operations where appropriate.

## Common Pitfalls

### Pitfall 1: Mailbox Orphaning
**What goes wrong:** Email/set update fails with "tooManyMailboxes" or "notFound" error
**Why it happens:** Removing email from all mailboxes (mailboxIds becomes empty) violates JMAP constraint
**How to avoid:** When moving/removing labels, ensure email remains in at least one mailbox. For move operations, add to new mailbox first, then remove from old.
**Warning signs:** notUpdated errors with type "invalidProperties" or "forbiddenToChange"

### Pitfall 2: Keyword Case Sensitivity
**What goes wrong:** mark_as_read appears to work but email still shows as unread
**Why it happens:** Using "Seen" or "seen" instead of "$seen" (dollar prefix required for standard keywords)
**How to avoid:** Always use exact keyword names: `$seen`, `$flagged`, `$draft`, `$answered`, `$forwarded`
**Warning signs:** Keywords property doesn't change in subsequent Email/get

### Pitfall 3: Partial Batch Failures
**What goes wrong:** Some emails updated, others fail silently
**Why it happens:** Email/set processes each ID independently; some may fail while others succeed
**How to avoid:** Always check `notUpdated`/`notDestroyed` in response, report failures to user
**Warning signs:** newState changes but some IDs missing from `updated`/`destroyed`

### Pitfall 4: State Desync After Write
**What goes wrong:** Subsequent Email/get returns stale data
**Why it happens:** Not using newState from Email/set response for subsequent operations
**How to avoid:** Update state tracker with newState from Email/set response (existing JMAPClient pattern)
**Warning signs:** Repeated operations seem ineffective, client shows outdated info

### Pitfall 5: Missing Mailbox Permissions
**What goes wrong:** Email/set fails with "forbidden" error
**Why it happens:** User lacks maySetSeen, maySetKeywords, mayAddItems, or mayRemoveItems permission
**How to avoid:** Check Mailbox permissions before operations, provide meaningful error messages
**Warning signs:** Operations work in some mailboxes but not others

## Code Examples

Verified patterns from official sources:

### mark_as_read Tool Implementation
```typescript
// Source: RFC 8621 Section 4.3, MCP SDK
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

const EMAIL_WRITE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export function registerMarkAsReadTool(
  server: McpServer,
  jmapClient: JMAPClient,
  logger: Logger
) {
  server.registerTool(
    'mark_as_read',
    {
      title: 'Mark Email as Read',
      description: 'Mark an email as read by setting the $seen keyword',
      inputSchema: {
        emailId: z.string().describe('The unique identifier of the email to mark as read'),
      },
      annotations: EMAIL_WRITE_ANNOTATIONS,
    },
    async ({ emailId }) => {
      logger.debug({ emailId }, 'mark_as_read called');

      try {
        const session = jmapClient.getSession();
        const response = await jmapClient.request([
          ['Email/set', {
            accountId: session.accountId,
            update: {
              [emailId]: {
                'keywords/$seen': true,
              }
            }
          }, 'markRead'],
        ]);

        const result = jmapClient.parseMethodResponse(response.methodResponses[0]);
        if (!result.success) {
          return {
            isError: true,
            content: [{
              type: 'text' as const,
              text: `Failed to mark email as read: ${result.error?.description || result.error?.type}`,
            }],
          };
        }

        const setResponse = result.data as EmailSetResponse;
        if (setResponse.notUpdated?.[emailId]) {
          const error = setResponse.notUpdated[emailId];
          return {
            isError: true,
            content: [{
              type: 'text' as const,
              text: `Failed to mark email as read: ${error.type} - ${error.description || ''}`,
            }],
          };
        }

        logger.debug({ emailId }, 'mark_as_read success');
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, emailId, marked: 'read' }),
          }],
        };
      } catch (error) {
        logger.error({ error, emailId }, 'Exception in mark_as_read');
        return {
          isError: true,
          content: [{
            type: 'text' as const,
            text: `Error marking email as read: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    }
  );
}
```

### delete_email Tool with Permanent/Trash Options
```typescript
// Source: RFC 8621 Section 4.3
const EMAIL_DESTRUCTIVE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

export function registerDeleteEmailTool(
  server: McpServer,
  jmapClient: JMAPClient,
  logger: Logger
) {
  server.registerTool(
    'delete_email',
    {
      title: 'Delete Email',
      description: 'Delete an email. By default moves to Trash. Use permanent=true to permanently destroy.',
      inputSchema: {
        emailId: z.string().describe('The unique identifier of the email to delete'),
        permanent: z.boolean().default(false).describe('If true, permanently destroy the email. Default: false (move to Trash)'),
      },
      annotations: EMAIL_DESTRUCTIVE_ANNOTATIONS,
    },
    async ({ emailId, permanent }) => {
      logger.debug({ emailId, permanent }, 'delete_email called');

      try {
        const session = jmapClient.getSession();

        if (permanent) {
          // Permanent delete using destroy
          const response = await jmapClient.request([
            ['Email/set', {
              accountId: session.accountId,
              destroy: [emailId],
            }, 'destroyEmail'],
          ]);

          const result = jmapClient.parseMethodResponse(response.methodResponses[0]);
          if (!result.success) {
            return {
              isError: true,
              content: [{
                type: 'text' as const,
                text: `Failed to delete email: ${result.error?.description || result.error?.type}`,
              }],
            };
          }

          const setResponse = result.data as EmailSetResponse;
          if (setResponse.notDestroyed?.[emailId]) {
            const error = setResponse.notDestroyed[emailId];
            return {
              isError: true,
              content: [{
                type: 'text' as const,
                text: `Failed to delete email: ${error.type} - ${error.description || ''}`,
              }],
            };
          }

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ success: true, emailId, action: 'permanently_deleted' }),
            }],
          };
        } else {
          // Move to Trash
          // First find Trash mailbox
          const mailboxResponse = await jmapClient.request([
            ['Mailbox/query', {
              accountId: session.accountId,
              filter: { role: 'trash' },
            }, 'findTrash'],
          ]);

          const queryResult = jmapClient.parseMethodResponse(mailboxResponse.methodResponses[0]);
          if (!queryResult.success) {
            return {
              isError: true,
              content: [{
                type: 'text' as const,
                text: 'Failed to find Trash mailbox',
              }],
            };
          }

          const trashIds = (queryResult.data as { ids: string[] }).ids;
          if (!trashIds || trashIds.length === 0) {
            // No Trash mailbox, fall back to permanent delete
            logger.warn('No Trash mailbox found, performing permanent delete');
            // ... call destroy as above
          }

          const trashMailboxId = trashIds[0];

          // Move to Trash (replace all mailboxIds with just Trash)
          const moveResponse = await jmapClient.request([
            ['Email/set', {
              accountId: session.accountId,
              update: {
                [emailId]: {
                  mailboxIds: { [trashMailboxId]: true },
                },
              },
            }, 'moveToTrash'],
          ]);

          const moveResult = jmapClient.parseMethodResponse(moveResponse.methodResponses[0]);
          if (!moveResult.success) {
            return {
              isError: true,
              content: [{
                type: 'text' as const,
                text: `Failed to move email to Trash: ${moveResult.error?.description || moveResult.error?.type}`,
              }],
            };
          }

          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ success: true, emailId, action: 'moved_to_trash' }),
            }],
          };
        }
      } catch (error) {
        logger.error({ error, emailId }, 'Exception in delete_email');
        return {
          isError: true,
          content: [{
            type: 'text' as const,
            text: `Error deleting email: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    }
  );
}
```

### move_email Tool Implementation
```typescript
// Source: RFC 8621 Section 4.3
const EMAIL_MOVE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export function registerMoveEmailTool(
  server: McpServer,
  jmapClient: JMAPClient,
  logger: Logger
) {
  server.registerTool(
    'move_email',
    {
      title: 'Move Email',
      description: 'Move an email to a different mailbox. Removes from current mailboxes and adds to target.',
      inputSchema: {
        emailId: z.string().describe('The unique identifier of the email to move'),
        targetMailboxId: z.string().describe('The ID of the destination mailbox'),
      },
      annotations: EMAIL_MOVE_ANNOTATIONS,
    },
    async ({ emailId, targetMailboxId }) => {
      logger.debug({ emailId, targetMailboxId }, 'move_email called');

      try {
        const session = jmapClient.getSession();

        // Replace all mailboxIds with just the target
        const response = await jmapClient.request([
          ['Email/set', {
            accountId: session.accountId,
            update: {
              [emailId]: {
                mailboxIds: { [targetMailboxId]: true },
              },
            },
          }, 'moveEmail'],
        ]);

        const result = jmapClient.parseMethodResponse(response.methodResponses[0]);
        if (!result.success) {
          return {
            isError: true,
            content: [{
              type: 'text' as const,
              text: `Failed to move email: ${result.error?.description || result.error?.type}`,
            }],
          };
        }

        const setResponse = result.data as EmailSetResponse;
        if (setResponse.notUpdated?.[emailId]) {
          const error = setResponse.notUpdated[emailId];
          return {
            isError: true,
            content: [{
              type: 'text' as const,
              text: `Failed to move email: ${error.type} - ${error.description || ''}`,
            }],
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, emailId, targetMailboxId }),
          }],
        };
      } catch (error) {
        logger.error({ error, emailId }, 'Exception in move_email');
        return {
          isError: true,
          content: [{
            type: 'text' as const,
            text: `Error moving email: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    }
  );
}
```

### add_label / remove_label Tools
```typescript
// Source: RFC 8621 Section 4.3 patch syntax
export function registerAddLabelTool(
  server: McpServer,
  jmapClient: JMAPClient,
  logger: Logger
) {
  server.registerTool(
    'add_label',
    {
      title: 'Add Label',
      description: 'Add a mailbox/label to an email without removing existing ones',
      inputSchema: {
        emailId: z.string().describe('The unique identifier of the email'),
        mailboxId: z.string().describe('The ID of the mailbox/label to add'),
      },
      annotations: EMAIL_WRITE_ANNOTATIONS,
    },
    async ({ emailId, mailboxId }) => {
      logger.debug({ emailId, mailboxId }, 'add_label called');

      try {
        const session = jmapClient.getSession();

        // Use patch syntax to add single mailbox
        const response = await jmapClient.request([
          ['Email/set', {
            accountId: session.accountId,
            update: {
              [emailId]: {
                [`mailboxIds/${mailboxId}`]: true,
              },
            },
          }, 'addLabel'],
        ]);

        const result = jmapClient.parseMethodResponse(response.methodResponses[0]);
        if (!result.success) {
          return {
            isError: true,
            content: [{
              type: 'text' as const,
              text: `Failed to add label: ${result.error?.description || result.error?.type}`,
            }],
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, emailId, addedMailboxId: mailboxId }),
          }],
        };
      } catch (error) {
        logger.error({ error, emailId }, 'Exception in add_label');
        return {
          isError: true,
          content: [{
            type: 'text' as const,
            text: `Error adding label: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    }
  );
}

export function registerRemoveLabelTool(
  server: McpServer,
  jmapClient: JMAPClient,
  logger: Logger
) {
  server.registerTool(
    'remove_label',
    {
      title: 'Remove Label',
      description: 'Remove a mailbox/label from an email. Email must remain in at least one mailbox.',
      inputSchema: {
        emailId: z.string().describe('The unique identifier of the email'),
        mailboxId: z.string().describe('The ID of the mailbox/label to remove'),
      },
      annotations: EMAIL_WRITE_ANNOTATIONS,
    },
    async ({ emailId, mailboxId }) => {
      logger.debug({ emailId, mailboxId }, 'remove_label called');

      try {
        const session = jmapClient.getSession();

        // Use patch syntax to remove single mailbox (set to null)
        const response = await jmapClient.request([
          ['Email/set', {
            accountId: session.accountId,
            update: {
              [emailId]: {
                [`mailboxIds/${mailboxId}`]: null,
              },
            },
          }, 'removeLabel'],
        ]);

        const result = jmapClient.parseMethodResponse(response.methodResponses[0]);
        if (!result.success) {
          return {
            isError: true,
            content: [{
              type: 'text' as const,
              text: `Failed to remove label: ${result.error?.description || result.error?.type}`,
            }],
          };
        }

        const setResponse = result.data as EmailSetResponse;
        if (setResponse.notUpdated?.[emailId]) {
          const error = setResponse.notUpdated[emailId];
          // Common case: trying to remove last mailbox
          if (error.type === 'invalidProperties') {
            return {
              isError: true,
              content: [{
                type: 'text' as const,
                text: 'Cannot remove label: email must belong to at least one mailbox',
              }],
            };
          }
          return {
            isError: true,
            content: [{
              type: 'text' as const,
              text: `Failed to remove label: ${error.type} - ${error.description || ''}`,
            }],
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, emailId, removedMailboxId: mailboxId }),
          }],
        };
      } catch (error) {
        logger.error({ error, emailId }, 'Exception in remove_label');
        return {
          isError: true,
          content: [{
            type: 'text' as const,
            text: `Error removing label: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    }
  );
}
```

### create_draft Tool
```typescript
// Source: RFC 8621 Section 4.3 create operation
export function registerCreateDraftTool(
  server: McpServer,
  jmapClient: JMAPClient,
  logger: Logger
) {
  server.registerTool(
    'create_draft',
    {
      title: 'Create Draft',
      description: 'Create a new email draft in the Drafts mailbox',
      inputSchema: {
        to: z.array(z.string().email()).optional().describe('Recipient email addresses'),
        cc: z.array(z.string().email()).optional().describe('CC email addresses'),
        bcc: z.array(z.string().email()).optional().describe('BCC email addresses'),
        subject: z.string().optional().describe('Email subject'),
        body: z.string().optional().describe('Plain text email body'),
        inReplyTo: z.string().optional().describe('Message-ID of email being replied to'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false, // Creating draft always creates new email
        openWorldHint: true,
      },
    },
    async (args) => {
      logger.debug({ args }, 'create_draft called');

      try {
        const session = jmapClient.getSession();

        // Find Drafts mailbox
        const mailboxResponse = await jmapClient.request([
          ['Mailbox/query', {
            accountId: session.accountId,
            filter: { role: 'drafts' },
          }, 'findDrafts'],
        ]);

        const queryResult = jmapClient.parseMethodResponse(mailboxResponse.methodResponses[0]);
        if (!queryResult.success || !((queryResult.data as { ids: string[] }).ids?.length)) {
          return {
            isError: true,
            content: [{
              type: 'text' as const,
              text: 'Failed to find Drafts mailbox',
            }],
          };
        }

        const draftsMailboxId = (queryResult.data as { ids: string[] }).ids[0];

        // Create draft email
        const createResponse = await jmapClient.request([
          ['Email/set', {
            accountId: session.accountId,
            create: {
              'newDraft': {
                mailboxIds: { [draftsMailboxId]: true },
                keywords: { '$draft': true, '$seen': true },
                to: args.to?.map(email => ({ email })),
                cc: args.cc?.map(email => ({ email })),
                bcc: args.bcc?.map(email => ({ email })),
                subject: args.subject || '',
                bodyStructure: {
                  type: 'text/plain',
                  partId: '1',
                },
                bodyValues: {
                  '1': {
                    value: args.body || '',
                    isEncodingProblem: false,
                    isTruncated: false,
                  },
                },
                ...(args.inReplyTo ? { inReplyTo: [args.inReplyTo] } : {}),
              },
            },
          }, 'createDraft'],
        ]);

        const createResult = jmapClient.parseMethodResponse(createResponse.methodResponses[0]);
        if (!createResult.success) {
          return {
            isError: true,
            content: [{
              type: 'text' as const,
              text: `Failed to create draft: ${createResult.error?.description || createResult.error?.type}`,
            }],
          };
        }

        const setResponse = createResult.data as EmailSetResponse;
        if (setResponse.notCreated?.['newDraft']) {
          const error = setResponse.notCreated['newDraft'];
          return {
            isError: true,
            content: [{
              type: 'text' as const,
              text: `Failed to create draft: ${error.type} - ${error.description || ''}`,
            }],
          };
        }

        const createdDraft = setResponse.created?.['newDraft'];
        if (!createdDraft) {
          return {
            isError: true,
            content: [{
              type: 'text' as const,
              text: 'Draft creation returned no result',
            }],
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              draftId: createdDraft.id,
              threadId: createdDraft.threadId,
            }),
          }],
        };
      } catch (error) {
        logger.error({ error }, 'Exception in create_draft');
        return {
          isError: true,
          content: [{
            type: 'text' as const,
            text: `Error creating draft: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    }
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Full object replacement | JMAP patch syntax | RFC 8620 (2019) | Granular updates, no race conditions |
| Generic write annotation | Specific annotation per operation | MCP 2025 | Better AI behavior hints |
| Single destroy operation | Trash-first pattern | Best practice | User-friendly, recoverable |

**Deprecated/outdated:**
- Full object replacement in updates: Use patch syntax for individual property changes
- Hardcoded mailbox IDs: Always query by role

## Open Questions

Things that couldn't be fully resolved:

1. **Batch operation UI**
   - What we know: Email/set supports multiple IDs in single request
   - What's unclear: Whether AI should expose batch operations or handle internally
   - Recommendation: Start with single-email tools; add batch variants if needed

2. **Draft HTML support**
   - What we know: Email/set create supports multipart bodies
   - What's unclear: How to handle HTML body creation cleanly in MCP tool
   - Recommendation: Start with text/plain only; add HTML support in future phase

3. **Undo operations**
   - What we know: JMAP supports state tracking for changes
   - What's unclear: How to implement undo at MCP level
   - Recommendation: Defer to future phase; focus on basic CRUD first

## Sources

### Primary (HIGH confidence)
- RFC 8621 JMAP for Mail Section 4.3 (Email/set): https://www.rfc-editor.org/rfc/rfc8621.html#section-4.3
- RFC 8620 JMAP Core Section 5.3 (set method): https://datatracker.ietf.org/doc/html/rfc8620#section-5.3
- MCP SDK ToolAnnotations type definition: `node_modules/@modelcontextprotocol/sdk/dist/esm/types.js`
- JMAP Mail Specification: https://jmap.io/spec-mail.html

### Secondary (MEDIUM confidence)
- MCP Tool Annotations Guide: https://dev.to/nickytonline/quick-fix-my-mcp-tools-were-showing-as-write-tools-in-chatgpt-dev-mode-3id9
- MCP Documentation: https://modelcontextprotocol.io/docs/concepts/tools

### Tertiary (LOW confidence)
- Apache James JMAP implementation notes (for edge case behaviors)

## Metadata

**Confidence breakdown:**
- Email/set method: HIGH - Based on RFC 8621 specification
- Patch syntax: HIGH - Based on RFC 8620 Section 5.3
- Tool annotations: HIGH - Verified from MCP SDK source
- Error handling: MEDIUM - Based on spec + existing patterns

**Research date:** 2026-01-29
**Valid until:** 2026-03-29 (60 days - stable APIs)
