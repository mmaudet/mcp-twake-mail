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
    ].join('\n');
  }

  const message = error.message.toLowerCase();

  // Authentication failures
  if (message.includes('401') || message.includes('unauthorized')) {
    return [
      'Authentication failed for JMAP server.',
      '',
      'Fix: Verify your credentials are correct.',
      'If using basic auth: check JMAP_USERNAME and JMAP_PASSWORD.',
      'If using bearer: check JMAP_TOKEN is valid and not expired.',
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
