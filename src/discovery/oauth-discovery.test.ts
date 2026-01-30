import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseWwwAuthenticate,
  discoverOAuthFromResource,
} from './oauth-discovery.js';

describe('parseWwwAuthenticate', () => {
  it('should parse valid Bearer header with issuer', () => {
    const header = 'Bearer issuer="https://auth.example.com"';
    const result = parseWwwAuthenticate(header);

    expect(result).toEqual({
      issuer: 'https://auth.example.com',
    });
  });

  it('should parse Bearer header with multiple parameters', () => {
    const header =
      'Bearer realm="example", scope="openid email", issuer="https://auth.example.com"';
    const result = parseWwwAuthenticate(header);

    expect(result).toEqual({
      realm: 'example',
      scope: 'openid email',
      issuer: 'https://auth.example.com',
    });
  });

  it('should be case-insensitive for Bearer scheme', () => {
    const header = 'bearer issuer="https://auth.example.com"';
    const result = parseWwwAuthenticate(header);

    expect(result).toEqual({
      issuer: 'https://auth.example.com',
    });
  });

  it('should return null for non-Bearer header', () => {
    const header = 'Basic realm="example"';
    const result = parseWwwAuthenticate(header);

    expect(result).toBeNull();
  });

  it('should return null for malformed header without parameters', () => {
    const header = 'Bearer';
    const result = parseWwwAuthenticate(header);

    expect(result).toBeNull();
  });

  it('should ignore unknown parameters', () => {
    const header =
      'Bearer issuer="https://auth.example.com", unknown="value"';
    const result = parseWwwAuthenticate(header);

    expect(result).toEqual({
      issuer: 'https://auth.example.com',
    });
  });
});

describe('discoverOAuthFromResource', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    global.fetch = mockFetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should discover issuer from protected-resource metadata', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorization_servers: ['https://auth.example.com'],
      }),
    });

    const result = await discoverOAuthFromResource(
      'https://jmap.example.com/api'
    );

    expect(result).toEqual({
      issuer: 'https://auth.example.com',
      method: 'protected-resource',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://jmap.example.com/.well-known/oauth-protected-resource',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('should fallback to WWW-Authenticate on 401 response', async () => {
    // First call: protected-resource fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    // Second call: JMAP URL returns 401 with WWW-Authenticate
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: {
        get: (name: string) => {
          if (name === 'WWW-Authenticate') {
            return 'Bearer issuer="https://auth.example.com"';
          }
          return null;
        },
      },
    });

    const result = await discoverOAuthFromResource(
      'https://jmap.example.com/api'
    );

    expect(result).toEqual({
      issuer: 'https://auth.example.com',
      method: 'www-authenticate',
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should return null when no OAuth info available', async () => {
    // First call: protected-resource fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    // Second call: JMAP URL returns 200 (no auth required)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const result = await discoverOAuthFromResource(
      'https://jmap.example.com/api'
    );

    expect(result).toBeNull();
  });

  it('should return null when WWW-Authenticate has no issuer', async () => {
    // First call: protected-resource fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    // Second call: JMAP URL returns 401 with WWW-Authenticate but no issuer
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: {
        get: (name: string) => {
          if (name === 'WWW-Authenticate') {
            return 'Bearer realm="example"';
          }
          return null;
        },
      },
    });

    const result = await discoverOAuthFromResource(
      'https://jmap.example.com/api'
    );

    expect(result).toBeNull();
  });

  it('should handle network errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await discoverOAuthFromResource(
      'https://jmap.example.com/api'
    );

    expect(result).toBeNull();
  });

  it('should handle invalid URL gracefully', async () => {
    const result = await discoverOAuthFromResource('not-a-url');

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should respect custom timeout', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValue(abortError);

    const result = await discoverOAuthFromResource(
      'https://jmap.example.com/api',
      100
    );

    expect(result).toBeNull();
  });

  it('should handle protected-resource with empty authorization_servers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        authorization_servers: [],
      }),
    });

    // Second call: fallback to WWW-Authenticate
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: {
        get: (name: string) => {
          if (name === 'WWW-Authenticate') {
            return 'Bearer issuer="https://auth.example.com"';
          }
          return null;
        },
      },
    });

    const result = await discoverOAuthFromResource(
      'https://jmap.example.com/api'
    );

    expect(result).toEqual({
      issuer: 'https://auth.example.com',
      method: 'www-authenticate',
    });
  });

  it('should handle protected-resource with missing authorization_servers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    // Second call: fallback to WWW-Authenticate
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: {
        get: (name: string) => {
          if (name === 'WWW-Authenticate') {
            return 'Bearer issuer="https://auth.example.com"';
          }
          return null;
        },
      },
    });

    const result = await discoverOAuthFromResource(
      'https://jmap.example.com/api'
    );

    expect(result).toEqual({
      issuer: 'https://auth.example.com',
      method: 'www-authenticate',
    });
  });
});
