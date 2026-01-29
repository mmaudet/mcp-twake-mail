/**
 * Tool registration aggregator.
 * Centralizes all MCP tool registrations.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { JMAPClient } from '../../jmap/client.js';
import type { Logger } from '../../config/logger.js';
import { registerEmailTools } from './email.js';
import { registerMailboxTools } from './mailbox.js';
import { registerEmailOperationTools } from './email-operations.js';

/**
 * Register all MCP tools with the server.
 * @param server MCP server instance
 * @param jmapClient JMAP client for API calls
 * @param logger Pino logger
 */
export function registerAllTools(
  server: McpServer,
  jmapClient: JMAPClient,
  logger: Logger
): void {
  logger.debug('Registering MCP tools...');

  // Register email tools (get_email, search_emails, get_email_labels)
  registerEmailTools(server, jmapClient, logger);

  // Register mailbox tools (get_mailbox, list_mailboxes)
  registerMailboxTools(server, jmapClient, logger);

  // Register email operation tools (mark_as_read, mark_as_unread, delete_email)
  registerEmailOperationTools(server, jmapClient, logger);

  logger.info('All MCP tools registered');
}
