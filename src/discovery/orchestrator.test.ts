/**
 * Tests for discovery orchestrator
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { discoverFromEmail, extractDomain } from './orchestrator.js';
import { DiscoveryError } from './types.js';

// Mock the discovery modules
vi.mock('./dns-srv.js');
vi.mock('./well-known.js');
vi.mock('./oauth-discovery.js');

import { resolveSrvRecord } from './dns-srv.js';
import { fetchWellKnownJmap, verifyJmapUrl } from './well-known.js';
import { discoverOAuthFromResource } from './oauth-discovery.js';

describe('extractDomain', () => {
  it('extracts domain from valid email', () => {
    expect(extractDomain('user@example.com')).toBe('example.com');
  });

  it('extracts domain from email with subdomain', () => {
    expect(extractDomain('user@mail.example.com')).toBe('mail.example.com');
  });

  it('throws on email without @', () => {
    expect(() => extractDomain('userexample.com')).toThrow('Invalid email format');
  });

  it('throws on domain without dot', () => {
    expect(() => extractDomain('user@localhost')).toThrow('Invalid email format');
  });

  it('throws on multiple @ symbols', () => {
    expect(() => extractDomain('user@test@example.com')).toThrow(
      'Invalid email format'
    );
  });

  it('throws on empty domain', () => {
    expect(() => extractDomain('user@')).toThrow('Invalid email format');
  });
});

describe('discoverFromEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DNS SRV success path', () => {
    it('discovers via DNS SRV with standard port', async () => {
      // Mock DNS SRV success
      vi.mocked(resolveSrvRecord).mockResolvedValue({
        hostname: 'jmap.example.com',
        port: 443,
      });

      // Mock URL verification
      vi.mocked(verifyJmapUrl).mockResolvedValue(
        'https://jmap.example.com/.well-known/jmap'
      );

      // Mock OAuth discovery
      vi.mocked(discoverOAuthFromResource).mockResolvedValue({
        issuer: 'https://auth.example.com',
        method: 'protected-resource',
      });

      const result = await discoverFromEmail('user@example.com');

      expect(result).toEqual({
        jmap: {
          sessionUrl: 'https://jmap.example.com/.well-known/jmap',
          method: 'dns-srv',
        },
        oidc: {
          issuer: 'https://auth.example.com',
          method: 'protected-resource',
        },
        email: 'user@example.com',
        domain: 'example.com',
      });

      // Verify correct URL was constructed
      expect(verifyJmapUrl).toHaveBeenCalledWith(
        'https://jmap.example.com/.well-known/jmap'
      );
    });

    it('discovers via DNS SRV with non-standard port', async () => {
      // Mock DNS SRV success with non-standard port
      vi.mocked(resolveSrvRecord).mockResolvedValue({
        hostname: 'jmap.example.com',
        port: 8443,
      });

      // Mock URL verification
      vi.mocked(verifyJmapUrl).mockResolvedValue(
        'https://jmap.example.com:8443/.well-known/jmap'
      );

      // Mock OAuth discovery (no OAuth info)
      vi.mocked(discoverOAuthFromResource).mockResolvedValue(null);

      const result = await discoverFromEmail('user@example.com');

      expect(result).toEqual({
        jmap: {
          sessionUrl: 'https://jmap.example.com:8443/.well-known/jmap',
          method: 'dns-srv',
        },
        oidc: undefined,
        email: 'user@example.com',
        domain: 'example.com',
      });

      // Verify URL includes non-standard port
      expect(verifyJmapUrl).toHaveBeenCalledWith(
        'https://jmap.example.com:8443/.well-known/jmap'
      );
    });

    it('discovers without OAuth info', async () => {
      // Mock DNS SRV success
      vi.mocked(resolveSrvRecord).mockResolvedValue({
        hostname: 'jmap.example.com',
        port: 443,
      });

      // Mock URL verification
      vi.mocked(verifyJmapUrl).mockResolvedValue(
        'https://jmap.example.com/.well-known/jmap'
      );

      // Mock OAuth discovery returning null
      vi.mocked(discoverOAuthFromResource).mockResolvedValue(null);

      const result = await discoverFromEmail('user@example.com');

      expect(result.oidc).toBeUndefined();
      expect(result.jmap.sessionUrl).toBe(
        'https://jmap.example.com/.well-known/jmap'
      );
    });
  });

  describe('Well-known fallback path', () => {
    it('falls back to well-known when DNS SRV returns null', async () => {
      // Mock DNS SRV failure
      vi.mocked(resolveSrvRecord).mockResolvedValue(null);

      // Mock well-known success
      vi.mocked(fetchWellKnownJmap).mockResolvedValue(
        'https://example.com/jmap/session'
      );

      // Mock OAuth discovery
      vi.mocked(discoverOAuthFromResource).mockResolvedValue({
        issuer: 'https://auth.example.com',
        method: 'www-authenticate',
      });

      const result = await discoverFromEmail('user@example.com');

      expect(result).toEqual({
        jmap: {
          sessionUrl: 'https://example.com/jmap/session',
          method: 'well-known-direct',
        },
        oidc: {
          issuer: 'https://auth.example.com',
          method: 'www-authenticate',
        },
        email: 'user@example.com',
        domain: 'example.com',
      });

      // Verify DNS SRV was tried first
      expect(resolveSrvRecord).toHaveBeenCalledWith('example.com');
      // Verify well-known was called
      expect(fetchWellKnownJmap).toHaveBeenCalledWith('example.com');
    });

    it('falls back to well-known when DNS SRV verification fails', async () => {
      // Mock DNS SRV success but verification failure
      vi.mocked(resolveSrvRecord).mockResolvedValue({
        hostname: 'jmap.example.com',
        port: 443,
      });
      vi.mocked(verifyJmapUrl).mockResolvedValue(null);

      // Mock well-known success
      vi.mocked(fetchWellKnownJmap).mockResolvedValue(
        'https://example.com/.well-known/jmap'
      );

      // Mock no OAuth
      vi.mocked(discoverOAuthFromResource).mockResolvedValue(null);

      const result = await discoverFromEmail('user@example.com');

      expect(result.jmap.method).toBe('well-known-direct');
      expect(result.jmap.sessionUrl).toBe(
        'https://example.com/.well-known/jmap'
      );

      // Verify both were tried
      expect(resolveSrvRecord).toHaveBeenCalled();
      expect(fetchWellKnownJmap).toHaveBeenCalled();
    });
  });

  describe('Complete failure path', () => {
    it('throws DiscoveryError when all methods fail', async () => {
      // Mock DNS SRV failure
      vi.mocked(resolveSrvRecord).mockResolvedValue(null);

      // Mock well-known failure
      vi.mocked(fetchWellKnownJmap).mockResolvedValue(null);

      await expect(discoverFromEmail('user@example.com')).rejects.toThrow(
        DiscoveryError
      );

      await expect(discoverFromEmail('user@example.com')).rejects.toThrow(
        'Could not discover JMAP server for domain "example.com"'
      );
    });

    it('throws DiscoveryError with correct domain and stage', async () => {
      // Mock all failures
      vi.mocked(resolveSrvRecord).mockResolvedValue(null);
      vi.mocked(fetchWellKnownJmap).mockResolvedValue(null);

      try {
        await discoverFromEmail('user@example.com');
        expect.fail('Should have thrown DiscoveryError');
      } catch (error) {
        expect(error).toBeInstanceOf(DiscoveryError);
        if (error instanceof DiscoveryError) {
          expect(error.domain).toBe('example.com');
          expect(error.stage).toBe('well-known');
        }
      }
    });

    it('throws on invalid email format', async () => {
      await expect(discoverFromEmail('not-an-email')).rejects.toThrow(
        'Invalid email format'
      );

      // Verify no discovery methods were called
      expect(resolveSrvRecord).not.toHaveBeenCalled();
      expect(fetchWellKnownJmap).not.toHaveBeenCalled();
    });
  });

  describe('OAuth discovery integration', () => {
    it('includes OAuth info when discovered via protected-resource', async () => {
      vi.mocked(resolveSrvRecord).mockResolvedValue({
        hostname: 'jmap.example.com',
        port: 443,
      });
      vi.mocked(verifyJmapUrl).mockResolvedValue(
        'https://jmap.example.com/.well-known/jmap'
      );
      vi.mocked(discoverOAuthFromResource).mockResolvedValue({
        issuer: 'https://auth.example.com',
        clientId: 'optional-client-id',
        method: 'protected-resource',
      });

      const result = await discoverFromEmail('user@example.com');

      expect(result.oidc).toEqual({
        issuer: 'https://auth.example.com',
        clientId: 'optional-client-id',
        method: 'protected-resource',
      });
    });

    it('includes OAuth info when discovered via www-authenticate', async () => {
      vi.mocked(resolveSrvRecord).mockResolvedValue(null);
      vi.mocked(fetchWellKnownJmap).mockResolvedValue(
        'https://example.com/.well-known/jmap'
      );
      vi.mocked(discoverOAuthFromResource).mockResolvedValue({
        issuer: 'https://auth.example.com',
        method: 'www-authenticate',
      });

      const result = await discoverFromEmail('user@example.com');

      expect(result.oidc).toEqual({
        issuer: 'https://auth.example.com',
        method: 'www-authenticate',
      });
    });

    it('handles OAuth discovery returning null gracefully', async () => {
      vi.mocked(resolveSrvRecord).mockResolvedValue({
        hostname: 'jmap.example.com',
        port: 443,
      });
      vi.mocked(verifyJmapUrl).mockResolvedValue(
        'https://jmap.example.com/.well-known/jmap'
      );
      vi.mocked(discoverOAuthFromResource).mockResolvedValue(null);

      const result = await discoverFromEmail('user@example.com');

      expect(result.oidc).toBeUndefined();
      expect(result.jmap).toBeDefined();
    });

    it('calls OAuth discovery with correct JMAP URL', async () => {
      const jmapUrl = 'https://jmap.example.com/.well-known/jmap';
      vi.mocked(resolveSrvRecord).mockResolvedValue({
        hostname: 'jmap.example.com',
        port: 443,
      });
      vi.mocked(verifyJmapUrl).mockResolvedValue(jmapUrl);
      vi.mocked(discoverOAuthFromResource).mockResolvedValue(null);

      await discoverFromEmail('user@example.com');

      expect(discoverOAuthFromResource).toHaveBeenCalledWith(jmapUrl);
    });
  });
});
