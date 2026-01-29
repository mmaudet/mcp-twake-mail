/**
 * Interactive prompts for setup wizard.
 * Uses @inquirer/prompts for modern, TypeScript-first prompts.
 */
import { input, select, password, confirm } from '@inquirer/prompts';

/** Auth method choices for the wizard */
export type AuthMethod = 'oidc' | 'basic' | 'bearer';

/**
 * Prompt for JMAP session URL with validation.
 */
export async function promptJmapUrl(): Promise<string> {
  return input({
    message: 'JMAP Session URL:',
    default: 'https://jmap.linagora.com/jmap/session',
    validate: (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return 'Please enter a valid URL';
      }
    },
  });
}

/**
 * Prompt for authentication method selection.
 */
export async function promptAuthMethod(): Promise<AuthMethod> {
  return select({
    message: 'Authentication method:',
    choices: [
      { value: 'oidc' as const, name: 'OIDC (recommended for Twake Mail)' },
      { value: 'basic' as const, name: 'Basic Auth (username/password)' },
      { value: 'bearer' as const, name: 'Bearer Token' },
    ],
  });
}

/**
 * Prompt for Basic auth credentials.
 */
export async function promptBasicAuth(): Promise<{ username: string; password: string }> {
  const username = await input({
    message: 'Username (email):',
    validate: (value) => value.length > 0 || 'Username is required',
  });

  const pwd = await password({
    message: 'Password:',
    mask: '*',
  });

  return { username, password: pwd };
}

/**
 * Prompt for Bearer token.
 */
export async function promptBearerToken(): Promise<string> {
  return password({
    message: 'Bearer token:',
    mask: '*',
    validate: (value) => value.length > 0 || 'Token is required',
  });
}

/**
 * Prompt for OIDC configuration.
 */
export async function promptOidcAuth(): Promise<{
  issuer: string;
  clientId: string;
  scope: string;
  redirectUri: string;
  callbackPort: number;
}> {
  const issuer = await input({
    message: 'OIDC Issuer URL:',
    default: 'https://sso.linagora.com',
    validate: (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return 'Please enter a valid URL';
      }
    },
  });

  const clientId = await input({
    message: 'OAuth Client ID:',
    default: 'twake-mail',
    validate: (value) => value.length > 0 || 'Client ID is required',
  });

  const scope = await input({
    message: 'OAuth Scopes:',
    default: 'openid profile email offline_access',
  });

  const redirectUri = await input({
    message: 'OAuth Redirect URI (registered with OIDC provider):',
    default: 'http://localhost:3000/callback',
    validate: (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        return 'Please enter a valid URL';
      }
    },
  });

  // Extract port from redirect URI if localhost, otherwise ask for local callback port
  let defaultPort = 3000;
  try {
    const url = new URL(redirectUri);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      defaultPort = parseInt(url.port, 10) || 3000;
    }
  } catch {
    // Use default
  }

  const callbackPortStr = await input({
    message: 'Local callback port (for ngrok/tunnels, this is the local port):',
    default: String(defaultPort),
    validate: (value) => {
      const port = parseInt(value, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        return 'Please enter a valid port number (1-65535)';
      }
      return true;
    },
  });

  return { issuer, clientId, scope, redirectUri, callbackPort: parseInt(callbackPortStr, 10) };
}

/**
 * Prompt to confirm writing config to file.
 */
export async function promptWriteConfig(): Promise<boolean> {
  return confirm({
    message: 'Write config to Claude Desktop config file?',
    default: true,
  });
}

/**
 * Prompt for custom server name in Claude config.
 */
export async function promptServerName(): Promise<string> {
  return input({
    message: 'Server name in Claude Desktop:',
    default: 'twake-mail',
    validate: (value) => /^[a-z0-9-]+$/.test(value) || 'Use lowercase letters, numbers, and hyphens only',
  });
}
