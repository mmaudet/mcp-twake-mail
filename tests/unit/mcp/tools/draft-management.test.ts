import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the MCP SDK
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn(),
}));

import { registerEmailOperationTools } from '../../../../src/mcp/tools/email-operations.js';
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

describe('Draft Management Tools', () => {
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

  describe('update_draft', () => {
    it('registers update_draft tool with correct metadata', () => {
      registerEmailOperationTools(mockServer, mockJmapClient, mockLogger);

      expect(registeredTools.has('update_draft')).toBe(true);
      const tool = registeredTools.get('update_draft')!;

      expect(tool.config.title).toBe('Update Draft Email');
      expect(tool.config.annotations.readOnlyHint).toBe(false);
      expect(tool.config.annotations.destructiveHint).toBe(false);
      expect(tool.config.annotations.idempotentHint).toBe(true); // Update is idempotent
      expect(tool.config.annotations.openWorldHint).toBe(true);
    });

    it('updates draft subject and body using patch syntax', async () => {
      registerEmailOperationTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('update_draft')!;

      // Mock Email/set success response
      const updateResponse = {
        methodResponses: [
          ['Email/set', { updated: { 'draft-1': { id: 'draft-1' } } }, 'updateDraft'],
        ],
      };

      vi.mocked(mockJmapClient.request).mockResolvedValue(updateResponse);
      vi.mocked(mockJmapClient.parseMethodResponse).mockReturnValue({
        success: true,
        data: { updated: { 'draft-1': { id: 'draft-1' } } },
      });

      const result = await tool.handler({
        draftId: 'draft-1',
        subject: 'Updated Subject',
        body: 'Updated body text',
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('success');
      expect(result.content[0].text).toContain('draft-1');

      // Verify patch syntax was used for body
      const requestCall = vi.mocked(mockJmapClient.request).mock.calls[0][0];
      const updateCall = requestCall[0];
      expect(updateCall[0]).toBe('Email/set');
      const params = updateCall[1] as Record<string, unknown>;
      const update = params.update as Record<string, Record<string, unknown>>;
      expect(update['draft-1']['bodyValues/1/value']).toBe('Updated body text');
      expect(update['draft-1']['subject']).toBe('Updated Subject');
    });

    it('updates draft recipients', async () => {
      registerEmailOperationTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('update_draft')!;

      const updateResponse = {
        methodResponses: [
          ['Email/set', { updated: { 'draft-1': { id: 'draft-1' } } }, 'updateDraft'],
        ],
      };

      vi.mocked(mockJmapClient.request).mockResolvedValue(updateResponse);
      vi.mocked(mockJmapClient.parseMethodResponse).mockReturnValue({
        success: true,
        data: { updated: { 'draft-1': { id: 'draft-1' } } },
      });

      const result = await tool.handler({
        draftId: 'draft-1',
        to: ['user1@example.com', 'user2@example.com'],
        cc: ['cc@example.com'],
        bcc: ['bcc@example.com'],
      });

      expect(result.isError).toBeUndefined();

      // Verify recipients were formatted correctly
      const requestCall = vi.mocked(mockJmapClient.request).mock.calls[0][0];
      const updateCall = requestCall[0];
      const params = updateCall[1] as Record<string, unknown>;
      const update = params.update as Record<string, Record<string, unknown>>;
      const draftUpdate = update['draft-1'];

      expect(draftUpdate.to).toEqual([
        { email: 'user1@example.com' },
        { email: 'user2@example.com' },
      ]);
      expect(draftUpdate.cc).toEqual([{ email: 'cc@example.com' }]);
      expect(draftUpdate.bcc).toEqual([{ email: 'bcc@example.com' }]);
    });

    it('returns error when draft not found', async () => {
      registerEmailOperationTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('update_draft')!;

      vi.mocked(mockJmapClient.request).mockResolvedValue({
        methodResponses: [
          ['Email/set', { notUpdated: { 'draft-1': { type: 'notFound' } } }, 'updateDraft'],
        ],
      });
      vi.mocked(mockJmapClient.parseMethodResponse).mockReturnValue({
        success: true,
        data: { notUpdated: { 'draft-1': { type: 'notFound' } } },
      });

      const result = await tool.handler({
        draftId: 'draft-1',
        subject: 'New Subject',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Draft not found');
    });

    it('returns error when state mismatch occurs', async () => {
      registerEmailOperationTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('update_draft')!;

      vi.mocked(mockJmapClient.request).mockResolvedValue({
        methodResponses: [
          ['Email/set', { notUpdated: { 'draft-1': { type: 'stateMismatch' } } }, 'updateDraft'],
        ],
      });
      vi.mocked(mockJmapClient.parseMethodResponse).mockReturnValue({
        success: true,
        data: { notUpdated: { 'draft-1': { type: 'stateMismatch' } } },
      });

      const result = await tool.handler({
        draftId: 'draft-1',
        subject: 'New Subject',
        ifInState: 'old-state',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('modified by another client');
    });

    it('returns error when no fields to update', async () => {
      registerEmailOperationTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('update_draft')!;

      const result = await tool.handler({
        draftId: 'draft-1',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No fields to update');

      // Should not make API call
      expect(mockJmapClient.request).not.toHaveBeenCalled();
    });

    it('supports optional ifInState parameter', async () => {
      registerEmailOperationTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('update_draft')!;

      const updateResponse = {
        methodResponses: [
          ['Email/set', { updated: { 'draft-1': { id: 'draft-1' } } }, 'updateDraft'],
        ],
      };

      vi.mocked(mockJmapClient.request).mockResolvedValue(updateResponse);
      vi.mocked(mockJmapClient.parseMethodResponse).mockReturnValue({
        success: true,
        data: { updated: { 'draft-1': { id: 'draft-1' } } },
      });

      await tool.handler({
        draftId: 'draft-1',
        subject: 'New Subject',
        ifInState: 'state-123',
      });

      // Verify ifInState was included in request
      const requestCall = vi.mocked(mockJmapClient.request).mock.calls[0][0];
      const updateCall = requestCall[0];
      const params = updateCall[1] as Record<string, unknown>;
      expect(params.ifInState).toBe('state-123');
    });
  });

  describe('send_draft', () => {
    it('registers send_draft tool with correct metadata', () => {
      registerEmailOperationTools(mockServer, mockJmapClient, mockLogger);

      expect(registeredTools.has('send_draft')).toBe(true);
      const tool = registeredTools.get('send_draft')!;

      expect(tool.config.title).toBe('Send Draft Email');
      expect(tool.config.annotations.readOnlyHint).toBe(false);
      expect(tool.config.annotations.destructiveHint).toBe(false);
      expect(tool.config.annotations.idempotentHint).toBe(false); // Send is NOT idempotent
      expect(tool.config.annotations.openWorldHint).toBe(true);
    });

    it('sends draft and moves to Sent folder', async () => {
      registerEmailOperationTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('send_draft')!;

      // Mock setup response (Identity/get, Mailbox/get)
      const setupResponse = {
        methodResponses: [
          ['Identity/get', { list: [{ id: 'identity1', email: 'test@example.com' }] }, 'getIdentity'],
          ['Mailbox/get', { list: [{ id: 'sent-1', role: 'sent' }, { id: 'drafts-1', role: 'drafts' }] }, 'getMailboxes'],
        ],
      };

      // Mock send response (EmailSubmission/set)
      const sendResponse = {
        methodResponses: [
          ['EmailSubmission/set', { created: { submission: { id: 'submission-1' } } }, 'submitDraft'],
        ],
      };

      vi.mocked(mockJmapClient.request)
        .mockResolvedValueOnce(setupResponse)
        .mockResolvedValueOnce(sendResponse);

      vi.mocked(mockJmapClient.parseMethodResponse)
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'identity1', email: 'test@example.com' }] } })
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'sent-1', role: 'sent' }, { id: 'drafts-1', role: 'drafts' }] } })
        .mockReturnValueOnce({ success: true, data: { created: { submission: { id: 'submission-1' } } } });

      const result = await tool.handler({ draftId: 'draft-1' });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('success');
      expect(result.content[0].text).toContain('submission-1');

      // Verify onSuccessUpdateEmail includes correct structure
      const sendCall = vi.mocked(mockJmapClient.request).mock.calls[1][0];
      const submissionCall = sendCall[0];
      expect(submissionCall[0]).toBe('EmailSubmission/set');
      const params = submissionCall[1] as Record<string, unknown>;
      const onSuccess = params.onSuccessUpdateEmail as Record<string, Record<string, unknown>>;
      const update = onSuccess['#submission'];

      expect(update['keywords/$draft']).toBe(null); // Remove draft keyword
      expect(update['mailboxIds/drafts-1']).toBe(null); // Remove from Drafts
      expect(update['mailboxIds/sent-1']).toBe(true); // Add to Sent
    });

    it('sends draft when Sent mailbox missing', async () => {
      registerEmailOperationTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('send_draft')!;

      // Mock setup response (Identity/get, Mailbox/get with no Sent)
      const setupResponse = {
        methodResponses: [
          ['Identity/get', { list: [{ id: 'identity1', email: 'test@example.com' }] }, 'getIdentity'],
          ['Mailbox/get', { list: [{ id: 'drafts-1', role: 'drafts' }] }, 'getMailboxes'],
        ],
      };

      const sendResponse = {
        methodResponses: [
          ['EmailSubmission/set', { created: { submission: { id: 'submission-1' } } }, 'submitDraft'],
        ],
      };

      vi.mocked(mockJmapClient.request)
        .mockResolvedValueOnce(setupResponse)
        .mockResolvedValueOnce(sendResponse);

      vi.mocked(mockJmapClient.parseMethodResponse)
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'identity1', email: 'test@example.com' }] } })
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'drafts-1', role: 'drafts' }] } })
        .mockReturnValueOnce({ success: true, data: { created: { submission: { id: 'submission-1' } } } });

      const result = await tool.handler({ draftId: 'draft-1' });

      expect(result.isError).toBeUndefined();
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.movedToSent).toBe(false); // No Sent mailbox to move to

      // Verify onSuccessUpdateEmail only removes draft keyword
      const sendCall = vi.mocked(mockJmapClient.request).mock.calls[1][0];
      const submissionCall = sendCall[0];
      const params = submissionCall[1] as Record<string, unknown>;
      const onSuccess = params.onSuccessUpdateEmail as Record<string, Record<string, unknown>>;
      const update = onSuccess['#submission'];

      expect(update['keywords/$draft']).toBe(null); // Remove draft keyword
      expect(update['mailboxIds/drafts-1']).toBeUndefined(); // Should not modify mailboxIds if no Sent
    });

    it('returns error for forbiddenFrom', async () => {
      registerEmailOperationTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('send_draft')!;

      const setupResponse = {
        methodResponses: [
          ['Identity/get', { list: [{ id: 'identity1', email: 'test@example.com' }] }, 'getIdentity'],
          ['Mailbox/get', { list: [{ id: 'sent-1', role: 'sent' }, { id: 'drafts-1', role: 'drafts' }] }, 'getMailboxes'],
        ],
      };

      const sendResponse = {
        methodResponses: [
          ['EmailSubmission/set', { notCreated: { submission: { type: 'forbiddenFrom' } } }, 'submitDraft'],
        ],
      };

      vi.mocked(mockJmapClient.request)
        .mockResolvedValueOnce(setupResponse)
        .mockResolvedValueOnce(sendResponse);

      vi.mocked(mockJmapClient.parseMethodResponse)
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'identity1', email: 'test@example.com' }] } })
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'sent-1', role: 'sent' }, { id: 'drafts-1', role: 'drafts' }] } })
        .mockReturnValueOnce({ success: true, data: { notCreated: { submission: { type: 'forbiddenFrom' } } } });

      const result = await tool.handler({ draftId: 'draft-1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not authorized to send from this address');
    });

    it('returns error for invalidEmail', async () => {
      registerEmailOperationTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('send_draft')!;

      const setupResponse = {
        methodResponses: [
          ['Identity/get', { list: [{ id: 'identity1', email: 'test@example.com' }] }, 'getIdentity'],
          ['Mailbox/get', { list: [{ id: 'sent-1', role: 'sent' }, { id: 'drafts-1', role: 'drafts' }] }, 'getMailboxes'],
        ],
      };

      const sendResponse = {
        methodResponses: [
          ['EmailSubmission/set', { notCreated: { submission: { type: 'invalidEmail' } } }, 'submitDraft'],
        ],
      };

      vi.mocked(mockJmapClient.request)
        .mockResolvedValueOnce(setupResponse)
        .mockResolvedValueOnce(sendResponse);

      vi.mocked(mockJmapClient.parseMethodResponse)
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'identity1', email: 'test@example.com' }] } })
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'sent-1', role: 'sent' }, { id: 'drafts-1', role: 'drafts' }] } })
        .mockReturnValueOnce({ success: true, data: { notCreated: { submission: { type: 'invalidEmail' } } } });

      const result = await tool.handler({ draftId: 'draft-1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Draft is invalid or missing required fields');
    });

    it('returns error for tooManyRecipients', async () => {
      registerEmailOperationTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('send_draft')!;

      const setupResponse = {
        methodResponses: [
          ['Identity/get', { list: [{ id: 'identity1', email: 'test@example.com' }] }, 'getIdentity'],
          ['Mailbox/get', { list: [{ id: 'sent-1', role: 'sent' }, { id: 'drafts-1', role: 'drafts' }] }, 'getMailboxes'],
        ],
      };

      const sendResponse = {
        methodResponses: [
          ['EmailSubmission/set', { notCreated: { submission: { type: 'tooManyRecipients' } } }, 'submitDraft'],
        ],
      };

      vi.mocked(mockJmapClient.request)
        .mockResolvedValueOnce(setupResponse)
        .mockResolvedValueOnce(sendResponse);

      vi.mocked(mockJmapClient.parseMethodResponse)
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'identity1', email: 'test@example.com' }] } })
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'sent-1', role: 'sent' }, { id: 'drafts-1', role: 'drafts' }] } })
        .mockReturnValueOnce({ success: true, data: { notCreated: { submission: { type: 'tooManyRecipients' } } } });

      const result = await tool.handler({ draftId: 'draft-1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Too many recipients');
    });

    it('returns error when no identity available', async () => {
      registerEmailOperationTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('send_draft')!;

      const setupResponse = {
        methodResponses: [
          ['Identity/get', { list: [] }, 'getIdentity'],
          ['Mailbox/get', { list: [{ id: 'sent-1', role: 'sent' }, { id: 'drafts-1', role: 'drafts' }] }, 'getMailboxes'],
        ],
      };

      vi.mocked(mockJmapClient.request).mockResolvedValueOnce(setupResponse);
      vi.mocked(mockJmapClient.parseMethodResponse)
        .mockReturnValueOnce({ success: true, data: { list: [] } })
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'sent-1', role: 'sent' }, { id: 'drafts-1', role: 'drafts' }] } });

      const result = await tool.handler({ draftId: 'draft-1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No sending identity available');
    });

    it('returns error when mailbox fetch fails', async () => {
      registerEmailOperationTools(mockServer, mockJmapClient, mockLogger);
      const tool = registeredTools.get('send_draft')!;

      const setupResponse = {
        methodResponses: [
          ['Identity/get', { list: [{ id: 'identity1', email: 'test@example.com' }] }, 'getIdentity'],
          ['error', { type: 'serverError' }, 'getMailboxes'],
        ],
      };

      vi.mocked(mockJmapClient.request).mockResolvedValueOnce(setupResponse);
      vi.mocked(mockJmapClient.parseMethodResponse)
        .mockReturnValueOnce({ success: true, data: { list: [{ id: 'identity1', email: 'test@example.com' }] } })
        .mockReturnValueOnce({ success: false, error: { type: 'serverError' } });

      const result = await tool.handler({ draftId: 'draft-1' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to get mailboxes');
    });
  });
});
