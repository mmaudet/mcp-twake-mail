import { describe, it, expect, vi, beforeEach } from 'vitest';
import { homedir } from 'node:os';
import type { Logger } from '../config/logger.js';
import { loadSignature } from './loader.js';

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  access: vi.fn(),
}));

// Import after mocking
const { readFile, access } = await import('node:fs/promises');

describe('loadSignature', () => {
  let mockLogger: Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      trace: vi.fn(),
      child: vi.fn(),
    } as unknown as Logger;
  });

  it('returns undefined when signaturePath is undefined', async () => {
    const result = await loadSignature(undefined, mockLogger);

    expect(result).toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith('No signature path configured');
    expect(access).not.toHaveBeenCalled();
  });

  it('returns undefined when signaturePath is empty string', async () => {
    const result = await loadSignature('', mockLogger);

    expect(result).toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith('No signature path configured');
    expect(access).not.toHaveBeenCalled();
  });

  it('loads and converts file successfully', async () => {
    const markdown = '**John Doe**\nSoftware Engineer\n[email@example.com](mailto:email@example.com)';

    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(readFile).mockResolvedValue(markdown);

    const result = await loadSignature('/path/to/signature.md', mockLogger);

    expect(result).toBeDefined();
    expect(result?.text).toContain('John Doe');
    expect(result?.text).toContain('Software Engineer');
    expect(result?.text).toContain('email@example.com (mailto:email@example.com)');
    expect(result?.html).toContain('<strong>John Doe</strong>');
    expect(result?.html).toContain('<a href="mailto:email@example.com">email@example.com</a>');

    expect(mockLogger.info).toHaveBeenCalledWith(
      { path: '/path/to/signature.md' },
      'Signature loaded successfully'
    );
  });

  it('expands ~ to home directory', async () => {
    const markdown = 'Test signature';
    const expectedPath = `${homedir()}/signature.md`;

    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(readFile).mockResolvedValue(markdown);

    await loadSignature('~/signature.md', mockLogger);

    expect(access).toHaveBeenCalledWith(expectedPath, expect.any(Number));
    expect(readFile).toHaveBeenCalledWith(expectedPath, 'utf-8');
    expect(mockLogger.info).toHaveBeenCalledWith(
      { path: expectedPath },
      'Signature loaded successfully'
    );
  });

  it('returns undefined and logs warning when file does not exist', async () => {
    const error = new Error('ENOENT: no such file or directory');
    vi.mocked(access).mockRejectedValue(error);

    const result = await loadSignature('/nonexistent/signature.md', mockLogger);

    expect(result).toBeUndefined();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { error, path: '/nonexistent/signature.md' },
      'Failed to load signature file - emails will be sent without signature'
    );
    expect(readFile).not.toHaveBeenCalled();
  });

  it('returns undefined and logs warning when file is not readable', async () => {
    const error = new Error('EACCES: permission denied');
    vi.mocked(access).mockRejectedValue(error);

    const result = await loadSignature('/restricted/signature.md', mockLogger);

    expect(result).toBeUndefined();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { error, path: '/restricted/signature.md' },
      'Failed to load signature file - emails will be sent without signature'
    );
    expect(readFile).not.toHaveBeenCalled();
  });

  it('returns undefined and logs warning when readFile fails', async () => {
    const error = new Error('Read error');
    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(readFile).mockRejectedValue(error);

    const result = await loadSignature('/path/to/signature.md', mockLogger);

    expect(result).toBeUndefined();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { error, path: '/path/to/signature.md' },
      'Failed to load signature file - emails will be sent without signature'
    );
  });
});
