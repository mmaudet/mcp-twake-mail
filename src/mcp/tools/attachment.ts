/**
 * Attachment MCP tool - get_attachments.
 * Enables AI assistants to list and filter email attachments without downloading content.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { JMAPClient } from '../../jmap/client.js';
import type { Logger } from '../../config/logger.js';

/**
 * Metadata for a single attachment.
 */
export interface AttachmentMetadata {
  blobId: string;
  name: string | null;
  type: string;
  size: number;
  isInline: boolean;
}

/**
 * JMAP body part structure from Email/get response.
 */
interface JMAPBodyPart {
  blobId: string;
  name?: string | null;
  type: string;
  size: number;
  disposition?: string | null;
  cid?: string | null;
}

/**
 * Common annotations for read-only attachment tools.
 */
const ATTACHMENT_READ_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

/**
 * Determine if an attachment is inline based on RFC 8621 algorithm.
 * isInline = has cid AND disposition !== 'attachment'
 * @param part The body part to check
 * @returns true if the attachment is inline
 */
export function isInlineAttachment(part: { cid?: string | null; disposition?: string | null }): boolean {
  return !!part.cid && part.disposition !== 'attachment';
}

/**
 * Transform a JMAP body part to AttachmentMetadata.
 * @param part JMAP body part from attachments array
 * @returns AttachmentMetadata with isInline flag
 */
function transformAttachment(part: JMAPBodyPart): AttachmentMetadata {
  return {
    blobId: part.blobId,
    name: part.name ?? null,
    type: part.type,
    size: part.size,
    isInline: isInlineAttachment(part),
  };
}

/**
 * Filter attachments based on optional criteria.
 * @param attachments List of attachment metadata
 * @param excludeInline If true, remove inline attachments
 * @param mimeTypeFilter If provided, only include attachments matching this MIME type prefix
 * @returns Filtered list of attachments
 */
function filterAttachments(
  attachments: AttachmentMetadata[],
  excludeInline?: boolean,
  mimeTypeFilter?: string
): AttachmentMetadata[] {
  return attachments.filter((att) => {
    if (excludeInline && att.isInline) return false;
    if (mimeTypeFilter && !att.type.startsWith(mimeTypeFilter)) return false;
    return true;
  });
}

/**
 * Register attachment MCP tools with the server.
 * @param server MCP server instance
 * @param jmapClient JMAP client for API calls
 * @param logger Pino logger
 */
export function registerAttachmentTools(
  server: McpServer,
  jmapClient: JMAPClient,
  logger: Logger
): void {
  // get_attachments - list attachment metadata for an email (ATTACH-01, ATTACH-02)
  server.registerTool(
    'get_attachments',
    {
      title: 'Get Attachments',
      description:
        'List all attachments for an email with metadata (blobId, name, type, size, isInline). Supports filtering by excludeInline and mimeTypeFilter.',
      inputSchema: {
        emailId: z.string().describe('The unique identifier of the email to get attachments from'),
        excludeInline: z
          .boolean()
          .optional()
          .default(false)
          .describe('Exclude inline attachments (images embedded in HTML body)'),
        mimeTypeFilter: z
          .string()
          .optional()
          .describe('Filter by MIME type prefix (e.g., "image/", "application/pdf")'),
      },
      annotations: ATTACHMENT_READ_ANNOTATIONS,
    },
    async ({ emailId, excludeInline, mimeTypeFilter }) => {
      logger.debug({ emailId, excludeInline, mimeTypeFilter }, 'get_attachments called');

      try {
        const session = jmapClient.getSession();
        const response = await jmapClient.request([
          [
            'Email/get',
            {
              accountId: session.accountId,
              ids: [emailId],
              properties: ['attachments'],
              bodyProperties: ['blobId', 'name', 'type', 'size', 'disposition', 'cid'],
            },
            'getAttachments',
          ],
        ]);

        const result = jmapClient.parseMethodResponse(response.methodResponses[0]);
        if (!result.success) {
          logger.error({ error: result.error, emailId }, 'JMAP error in get_attachments');
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Failed to retrieve attachments: ${result.error?.description || result.error?.type || 'Unknown error'}`,
              },
            ],
          };
        }

        const emails = result.data?.list as Array<{ id: string; attachments?: JMAPBodyPart[] }>;
        if (!emails || emails.length === 0) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: `Email not found: ${emailId}`,
              },
            ],
          };
        }

        // Get attachments array (may be empty or undefined)
        const rawAttachments = emails[0].attachments || [];

        // Transform all attachments to metadata
        const allAttachments = rawAttachments.map(transformAttachment);
        const totalCount = allAttachments.length;

        // Apply filters
        const filteredAttachments = filterAttachments(allAttachments, excludeInline, mimeTypeFilter);
        const filteredCount = filteredAttachments.length;

        logger.debug(
          { emailId, total: totalCount, filtered: filteredCount },
          'get_attachments success'
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  emailId,
                  attachments: filteredAttachments,
                  total: totalCount,
                  filtered: filteredCount,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        logger.error({ error, emailId }, 'Exception in get_attachments');
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Error retrieving attachments: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );

  logger.debug('Attachment tools registered: get_attachments');
}
