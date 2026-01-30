/**
 * Discovery orchestrator - chains DNS SRV, well-known, and OAuth discovery
 * Provides high-level API to discover JMAP and OIDC settings from email address
 */

import { resolveSrvRecord } from './dns-srv.js';
import { fetchWellKnownJmap, verifyJmapUrl } from './well-known.js';
import { discoverOAuthFromResource } from './oauth-discovery.js';
import {
  JmapDiscoveryResult,
  OidcDiscoveryResult,
  DiscoveryError,
} from './types.js';

export interface FullDiscoveryResult {
  jmap: JmapDiscoveryResult;
  oidc?: OidcDiscoveryResult;
  email: string;
  domain: string;
}

/**
 * Extract domain from email address.
 * @throws Error if email format invalid
 */
export function extractDomain(email: string): string {
  // Split on '@' and take second part
  const parts = email.split('@');
  if (parts.length !== 2) {
    throw new Error('Invalid email format');
  }

  const domain = parts[1];

  // Validate domain has at least one '.'
  if (!domain.includes('.')) {
    throw new Error('Invalid email format');
  }

  return domain;
}

/**
 * Discover JMAP and OIDC settings from an email address.
 *
 * Discovery stages:
 * 1. Extract domain from email
 * 2. Try DNS SRV lookup for _jmap._tcp.{domain}
 * 3. If SRV found, construct URL and verify it works
 * 4. If SRV fails, try .well-known/jmap on domain
 * 5. If JMAP found, attempt OAuth discovery on that URL
 *
 * @param email User's email address (e.g., "user@example.com")
 * @returns Full discovery result with JMAP and optional OIDC settings
 * @throws DiscoveryError if JMAP server cannot be discovered
 */
export async function discoverFromEmail(
  email: string
): Promise<FullDiscoveryResult> {
  // Extract domain from email
  const domain = extractDomain(email);

  // Stage 1 - DNS SRV discovery
  const srv = await resolveSrvRecord(domain);
  if (srv) {
    // Construct URL from SRV record
    const url =
      srv.port === 443
        ? `https://${srv.hostname}/.well-known/jmap`
        : `https://${srv.hostname}:${srv.port}/.well-known/jmap`;

    // Verify the URL works
    const verified = await verifyJmapUrl(url);
    if (verified) {
      const jmap: JmapDiscoveryResult = {
        sessionUrl: verified,
        method: 'dns-srv',
      };

      // Stage 4 - OAuth discovery
      const oidc = await discoverOAuthFromResource(verified);

      return {
        jmap,
        oidc: oidc ?? undefined,
        email,
        domain,
      };
    }
  }

  // Stage 2 - Well-known fallback
  const wellKnown = await fetchWellKnownJmap(domain);
  if (wellKnown) {
    const jmap: JmapDiscoveryResult = {
      sessionUrl: wellKnown,
      method: 'well-known-direct',
    };

    // Stage 4 - OAuth discovery
    const oidc = await discoverOAuthFromResource(wellKnown);

    return {
      jmap,
      oidc: oidc ?? undefined,
      email,
      domain,
    };
  }

  // Stage 3 - Failure
  throw new DiscoveryError(
    `Could not discover JMAP server for domain "${domain}". ` +
      'The domain does not have a JMAP SRV record or .well-known/jmap endpoint.',
    domain,
    'well-known'
  );
}
