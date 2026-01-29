import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import createFetchMock from 'vitest-fetch-mock';
import { JMAPClient } from '../../src/jmap/client.js';
import { JMAPError } from '../../src/errors.js';
import type { Config } from '../../src/config/schema.js';
import type { Logger } from '../../src/config/logger.js';

// Setup fetch mock
const fetchMocker = createFetchMock(vi);

// Mock config
const mockConfig: Config = {
  JMAP_SESSION_URL: 'https://jmap.example.com/session',
  JMAP_AUTH_METHOD: 'basic',
  JMAP_USERNAME: 'testuser',
  JMAP_PASSWORD: 'testpass',
  JMAP_TOKEN: undefined,
  JMAP_REQUEST_TIMEOUT: 30000,
  LOG_LEVEL: 'info',
};

// Mock logger
const mockLogger: Logger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
  child: vi.fn().mockReturnThis(),
  level: 'info',
} as unknown as Logger;

// Valid session response
const validSessionResponse = {
  capabilities: {
    'urn:ietf:params:jmap:core': {},
    'urn:ietf:params:jmap:mail': {},
  },
  accounts: {
    'account-123': {
      name: 'Test User',
      isPersonal: true,
      accountCapabilities: {},
    },
  },
  primaryAccounts: {
    'urn:ietf:params:jmap:mail': 'account-123',
  },
  apiUrl: 'https://jmap.example.com/api',
  state: 'session-state-1',
};

