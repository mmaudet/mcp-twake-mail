import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the MCP SDK
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn(),
}));

import { registerEmailSendingTools } from '../../../../src/mcp/tools/email-sending.js';
import type { JMAPClient } from '../../../../src/jmap/client.js';
import type { Logger } from '../../../../src/config/logger.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Test utilities
interface ToolRegistration {
  name: string;
  config: {
    title: string;
    description: string;
    inputSchema: Record<string, unknown>;
    annotations: {
      readOnlyHint: boolean;
      destructiveHint: boolean;
      idempotentHint: boolean;
      openWorldHint: boolean;
    };
  };
  handler: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }>;
}

describe('Email Sending Tools', () => {
  let mockServer: McpServer;
  let mockJmapClient: JMAPClient;
  let mockLogger: Logger;
  let registeredTools: Map<string, ToolRegistration>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Track tool registrations
    registeredTools = new Map();

    // Mock McpServer
    mockServer = {
      registerTool: vi.fn((name: string, config: unknown, handler: unknown) => {
        registeredTools.set(name, {
          name,
          config: config as ToolRegistration['config'],
          handler: handler as ToolRegistration['handler'],
        });
      }),
    } as unknown as McpServer;

    // Mock JMAPClient
    mockJmapClient = {
      getSession: vi.fn().mockReturnValue({ accountId: 'account1' }),
      request: vi.fn(),
      parseMethodResponse: vi.fn(),
    } as unknown as JMAPClient;

    // Mock Logger
    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    } as unknown as Logger;
  });

  describe('send_email', () => {
    it('registers send_email tool with correct metadata', () => {
      registerEmailSendingTools(mockServer, mockJmapClient, mockLogger);

      expect(registeredTools.has('send_email')).toBe(true);
      const tool = registeredTools.get('send_email')!;

      expect(tool.config.title).toBe('Send Email');
      expect(tool.config.annotations.readOnlyHint).toBe(false);
      expect(tool.config.annotations.destructiveHint).toBe(false);
      expect(tool.config.annotations.idempotentHint).toBe(false);
      expect(tool.config.annotations.openWorldHint).toBe(true);
    });

    it('sends email with plain text body', async () => {
      // Mock setup response (Identity/get, Mailbox/query x2)
      const setupResponse = {
        methodResponses: [
          ['Identity/get', { list: [{ id: 'identity1', name: 'Test User', email: 'test@example.com' }] }, 'getIdentity'],
          ['Mailbox/get', { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] }, 'getMailboxes'],
        ],
      };

      // Mock send response (Email/set, EmailSubmission/set)
      const sendResponse = {
        methodResponses: [
          ['Email/set', { created: { email: { id: 'email-1', blobId: 'blob-1', threadId: 'thread-1' } } }, 'createEmail'],
          ['EmailSubmission/set', { created: { submission: { id: 'submission-1' } } }, 'submitEmail'],
        ],
      };

      (mockJmapClient.request as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(setupResponse)
        .mockResolvedValueOnce(sendResponse);

      (mockJmapClient.parseMethodResponse as ReturnType<typeof vi.fn>)
        // Setup responses
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'identity1', name: 'Test User', email: 'test@example.com' }] } })
        
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] } })
        // Send responses
        .mockReturnValueOnce({ success: true, data: { created: { email: { id: 'email-1', blobId: 'blob-1', threadId: 'thread-1' } } } })
        .mockReturnValueOnce({ success: true, data: { created: { submission: { id: 'submission-1' } } } });

      registerEmailSendingTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('send_email')!;

      const result = await tool.handler({
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        body: 'Hello, World!',
      });

      expect(result.isError).toBeUndefined();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.emailId).toBe('email-1');
      expect(response.submissionId).toBe('submission-1');

      // Verify Email/set was called with correct body structure
      const sendCall = (mockJmapClient.request as ReturnType<typeof vi.fn>).mock.calls[1][0];
      const emailSetCall = sendCall.find((call: unknown[]) => call[0] === 'Email/set');
      expect(emailSetCall[1].create.email.bodyStructure.type).toBe('text/plain');
    });

    it('sends email with multipart body (text + HTML)', async () => {
      const setupResponse = {
        methodResponses: [
          ['Identity/get', { list: [{ id: 'identity1', name: 'Test User', email: 'test@example.com' }] }, 'getIdentity'],
          ['Mailbox/get', { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] }, 'getMailboxes'],
        ],
      };

      const sendResponse = {
        methodResponses: [
          ['Email/set', { created: { email: { id: 'email-1', blobId: 'blob-1', threadId: 'thread-1' } } }, 'createEmail'],
          ['EmailSubmission/set', { created: { submission: { id: 'submission-1' } } }, 'submitEmail'],
        ],
      };

      (mockJmapClient.request as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(setupResponse)
        .mockResolvedValueOnce(sendResponse);

      (mockJmapClient.parseMethodResponse as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'identity1', name: 'Test User', email: 'test@example.com' }] } })
        
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] } })
        .mockReturnValueOnce({ success: true, data: { created: { email: { id: 'email-1', blobId: 'blob-1', threadId: 'thread-1' } } } })
        .mockReturnValueOnce({ success: true, data: { created: { submission: { id: 'submission-1' } } } });

      registerEmailSendingTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('send_email')!;

      await tool.handler({
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        body: 'Hello, World!',
        htmlBody: '<p>Hello, World!</p>',
      });

      // Verify Email/set was called with multipart body structure
      const sendCall = (mockJmapClient.request as ReturnType<typeof vi.fn>).mock.calls[1][0];
      const emailSetCall = sendCall.find((call: unknown[]) => call[0] === 'Email/set');
      expect(emailSetCall[1].create.email.bodyStructure.type).toBe('multipart/alternative');
      expect(emailSetCall[1].create.email.bodyValues).toHaveProperty('text');
      expect(emailSetCall[1].create.email.bodyValues).toHaveProperty('html');
    });

    it('includes submission capability in requests', async () => {
      const setupResponse = {
        methodResponses: [
          ['Identity/get', { list: [{ id: 'identity1', name: 'Test User', email: 'test@example.com' }] }, 'getIdentity'],
          ['Mailbox/get', { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] }, 'getMailboxes'],
        ],
      };

      const sendResponse = {
        methodResponses: [
          ['Email/set', { created: { email: { id: 'email-1', blobId: 'blob-1', threadId: 'thread-1' } } }, 'createEmail'],
          ['EmailSubmission/set', { created: { submission: { id: 'submission-1' } } }, 'submitEmail'],
        ],
      };

      (mockJmapClient.request as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(setupResponse)
        .mockResolvedValueOnce(sendResponse);

      (mockJmapClient.parseMethodResponse as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'identity1', name: 'Test User', email: 'test@example.com' }] } })
        
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] } })
        .mockReturnValueOnce({ success: true, data: { created: { email: { id: 'email-1', blobId: 'blob-1', threadId: 'thread-1' } } } })
        .mockReturnValueOnce({ success: true, data: { created: { submission: { id: 'submission-1' } } } });

      registerEmailSendingTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('send_email')!;

      await tool.handler({
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        body: 'Hello, World!',
      });

      // Verify submission capability in request
      const [, using] = (mockJmapClient.request as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(using).toContain('urn:ietf:params:jmap:submission');
    });

    it('handles missing identity gracefully', async () => {
      const setupResponse = {
        methodResponses: [
          ['Identity/get', { list: [] }, 'getIdentity'],
          ['Mailbox/get', { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] }, 'getMailboxes'],
        ],
      };

      (mockJmapClient.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce(setupResponse);

      (mockJmapClient.parseMethodResponse as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({ success: true, data: { list: [] } });

      registerEmailSendingTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('send_email')!;

      const result = await tool.handler({
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        body: 'Hello, World!',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No sending identity available');
    });

    it('handles email creation failure', async () => {
      const setupResponse = {
        methodResponses: [
          ['Identity/get', { list: [{ id: 'identity1', name: 'Test User', email: 'test@example.com' }] }, 'getIdentity'],
          ['Mailbox/get', { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] }, 'getMailboxes'],
        ],
      };

      const sendResponse = {
        methodResponses: [
          ['Email/set', { notCreated: { email: { type: 'invalidProperties', description: 'Bad email data' } } }, 'createEmail'],
        ],
      };

      (mockJmapClient.request as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(setupResponse)
        .mockResolvedValueOnce(sendResponse);

      (mockJmapClient.parseMethodResponse as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'identity1', name: 'Test User', email: 'test@example.com' }] } })
        
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] } })
        .mockReturnValueOnce({ success: true, data: { notCreated: { email: { type: 'invalidProperties', description: 'Bad email data' } } } });

      registerEmailSendingTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('send_email')!;

      const result = await tool.handler({
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        body: 'Hello, World!',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('invalidProperties');
    });

    it('handles submission failure', async () => {
      const setupResponse = {
        methodResponses: [
          ['Identity/get', { list: [{ id: 'identity1', name: 'Test User', email: 'test@example.com' }] }, 'getIdentity'],
          ['Mailbox/get', { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] }, 'getMailboxes'],
        ],
      };

      const sendResponse = {
        methodResponses: [
          ['Email/set', { created: { email: { id: 'email-1', blobId: 'blob-1', threadId: 'thread-1' } } }, 'createEmail'],
          ['EmailSubmission/set', { notCreated: { submission: { type: 'forbiddenFrom', description: 'Cannot send from this address' } } }, 'submitEmail'],
        ],
      };

      (mockJmapClient.request as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(setupResponse)
        .mockResolvedValueOnce(sendResponse);

      (mockJmapClient.parseMethodResponse as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'identity1', name: 'Test User', email: 'test@example.com' }] } })
        
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] } })
        .mockReturnValueOnce({ success: true, data: { created: { email: { id: 'email-1', blobId: 'blob-1', threadId: 'thread-1' } } } })
        .mockReturnValueOnce({ success: true, data: { notCreated: { submission: { type: 'forbiddenFrom', description: 'Cannot send from this address' } } } });

      registerEmailSendingTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('send_email')!;

      const result = await tool.handler({
        to: ['recipient@example.com'],
        subject: 'Test Subject',
        body: 'Hello, World!',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not authorized to send from this address');
    });
  });

  describe('reply_email', () => {
    it('registers reply_email tool with correct metadata', () => {
      registerEmailSendingTools(mockServer, mockJmapClient, mockLogger);

      expect(registeredTools.has('reply_email')).toBe(true);
      const tool = registeredTools.get('reply_email')!;

      expect(tool.config.title).toBe('Reply to Email');
      expect(tool.config.annotations.readOnlyHint).toBe(false);
      expect(tool.config.annotations.idempotentHint).toBe(false);
    });

    it('builds correct threading headers', async () => {
      const setupResponse = {
        methodResponses: [
          ['Identity/get', { list: [{ id: 'identity1', name: 'Test User', email: 'me@example.com' }] }, 'getIdentity'],
          ['Mailbox/get', { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] }, 'getMailboxes'],
          ['Email/get', {
            list: [{
              messageId: ['<msg1@example.com>'],
              references: ['<ref1@example.com>'],
              subject: 'Original Subject',
              from: [{ name: 'Sender', email: 'sender@example.com' }],
            }],
          }, 'getOriginal'],
        ],
      };

      const sendResponse = {
        methodResponses: [
          ['Email/set', { created: { reply: { id: 'reply-1', blobId: 'blob-1', threadId: 'thread-1' } } }, 'createReply'],
          ['EmailSubmission/set', { created: { submission: { id: 'submission-1' } } }, 'submitReply'],
        ],
      };

      (mockJmapClient.request as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(setupResponse)
        .mockResolvedValueOnce(sendResponse);

      (mockJmapClient.parseMethodResponse as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'identity1', name: 'Test User', email: 'me@example.com' }] } })
        
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] } })
        .mockReturnValueOnce({
          success: true,
          data: {
            list: [{
              messageId: ['<msg1@example.com>'],
              references: ['<ref1@example.com>'],
              subject: 'Original Subject',
              from: [{ name: 'Sender', email: 'sender@example.com' }],
            }],
          },
        })
        .mockReturnValueOnce({ success: true, data: { created: { reply: { id: 'reply-1', blobId: 'blob-1', threadId: 'thread-1' } } } })
        .mockReturnValueOnce({ success: true, data: { created: { submission: { id: 'submission-1' } } } });

      registerEmailSendingTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('reply_email')!;

      await tool.handler({
        originalEmailId: 'original-email-1',
        body: 'This is my reply.',
      });

      // Verify Email/set was called with correct threading headers
      const sendCall = (mockJmapClient.request as ReturnType<typeof vi.fn>).mock.calls[1][0];
      const emailSetCall = sendCall.find((call: unknown[]) => call[0] === 'Email/set');
      const emailCreate = emailSetCall[1].create.reply;

      expect(emailCreate.inReplyTo).toEqual(['<msg1@example.com>']);
      expect(emailCreate.references).toEqual(['<ref1@example.com>', '<msg1@example.com>']);
    });

    it('adds Re: prefix to subject', async () => {
      const setupResponse = {
        methodResponses: [
          ['Identity/get', { list: [{ id: 'identity1', name: 'Test User', email: 'me@example.com' }] }, 'getIdentity'],
          ['Mailbox/get', { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] }, 'getMailboxes'],
          ['Email/get', {
            list: [{
              messageId: ['<msg1@example.com>'],
              subject: 'Hello',
              from: [{ email: 'sender@example.com' }],
            }],
          }, 'getOriginal'],
        ],
      };

      const sendResponse = {
        methodResponses: [
          ['Email/set', { created: { reply: { id: 'reply-1', blobId: 'blob-1', threadId: 'thread-1' } } }, 'createReply'],
          ['EmailSubmission/set', { created: { submission: { id: 'submission-1' } } }, 'submitReply'],
        ],
      };

      (mockJmapClient.request as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(setupResponse)
        .mockResolvedValueOnce(sendResponse);

      (mockJmapClient.parseMethodResponse as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'identity1', name: 'Test User', email: 'me@example.com' }] } })
        
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] } })
        .mockReturnValueOnce({
          success: true,
          data: { list: [{ messageId: ['<msg1@example.com>'], subject: 'Hello', from: [{ email: 'sender@example.com' }] }] },
        })
        .mockReturnValueOnce({ success: true, data: { created: { reply: { id: 'reply-1', blobId: 'blob-1', threadId: 'thread-1' } } } })
        .mockReturnValueOnce({ success: true, data: { created: { submission: { id: 'submission-1' } } } });

      registerEmailSendingTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('reply_email')!;

      await tool.handler({
        originalEmailId: 'original-email-1',
        body: 'This is my reply.',
      });

      const sendCall = (mockJmapClient.request as ReturnType<typeof vi.fn>).mock.calls[1][0];
      const emailSetCall = sendCall.find((call: unknown[]) => call[0] === 'Email/set');
      expect(emailSetCall[1].create.reply.subject).toBe('Re: Hello');
    });

    it('preserves existing Re: prefix', async () => {
      const setupResponse = {
        methodResponses: [
          ['Identity/get', { list: [{ id: 'identity1', name: 'Test User', email: 'me@example.com' }] }, 'getIdentity'],
          ['Mailbox/get', { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] }, 'getMailboxes'],
          ['Email/get', {
            list: [{
              messageId: ['<msg1@example.com>'],
              subject: 'Re: Hello',
              from: [{ email: 'sender@example.com' }],
            }],
          }, 'getOriginal'],
        ],
      };

      const sendResponse = {
        methodResponses: [
          ['Email/set', { created: { reply: { id: 'reply-1', blobId: 'blob-1', threadId: 'thread-1' } } }, 'createReply'],
          ['EmailSubmission/set', { created: { submission: { id: 'submission-1' } } }, 'submitReply'],
        ],
      };

      (mockJmapClient.request as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(setupResponse)
        .mockResolvedValueOnce(sendResponse);

      (mockJmapClient.parseMethodResponse as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'identity1', name: 'Test User', email: 'me@example.com' }] } })
        
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] } })
        .mockReturnValueOnce({
          success: true,
          data: { list: [{ messageId: ['<msg1@example.com>'], subject: 'Re: Hello', from: [{ email: 'sender@example.com' }] }] },
        })
        .mockReturnValueOnce({ success: true, data: { created: { reply: { id: 'reply-1', blobId: 'blob-1', threadId: 'thread-1' } } } })
        .mockReturnValueOnce({ success: true, data: { created: { submission: { id: 'submission-1' } } } });

      registerEmailSendingTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('reply_email')!;

      await tool.handler({
        originalEmailId: 'original-email-1',
        body: 'This is my reply.',
      });

      const sendCall = (mockJmapClient.request as ReturnType<typeof vi.fn>).mock.calls[1][0];
      const emailSetCall = sendCall.find((call: unknown[]) => call[0] === 'Email/set');
      expect(emailSetCall[1].create.reply.subject).toBe('Re: Hello');
    });

    it('uses replyTo address when available', async () => {
      const setupResponse = {
        methodResponses: [
          ['Identity/get', { list: [{ id: 'identity1', name: 'Test User', email: 'me@example.com' }] }, 'getIdentity'],
          ['Mailbox/get', { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] }, 'getMailboxes'],
          ['Email/get', {
            list: [{
              messageId: ['<msg1@example.com>'],
              subject: 'Hello',
              from: [{ email: 'from@example.com' }],
              replyTo: [{ email: 'reply@example.com' }],
            }],
          }, 'getOriginal'],
        ],
      };

      const sendResponse = {
        methodResponses: [
          ['Email/set', { created: { reply: { id: 'reply-1', blobId: 'blob-1', threadId: 'thread-1' } } }, 'createReply'],
          ['EmailSubmission/set', { created: { submission: { id: 'submission-1' } } }, 'submitReply'],
        ],
      };

      (mockJmapClient.request as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(setupResponse)
        .mockResolvedValueOnce(sendResponse);

      (mockJmapClient.parseMethodResponse as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'identity1', name: 'Test User', email: 'me@example.com' }] } })
        
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] } })
        .mockReturnValueOnce({
          success: true,
          data: {
            list: [{
              messageId: ['<msg1@example.com>'],
              subject: 'Hello',
              from: [{ email: 'from@example.com' }],
              replyTo: [{ email: 'reply@example.com' }],
            }],
          },
        })
        .mockReturnValueOnce({ success: true, data: { created: { reply: { id: 'reply-1', blobId: 'blob-1', threadId: 'thread-1' } } } })
        .mockReturnValueOnce({ success: true, data: { created: { submission: { id: 'submission-1' } } } });

      registerEmailSendingTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('reply_email')!;

      await tool.handler({
        originalEmailId: 'original-email-1',
        body: 'This is my reply.',
      });

      const sendCall = (mockJmapClient.request as ReturnType<typeof vi.fn>).mock.calls[1][0];
      const emailSetCall = sendCall.find((call: unknown[]) => call[0] === 'Email/set');
      expect(emailSetCall[1].create.reply.to).toEqual([{ email: 'reply@example.com' }]);
    });

    it('falls back to from address when no replyTo', async () => {
      const setupResponse = {
        methodResponses: [
          ['Identity/get', { list: [{ id: 'identity1', name: 'Test User', email: 'me@example.com' }] }, 'getIdentity'],
          ['Mailbox/get', { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] }, 'getMailboxes'],
          ['Email/get', {
            list: [{
              messageId: ['<msg1@example.com>'],
              subject: 'Hello',
              from: [{ email: 'from@example.com' }],
            }],
          }, 'getOriginal'],
        ],
      };

      const sendResponse = {
        methodResponses: [
          ['Email/set', { created: { reply: { id: 'reply-1', blobId: 'blob-1', threadId: 'thread-1' } } }, 'createReply'],
          ['EmailSubmission/set', { created: { submission: { id: 'submission-1' } } }, 'submitReply'],
        ],
      };

      (mockJmapClient.request as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(setupResponse)
        .mockResolvedValueOnce(sendResponse);

      (mockJmapClient.parseMethodResponse as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'identity1', name: 'Test User', email: 'me@example.com' }] } })
        
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] } })
        .mockReturnValueOnce({
          success: true,
          data: { list: [{ messageId: ['<msg1@example.com>'], subject: 'Hello', from: [{ email: 'from@example.com' }] }] },
        })
        .mockReturnValueOnce({ success: true, data: { created: { reply: { id: 'reply-1', blobId: 'blob-1', threadId: 'thread-1' } } } })
        .mockReturnValueOnce({ success: true, data: { created: { submission: { id: 'submission-1' } } } });

      registerEmailSendingTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('reply_email')!;

      await tool.handler({
        originalEmailId: 'original-email-1',
        body: 'This is my reply.',
      });

      const sendCall = (mockJmapClient.request as ReturnType<typeof vi.fn>).mock.calls[1][0];
      const emailSetCall = sendCall.find((call: unknown[]) => call[0] === 'Email/set');
      expect(emailSetCall[1].create.reply.to).toEqual([{ email: 'from@example.com' }]);
    });

    it('includes all recipients on replyAll', async () => {
      const setupResponse = {
        methodResponses: [
          ['Identity/get', { list: [{ id: 'identity1', name: 'Test User', email: 'me@example.com' }] }, 'getIdentity'],
          ['Mailbox/get', { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] }, 'getMailboxes'],
          ['Email/get', {
            list: [{
              messageId: ['<msg1@example.com>'],
              subject: 'Hello',
              from: [{ email: 'sender@example.com' }],
              to: [{ email: 'me@example.com' }, { email: 'other@example.com' }],
              cc: [{ email: 'cc1@example.com' }, { email: 'cc2@example.com' }],
            }],
          }, 'getOriginal'],
        ],
      };

      const sendResponse = {
        methodResponses: [
          ['Email/set', { created: { reply: { id: 'reply-1', blobId: 'blob-1', threadId: 'thread-1' } } }, 'createReply'],
          ['EmailSubmission/set', { created: { submission: { id: 'submission-1' } } }, 'submitReply'],
        ],
      };

      (mockJmapClient.request as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(setupResponse)
        .mockResolvedValueOnce(sendResponse);

      (mockJmapClient.parseMethodResponse as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'identity1', name: 'Test User', email: 'me@example.com' }] } })
        
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] } })
        .mockReturnValueOnce({
          success: true,
          data: {
            list: [{
              messageId: ['<msg1@example.com>'],
              subject: 'Hello',
              from: [{ email: 'sender@example.com' }],
              to: [{ email: 'me@example.com' }, { email: 'other@example.com' }],
              cc: [{ email: 'cc1@example.com' }, { email: 'cc2@example.com' }],
            }],
          },
        })
        .mockReturnValueOnce({ success: true, data: { created: { reply: { id: 'reply-1', blobId: 'blob-1', threadId: 'thread-1' } } } })
        .mockReturnValueOnce({ success: true, data: { created: { submission: { id: 'submission-1' } } } });

      registerEmailSendingTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('reply_email')!;

      await tool.handler({
        originalEmailId: 'original-email-1',
        body: 'This is my reply.',
        replyAll: true,
      });

      const sendCall = (mockJmapClient.request as ReturnType<typeof vi.fn>).mock.calls[1][0];
      const emailSetCall = sendCall.find((call: unknown[]) => call[0] === 'Email/set');
      const toEmails = emailSetCall[1].create.reply.to.map((t: { email: string }) => t.email);
      const ccEmails = emailSetCall[1].create.reply.cc.map((c: { email: string }) => c.email);

      // Should include sender and other@example.com in to, but not me@example.com (self)
      expect(toEmails).toContain('sender@example.com');
      expect(toEmails).toContain('other@example.com');
      expect(toEmails).not.toContain('me@example.com');

      // Should include cc addresses
      expect(ccEmails).toContain('cc1@example.com');
      expect(ccEmails).toContain('cc2@example.com');
    });

    it('excludes self from replyAll recipients', async () => {
      const setupResponse = {
        methodResponses: [
          ['Identity/get', { list: [{ id: 'identity1', name: 'Test User', email: 'ME@EXAMPLE.COM' }] }, 'getIdentity'],
          ['Mailbox/get', { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] }, 'getMailboxes'],
          ['Email/get', {
            list: [{
              messageId: ['<msg1@example.com>'],
              subject: 'Hello',
              from: [{ email: 'sender@example.com' }],
              to: [{ email: 'me@example.com' }, { email: 'other@example.com' }],
              cc: [{ email: 'me@example.com' }], // Self in CC with different case
            }],
          }, 'getOriginal'],
        ],
      };

      const sendResponse = {
        methodResponses: [
          ['Email/set', { created: { reply: { id: 'reply-1', blobId: 'blob-1', threadId: 'thread-1' } } }, 'createReply'],
          ['EmailSubmission/set', { created: { submission: { id: 'submission-1' } } }, 'submitReply'],
        ],
      };

      (mockJmapClient.request as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(setupResponse)
        .mockResolvedValueOnce(sendResponse);

      (mockJmapClient.parseMethodResponse as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'identity1', name: 'Test User', email: 'ME@EXAMPLE.COM' }] } })
        
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] } })
        .mockReturnValueOnce({
          success: true,
          data: {
            list: [{
              messageId: ['<msg1@example.com>'],
              subject: 'Hello',
              from: [{ email: 'sender@example.com' }],
              to: [{ email: 'me@example.com' }, { email: 'other@example.com' }],
              cc: [{ email: 'me@example.com' }],
            }],
          },
        })
        .mockReturnValueOnce({ success: true, data: { created: { reply: { id: 'reply-1', blobId: 'blob-1', threadId: 'thread-1' } } } })
        .mockReturnValueOnce({ success: true, data: { created: { submission: { id: 'submission-1' } } } });

      registerEmailSendingTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('reply_email')!;

      await tool.handler({
        originalEmailId: 'original-email-1',
        body: 'This is my reply.',
        replyAll: true,
      });

      const sendCall = (mockJmapClient.request as ReturnType<typeof vi.fn>).mock.calls[1][0];
      const emailSetCall = sendCall.find((call: unknown[]) => call[0] === 'Email/set');
      const toEmails = emailSetCall[1].create.reply.to.map((t: { email: string }) => t.email.toLowerCase());
      const ccEmails = emailSetCall[1].create.reply.cc?.map((c: { email: string }) => c.email.toLowerCase()) || [];

      // Self should be excluded (case-insensitive)
      expect(toEmails).not.toContain('me@example.com');
      expect(ccEmails).not.toContain('me@example.com');
    });

    it('handles original email not found', async () => {
      const setupResponse = {
        methodResponses: [
          ['Identity/get', { list: [{ id: 'identity1', name: 'Test User', email: 'me@example.com' }] }, 'getIdentity'],
          ['Mailbox/get', { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] }, 'getMailboxes'],
          ['Email/get', { list: [] }, 'getOriginal'],
        ],
      };

      (mockJmapClient.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce(setupResponse);

      (mockJmapClient.parseMethodResponse as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'identity1', name: 'Test User', email: 'me@example.com' }] } })
        
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'sent-mailbox-1', role: 'sent' }, { id: 'drafts-mailbox-1', role: 'drafts' }] } })
        .mockReturnValueOnce({ success: true, data: { list: [] } });

      registerEmailSendingTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('reply_email')!;

      const result = await tool.handler({
        originalEmailId: 'nonexistent-email-id',
        body: 'This is my reply.',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Original email not found');
      expect(result.content[0].text).toContain('nonexistent-email-id');
    });
  });
});
