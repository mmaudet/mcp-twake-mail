/**
 * Well-known JMAP endpoint discovery tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyJmapUrl, fetchWellKnownJmap } from './well-known.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('verifyJmapUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns final URL on successful 200 response', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      url: 'https://jmap.example.com/session',
    });

    const result = await verifyJmapUrl('https://example.com/.well-known/jmap');

    expect(result).toBe('https://jmap.example.com/session');
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/.well-known/jmap', {
      redirect: 'follow',
      signal: expect.any(AbortSignal),
    });
  });

  it('returns final URL on 401 response (needs auth)', async () => {
    mockFetch.mockResolvedValue({
      status: 401,
      url: 'https://jmap.example.com/session',
    });

    const result = await verifyJmapUrl('https://example.com/.well-known/jmap');

    expect(result).toBe('https://jmap.example.com/session');
  });

  it('follows redirects and returns final URL', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      url: 'https://jmap.example.com/api/session', // Different from requested URL
    });

    const result = await verifyJmapUrl('https://example.com/.well-known/jmap');

    // Should return the response.url (final URL after redirects)
    expect(result).toBe('https://jmap.example.com/api/session');
  });

  it('returns null on 404 response (no JMAP)', async () => {
    mockFetch.mockResolvedValue({
      status: 404,
      url: 'https://example.com/.well-known/jmap',
    });

    const result = await verifyJmapUrl('https://example.com/.well-known/jmap');

    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network unreachable'));

    const result = await verifyJmapUrl('https://example.com/.well-known/jmap');

    expect(result).toBeNull();
  });

  it('returns null on timeout', async () => {
    // Mock a fetch that respects AbortSignal and rejects when aborted
    mockFetch.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          const signal = (options as RequestInit)?.signal;
          if (signal) {
            signal.addEventListener('abort', () => {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }
          // Never resolves naturally - will be aborted by timeout
        })
    );

    const result = await verifyJmapUrl('https://slow.example.com/.well-known/jmap', 100);

    expect(result).toBeNull();
  });

  it('returns null on 500 server error', async () => {
    mockFetch.mockResolvedValue({
      status: 500,
      url: 'https://example.com/.well-known/jmap',
    });

    const result = await verifyJmapUrl('https://example.com/.well-known/jmap');

    expect(result).toBeNull();
  });
});

describe('fetchWellKnownJmap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('constructs HTTPS URL and returns session URL', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      url: 'https://jmap.example.com/session',
    });

    const result = await fetchWellKnownJmap('example.com');

    expect(result).toBe('https://jmap.example.com/session');
    expect(mockFetch).toHaveBeenCalledWith('https://example.com/.well-known/jmap', {
      redirect: 'follow',
      signal: expect.any(AbortSignal),
    });
  });

  it('returns null when well-known endpoint not found', async () => {
    mockFetch.mockResolvedValue({
      status: 404,
      url: 'https://example.com/.well-known/jmap',
    });

    const result = await fetchWellKnownJmap('example.com');

    expect(result).toBeNull();
  });

  it('uses HTTPS only (security requirement)', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      url: 'https://jmap.example.com/session',
    });

    await fetchWellKnownJmap('example.com');

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toMatch(/^https:\/\//);
  });
});