describe('JMAPClient', () => {
  beforeEach(() => {
    fetchMocker.enableMocks();
    fetchMocker.resetMocks();
    vi.clearAllMocks();
  });

  afterEach(() => {
    fetchMocker.disableMocks();
  });

  describe('fetchSession', () => {
    it('should fetch and parse session correctly', async () => {
      fetchMocker.mockResponseOnce(JSON.stringify(validSessionResponse));

      const client = new JMAPClient(mockConfig, mockLogger);
      const session = await client.fetchSession();

      expect(session.apiUrl).toBe('https://jmap.example.com/api');
      expect(session.accountId).toBe('account-123');
      expect(session.state).toBe('session-state-1');
      expect(session.capabilities).toHaveProperty('urn:ietf:params:jmap:core');

      // Verify fetch was called with correct params
      expect(fetchMocker).toHaveBeenCalledOnce();
      const [url, options] = fetchMocker.mock.calls[0];
      expect(url).toBe('https://jmap.example.com/session');
      expect(options?.method).toBe('GET');
      expect(options?.headers).toHaveProperty('Authorization');
    });

    it('should throw JMAPError when no mail account found', async () => {
      const noMailSession = {
        ...validSessionResponse,
        primaryAccounts: {}, // No mail account
      };
      fetchMocker.mockResponseOnce(JSON.stringify(noMailSession));

      const client = new JMAPClient(mockConfig, mockLogger);

      try {
        await client.fetchSession();
        expect.fail('Expected JMAPError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JMAPError);
        expect((error as JMAPError).type).toBe('noMailAccount');
      }
    });

    it('should throw JMAPError on HTTP 401', async () => {
      fetchMocker.mockResponseOnce('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      const client = new JMAPClient(mockConfig, mockLogger);

      try {
        await client.fetchSession();
        expect.fail('Expected JMAPError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JMAPError);
        expect((error as JMAPError).type).toBe('unauthorized');
      }
    });

    it('should throw JMAPError on HTTP 500', async () => {
      fetchMocker.mockResponseOnce('Server Error', { status: 500, statusText: 'Internal Server Error' });

      const client = new JMAPClient(mockConfig, mockLogger);

      try {
        await client.fetchSession();
        expect.fail('Expected JMAPError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(JMAPError);
        expect((error as JMAPError).type).toBe('serverError');
      }
    });

    it('should use Basic auth header for basic auth method', async () => {
      fetchMocker.mockResponseOnce(JSON.stringify(validSessionResponse));

      const client = new JMAPClient(mockConfig, mockLogger);
      await client.fetchSession();

      const [, options] = fetchMocker.mock.calls[0];
      const expectedToken = Buffer.from('testuser:testpass').toString('base64');
      expect(options?.headers?.['Authorization']).toBe(`Basic ${expectedToken}`);
    });

    it('should use Bearer auth header for bearer auth method', async () => {
      const bearerConfig: Config = {
        ...mockConfig,
        JMAP_AUTH_METHOD: 'bearer',
        JMAP_TOKEN: 'test-bearer-token',
      };
      fetchMocker.mockResponseOnce(JSON.stringify(validSessionResponse));

      const client = new JMAPClient(bearerConfig, mockLogger);
      await client.fetchSession();

      const [, options] = fetchMocker.mock.calls[0];
      expect(options?.headers?.['Authorization']).toBe('Bearer test-bearer-token');
    });
  });

  describe('getSession', () => {
    it('should throw error if session not initialized', () => {
      const client = new JMAPClient(mockConfig, mockLogger);

      expect(() => client.getSession()).toThrow(JMAPError);
      expect(() => client.getSession()).toThrow('Session not initialized');
    });

    it('should return session after fetchSession', async () => {
      fetchMocker.mockResponseOnce(JSON.stringify(validSessionResponse));

      const client = new JMAPClient(mockConfig, mockLogger);
      await client.fetchSession();
      const session = client.getSession();

      expect(session.accountId).toBe('account-123');
    });
  });

  describe('request', () => {
    beforeEach(async () => {
      fetchMocker.mockResponseOnce(JSON.stringify(validSessionResponse));
    });

    it('should send batched request with multiple methodCalls', async () => {
      const client = new JMAPClient(mockConfig, mockLogger);
      await client.fetchSession();

      const batchedResponse = {
        methodResponses: [
          ['Email/get', { accountId: 'account-123', list: [], state: 'email-state-1' }, 'c1'],
          ['Mailbox/get', { accountId: 'account-123', list: [], state: 'mailbox-state-1' }, 'c2'],
        ],
        sessionState: 'session-state-1',
      };
      fetchMocker.mockResponseOnce(JSON.stringify(batchedResponse));

      const response = await client.request([
        ['Email/get', { accountId: 'account-123', ids: null }, 'c1'],
        ['Mailbox/get', { accountId: 'account-123', ids: null }, 'c2'],
      ]);

      expect(response.methodResponses).toHaveLength(2);
      expect(response.methodResponses[0][0]).toBe('Email/get');
      expect(response.methodResponses[1][0]).toBe('Mailbox/get');

      // Verify single HTTP call with both methods
      expect(fetchMocker).toHaveBeenCalledTimes(2); // 1 session + 1 request
      const [, options] = fetchMocker.mock.calls[1];
      const requestBody = JSON.parse(options?.body as string);
      expect(requestBody.methodCalls).toHaveLength(2);
    });

    it('should use default capabilities if not provided', async () => {
      const client = new JMAPClient(mockConfig, mockLogger);
      await client.fetchSession();

      const response = {
        methodResponses: [['Email/get', { list: [] }, 'c1']],
      };
      fetchMocker.mockResponseOnce(JSON.stringify(response));

      await client.request([['Email/get', { accountId: 'account-123' }, 'c1']]);

      const [, options] = fetchMocker.mock.calls[1];
      const requestBody = JSON.parse(options?.body as string);
      expect(requestBody.using).toContain('urn:ietf:params:jmap:core');
      expect(requestBody.using).toContain('urn:ietf:params:jmap:mail');
    });

    it('should throw error if session not initialized', async () => {
      const client = new JMAPClient(mockConfig, mockLogger);

      await expect(
        client.request([['Email/get', {}, 'c1']])
      ).rejects.toThrow('Session not initialized');
    });

    it('should throw JMAPError on HTTP error during request', async () => {
      const client = new JMAPClient(mockConfig, mockLogger);
      await client.fetchSession();

      fetchMocker.mockResponseOnce('Forbidden', { status: 403, statusText: 'Forbidden' });

      await expect(
        client.request([['Email/get', {}, 'c1']])
      ).rejects.toMatchObject({
        type: 'forbidden',
      });
    });

    it('should warn when session state changes', async () => {
      const client = new JMAPClient(mockConfig, mockLogger);
      await client.fetchSession();

      const response = {
        methodResponses: [['Email/get', { list: [] }, 'c1']],
        sessionState: 'session-state-2', // Changed state
      };
      fetchMocker.mockResponseOnce(JSON.stringify(response));

      await client.request([['Email/get', {}, 'c1']]);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ oldState: 'session-state-1', newState: 'session-state-2' }),
        expect.any(String)
      );
    });
  });

  describe('parseMethodResponse', () => {
    it('should parse successful response', async () => {
      fetchMocker.mockResponseOnce(JSON.stringify(validSessionResponse));
      const client = new JMAPClient(mockConfig, mockLogger);
      await client.fetchSession();

      const result = client.parseMethodResponse([
        'Email/get',
        { accountId: 'account-123', list: [{ id: 'email-1' }], state: 'state-1' },
        'c1',
      ]);

      expect(result.success).toBe(true);
      expect(result.data?.list).toEqual([{ id: 'email-1' }]);
    });

    it('should parse error response', async () => {
      fetchMocker.mockResponseOnce(JSON.stringify(validSessionResponse));
      const client = new JMAPClient(mockConfig, mockLogger);
      await client.fetchSession();

      const result = client.parseMethodResponse([
        'error',
        { type: 'stateMismatch', description: 'State is stale' },
        'c1',
      ]);

      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('stateMismatch');
      expect(result.error?.description).toBe('State is stale');
    });
  });

  describe('state tracking', () => {
    beforeEach(async () => {
      fetchMocker.mockResponseOnce(JSON.stringify(validSessionResponse));
    });

    it('should track state from response', async () => {
      const client = new JMAPClient(mockConfig, mockLogger);
      await client.fetchSession();

      const response = {
        methodResponses: [
          ['Email/get', { list: [], state: 'email-state-1' }, 'c1'],
        ],
      };
      fetchMocker.mockResponseOnce(JSON.stringify(response));

      await client.request([['Email/get', {}, 'c1']]);

      expect(client.getState('Email')).toBe('email-state-1');
    });

    it('should track newState from response', async () => {
      const client = new JMAPClient(mockConfig, mockLogger);
      await client.fetchSession();

      const response = {
        methodResponses: [
          ['Email/set', { newState: 'email-state-2' }, 'c1'],
        ],
      };
      fetchMocker.mockResponseOnce(JSON.stringify(response));

      await client.request([['Email/set', {}, 'c1']]);

      expect(client.getState('Email')).toBe('email-state-2');
    });

    it('should return undefined for untracked state', async () => {
      fetchMocker.mockResponseOnce(JSON.stringify(validSessionResponse));
      const client = new JMAPClient(mockConfig, mockLogger);
      await client.fetchSession();

      expect(client.getState('Thread')).toBeUndefined();
    });

    it('should clear specific state', async () => {
      const client = new JMAPClient(mockConfig, mockLogger);
      await client.fetchSession();

      client.updateState('Email', 'state-1');
      client.updateState('Mailbox', 'state-2');
      client.clearState('Email');

      expect(client.getState('Email')).toBeUndefined();
      expect(client.getState('Mailbox')).toBe('state-2');
    });

    it('should clear all state', async () => {
      const client = new JMAPClient(mockConfig, mockLogger);
      await client.fetchSession();

      client.updateState('Email', 'state-1');
      client.updateState('Mailbox', 'state-2');
      client.clearState();

      expect(client.getState('Email')).toBeUndefined();
      expect(client.getState('Mailbox')).toBeUndefined();
    });
  });
});

describe('JMAPError', () => {
  describe('httpError', () => {
    it('should create unauthorized error for 401', () => {
      const error = JMAPError.httpError(401, 'Unauthorized');
      expect(error.type).toBe('unauthorized');
      expect(error.message).toBe('HTTP 401: Unauthorized');
    });

    it('should create forbidden error for 403', () => {
      const error = JMAPError.httpError(403, 'Forbidden');
      expect(error.type).toBe('forbidden');
    });

    it('should create notFound error for 404', () => {
      const error = JMAPError.httpError(404, 'Not Found');
      expect(error.type).toBe('notFound');
    });

    it('should create serverError for 5xx', () => {
      const error = JMAPError.httpError(500, 'Internal Server Error');
      expect(error.type).toBe('serverError');
    });
  });

  describe('methodError', () => {
    it('should create error with known type', () => {
      const error = JMAPError.methodError('stateMismatch', 'State is stale');
      expect(error.type).toBe('stateMismatch');
      expect(error.message).toBe('State is stale');
      expect(error.fix).toContain('Refetch');
    });

    it('should create error with unknown type', () => {
      const error = JMAPError.methodError('unknownType');
      expect(error.type).toBe('unknownType');
      expect(error.fix).toContain('JMAP error occurred');
    });
  });

  describe('timeout', () => {
    it('should create timeout error', () => {
      const error = JMAPError.timeout('JMAP request');
      expect(error.type).toBe('timeout');
      expect(error.message).toBe('JMAP request timed out');
      expect(error.fix).toContain('JMAP_REQUEST_TIMEOUT');
    });
  });
});
