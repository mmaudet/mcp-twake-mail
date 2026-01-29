/**
 * Mailbox MCP tools for retrieving and listing mailboxes.
 * Provides get_mailbox (MBOX-01) and list_mailboxes (MBOX-02) tools.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { JMAPClient } from '../../jmap/client.js';
import type { Logger } from '../../config/logger.js';
import { transformMailbox } from '../../transformers/mailbox.js';
import type { SimplifiedMailbox, MailboxRole } from '../../types/dto.js';

/** Properties to fetch for mailbox operations */
const MAILBOX_PROPERTIES = [
  'id',
  'name',
  'parentId',
  'role',
  'sortOrder',
  'totalEmails',
  'unreadEmails',
  'totalThreads',
  'unreadThreads',
  'myRights',
  'isSubscribed',
];

/** Valid mailbox roles for filtering */
const VALID_ROLES: MailboxRole[] = [
  'inbox',
  'drafts',
  'sent',
  'trash',
  'archive',
  'junk',
  'important',
  'all',
  'subscribed',
];

/** Common tool annotations for read-only mailbox operations */
const MAILBOX_TOOL_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

/**
 * Register mailbox tools with the MCP server.
 * @param server MCP server instance
 * @param jmapClient JMAP client for server communication
 * @param logger Logger instance
 */
export function registerMailboxTools(
  server: McpServer,
  jmapClient: JMAPClient,
  logger: Logger
): void {
  // get_mailbox tool (MBOX-01)
  server.tool(
    'get_mailbox',
    'Retrieve a mailbox by its ID with metadata including email counts and permissions.',
    {
      mailboxId: z.string().describe('The unique identifier of the mailbox to retrieve'),
    },
    {
      ...MAILBOX_TOOL_ANNOTATIONS,
      title: 'Get Mailbox',
    },
    async ({ mailboxId }) => {
      logger.debug({ mailboxId }, 'get_mailbox called');

      try {
        const session = jmapClient.getSession();
        const response = await jmapClient.request([
          [
            'Mailbox/get',
            {
              accountId: session.accountId,
              ids: [mailboxId],
              properties: MAILBOX_PROPERTIES,
            },
            'get-mailbox',
          ],
        ]);

        const result = jmapClient.parseMethodResponse(response.methodResponses[0]);

        if (!result.success) {
          logger.error({ error: result.error }, 'JMAP error in get_mailbox');
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error retrieving mailbox: ${result.error?.description || result.error?.type || 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }

        const list = result.data?.list as Record<string, unknown>[] | undefined;
        const notFound = result.data?.notFound as string[] | undefined;

        if (notFound && notFound.includes(mailboxId)) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Mailbox not found: ${mailboxId}`,
              },
            ],
            isError: true,
          };
        }

        if (!list || list.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Mailbox not found: ${mailboxId}`,
              },
            ],
            isError: true,
          };
        }

        const mailbox = transformMailbox(list[0] as unknown as Parameters<typeof transformMailbox>[0]);

        logger.debug({ mailboxId: mailbox.id, name: mailbox.name }, 'get_mailbox success');

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(mailbox, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error({ error, mailboxId }, 'Exception in get_mailbox');
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error retrieving mailbox: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // list_mailboxes tool (MBOX-02)
  server.tool(
    'list_mailboxes',
    'List all mailboxes with optional filtering by role (inbox, drafts, sent, trash, archive, spam, junk, important, all).',
    {
      role: z
        .enum(['inbox', 'drafts', 'sent', 'trash', 'archive', 'junk', 'important', 'all', 'subscribed'])
        .optional()
        .describe('Filter mailboxes by role (e.g., inbox, drafts, sent, trash)'),
    },
    {
      ...MAILBOX_TOOL_ANNOTATIONS,
      title: 'List Mailboxes',
    },
    async ({ role }) => {
      logger.debug({ role }, 'list_mailboxes called');

      try {
        const session = jmapClient.getSession();
        const response = await jmapClient.request([
          [
            'Mailbox/get',
            {
              accountId: session.accountId,
              properties: MAILBOX_PROPERTIES,
            },
            'list-mailboxes',
          ],
        ]);

        const result = jmapClient.parseMethodResponse(response.methodResponses[0]);

        if (!result.success) {
          logger.error({ error: result.error }, 'JMAP error in list_mailboxes');
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error listing mailboxes: ${result.error?.description || result.error?.type || 'Unknown error'}`,
              },
            ],
            isError: true,
          };
        }

        const list = result.data?.list as Record<string, unknown>[] | undefined;

        if (!list) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify([], null, 2),
              },
            ],
          };
        }

        // Transform all mailboxes
        let mailboxes: SimplifiedMailbox[] = list.map((item) =>
          transformMailbox(item as unknown as Parameters<typeof transformMailbox>[0])
        );

        // Filter by role if specified (client-side filtering)
        if (role) {
          mailboxes = mailboxes.filter((mailbox) => mailbox.role === role);
        }

        logger.debug(
          { count: mailboxes.length, filtered: !!role, role },
          'list_mailboxes success'
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(mailboxes, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error({ error, role }, 'Exception in list_mailboxes');
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error listing mailboxes: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  logger.info('Mailbox tools registered: get_mailbox, list_mailboxes');
}
