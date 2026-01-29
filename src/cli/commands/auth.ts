/**
 * Auth command - re-run OIDC authentication flow.
 * Useful when tokens have expired or been revoked.
 */
import { loadConfig } from '../../config/schema.js';
import { performOIDCFlow, getOIDCOptionsFromConfig } from '../../auth/oidc-flow.js';

/**
 * Run OIDC authentication flow using current environment config.
 * Requires JMAP_AUTH_METHOD=oidc and OIDC env vars to be set.
 */
export async function runAuth(): Promise<void> {
  console.log('\n=== MCP Twake Mail - Re-authenticate ===\n');

  // Load config from environment
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error('Configuration error:', error instanceof Error ? error.message : String(error));
    console.error('\nMake sure environment variables are set. Run `mcp-twake-mail setup` to configure.');
    process.exit(1);
  }

  // Check if OIDC is configured
  const oidcOptions = getOIDCOptionsFromConfig(config);
  if (!oidcOptions) {
    console.error('OIDC is not configured.');
    console.error('\nThis command only works when JMAP_AUTH_METHOD=oidc');
    console.error('For basic or bearer auth, credentials are read from environment variables.');
    process.exit(1);
  }

  console.log(`Issuer: ${oidcOptions.issuerUrl}`);
  console.log(`Client ID: ${oidcOptions.clientId}`);
  console.log(`Scopes: ${oidcOptions.scope}`);
  console.log('\nOpening browser for authentication...\n');

  try {
    const tokens = await performOIDCFlow(oidcOptions);
    console.log('\nAuthentication successful!');
    console.log(`Access token stored (expires: ${tokens.expiresAt ? new Date(tokens.expiresAt * 1000).toISOString() : 'unknown'})`);
    if (tokens.refreshToken) {
      console.log('Refresh token stored for automatic renewal.');
    }
    console.log('\nYou can now use mcp-twake-mail.\n');
  } catch (error) {
    console.error('\nAuthentication failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
