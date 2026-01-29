/**
 * Email write operation MCP tools for managing emails via JMAP.
 * Tools: mark_as_read, mark_as_unread, delete_email, move_email, add_label, remove_label, create_draft.
 * These tools enable AI assistants to modify email status, organize emails, and create drafts.
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
 * Annotations for create operations (not idempotent - each call creates new item).
 */
const EMAIL_CREATE_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
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

  // create_draft - create a new draft email (EMAIL-12)
  server.registerTool(
    'create_draft',
    {
      title: 'Create Draft Email',
      description: 'Create a new draft email in the Drafts mailbox for later editing or sending.',
      inputSchema: {
        to: z.array(z.string().email()).optional().describe('Recipient email addresses'),
        cc: z.array(z.string().email()).optional().describe('CC email addresses'),
        bcc: z.array(z.string().email()).optional().describe('BCC email addresses'),
        subject: z.string().optional().describe('Email subject'),
        body: z.string().optional().describe('Plain text email body'),
        inReplyTo: z.string().optional().describe('Message-ID of the email being replied to'),
      },
      annotations: EMAIL_CREATE_ANNOTATIONS,
    },
    async ({ to, cc, bcc, subject, body, inReplyTo }) => {
      logger.debug({ to, cc, bcc, subject, hasBody: !!body, inReplyTo }, 'create_draft called');

      try {
        const session = jmapClient.getSession();

        // Get Drafts mailbox first (doesn't need submission capability)
        const mailboxResponse = await jmapClient.request([
          [
            'Mailbox/get',
            {
              accountId: session.accountId,
              properties: ['id', 'role'],
            },
            'getMailboxes',
          ],
        ]);

        // Parse Mailbox response
        const getResult = jmapClient.parseMethodResponse(mailboxResponse.methodResponses[0]);

        // Try to get identity separately (needs submission capability)
        let identity: { id: string; email: string; name?: string } | undefined;
        try {
          const identityResponse = await jmapClient.request(
            [['Identity/get', { accountId: session.accountId }, 'getIdentity']],
            ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail', 'urn:ietf:params:jmap:submission']
          );
          const identityResult = jmapClient.parseMethodResponse(identityResponse.methodResponses[0]);
          if (identityResult.success) {
            const identities = (identityResult.data as { list: Array<{ id: string; email: string; name?: string }> }).list;
            identity = identities?.[0];
          }
        } catch {
          // Identity fetch failed - draft will be created without from field
          logger.debug('Could not fetch identity for draft - will create without from field');
        }
        if (!getResult.success) {
          logger.error({ error: getResult.error }, 'JMAP error getting mailboxes');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: 'Failed to get mailboxes',
              },
            ],
          };
        }

        const mailboxes = (getResult.data as { list: Array<{ id: string; role: string | null }> }).list;
        const draftsMailbox = mailboxes.find((mb) => mb.role === 'drafts');
        if (!draftsMailbox) {
          logger.error({}, 'No Drafts mailbox found');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: 'No Drafts mailbox found. Cannot create draft.',
              },
            ],
          };
        }

        const draftsMailboxId = draftsMailbox.id;

        // Build email create object
        const emailCreate: Record<string, unknown> = {
          mailboxIds: { [draftsMailboxId]: true },
          keywords: { '$draft': true, '$seen': true },
          subject: subject || '',
          bodyStructure: { type: 'text/plain', partId: '1' },
          bodyValues: {
            '1': {
              value: body || '',
              isEncodingProblem: false,
              isTruncated: false,
            },
          },
        };

        // Set from field using identity (if available)
        if (identity) {
          emailCreate.from = [{ email: identity.email, name: identity.name }];
        }

        // Add optional address fields
        if (to && to.length > 0) {
          emailCreate.to = to.map((email) => ({ email }));
        }
        if (cc && cc.length > 0) {
          emailCreate.cc = cc.map((email) => ({ email }));
        }
        if (bcc && bcc.length > 0) {
          emailCreate.bcc = bcc.map((email) => ({ email }));
        }
        if (inReplyTo) {
          emailCreate.inReplyTo = [inReplyTo];
        }

        // Create the draft
        const createResponse = await jmapClient.request([
          [
            'Email/set',
            {
              accountId: session.accountId,
              create: {
                draft: emailCreate,
              },
            },
            'createDraft',
          ],
        ]);

        const createResult = jmapClient.parseMethodResponse(createResponse.methodResponses[0]);
        if (!createResult.success) {
          logger.error({ error: createResult.error }, 'JMAP error in create_draft');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to create draft: ${createResult.error?.description || createResult.error?.type || 'Unknown error'}`,
              },
            ],
          };
        }

        const setResponse = createResult.data as unknown as EmailSetResponse;
        if (setResponse.notCreated?.draft) {
          const error = setResponse.notCreated.draft;
          logger.error({ error }, 'Email/set notCreated in create_draft');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to create draft: ${error.type} - ${error.description || ''}`,
              },
            ],
          };
        }

        const created = setResponse.created?.draft;
        if (!created) {
          logger.error({}, 'No created draft in response');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: 'Failed to create draft: no created email in response',
              },
            ],
          };
        }

        logger.debug({ draftId: created.id, threadId: created.threadId }, 'create_draft success');
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: true, draftId: created.id, threadId: created.threadId }),
            },
          ],
        };
      } catch (error) {
        logger.error({ error }, 'Exception in create_draft');
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Error creating draft: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  logger.debug('Email operation tools registered: mark_as_read, mark_as_unread, delete_email, move_email, add_label, remove_label, create_draft');
}
