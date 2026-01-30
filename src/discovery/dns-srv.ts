/**
 * DNS SRV resolution for JMAP server discovery
 * RFC 8620 Section 2.2 - Service Discovery via DNS SRV
 */

import { promises as dns } from 'node:dns';

interface SrvRecord {
  hostname: string;
  port: number;
}

/**
 * Resolve DNS SRV record for JMAP service
 * Queries _jmap._tcp.{domain} and returns hostname/port of highest priority server
 *
 * @param domain - Email domain to query (e.g., "example.com")
 * @param timeout - Timeout in milliseconds (default: 3000)
 * @returns SrvRecord with hostname/port, or null if no record found
 */
export async function resolveSrvRecord(
  domain: string,
  timeout = 3000
): Promise<SrvRecord | null> {
  const query = `_jmap._tcp.${domain}`;

  try {
    // Race DNS query against timeout
    const records = await Promise.race([
      dns.resolveSrv(query),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('DNS timeout')), timeout)
      ),
    ]);

    if (!records || records.length === 0) {
      return null;
    }

    // Sort by priority (ascending) then weight (descending)
    // Lower priority value = higher priority
    // Higher weight value = more preferred among same priority
    const sorted = records.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return b.weight - a.weight;
    });

    // Return first (highest priority/weight) record
    const record = sorted[0];
    return {
      hostname: record.name,
      port: record.port,
    };
  } catch (error) {
    // Handle DNS-specific errors gracefully
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error.code === 'ENOTFOUND' || error.code === 'ENODATA')
    ) {
      // No DNS record exists - this is expected for many domains
      return null;
    }

    // Log timeout and other errors, but return null for graceful fallback
    if (error instanceof Error && error.message === 'DNS timeout') {
      console.warn(`DNS SRV query timeout for ${query}`);
      return null;
    }

    // Unexpected error - log but still return null to allow fallback
    console.warn(`DNS SRV query failed for ${query}:`, error);
    return null;
  }
}
