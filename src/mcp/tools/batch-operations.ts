/**
 * Batch email operation MCP tools for managing multiple emails via JMAP.
 * Tools: batch_mark_read, batch_mark_unread, batch_move.
 * These tools enable AI assistants to perform bulk email operations efficiently.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { JMAPClient } from '../../jmap/client.js';
import type { Logger } from '../../config/logger.js';
import type { EmailSetResponse } from '../../types/jmap.js';

/**
 * Result format for batch operations with per-email success/failure reporting.
 */
interface BatchOperationResult {
  success: boolean; // true if ALL succeeded
  total: number;
  succeeded: number;
  failed: number;
  results: {
    succeeded: string[];
    failed: Array<{ emailId: string; error: string }>;
  };
}

/**
 * Common annotations for non-destructive batch write operations.
 */
const BATCH_WRITE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

/**
 * Build a BatchOperationResult from JMAP Email/set response.
 * @param emailIds Original array of email IDs in the request
 * @param updated Record of successfully updated email IDs
 * @param notUpdated Record of failed email IDs with error details
 */
function buildBatchResult(
  emailIds: string[],
  updated: Record<string, unknown> | undefined,
  notUpdated: Record<string, { type: string; description?: string }> | undefined
): BatchOperationResult {
  const succeededIds = Object.keys(updated || {});
  const failedEntries: Array<{ emailId: string; error: string }> = [];

  for (const [emailId, error] of Object.entries(notUpdated || {})) {
    failedEntries.push({
      emailId,
      error: `${error.type}${error.description ? `: ${error.description}` : ''}`,
    });
  }

  return {
    success: failedEntries.length === 0,
    total: emailIds.length,
    succeeded: succeededIds.length,
    failed: failedEntries.length,
    results: {
      succeeded: succeededIds,
      failed: failedEntries,
    },
  };
}

/**
 * Register batch email operation MCP tools with the server.
 * @param server MCP server instance
 * @param jmapClient JMAP client for API calls
 * @param logger Pino logger
 */
