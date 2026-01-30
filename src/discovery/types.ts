/**
 * JMAP server discovery result types
 * Supports DNS SRV, .well-known/jmap, and manual configuration
 */

export interface JmapDiscoveryResult {
  sessionUrl: string;
  method: 'dns-srv' | 'well-known-direct' | 'manual';
}

export interface OidcDiscoveryResult {
  issuer: string;
  clientId?: string; // Optional - often not discoverable
  method: 'protected-resource' | 'www-authenticate' | 'well-known-oidc' | 'manual';
}

export class DiscoveryError extends Error {
  constructor(
    message: string,
    public readonly domain: string,
    public readonly stage: 'dns' | 'well-known' | 'verification'
  ) {
    super(message);
    this.name = 'DiscoveryError';
  }
}
