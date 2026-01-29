/**
 * Email write operation MCP tools - mark_as_read, mark_as_unread, delete_email.
 * These tools enable AI assistants to modify email read status and delete emails.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { JMAPClient } from '../../jmap/client.js';
import type { Logger } from '../../config/logger.js';
import type { EmailSetResponse } from '../../types/jmap.js';

/**
 * Common annotations for non-destructive write operations.
 */
const EMAIL_WRITE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

/**
 * Annotations for destructive operations (delete).
 */
const EMAIL_DESTRUCTIVE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

/**
 * Register email operation MCP tools with the server.
 * @param server MCP server instance
 * @param jmapClient JMAP client for API calls
 * @param logger Pino logger
 */
export function registerEmailOperationTools(
  server: McpServer,
  jmapClient: JMAPClient,
  logger: Logger
): void {
  // mark_as_read - set $seen keyword (EMAIL-06)
  server.registerTool(
    'mark_as_read',
    {
      title: 'Mark Email as Read',
      description: 'Mark an email as read by setting the $seen keyword.',
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
          [
            'Email/set',
            {
              accountId: session.accountId,
              update: {
                [emailId]: {
                  'keywords/$seen': true,
                },
              },
            },
            'markRead',
          ],
        ]);

        const result = jmapClient.parseMethodResponse(response.methodResponses[0]);
        if (!result.success) {
          logger.error({ error: result.error, emailId }, 'JMAP error in mark_as_read');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to mark email as read: ${result.error?.description || result.error?.type || 'Unknown error'}`,
              },
            ],
          };
        }

        const setResponse = result.data as unknown as EmailSetResponse;
        if (setResponse.notUpdated?.[emailId]) {
          const error = setResponse.notUpdated[emailId];
          logger.error({ error, emailId }, 'Email/set notUpdated in mark_as_read');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to mark email as read: ${error.type} - ${error.description || ''}`,
              },
            ],
          };
        }

        logger.debug({ emailId }, 'mark_as_read success');
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: true, emailId, marked: 'read' }),
            },
          ],
        };
      } catch (error) {
        logger.error({ error, emailId }, 'Exception in mark_as_read');
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Error marking email as read: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // mark_as_unread - remove $seen keyword (EMAIL-07)
  server.registerTool(
    'mark_as_unread',
    {
      title: 'Mark Email as Unread',
      description: 'Mark an email as unread by removing the $seen keyword.',
      inputSchema: {
        emailId: z.string().describe('The unique identifier of the email to mark as unread'),
      },
      annotations: EMAIL_WRITE_ANNOTATIONS,
    },
    async ({ emailId }) => {
      logger.debug({ emailId }, 'mark_as_unread called');

      try {
        const session = jmapClient.getSession();
        const response = await jmapClient.request([
          [
            'Email/set',
            {
              accountId: session.accountId,
              update: {
                [emailId]: {
                  'keywords/$seen': null,
                },
              },
            },
            'markUnread',
          ],
        ]);

        const result = jmapClient.parseMethodResponse(response.methodResponses[0]);
        if (!result.success) {
          logger.error({ error: result.error, emailId }, 'JMAP error in mark_as_unread');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to mark email as unread: ${result.error?.description || result.error?.type || 'Unknown error'}`,
              },
            ],
          };
        }

        const setResponse = result.data as unknown as EmailSetResponse;
        if (setResponse.notUpdated?.[emailId]) {
          const error = setResponse.notUpdated[emailId];
          logger.error({ error, emailId }, 'Email/set notUpdated in mark_as_unread');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to mark email as unread: ${error.type} - ${error.description || ''}`,
              },
            ],
          };
        }

        logger.debug({ emailId }, 'mark_as_unread success');
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: true, emailId, marked: 'unread' }),
            },
          ],
        };
      } catch (error) {
        logger.error({ error, emailId }, 'Exception in mark_as_unread');
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Error marking email as unread: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // delete_email - move to Trash or permanently destroy (EMAIL-05)
  server.registerTool(
    'delete_email',
    {
      title: 'Delete Email',
      description:
        'Delete an email. By default moves to Trash. Use permanent=true to permanently destroy.',
      inputSchema: {
        emailId: z.string().describe('The unique identifier of the email to delete'),
        permanent: z
          .boolean()
          .default(false)
          .describe('If true, permanently destroy the email. Default: false (move to Trash)'),
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
            [
              'Email/set',
              {
                accountId: session.accountId,
                destroy: [emailId],
              },
              'destroyEmail',
            ],
          ]);

          const result = jmapClient.parseMethodResponse(response.methodResponses[0]);
          if (!result.success) {
            logger.error({ error: result.error, emailId }, 'JMAP error in delete_email (permanent)');
            return {
              isError: true,
              content: [
                {
                  type: 'text' as const,
                  text: `Failed to delete email: ${result.error?.description || result.error?.type || 'Unknown error'}`,
                },
              ],
            };
          }

          const setResponse = result.data as unknown as EmailSetResponse;
          if (setResponse.notDestroyed?.[emailId]) {
            const error = setResponse.notDestroyed[emailId];
            logger.error({ error, emailId }, 'Email/set notDestroyed in delete_email');
            return {
              isError: true,
              content: [
                {
                  type: 'text' as const,
                  text: `Failed to delete email: ${error.type} - ${error.description || ''}`,
                },
              ],
            };
          }

          logger.debug({ emailId }, 'delete_email (permanent) success');
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ success: true, emailId, action: 'permanently_deleted' }),
              },
            ],
          };
        } else {
          // Move to Trash
          // First find Trash mailbox
          const mailboxResponse = await jmapClient.request([
            [
              'Mailbox/query',
              {
                accountId: session.accountId,
                filter: { role: 'trash' },
              },
              'findTrash',
            ],
          ]);

          const queryResult = jmapClient.parseMethodResponse(mailboxResponse.methodResponses[0]);
          if (!queryResult.success) {
            logger.error({ error: queryResult.error }, 'JMAP error finding Trash mailbox');
            return {
              isError: true,
              content: [
                {
                  type: 'text' as const,
                  text: 'Failed to find Trash mailbox',
                },
              ],
            };
          }

          const trashIds = (queryResult.data as { ids: string[] }).ids;
          if (!trashIds || trashIds.length === 0) {
            // No Trash mailbox, fall back to permanent delete
            logger.warn({ emailId }, 'No Trash mailbox found, performing permanent delete');

            const destroyResponse = await jmapClient.request([
              [
                'Email/set',
                {
                  accountId: session.accountId,
                  destroy: [emailId],
                },
                'destroyEmailFallback',
              ],
            ]);

            const destroyResult = jmapClient.parseMethodResponse(
              destroyResponse.methodResponses[0]
            );
            if (!destroyResult.success) {
              logger.error(
                { error: destroyResult.error, emailId },
                'JMAP error in delete_email (fallback)'
              );
              return {
                isError: true,
                content: [
                  {
                    type: 'text' as const,
                    text: `Failed to delete email: ${destroyResult.error?.description || destroyResult.error?.type || 'Unknown error'}`,
                  },
                ],
              };
            }

            const destroySetResponse = destroyResult.data as unknown as EmailSetResponse;
            if (destroySetResponse.notDestroyed?.[emailId]) {
              const error = destroySetResponse.notDestroyed[emailId];
              logger.error({ error, emailId }, 'Email/set notDestroyed in delete_email (fallback)');
              return {
                isError: true,
                content: [
                  {
                    type: 'text' as const,
                    text: `Failed to delete email: ${error.type} - ${error.description || ''}`,
                  },
                ],
              };
            }

            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({ success: true, emailId, action: 'permanently_deleted' }),
                },
              ],
            };
          }

          const trashMailboxId = trashIds[0];

          // Move to Trash (replace all mailboxIds with just Trash)
          const moveResponse = await jmapClient.request([
            [
              'Email/set',
              {
                accountId: session.accountId,
                update: {
                  [emailId]: {
                    mailboxIds: { [trashMailboxId]: true },
                  },
                },
              },
              'moveToTrash',
            ],
          ]);

          const moveResult = jmapClient.parseMethodResponse(moveResponse.methodResponses[0]);
          if (!moveResult.success) {
            logger.error({ error: moveResult.error, emailId }, 'JMAP error in delete_email (move)');
            return {
              isError: true,
              content: [
                {
                  type: 'text' as const,
                  text: `Failed to move email to Trash: ${moveResult.error?.description || moveResult.error?.type || 'Unknown error'}`,
                },
              ],
            };
          }

          const moveSetResponse = moveResult.data as unknown as EmailSetResponse;
          if (moveSetResponse.notUpdated?.[emailId]) {
            const error = moveSetResponse.notUpdated[emailId];
            logger.error({ error, emailId }, 'Email/set notUpdated in delete_email (move)');
            return {
              isError: true,
              content: [
                {
                  type: 'text' as const,
                  text: `Failed to move email to Trash: ${error.type} - ${error.description || ''}`,
                },
              ],
            };
          }

          logger.debug({ emailId, trashMailboxId }, 'delete_email (move to Trash) success');
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ success: true, emailId, action: 'moved_to_trash' }),
              },
            ],
          };
        }
      } catch (error) {
        logger.error({ error, emailId }, 'Exception in delete_email');
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Error deleting email: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // move_email - move email to a different mailbox (EMAIL-08)
  server.registerTool(
    'move_email',
    {
      title: 'Move Email',
      description: 'Move an email to a different mailbox. This replaces all current mailbox associations.',
      inputSchema: {
        emailId: z.string().describe('The unique identifier of the email to move'),
        targetMailboxId: z.string().describe('The ID of the mailbox to move the email to'),
      },
      annotations: EMAIL_WRITE_ANNOTATIONS,
    },
    async ({ emailId, targetMailboxId }) => {
      logger.debug({ emailId, targetMailboxId }, 'move_email called');

      try {
        const session = jmapClient.getSession();
        const response = await jmapClient.request([
          [
            'Email/set',
            {
              accountId: session.accountId,
              update: {
                [emailId]: {
                  mailboxIds: { [targetMailboxId]: true },
                },
              },
            },
            'moveEmail',
          ],
        ]);

        const result = jmapClient.parseMethodResponse(response.methodResponses[0]);
        if (!result.success) {
          logger.error({ error: result.error, emailId }, 'JMAP error in move_email');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to move email: ${result.error?.description || result.error?.type || 'Unknown error'}`,
              },
            ],
          };
        }

        const setResponse = result.data as unknown as EmailSetResponse;
        if (setResponse.notUpdated?.[emailId]) {
          const error = setResponse.notUpdated[emailId];
          logger.error({ error, emailId }, 'Email/set notUpdated in move_email');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to move email: ${error.type} - ${error.description || ''}`,
              },
            ],
          };
        }

        logger.debug({ emailId, targetMailboxId }, 'move_email success');
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: true, emailId, targetMailboxId }),
            },
          ],
        };
      } catch (error) {
        logger.error({ error, emailId }, 'Exception in move_email');
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Error moving email: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // add_label - add a mailbox to an email without removing existing ones (EMAIL-09)
  server.registerTool(
    'add_label',
    {
      title: 'Add Label to Email',
      description: 'Add a label (mailbox) to an email without removing existing labels.',
      inputSchema: {
        emailId: z.string().describe('The unique identifier of the email'),
        mailboxId: z.string().describe('The ID of the mailbox (label) to add'),
      },
      annotations: EMAIL_WRITE_ANNOTATIONS,
    },
    async ({ emailId, mailboxId }) => {
      logger.debug({ emailId, mailboxId }, 'add_label called');

      try {
        const session = jmapClient.getSession();
        const response = await jmapClient.request([
          [
            'Email/set',
            {
              accountId: session.accountId,
              update: {
                [emailId]: {
                  [`mailboxIds/${mailboxId}`]: true,
                },
              },
            },
            'addLabel',
          ],
        ]);

        const result = jmapClient.parseMethodResponse(response.methodResponses[0]);
        if (!result.success) {
          logger.error({ error: result.error, emailId }, 'JMAP error in add_label');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to add label: ${result.error?.description || result.error?.type || 'Unknown error'}`,
              },
            ],
          };
        }

        const setResponse = result.data as unknown as EmailSetResponse;
        if (setResponse.notUpdated?.[emailId]) {
          const error = setResponse.notUpdated[emailId];
          logger.error({ error, emailId }, 'Email/set notUpdated in add_label');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to add label: ${error.type} - ${error.description || ''}`,
              },
            ],
          };
        }

        logger.debug({ emailId, mailboxId }, 'add_label success');
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: true, emailId, addedMailboxId: mailboxId }),
            },
          ],
        };
      } catch (error) {
        logger.error({ error, emailId }, 'Exception in add_label');
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Error adding label: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // remove_label - remove a mailbox from an email (EMAIL-10)
  server.registerTool(
    'remove_label',
    {
      title: 'Remove Label from Email',
      description: 'Remove a label (mailbox) from an email. Email must belong to at least one mailbox.',
      inputSchema: {
        emailId: z.string().describe('The unique identifier of the email'),
        mailboxId: z.string().describe('The ID of the mailbox (label) to remove'),
      },
      annotations: EMAIL_WRITE_ANNOTATIONS,
    },
    async ({ emailId, mailboxId }) => {
      logger.debug({ emailId, mailboxId }, 'remove_label called');

      try {
        const session = jmapClient.getSession();
        const response = await jmapClient.request([
          [
            'Email/set',
            {
              accountId: session.accountId,
              update: {
                [emailId]: {
                  [`mailboxIds/${mailboxId}`]: null,
                },
              },
            },
            'removeLabel',
          ],
        ]);

        const result = jmapClient.parseMethodResponse(response.methodResponses[0]);
        if (!result.success) {
          logger.error({ error: result.error, emailId }, 'JMAP error in remove_label');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to remove label: ${result.error?.description || result.error?.type || 'Unknown error'}`,
              },
            ],
          };
        }

        const setResponse = result.data as unknown as EmailSetResponse;
        if (setResponse.notUpdated?.[emailId]) {
          const error = setResponse.notUpdated[emailId];
          logger.error({ error, emailId }, 'Email/set notUpdated in remove_label');
          // Handle the case where email only has one mailbox
          if (error.type === 'invalidProperties') {
            return {
              isError: true,
              content: [
                {
                  type: 'text' as const,
                  text: 'Cannot remove label: email must belong to at least one mailbox',
                },
              ],
            };
          }
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to remove label: ${error.type} - ${error.description || ''}`,
              },
            ],
          };
        }

        logger.debug({ emailId, mailboxId }, 'remove_label success');
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: true, emailId, removedMailboxId: mailboxId }),
            },
          ],
        };
      } catch (error) {
        logger.error({ error, emailId }, 'Exception in remove_label');
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Error removing label: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  logger.debug('Email operation tools registered: mark_as_read, mark_as_unread, delete_email, move_email, add_label, remove_label');
}
