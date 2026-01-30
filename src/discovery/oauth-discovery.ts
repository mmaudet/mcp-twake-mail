/**
 * OAuth/OIDC discovery from JMAP resource server
 * Implements RFC 9728 Protected Resource Metadata discovery
 */

import type { OidcDiscoveryResult } from './types.js';

/**
 * Parse WWW-Authenticate header to extract OAuth metadata.
 * Supports Bearer scheme with realm, scope, and issuer parameters.
 *
 * Example header:
 * Bearer realm="example", scope="openid email", issuer="https://auth.example.com"
 *
 * @param header WWW-Authenticate header value
 * @returns Parsed metadata or null if not Bearer auth
 */
export function parseWwwAuthenticate(
  header: string
): { issuer?: string; realm?: string; scope?: string } | null {
  // Check if header starts with "Bearer " (case-insensitive)
  if (!header.match(/^Bearer\s+/i)) {
    return null;
  }

  // Extract the part after "Bearer "
  const params = header.replace(/^Bearer\s+/i, '');

  // Parse key="value" pairs using regex
  const paramRegex = /(\w+)="([^"]+)"/g;
  const result: { issuer?: string; realm?: string; scope?: string } = {};

  let match;
  while ((match = paramRegex.exec(params)) !== null) {
    const [, key, value] = match;
    if (key === 'issuer' || key === 'realm' || key === 'scope') {
      result[key] = value;
    }
  }

  // Return null if no metadata found
  if (Object.keys(result).length === 0) {
    return null;
  }

  return result;
}

/**
 * Try common SSO subdomain patterns for OIDC discovery.
 * Many organizations use predictable subdomain patterns for their SSO.
 *
 * @param domain The base domain to check
 * @param timeout Request timeout in ms
 * @returns OidcDiscoveryResult or null if no valid OIDC endpoint found
 */
async function tryCommonSsoPatterns(
  domain: string,
  timeout: number
): Promise<OidcDiscoveryResult | null> {
  // Extract base domain (remove subdomain like 'jmap.' or 'mail.')
  const parts = domain.split('.');
  const baseDomain = parts.length > 2 ? parts.slice(-2).join('.') : domain;

  // Common SSO subdomain patterns
  const ssoPatterns = ['sso', 'auth', 'login', 'id', 'accounts'];

  for (const pattern of ssoPatterns) {
    const issuerUrl = `https://${pattern}.${baseDomain}`;
    const discoveryUrl = `${issuerUrl}/.well-known/openid-configuration`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(discoveryUrl, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const config = await response.json();
        // Verify it's a valid OIDC config with issuer field
        if (config.issuer) {
          return {
            issuer: config.issuer,
            method: 'well-known-oidc',
          };
        }
      }
    } catch {
      // This pattern didn't work, try next
    }
  }

  return null;
}

/**
 * Discover OAuth authorization server from JMAP resource URL.
 * Implements RFC 9728 Protected Resource Metadata discovery with fallbacks.
 *
 * Discovery order:
 * 1. Try /.well-known/oauth-protected-resource at resource origin
 * 2. If that fails, try fetching JMAP URL to trigger 401 with WWW-Authenticate
 * 3. If that fails, try common SSO subdomain patterns (sso., auth., login.)
 *
 * @param jmapUrl The JMAP session or API URL
 * @param timeout Request timeout in ms (default 10000)
 * @returns OidcDiscoveryResult or null if no OAuth info found
 */
export async function discoverOAuthFromResource(
  jmapUrl: string,
  timeout = 10000
): Promise<OidcDiscoveryResult | null> {
  try {
    // Parse jmapUrl to get origin
    const url = new URL(jmapUrl);
    const origin = `${url.protocol}//${url.host}`;

    // Try RFC 9728 Protected Resource Metadata first
    const metadataUrl = `${origin}/.well-known/oauth-protected-resource`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const metadataResponse = await fetch(metadataUrl, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (metadataResponse.ok) {
        const metadata = await metadataResponse.json();

        // Extract issuer from authorization_servers array
        if (
          metadata.authorization_servers &&
          Array.isArray(metadata.authorization_servers) &&
          metadata.authorization_servers.length > 0
        ) {
          return {
            issuer: metadata.authorization_servers[0],
            method: 'protected-resource',
          };
        }
      }
    } catch {
      // Protected resource metadata failed, try WWW-Authenticate fallback
    }

    // Fallback 1: Try fetching JMAP URL directly to get 401 with WWW-Authenticate
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const jmapResponse = await fetch(jmapUrl, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Check for 401 response with WWW-Authenticate header
      if (jmapResponse.status === 401) {
        const wwwAuth = jmapResponse.headers.get('WWW-Authenticate');
        if (wwwAuth) {
          const parsed = parseWwwAuthenticate(wwwAuth);
          if (parsed?.issuer) {
            return {
              issuer: parsed.issuer,
              method: 'www-authenticate',
            };
          }
        }
      }
    } catch {
      // WWW-Authenticate fallback also failed
    }

    // Fallback 2: Try common SSO subdomain patterns
    const ssoResult = await tryCommonSsoPatterns(url.hostname, timeout);
    if (ssoResult) {
      return ssoResult;
    }

    // No OAuth info found
    return null;
  } catch {
    // URL parsing or other error
    return null;
  }
}
