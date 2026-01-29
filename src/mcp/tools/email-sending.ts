/**
 * Email sending MCP tools for composing and sending emails via JMAP.
 * Tools: send_email
 * These tools enable AI assistants to send new emails.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { JMAPClient } from '../../jmap/client.js';
import type { Logger } from '../../config/logger.js';
import type {
  EmailSetResponse,
  Identity,
  EmailSubmissionSetResponse,
} from '../../types/jmap.js';

/**
 * Annotations for send operations (not idempotent - each call sends a new email).
 */
const EMAIL_SEND_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

/**
 * JMAP capabilities required for email submission.
 */
const SUBMISSION_USING = [
  'urn:ietf:params:jmap:core',
  'urn:ietf:params:jmap:mail',
  'urn:ietf:params:jmap:submission',
];

/**
 * Register email sending MCP tools with the server.
 * @param server MCP server instance
 * @param jmapClient JMAP client for API calls
 * @param logger Pino logger
 */
export function registerEmailSendingTools(
  server: McpServer,
  jmapClient: JMAPClient,
  logger: Logger
): void {
  // send_email - compose and send a new email (EMAIL-01)
  server.registerTool(
    'send_email',
    {
      title: 'Send Email',
      description:
        'Compose and send a new email. Supports plain text and HTML body content.',
      inputSchema: {
        to: z
          .array(z.string().email())
          .min(1)
          .describe('Recipient email addresses (at least one required)'),
        cc: z.array(z.string().email()).optional().describe('CC email addresses'),
        bcc: z.array(z.string().email()).optional().describe('BCC email addresses'),
        subject: z.string().describe('Email subject line'),
        body: z.string().optional().describe('Plain text email body'),
        htmlBody: z.string().optional().describe('HTML email body'),
      },
      annotations: EMAIL_SEND_ANNOTATIONS,
    },
    async ({ to, cc, bcc, subject, body, htmlBody }) => {
      logger.debug(
        { to, cc, bcc, subject, hasBody: !!body, hasHtmlBody: !!htmlBody },
        'send_email called'
      );

      try {
        const session = jmapClient.getSession();

        // Step 1: Get identity and mailbox IDs in a single batch
        const setupResponse = await jmapClient.request(
          [
            ['Identity/get', { accountId: session.accountId }, 'getIdentity'],
            [
              'Mailbox/query',
              { accountId: session.accountId, filter: { role: 'sent' } },
              'findSent',
            ],
            [
              'Mailbox/query',
              { accountId: session.accountId, filter: { role: 'drafts' } },
              'findDrafts',
            ],
          ],
          SUBMISSION_USING
        );

        // Parse Identity response
        const identityResult = jmapClient.parseMethodResponse(setupResponse.methodResponses[0]);
        if (!identityResult.success) {
          logger.error({ error: identityResult.error }, 'Failed to get identity');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: 'Failed to get sending identity. Contact your administrator.',
              },
            ],
          };
        }

        const identities = (identityResult.data as { list: Identity[] }).list;
        if (!identities || identities.length === 0) {
          logger.error({}, 'No sending identity available');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: 'No sending identity available. Contact your administrator.',
              },
            ],
          };
        }
        const identity = identities[0];

        // Parse Sent mailbox response
        const sentResult = jmapClient.parseMethodResponse(setupResponse.methodResponses[1]);
        const sentMailboxId = sentResult.success
          ? (sentResult.data as { ids: string[] }).ids?.[0]
          : undefined;

        // Parse Drafts mailbox response
        const draftsResult = jmapClient.parseMethodResponse(setupResponse.methodResponses[2]);
        if (!draftsResult.success) {
          logger.error({ error: draftsResult.error }, 'Failed to find Drafts mailbox');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: 'No Drafts mailbox found. Cannot send email.',
              },
            ],
          };
        }

        const draftsIds = (draftsResult.data as { ids: string[] }).ids;
        if (!draftsIds || draftsIds.length === 0) {
          logger.error({}, 'No Drafts mailbox found');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: 'No Drafts mailbox found. Cannot send email.',
              },
            ],
          };
        }
        const draftsMailboxId = draftsIds[0];

        // Step 2: Build bodyStructure based on body/htmlBody
        let bodyStructure: Record<string, unknown>;
        let bodyValues: Record<string, { value: string; isEncodingProblem: boolean; isTruncated: boolean }>;

        if (body && htmlBody) {
          // Both text and HTML: multipart/alternative
          bodyStructure = {
            type: 'multipart/alternative',
            subParts: [
              { partId: 'text', type: 'text/plain' },
              { partId: 'html', type: 'text/html' },
            ],
          };
          bodyValues = {
            text: { value: body, isEncodingProblem: false, isTruncated: false },
            html: { value: htmlBody, isEncodingProblem: false, isTruncated: false },
          };
        } else if (htmlBody) {
          // Only HTML
          bodyStructure = { type: 'text/html', partId: 'body' };
          bodyValues = {
            body: { value: htmlBody, isEncodingProblem: false, isTruncated: false },
          };
        } else {
          // Only text (or neither - use empty string)
          bodyStructure = { type: 'text/plain', partId: 'body' };
          bodyValues = {
            body: { value: body || '', isEncodingProblem: false, isTruncated: false },
          };
        }

        // Step 3: Build email object
        const emailCreate: Record<string, unknown> = {
          mailboxIds: { [draftsMailboxId]: true },
          from: [{ name: identity.name, email: identity.email }],
          to: to.map((email) => ({ email })),
          subject,
          bodyStructure,
          bodyValues,
        };

        // Add optional address fields
        if (cc && cc.length > 0) {
          emailCreate.cc = cc.map((email) => ({ email }));
        }
        if (bcc && bcc.length > 0) {
          emailCreate.bcc = bcc.map((email) => ({ email }));
        }

        // Step 4: Build onSuccessUpdateEmail for Drafts-to-Sent transition
        const onSuccessUpdate: Record<string, unknown> = {
          'keywords/$draft': null,
        };

        if (sentMailboxId) {
          onSuccessUpdate[`mailboxIds/${draftsMailboxId}`] = null;
          onSuccessUpdate[`mailboxIds/${sentMailboxId}`] = true;
        }

        // Step 5: Create email and submit in single batch
        const sendResponse = await jmapClient.request(
          [
            [
              'Email/set',
              {
                accountId: session.accountId,
                create: { email: emailCreate },
              },
              'createEmail',
            ],
            [
              'EmailSubmission/set',
              {
                accountId: session.accountId,
                create: {
                  submission: {
                    identityId: identity.id,
                    emailId: '#email',
                  },
                },
                onSuccessUpdateEmail: { '#submission': onSuccessUpdate },
              },
              'submitEmail',
            ],
          ],
          SUBMISSION_USING
        );

        // Step 6: Check Email/set response
        const emailResult = jmapClient.parseMethodResponse(sendResponse.methodResponses[0]);
        if (!emailResult.success) {
          logger.error({ error: emailResult.error }, 'JMAP error in Email/set');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to create email: ${emailResult.error?.description || emailResult.error?.type || 'Unknown error'}`,
              },
            ],
          };
        }

        const emailSetResponse = emailResult.data as unknown as EmailSetResponse;
        if (emailSetResponse.notCreated?.email) {
          const error = emailSetResponse.notCreated.email;
          logger.error({ error }, 'Email/set notCreated');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to create email: ${error.type} - ${error.description || ''}`,
              },
            ],
          };
        }

        const createdEmail = emailSetResponse.created?.email;
        if (!createdEmail) {
          logger.error({}, 'No created email in response');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: 'Failed to create email: no created email in response',
              },
            ],
          };
        }

        // Step 7: Check EmailSubmission/set response
        const submissionResult = jmapClient.parseMethodResponse(sendResponse.methodResponses[1]);
        if (!submissionResult.success) {
          logger.error({ error: submissionResult.error }, 'JMAP error in EmailSubmission/set');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to send email: ${submissionResult.error?.description || submissionResult.error?.type || 'Unknown error'}`,
              },
            ],
          };
        }

        const submissionSetResponse = submissionResult.data as unknown as EmailSubmissionSetResponse;
        if (submissionSetResponse.notCreated?.submission) {
          const error = submissionSetResponse.notCreated.submission;
          logger.error({ error }, 'EmailSubmission/set notCreated');
          // Provide user-friendly messages for common errors
          let errorMessage = `Failed to send email: ${error.type}`;
          if (error.type === 'forbiddenFrom') {
            errorMessage = 'Failed to send email: You are not authorized to send from this address.';
          } else if (error.type === 'forbiddenToSend') {
            errorMessage = 'Failed to send email: You do not have permission to send emails.';
          } else if (error.type === 'tooManyRecipients') {
            errorMessage = 'Failed to send email: Too many recipients specified.';
          } else if (error.description) {
            errorMessage = `Failed to send email: ${error.type} - ${error.description}`;
          }
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: errorMessage,
              },
            ],
          };
        }

        const createdSubmission = submissionSetResponse.created?.submission;
        if (!createdSubmission) {
          logger.error({}, 'No created submission in response');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: 'Failed to send email: no submission created in response',
              },
            ],
          };
        }

        logger.debug(
          { emailId: createdEmail.id, submissionId: createdSubmission.id },
          'send_email success'
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                emailId: createdEmail.id,
                submissionId: createdSubmission.id,
              }),
            },
          ],
        };
      } catch (error) {
        logger.error({ error }, 'Exception in send_email');
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Error sending email: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  // reply_email - reply to an existing email with proper threading (EMAIL-02)
  server.registerTool(
    'reply_email',
    {
      title: 'Reply to Email',
      description:
        'Reply to an existing email with proper threading (In-Reply-To, References headers). Supports reply-all to include all original recipients.',
      inputSchema: {
        originalEmailId: z.string().describe('ID of the email being replied to'),
        body: z.string().describe('Plain text reply body'),
        htmlBody: z.string().optional().describe('HTML reply body'),
        replyAll: z
          .boolean()
          .default(false)
          .describe('If true, reply to all original recipients'),
      },
      annotations: EMAIL_SEND_ANNOTATIONS,
    },
    async ({ originalEmailId, body, htmlBody, replyAll }) => {
      logger.debug(
        { originalEmailId, hasBody: !!body, hasHtmlBody: !!htmlBody, replyAll },
        'reply_email called'
      );

      try {
        const session = jmapClient.getSession();

        // Step 1: Get identity, mailbox IDs, and original email in a single batch
        const setupResponse = await jmapClient.request(
          [
            ['Identity/get', { accountId: session.accountId }, 'getIdentity'],
            [
              'Mailbox/query',
              { accountId: session.accountId, filter: { role: 'sent' } },
              'findSent',
            ],
            [
              'Mailbox/query',
              { accountId: session.accountId, filter: { role: 'drafts' } },
              'findDrafts',
            ],
            [
              'Email/get',
              {
                accountId: session.accountId,
                ids: [originalEmailId],
                properties: ['messageId', 'references', 'subject', 'from', 'to', 'cc', 'replyTo'],
              },
              'getOriginal',
            ],
          ],
          SUBMISSION_USING
        );

        // Parse Identity response
        const identityResult = jmapClient.parseMethodResponse(setupResponse.methodResponses[0]);
        if (!identityResult.success) {
          logger.error({ error: identityResult.error }, 'Failed to get identity');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: 'Failed to get sending identity. Contact your administrator.',
              },
            ],
          };
        }

        const identities = (identityResult.data as { list: Identity[] }).list;
        if (!identities || identities.length === 0) {
          logger.error({}, 'No sending identity available');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: 'No sending identity available. Contact your administrator.',
              },
            ],
          };
        }
        const identity = identities[0];

        // Parse Sent mailbox response
        const sentResult = jmapClient.parseMethodResponse(setupResponse.methodResponses[1]);
        const sentMailboxId = sentResult.success
          ? (sentResult.data as { ids: string[] }).ids?.[0]
          : undefined;

        // Parse Drafts mailbox response
        const draftsResult = jmapClient.parseMethodResponse(setupResponse.methodResponses[2]);
        if (!draftsResult.success) {
          logger.error({ error: draftsResult.error }, 'Failed to find Drafts mailbox');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: 'No Drafts mailbox found. Cannot send reply.',
              },
            ],
          };
        }

        const draftsIds = (draftsResult.data as { ids: string[] }).ids;
        if (!draftsIds || draftsIds.length === 0) {
          logger.error({}, 'No Drafts mailbox found');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: 'No Drafts mailbox found. Cannot send reply.',
              },
            ],
          };
        }
        const draftsMailboxId = draftsIds[0];

        // Parse original email response
        const originalResult = jmapClient.parseMethodResponse(setupResponse.methodResponses[3]);
        if (!originalResult.success) {
          logger.error({ error: originalResult.error }, 'Failed to get original email');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to fetch original email: ${originalResult.error?.description || originalResult.error?.type || 'Unknown error'}`,
              },
            ],
          };
        }

        const originalList = (
          originalResult.data as {
            list: Array<{
              messageId?: string[];
              references?: string[];
              subject?: string;
              from?: Array<{ name?: string; email: string }>;
              to?: Array<{ name?: string; email: string }>;
              cc?: Array<{ name?: string; email: string }>;
              replyTo?: Array<{ name?: string; email: string }>;
            }>;
          }
        ).list;

        if (!originalList || originalList.length === 0) {
          logger.error({ originalEmailId }, 'Original email not found');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Original email not found: ${originalEmailId}`,
              },
            ],
          };
        }
        const original = originalList[0];

        // Step 2: Build threading headers (arrays per RFC 8621)
        const inReplyTo: string[] = original.messageId || [];
        const references: string[] = [
          ...(original.references || []),
          ...(original.messageId || []),
        ];

        // Step 3: Build subject with Re: prefix
        let replySubject: string;
        const originalSubject = original.subject || '';
        if (originalSubject.toLowerCase().startsWith('re:')) {
          replySubject = originalSubject;
        } else {
          replySubject = `Re: ${originalSubject}`;
        }

        // Step 4: Build recipients
        // Primary recipient: replyTo if available, otherwise from
        const primaryRecipient = original.replyTo?.[0] || original.from?.[0];
        if (!primaryRecipient) {
          logger.error({}, 'No recipient found in original email');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: 'Original email has no sender address to reply to.',
              },
            ],
          };
        }

        const toAddresses: Array<{ name?: string; email: string }> = [primaryRecipient];
        const ccAddresses: Array<{ name?: string; email: string }> = [];

        if (replyAll) {
          // Add all original 'to' recipients except self (case-insensitive)
          const selfEmail = identity.email.toLowerCase();
          for (const addr of original.to || []) {
            if (addr.email.toLowerCase() !== selfEmail) {
              // Avoid duplicates with primary recipient
              if (addr.email.toLowerCase() !== primaryRecipient.email.toLowerCase()) {
                toAddresses.push(addr);
              }
            }
          }
          // Add all original 'cc' recipients except self
          for (const addr of original.cc || []) {
            if (addr.email.toLowerCase() !== selfEmail) {
              ccAddresses.push(addr);
            }
          }
        }

        // Step 5: Build body structure (same logic as send_email)
        let bodyStructure: Record<string, unknown>;
        let bodyValues: Record<string, { value: string; isEncodingProblem: boolean; isTruncated: boolean }>;

        if (body && htmlBody) {
          bodyStructure = {
            type: 'multipart/alternative',
            subParts: [
              { partId: 'text', type: 'text/plain' },
              { partId: 'html', type: 'text/html' },
            ],
          };
          bodyValues = {
            text: { value: body, isEncodingProblem: false, isTruncated: false },
            html: { value: htmlBody, isEncodingProblem: false, isTruncated: false },
          };
        } else if (htmlBody) {
          bodyStructure = { type: 'text/html', partId: 'body' };
          bodyValues = {
            body: { value: htmlBody, isEncodingProblem: false, isTruncated: false },
          };
        } else {
          bodyStructure = { type: 'text/plain', partId: 'body' };
          bodyValues = {
            body: { value: body || '', isEncodingProblem: false, isTruncated: false },
          };
        }

        // Step 6: Build email object
        const emailCreate: Record<string, unknown> = {
          mailboxIds: { [draftsMailboxId]: true },
          from: [{ name: identity.name, email: identity.email }],
          to: toAddresses,
          subject: replySubject,
          inReplyTo,
          references,
          bodyStructure,
          bodyValues,
        };

        // Add cc if non-empty
        if (ccAddresses.length > 0) {
          emailCreate.cc = ccAddresses;
        }

        // Step 7: Build onSuccessUpdateEmail for Drafts-to-Sent transition
        const onSuccessUpdate: Record<string, unknown> = {
          'keywords/$draft': null,
        };

        if (sentMailboxId) {
          onSuccessUpdate[`mailboxIds/${draftsMailboxId}`] = null;
          onSuccessUpdate[`mailboxIds/${sentMailboxId}`] = true;
        }

        // Step 8: Create email and submit in single batch
        const sendResponse = await jmapClient.request(
          [
            [
              'Email/set',
              {
                accountId: session.accountId,
                create: { reply: emailCreate },
              },
              'createReply',
            ],
            [
              'EmailSubmission/set',
              {
                accountId: session.accountId,
                create: {
                  submission: {
                    identityId: identity.id,
                    emailId: '#reply',
                  },
                },
                onSuccessUpdateEmail: { '#submission': onSuccessUpdate },
              },
              'submitReply',
            ],
          ],
          SUBMISSION_USING
        );

        // Step 9: Check Email/set response
        const emailResult = jmapClient.parseMethodResponse(sendResponse.methodResponses[0]);
        if (!emailResult.success) {
          logger.error({ error: emailResult.error }, 'JMAP error in Email/set for reply');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to create reply: ${emailResult.error?.description || emailResult.error?.type || 'Unknown error'}`,
              },
            ],
          };
        }

        const emailSetResponse = emailResult.data as unknown as EmailSetResponse;
        if (emailSetResponse.notCreated?.reply) {
          const error = emailSetResponse.notCreated.reply;
          logger.error({ error }, 'Email/set notCreated for reply');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to create reply: ${error.type} - ${error.description || ''}`,
              },
            ],
          };
        }

        const createdEmail = emailSetResponse.created?.reply;
        if (!createdEmail) {
          logger.error({}, 'No created reply in response');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: 'Failed to create reply: no created email in response',
              },
            ],
          };
        }

        // Step 10: Check EmailSubmission/set response
        const submissionResult = jmapClient.parseMethodResponse(sendResponse.methodResponses[1]);
        if (!submissionResult.success) {
          logger.error({ error: submissionResult.error }, 'JMAP error in EmailSubmission/set for reply');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to send reply: ${submissionResult.error?.description || submissionResult.error?.type || 'Unknown error'}`,
              },
            ],
          };
        }

        const submissionSetResponse = submissionResult.data as unknown as EmailSubmissionSetResponse;
        if (submissionSetResponse.notCreated?.submission) {
          const error = submissionSetResponse.notCreated.submission;
          logger.error({ error }, 'EmailSubmission/set notCreated for reply');
          let errorMessage = `Failed to send reply: ${error.type}`;
          if (error.type === 'forbiddenFrom') {
            errorMessage = 'Failed to send reply: You are not authorized to send from this address.';
          } else if (error.type === 'forbiddenToSend') {
            errorMessage = 'Failed to send reply: You do not have permission to send emails.';
          } else if (error.type === 'tooManyRecipients') {
            errorMessage = 'Failed to send reply: Too many recipients specified.';
          } else if (error.description) {
            errorMessage = `Failed to send reply: ${error.type} - ${error.description}`;
          }
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: errorMessage,
              },
            ],
          };
        }

        const createdSubmission = submissionSetResponse.created?.submission;
        if (!createdSubmission) {
          logger.error({}, 'No created submission in response for reply');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: 'Failed to send reply: no submission created in response',
              },
            ],
          };
        }

        logger.debug(
          {
            emailId: createdEmail.id,
            submissionId: createdSubmission.id,
            threadId: createdEmail.threadId,
            inReplyTo,
            references,
          },
          'reply_email success'
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                emailId: createdEmail.id,
                submissionId: createdSubmission.id,
                threadId: createdEmail.threadId,
              }),
            },
          ],
        };
      } catch (error) {
        logger.error({ error }, 'Exception in reply_email');
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Error sending reply: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  logger.debug('Email sending tools registered: send_email, reply_email');
}
