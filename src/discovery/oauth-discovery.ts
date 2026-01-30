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
 * Discover OAuth authorization server from JMAP resource URL.
 * Implements RFC 9728 Protected Resource Metadata discovery.
 *
 * Discovery order:
 * 1. Try /.well-known/oauth-protected-resource at resource origin
 * 2. If that fails, try fetching JMAP URL to trigger 401 with WWW-Authenticate
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
    } catch (err) {
      // Protected resource metadata failed, try WWW-Authenticate fallback
    }

    // Fallback: Try fetching JMAP URL directly to get 401 with WWW-Authenticate
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
    } catch (err) {
      // WWW-Authenticate fallback also failed
    }

    // No OAuth info found
    return null;
  } catch (err) {
    // URL parsing or other error
    return null;
  }
}
