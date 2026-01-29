/**
 * Setup wizard command - interactive configuration for mcp-twake-mail.
 * Generates Claude Desktop config JSON.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

import {
  promptJmapUrl,
  promptAuthMethod,
  promptBasicAuth,
  promptBearerToken,
  promptOidcAuth,
  promptWriteConfig,
  promptServerName,
} from '../prompts/setup-wizard.js';

/**
 * Get Claude Desktop config file path based on platform.
 */
function getClaudeConfigPath(): string {
  const home = homedir();
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  } else if (process.platform === 'win32') {
    return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  }
  // Linux fallback (unofficial)
  return join(home, '.config', 'claude', 'claude_desktop_config.json');
}

/**
 * Generate Claude Desktop config for this MCP server.
 */
function generateClaudeConfig(
  serverName: string,
  env: Record<string, string>
): { mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }> } {
  return {
    mcpServers: {
      [serverName]: {
        command: 'npx',
        args: ['-y', 'mcp-twake-mail'],
        env,
      },
    },
  };
}

/**
 * Test JMAP connection with provided config.
 * Returns true if connection successful, false otherwise.
 */
async function testConnection(env: Record<string, string>): Promise<{ success: boolean; error?: string }> {
  // Dynamically import to avoid loading JMAP client in CLI context unnecessarily
  try {
    const { JMAPClient } = await import('../../jmap/client.js');
    const { createLogger } = await import('../../config/logger.js');

    // Build minimal config object for JMAPClient
    // Fixed redirect URI for OIDC - must be registered with the OIDC provider
    const OIDC_REDIRECT_URI = 'http://localhost:3000/callback';

    const config = {
      JMAP_SESSION_URL: env.JMAP_SESSION_URL,
      JMAP_AUTH_METHOD: env.JMAP_AUTH_METHOD as 'basic' | 'bearer' | 'oidc',
      JMAP_USERNAME: env.JMAP_USERNAME,
      JMAP_PASSWORD: env.JMAP_PASSWORD,
      JMAP_TOKEN: env.JMAP_BEARER_TOKEN,
      JMAP_OIDC_ISSUER: env.JMAP_OIDC_ISSUER,
      JMAP_OIDC_CLIENT_ID: env.JMAP_OIDC_CLIENT_ID,
      JMAP_OIDC_SCOPE: env.JMAP_OIDC_SCOPE || 'openid profile email offline_access',
      JMAP_OIDC_REDIRECT_URI: OIDC_REDIRECT_URI,
      JMAP_REQUEST_TIMEOUT: 30000,
      LOG_LEVEL: 'error' as const,
    };

    const logger = createLogger('error');
    const client = new JMAPClient(config, logger);

    // For OIDC, we need to run the auth flow first
    if (config.JMAP_AUTH_METHOD === 'oidc') {
      const { performOIDCFlow } = await import('../../auth/oidc-flow.js');
      console.log('\nOpening browser for authentication...');
      await performOIDCFlow({
        issuerUrl: config.JMAP_OIDC_ISSUER!,
        clientId: config.JMAP_OIDC_CLIENT_ID!,
        scope: config.JMAP_OIDC_SCOPE,
        redirectUri: config.JMAP_OIDC_REDIRECT_URI,
      });
      console.log('Authentication successful!\n');
    }

    const session = await client.fetchSession();
    console.log(`Connected! Account ID: ${session.accountId}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Run the interactive setup wizard.
 */
export async function runSetup(): Promise<void> {
  console.log('\n=== MCP Twake Mail Setup Wizard ===\n');

  // Step 1: JMAP URL
  const jmapUrl = await promptJmapUrl();

  // Step 2: Auth method
  const authMethod = await promptAuthMethod();

  // Step 3: Auth-specific prompts
  const env: Record<string, string> = {
    JMAP_SESSION_URL: jmapUrl,
    JMAP_AUTH_METHOD: authMethod,
  };

  if (authMethod === 'basic') {
    const { username, password } = await promptBasicAuth();
    env.JMAP_USERNAME = username;
    env.JMAP_PASSWORD = password;
  } else if (authMethod === 'bearer') {
    env.JMAP_BEARER_TOKEN = await promptBearerToken();
  } else if (authMethod === 'oidc') {
    const { issuer, clientId, scope } = await promptOidcAuth();
    env.JMAP_OIDC_ISSUER = issuer;
    env.JMAP_OIDC_CLIENT_ID = clientId;
    env.JMAP_OIDC_SCOPE = scope;
  }

  // Step 4: Test connection
  console.log('\nTesting connection...');
  const testResult = await testConnection(env);

  if (!testResult.success) {
    console.error(`\nConnection failed: ${testResult.error}`);
    console.error('Please check your configuration and try again.\n');
    process.exit(1);
  }

  console.log('\nConnection successful!\n');

  // Step 5: Server name for Claude config
  const serverName = await promptServerName();

  // Step 6: Generate config
  const config = generateClaudeConfig(serverName, env);
  const configJson = JSON.stringify(config, null, 2);

  console.log('\n--- Generated Claude Desktop Config ---');
  console.log(configJson);
  console.log('---------------------------------------\n');

  // Step 7: Optionally write to Claude Desktop config
  const shouldWrite = await promptWriteConfig();

  if (shouldWrite) {
    const configPath = getClaudeConfigPath();
    console.log(`\nWriting to: ${configPath}`);

    try {
      // Read existing config if it exists
      let existingConfig: Record<string, unknown> = {};
      try {
        const existingContent = await readFile(configPath, 'utf-8');
        existingConfig = JSON.parse(existingContent);
      } catch {
        // File doesn't exist or is invalid, start fresh
      }

      // Merge mcpServers
      const mergedConfig = {
        ...existingConfig,
        mcpServers: {
          ...(existingConfig.mcpServers as Record<string, unknown> || {}),
          ...config.mcpServers,
        },
      };

      // Ensure directory exists
      await mkdir(join(configPath, '..'), { recursive: true });

      // Write merged config
      await writeFile(configPath, JSON.stringify(mergedConfig, null, 2), 'utf-8');
      console.log('Config written successfully!');
      console.log('\nRestart Claude Desktop to load the new configuration.\n');
    } catch (error) {
      console.error(`Failed to write config: ${error instanceof Error ? error.message : String(error)}`);
      console.error('\nYou can manually add the config above to your Claude Desktop configuration.\n');
      process.exit(1);
    }
  } else {
    console.log('\nTo use this configuration, add it to your Claude Desktop config file:');
    console.log(`  ${getClaudeConfigPath()}\n`);
  }
}
