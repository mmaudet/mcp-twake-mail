/**
 * DNS SRV resolution tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as dns } from 'node:dns';
import { resolveSrvRecord } from './dns-srv.js';

vi.mock('node:dns', () => ({
  promises: {
    resolveSrv: vi.fn(),
  },
}));

describe('resolveSrvRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves DNS SRV record and returns hostname/port', async () => {
    const mockRecords = [
      { name: 'jmap.example.com', port: 443, priority: 10, weight: 10 },
    ];
    vi.mocked(dns.resolveSrv).mockResolvedValue(mockRecords);

    const result = await resolveSrvRecord('example.com');

    expect(result).toEqual({
      hostname: 'jmap.example.com',
      port: 443,
    });
    expect(dns.resolveSrv).toHaveBeenCalledWith('_jmap._tcp.example.com');
  });

  it('sorts by priority (ascending) then weight (descending)', async () => {
    const mockRecords = [
      { name: 'low-weight.example.com', port: 443, priority: 10, weight: 5 },
      { name: 'high-priority.example.com', port: 443, priority: 20, weight: 10 },
      { name: 'best.example.com', port: 443, priority: 10, weight: 10 },
    ];
    vi.mocked(dns.resolveSrv).mockResolvedValue(mockRecords);

    const result = await resolveSrvRecord('example.com');

    // Should return priority 10, weight 10 (best)
    expect(result).toEqual({
      hostname: 'best.example.com',
      port: 443,
    });
  });

  it('returns null when DNS record not found (ENOTFOUND)', async () => {
    const error: NodeJS.ErrnoException = new Error('DNS query failed');
    error.code = 'ENOTFOUND';
    vi.mocked(dns.resolveSrv).mockRejectedValue(error);

    const result = await resolveSrvRecord('nonexistent.example.com');

    expect(result).toBeNull();
  });

  it('returns null when DNS record has no data (ENODATA)', async () => {
    const error: NodeJS.ErrnoException = new Error('DNS query failed');
    error.code = 'ENODATA';
    vi.mocked(dns.resolveSrv).mockRejectedValue(error);

    const result = await resolveSrvRecord('nodns.example.com');

    expect(result).toBeNull();
  });

  it('returns null on timeout', async () => {
    // Mock a slow DNS response (never resolves)
    vi.mocked(dns.resolveSrv).mockImplementation(
      () =>
        new Promise((resolve) => {
          // Never resolves - will timeout
          setTimeout(() => resolve([]), 10000);
        })
    );

    const result = await resolveSrvRecord('slow.example.com', 100);

    expect(result).toBeNull();
  });

  it('returns null when no records returned', async () => {
    vi.mocked(dns.resolveSrv).mockResolvedValue([]);

    const result = await resolveSrvRecord('empty.example.com');

    expect(result).toBeNull();
  });

  it('returns null on unexpected DNS error', async () => {
    vi.mocked(dns.resolveSrv).mockRejectedValue(new Error('Network unreachable'));

    const result = await resolveSrvRecord('error.example.com');

    expect(result).toBeNull();
  });
});
