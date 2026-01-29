/**
 * Tests for JMAPError class and formatStartupError function.
 */
import { describe, it, expect } from 'vitest';
import { JMAPError, formatStartupError } from './errors.js';
import { z } from 'zod';

describe('JMAPError', () => {
  describe('constructor', () => {
    it('creates error with message, type, and fix', () => {
      const error = new JMAPError('Test error', 'testType', 'Fix: do something');

      expect(error.message).toBe('Test error');
      expect(error.name).toBe('JMAPError');
      expect(error.type).toBe('testType');
      expect(error.fix).toBe('Fix: do something');
    });
  });

  describe('httpError', () => {
    it('creates 401 unauthorized error', () => {
      const error = JMAPError.httpError(401, 'Unauthorized');

      expect(error.message).toBe('HTTP 401: Unauthorized');
      expect(error.type).toBe('unauthorized');
      expect(error.fix).toContain('credentials');
    });

    it('creates 403 forbidden error', () => {
      const error = JMAPError.httpError(403, 'Forbidden');

      expect(error.message).toBe('HTTP 403: Forbidden');
      expect(error.type).toBe('forbidden');
      expect(error.fix).toContain('permission');
    });

    it('creates 404 not found error', () => {
      const error = JMAPError.httpError(404, 'Not Found');

      expect(error.message).toBe('HTTP 404: Not Found');
      expect(error.type).toBe('notFound');
      expect(error.fix).toContain('JMAP_SESSION_URL');
    });

    it('creates server error for 5xx status', () => {
      const error = JMAPError.httpError(500, 'Internal Server Error');

      expect(error.message).toBe('HTTP 500: Internal Server Error');
      expect(error.type).toBe('serverError');
      expect(error.fix).toContain('server');
    });

    it('creates generic http error for other status codes', () => {
      const error = JMAPError.httpError(418, "I'm a teapot");

      expect(error.message).toBe("HTTP 418: I'm a teapot");
      expect(error.type).toBe('httpError');
      expect(error.fix).toContain('HTTP error');
    });
  });

  describe('methodError', () => {
    it('creates error with description', () => {
      const error = JMAPError.methodError('notFound', 'Email not found');

      expect(error.message).toBe('Email not found');
      expect(error.type).toBe('notFound');
      expect(error.fix).toContain('not found');
    });

    it('creates error without description', () => {
      const error = JMAPError.methodError('forbidden');

      expect(error.message).toBe('JMAP method error: forbidden');
      expect(error.type).toBe('forbidden');
      expect(error.fix).toContain('permission');
    });

    it('handles stateMismatch error type', () => {
      const error = JMAPError.methodError('stateMismatch');

      expect(error.type).toBe('stateMismatch');
      expect(error.fix).toContain('Refetch');
    });

    it('handles cannotCalculateChanges error type', () => {
      const error = JMAPError.methodError('cannotCalculateChanges');

      expect(error.type).toBe('cannotCalculateChanges');
      expect(error.fix).toContain('full sync');
    });

    it('handles accountNotFound error type', () => {
      const error = JMAPError.methodError('accountNotFound');

      expect(error.type).toBe('accountNotFound');
      expect(error.fix).toContain('Refetch the session');
    });

    it('handles unknownCapability error type', () => {
      const error = JMAPError.methodError('unknownCapability');

      expect(error.type).toBe('unknownCapability');
      expect(error.fix).toContain('capability');
    });

    it('handles invalidArguments error type', () => {
      const error = JMAPError.methodError('invalidArguments');

      expect(error.type).toBe('invalidArguments');
      expect(error.fix).toContain('arguments');
    });

    it('handles noMailAccount error type', () => {
      const error = JMAPError.methodError('noMailAccount');

      expect(error.type).toBe('noMailAccount');
      expect(error.fix).toContain('mail account');
    });

    it('handles unknown error types with generic fix', () => {
      const error = JMAPError.methodError('unknownType');

      expect(error.type).toBe('unknownType');
      expect(error.fix).toContain('JMAP error');
    });
  });

  describe('timeout', () => {
    it('creates timeout error with operation name', () => {
      const error = JMAPError.timeout('fetchSession');

      expect(error.message).toBe('fetchSession timed out');
      expect(error.type).toBe('timeout');
      expect(error.fix).toContain('JMAP_REQUEST_TIMEOUT');
    });
  });

  describe('tokenExpired', () => {
    it('creates error with refresh available', () => {
      const error = JMAPError.tokenExpired(true);

      expect(error.message).toContain('automatic refresh');
      expect(error.type).toBe('tokenExpired');
      expect(error.fix).toContain('Automatic');
    });

    it('creates error without refresh available', () => {
      const error = JMAPError.tokenExpired(false);

      expect(error.message).toContain('Re-authenticate');
      expect(error.type).toBe('tokenExpired');
      expect(error.fix).toContain('Re-authenticate');
    });
  });

  describe('refreshFailed', () => {
    it('creates error with reason', () => {
      const error = JMAPError.refreshFailed('Invalid refresh token');

      expect(error.message).toBe('Token refresh failed: Invalid refresh token');
      expect(error.type).toBe('refreshFailed');
      expect(error.fix).toContain('Re-authenticate');
    });

    it('creates error without reason', () => {
      const error = JMAPError.refreshFailed();

      expect(error.message).toBe('Token refresh failed');
      expect(error.type).toBe('refreshFailed');
    });
  });

  describe('oidcFlowError', () => {
    it('creates error with details', () => {
      const error = JMAPError.oidcFlowError('discovery', 'Issuer not found');

      expect(error.message).toBe('OIDC authentication failed at discovery: Issuer not found');
      expect(error.type).toBe('oidcError');
      expect(error.fix).toContain('OIDC');
    });

    it('creates error without details', () => {
      const error = JMAPError.oidcFlowError('token_exchange');

      expect(error.message).toBe('OIDC authentication failed at token_exchange');
      expect(error.type).toBe('oidcError');
    });
  });

  describe('noStoredTokens', () => {
    it('creates error for missing tokens', () => {
      const error = JMAPError.noStoredTokens();

      expect(error.message).toContain('No stored');
      expect(error.type).toBe('noStoredTokens');
      expect(error.fix).toContain('npx mcp-twake-mail auth');
    });
  });
});

