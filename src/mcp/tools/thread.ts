/**
 * Thread MCP tools - get_thread, get_thread_emails.
 * These tools enable AI assistants to navigate email conversations.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { JMAPClient } from '../../jmap/client.js';
import type { Logger } from '../../config/logger.js';
import { transformEmail } from '../../transformers/email.js';

/**
 * Common annotations for read-only thread tools.
 */
const THREAD_READ_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

/**
 * Properties to fetch for full email content in thread context.
 */
const FULL_EMAIL_PROPERTIES = [
  'id',
  'blobId',
  'threadId',
  'mailboxIds',
  'keywords',
  'from',
  'to',
  'cc',
  'bcc',
  'replyTo',
  'subject',
  'receivedAt',
  'sentAt',
  'preview',
  'hasAttachment',
  'size',
  'bodyValues',
  'textBody',
  'htmlBody',
  'attachments',
];

/**
 * Register thread MCP tools with the server.
 * @param server MCP server instance
 * @param jmapClient JMAP client for API calls
 * @param logger Pino logger
 */
export function registerThreadTools(
  server: McpServer,
  jmapClient: JMAPClient,
  logger: Logger
): void {
  // get_thread - retrieve thread by ID (THREAD-01)
  server.registerTool(
    'get_thread',
    {
      title: 'Get Thread',
      description: 'Retrieve a thread by ID, returning the thread ID and list of email IDs in oldest-first order.',
      inputSchema: {
        threadId: z.string().describe('The unique identifier of the thread to retrieve'),
      },
      annotations: THREAD_READ_ANNOTATIONS,
    },
    async ({ threadId }) => {
      logger.debug({ threadId }, 'get_thread called');

      try {
        const session = jmapClient.getSession();
        const response = await jmapClient.request([
          [
            'Thread/get',
            {
              accountId: session.accountId,
              ids: [threadId],
            },
            'getThread',
          ],
        ]);

        const result = jmapClient.parseMethodResponse(response.methodResponses[0]);
        if (!result.success) {
          logger.error({ error: result.error, threadId }, 'JMAP error in get_thread');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to retrieve thread: ${result.error?.description || result.error?.type || 'Unknown error'}`,
              },
            ],
          };
        }

        const threads = result.data?.list as Array<{ id: string; emailIds: string[] }>;
        const notFound = result.data?.notFound as string[] | undefined;

        // Check if thread was not found
        if (notFound && notFound.includes(threadId)) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Thread not found: ${threadId}`,
              },
            ],
          };
        }

        if (!threads || threads.length === 0) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Thread not found: ${threadId}`,
              },
            ],
          };
        }

        const thread = threads[0];
        logger.debug({ threadId, emailCount: thread.emailIds.length }, 'get_thread success');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  id: thread.id,
                  emailIds: thread.emailIds,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        logger.error({ error, threadId }, 'Exception in get_thread');
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Error retrieving thread: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // get_thread_emails - retrieve all emails in a thread (THREAD-02)
  server.registerTool(
    'get_thread_emails',
    {
      title: 'Get Thread Emails',
      description: 'Retrieve all emails in a thread with full content, returned in oldest-first order.',
      inputSchema: {
        threadId: z.string().describe('The unique identifier of the thread'),
      },
      annotations: THREAD_READ_ANNOTATIONS,
    },
    async ({ threadId }) => {
      logger.debug({ threadId }, 'get_thread_emails called');

      try {
        const session = jmapClient.getSession();

        // Step 1: Get thread to retrieve emailIds
        const threadResponse = await jmapClient.request([
          [
            'Thread/get',
            {
              accountId: session.accountId,
              ids: [threadId],
            },
            'getThread',
          ],
        ]);

        const threadResult = jmapClient.parseMethodResponse(threadResponse.methodResponses[0]);
        if (!threadResult.success) {
          logger.error({ error: threadResult.error, threadId }, 'JMAP error in get_thread_emails (Thread/get)');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to retrieve thread: ${threadResult.error?.description || threadResult.error?.type || 'Unknown error'}`,
              },
            ],
          };
        }

        const threads = threadResult.data?.list as Array<{ id: string; emailIds: string[] }>;
        const notFound = threadResult.data?.notFound as string[] | undefined;

        // Check if thread was not found
        if (notFound && notFound.includes(threadId)) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Thread not found: ${threadId}`,
              },
            ],
          };
        }

        if (!threads || threads.length === 0) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Thread not found: ${threadId}`,
              },
            ],
          };
        }

        const thread = threads[0];
        const emailIds = thread.emailIds;

        // Handle empty thread (no emails)
        if (!emailIds || emailIds.length === 0) {
          logger.debug({ threadId }, 'get_thread_emails success (empty thread)');
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    threadId,
                    emails: [],
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // Step 2: Get all emails in the thread
        const emailResponse = await jmapClient.request([
          [
            'Email/get',
            {
              accountId: session.accountId,
              ids: emailIds,
              properties: FULL_EMAIL_PROPERTIES,
              fetchTextBodyValues: true,
              fetchHTMLBodyValues: true,
              bodyProperties: ['partId', 'blobId', 'type', 'name', 'size'],
            },
            'getEmails',
          ],
        ]);

        const emailResult = jmapClient.parseMethodResponse(emailResponse.methodResponses[0]);
        if (!emailResult.success) {
          logger.error({ error: emailResult.error, threadId }, 'JMAP error in get_thread_emails (Email/get)');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to retrieve thread emails: ${emailResult.error?.description || emailResult.error?.type || 'Unknown error'}`,
              },
            ],
          };
        }

        const emails = (emailResult.data?.list as unknown[]) || [];

        // Transform emails and maintain order (emailIds from Thread/get is oldest-first per RFC 8621)
        // Create a map for quick lookup by ID
        const emailMap = new Map<string, unknown>();
        for (const email of emails) {
          const emailObj = email as { id: string };
          emailMap.set(emailObj.id, email);
        }

        // Preserve the order from emailIds (oldest-first)
        const orderedEmails = emailIds
          .map((id) => emailMap.get(id))
          .filter((email): email is NonNullable<typeof email> => email !== undefined)
          .map((email) => transformEmail(email as Parameters<typeof transformEmail>[0]));

        logger.debug({ threadId, emailCount: orderedEmails.length }, 'get_thread_emails success');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  threadId,
                  emails: orderedEmails,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        logger.error({ error, threadId }, 'Exception in get_thread_emails');
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Error retrieving thread emails: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  logger.debug('Thread tools registered: get_thread, get_thread_emails');
}
