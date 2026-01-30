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
