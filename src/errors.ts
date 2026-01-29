import { ZodError } from 'zod';

export class JMAPError extends Error {
  type: string;
  fix: string;

  constructor(message: string, type: string, fix: string) {
    super(message);
    this.name = 'JMAPError';
    this.type = type;
    this.fix = fix;
  }

  /**
   * Create a JMAPError for HTTP-level errors (4xx, 5xx responses)
   */
  static httpError(status: number, statusText: string): JMAPError {
    const message = `HTTP ${status}: ${statusText}`;

    if (status === 401) {
      return new JMAPError(
        message,
        'unauthorized',
        'Check your credentials. For basic auth: verify JMAP_USERNAME and JMAP_PASSWORD. For bearer: verify JMAP_TOKEN is valid.'
      );
    }

    if (status === 403) {
      return new JMAPError(
        message,
        'forbidden',
        'You do not have permission to access this resource. Check your account permissions.'
      );
    }

    if (status === 404) {
      return new JMAPError(
        message,
        'notFound',
        'The JMAP endpoint was not found. Verify JMAP_SESSION_URL is correct.'
      );
    }

    if (status >= 500) {
      return new JMAPError(
        message,
        'serverError',
        'The JMAP server encountered an error. Try again later or contact the server administrator.'
      );
    }

    return new JMAPError(
      message,
      'httpError',
      'An HTTP error occurred. Check the server URL and try again.'
    );
  }

  /**
   * Create a JMAPError for JMAP method-level errors
   */
  static methodError(type: string, description?: string): JMAPError {
    const message = description || `JMAP method error: ${type}`;

    const fixes: Record<string, string> = {
      stateMismatch: 'The state is stale. Refetch the data and try again.',
      cannotCalculateChanges: 'State is too old. Perform a full sync instead of incremental.',
      notFound: 'The requested item was not found. It may have been deleted.',
      forbidden: 'You do not have permission for this operation.',
      accountNotFound: 'The account ID is invalid. Refetch the session.',
      noMailAccount: 'The server does not have a mail account. Check the JMAP server configuration.',
      unknownCapability: 'The server does not support the requested capability.',
      invalidArguments: 'The request arguments are invalid. Check the request parameters.',
    };

    const fix = fixes[type] || 'A JMAP error occurred. Check the error details and try again.';

    return new JMAPError(message, type, fix);
  }

  /**
   * Create a JMAPError for timeout errors
   */
  static timeout(operation: string): JMAPError {
    return new JMAPError(
      `${operation} timed out`,
      'timeout',
      'The operation took too long. Check your network connection and try again. If the issue persists, increase JMAP_REQUEST_TIMEOUT.'
    );
  }

  /**
   * Create a JMAPError for expired access token
   */
  static tokenExpired(refreshAvailable: boolean): JMAPError {
    if (refreshAvailable) {
      return new JMAPError(
        'Access token expired. Will attempt automatic refresh.',
        'tokenExpired',
        'The access token has expired. Automatic refresh will be attempted.'
      );
    }
    return new JMAPError(
      'Access token expired and no refresh token available. Re-authenticate using: npx mcp-twake-mail auth',
      'tokenExpired',
      'Your session has expired. Re-authenticate using: npx mcp-twake-mail auth'
    );
  }

  /**
   * Create a JMAPError for failed token refresh
   */
  static refreshFailed(reason?: string): JMAPError {
    const message = reason ? `Token refresh failed: ${reason}` : 'Token refresh failed';
    return new JMAPError(
      message,
      'refreshFailed',
      'Your session has expired. Re-authenticate using: npx mcp-twake-mail auth'
    );
  }

  /**
   * Create a JMAPError for OIDC flow errors
   */
  static oidcFlowError(stage: string, details?: string): JMAPError {
    const message = details
      ? `OIDC authentication failed at ${stage}: ${details}`
      : `OIDC authentication failed at ${stage}`;
    return new JMAPError(
      message,
      'oidcError',
      'Check your OIDC provider configuration. Verify JMAP_OIDC_ISSUER is correct and the provider supports PKCE.'
    );
  }

  /**
   * Create a JMAPError for missing stored tokens
   */
  static noStoredTokens(): JMAPError {
    return new JMAPError(
      'No stored authentication tokens found',
      'noStoredTokens',
      'Authenticate first using: npx mcp-twake-mail auth'
    );
  }
}

export function formatStartupError(error: Error, sessionUrl?: string): string {
  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const issues = error.issues.map((issue) => {
      const field = issue.path.join('.');
      return `  ${field}: ${issue.message}`;
    });
    return [
      'Configuration validation failed:',
      ...issues,
      '',
      'Fix: Check your environment variables.',
      'For basic auth: JMAP_SESSION_URL, JMAP_USERNAME, JMAP_PASSWORD',
      'For bearer auth: JMAP_SESSION_URL, JMAP_AUTH_METHOD=bearer, JMAP_TOKEN',
      'For OIDC auth: JMAP_SESSION_URL, JMAP_AUTH_METHOD=oidc, JMAP_OIDC_ISSUER, JMAP_OIDC_CLIENT_ID',
    ].join('\n');
  }

  const message = error.message.toLowerCase();

  // Token expiration errors
  if (message.includes('token') && message.includes('expired')) {
    return [
      'Authentication token has expired.',
      '',
      'Fix: Re-authenticate using: npx mcp-twake-mail auth',
    ].join('\n');
  }

  // OIDC/OAuth errors
  if (message.includes('oidc') || message.includes('oauth')) {
    return [
      'OIDC authentication error.',
      '',
      'Fix: Check your OIDC configuration:',
      '- Verify JMAP_OIDC_ISSUER is correct and accessible',
      '- Verify JMAP_OIDC_CLIENT_ID is valid',
      '- Ensure the OIDC provider supports PKCE',
      '',
      'Try re-authenticating: npx mcp-twake-mail auth',
    ].join('\n');
  }

  // Authentication failures
  if (message.includes('401') || message.includes('unauthorized')) {
    return [
      'Authentication failed for JMAP server.',
      '',
      'Fix: Verify your credentials are correct.',
      'If using basic auth: check JMAP_USERNAME and JMAP_PASSWORD.',
      'If using bearer: check JMAP_TOKEN is valid and not expired.',
      'If using OIDC: try re-authenticating with npx mcp-twake-mail auth',
    ].join('\n');
  }

  // Timeout errors
  if (message.includes('timeout')) {
    const urlContext = sessionUrl ? ` ${sessionUrl}` : '';
    return [
      `Connection to${urlContext} timed out.`,
      '',
      'Fix: Check the JMAP server is running and accessible.',
      'Try accessing the session URL in a browser to verify it responds.',
    ].join('\n');
  }

  // Fallback
  return [
    `Unexpected error: ${error.message}`,
    '',
    'Fix: Check your configuration and try again.',
    'Verify JMAP_SESSION_URL and authentication settings.',
  ].join('\n');
}