export function registerBatchOperationTools(
  server: McpServer,
  jmapClient: JMAPClient,
  logger: Logger
): void {
  // batch_mark_read - set $seen keyword on multiple emails
  server.registerTool(
    'batch_mark_read',
    {
      title: 'Batch Mark Emails as Read',
      description: 'Mark multiple emails as read in a single operation.',
      inputSchema: {
        emailIds: z
          .array(z.string())
          .min(1, 'At least one email ID required')
          .max(50, 'Maximum 50 emails per batch operation')
          .describe('Array of email IDs to mark as read (max 50)'),
      },
      annotations: BATCH_WRITE_ANNOTATIONS,
    },
    async ({ emailIds }) => {
      logger.debug({ emailIds, count: emailIds.length }, 'batch_mark_read called');

      try {
        const session = jmapClient.getSession();

        // Build update map for all emails
        const updateMap: Record<string, Record<string, unknown>> = {};
        for (const emailId of emailIds) {
          updateMap[emailId] = { 'keywords/$seen': true };
        }

        const response = await jmapClient.request([
          [
            'Email/set',
            {
              accountId: session.accountId,
              update: updateMap,
            },
            'batchMarkRead',
          ],
        ]);

        const result = jmapClient.parseMethodResponse(response.methodResponses[0]);
        if (!result.success) {
          logger.error({ error: result.error, emailIds }, 'JMAP error in batch_mark_read');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to batch mark emails as read: ${result.error?.description || result.error?.type || 'Unknown error'}`,
              },
            ],
          };
        }

        const setResponse = result.data as unknown as EmailSetResponse;
        const batchResult = buildBatchResult(emailIds, setResponse.updated, setResponse.notUpdated);

        logger.debug(
          { succeeded: batchResult.succeeded, failed: batchResult.failed },
          'batch_mark_read complete'
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(batchResult),
            },
          ],
        };
      } catch (error) {
        logger.error({ error, emailIds }, 'Exception in batch_mark_read');
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Error batch marking emails as read: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // batch_mark_unread - remove $seen keyword from multiple emails
  server.registerTool(
    'batch_mark_unread',
    {
      title: 'Batch Mark Emails as Unread',
      description: 'Mark multiple emails as unread in a single operation.',
      inputSchema: {
        emailIds: z
          .array(z.string())
          .min(1, 'At least one email ID required')
          .max(50, 'Maximum 50 emails per batch operation')
          .describe('Array of email IDs to mark as unread (max 50)'),
      },
      annotations: BATCH_WRITE_ANNOTATIONS,
    },
    async ({ emailIds }) => {
      logger.debug({ emailIds, count: emailIds.length }, 'batch_mark_unread called');

      try {
        const session = jmapClient.getSession();

        // Build update map for all emails
        const updateMap: Record<string, Record<string, unknown>> = {};
        for (const emailId of emailIds) {
          updateMap[emailId] = { 'keywords/$seen': null };
        }

        const response = await jmapClient.request([
          [
            'Email/set',
            {
              accountId: session.accountId,
              update: updateMap,
            },
            'batchMarkUnread',
          ],
        ]);

        const result = jmapClient.parseMethodResponse(response.methodResponses[0]);
        if (!result.success) {
          logger.error({ error: result.error, emailIds }, 'JMAP error in batch_mark_unread');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to batch mark emails as unread: ${result.error?.description || result.error?.type || 'Unknown error'}`,
              },
            ],
          };
        }

        const setResponse = result.data as unknown as EmailSetResponse;
        const batchResult = buildBatchResult(emailIds, setResponse.updated, setResponse.notUpdated);

        logger.debug(
          { succeeded: batchResult.succeeded, failed: batchResult.failed },
          'batch_mark_unread complete'
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(batchResult),
            },
          ],
        };
      } catch (error) {
        logger.error({ error, emailIds }, 'Exception in batch_mark_unread');
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Error batch marking emails as unread: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // batch_move - move multiple emails to a different mailbox
  server.registerTool(
    'batch_move',
    {
      title: 'Batch Move Emails',
      description:
        'Move multiple emails to a different mailbox in a single operation. This replaces all current mailbox associations for each email.',
      inputSchema: {
        emailIds: z
          .array(z.string())
          .min(1, 'At least one email ID required')
          .max(50, 'Maximum 50 emails per batch operation')
          .describe('Array of email IDs to move (max 50)'),
        targetMailboxId: z.string().describe('The ID of the mailbox to move the emails to'),
      },
      annotations: BATCH_WRITE_ANNOTATIONS,
    },
    async ({ emailIds, targetMailboxId }) => {
      logger.debug(
        { emailIds, count: emailIds.length, targetMailboxId },
        'batch_move called'
      );

      try {
        const session = jmapClient.getSession();

        // Build update map for all emails
        const updateMap: Record<string, Record<string, unknown>> = {};
        for (const emailId of emailIds) {
          updateMap[emailId] = { mailboxIds: { [targetMailboxId]: true } };
        }

        const response = await jmapClient.request([
          [
            'Email/set',
            {
              accountId: session.accountId,
              update: updateMap,
            },
            'batchMove',
          ],
        ]);

        const result = jmapClient.parseMethodResponse(response.methodResponses[0]);
        if (!result.success) {
          logger.error({ error: result.error, emailIds }, 'JMAP error in batch_move');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to batch move emails: ${result.error?.description || result.error?.type || 'Unknown error'}`,
              },
            ],
          };
        }

        const setResponse = result.data as unknown as EmailSetResponse;
        const batchResult = buildBatchResult(emailIds, setResponse.updated, setResponse.notUpdated);

        logger.debug(
          { succeeded: batchResult.succeeded, failed: batchResult.failed, targetMailboxId },
          'batch_move complete'
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ ...batchResult, targetMailboxId }),
            },
          ],
        };
      } catch (error) {
        logger.error({ error, emailIds }, 'Exception in batch_move');
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Error batch moving emails: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  logger.debug(
    'Batch operation tools registered: batch_mark_read, batch_mark_unread, batch_move'
  );
}