describe('formatStartupError', () => {
  describe('Zod validation errors', () => {
    it('formats ZodError with field details', () => {
      const schema = z.object({
        JMAP_SESSION_URL: z.string().url(),
        JMAP_USERNAME: z.string().min(1),
      });

      try {
        schema.parse({ JMAP_SESSION_URL: 'invalid', JMAP_USERNAME: '' });
      } catch (error) {
        const formatted = formatStartupError(error as Error);

        expect(formatted).toContain('Configuration validation failed');
        expect(formatted).toContain('JMAP_SESSION_URL');
        expect(formatted).toContain('JMAP_USERNAME');
        expect(formatted).toContain('environment variables');
      }
    });
  });

  describe('token expiration errors', () => {
    it('formats token expired error', () => {
      const error = new Error('Access token has expired');
      const formatted = formatStartupError(error);

      expect(formatted).toContain('Authentication token has expired');
      expect(formatted).toContain('npx mcp-twake-mail auth');
    });
  });

  describe('OIDC/OAuth errors', () => {
    it('formats OIDC error', () => {
      const error = new Error('OIDC discovery failed');
      const formatted = formatStartupError(error);

      expect(formatted).toContain('OIDC authentication error');
      expect(formatted).toContain('JMAP_OIDC_ISSUER');
      expect(formatted).toContain('JMAP_OIDC_CLIENT_ID');
    });

    it('formats OAuth error', () => {
      const error = new Error('OAuth token exchange failed');
      const formatted = formatStartupError(error);

      expect(formatted).toContain('OIDC authentication error');
    });
  });

  describe('authentication failures', () => {
    it('formats 401 error', () => {
      const error = new Error('HTTP 401 Unauthorized');
      const formatted = formatStartupError(error);

      expect(formatted).toContain('Authentication failed');
      expect(formatted).toContain('JMAP_USERNAME');
      expect(formatted).toContain('JMAP_PASSWORD');
    });

    it('formats unauthorized error', () => {
      const error = new Error('Request unauthorized');
      const formatted = formatStartupError(error);

      expect(formatted).toContain('Authentication failed');
    });
  });

  describe('timeout errors', () => {
    it('formats timeout error', () => {
      const error = new Error('Connection timeout');
      const formatted = formatStartupError(error, 'https://jmap.example.com/.well-known/jmap');

      expect(formatted).toContain('timed out');
      expect(formatted).toContain('https://jmap.example.com/.well-known/jmap');
    });

    it('formats timeout error without URL', () => {
      const error = new Error('Request timeout');
      const formatted = formatStartupError(error);

      expect(formatted).toContain('timed out');
      expect(formatted).toContain('JMAP server');
    });
  });

  describe('fallback errors', () => {
    it('formats unknown errors with generic message', () => {
      const error = new Error('Something went wrong');
      const formatted = formatStartupError(error);

      expect(formatted).toContain('Unexpected error');
      expect(formatted).toContain('Something went wrong');
      expect(formatted).toContain('configuration');
    });
  });
});
