/**
 * Tests for setup wizard prompts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { confirm, input } from '@inquirer/prompts';
import { access } from 'node:fs/promises';
import { promptDefaultFrom, promptSignaturePath } from './setup-wizard.js';

// Mock @inquirer/prompts
vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
  input: vi.fn(),
  select: vi.fn(),
  password: vi.fn(),
}));

// Mock node:fs/promises
vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
  constants: {
    R_OK: 4,
  },
}));

// Mock node:os
vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

describe('promptDefaultFrom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined when user declines to configure', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(false);

    const result = await promptDefaultFrom();

    expect(result).toBeUndefined();
    expect(confirm).toHaveBeenCalledWith({
      message: 'Configure default sender email address?',
      default: true,
    });
    expect(input).not.toHaveBeenCalled();
  });

  it('returns email when user configures and provides valid email', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(true);
    vi.mocked(input).mockResolvedValueOnce('user@example.com');

    const result = await promptDefaultFrom();

    expect(result).toBe('user@example.com');
    expect(confirm).toHaveBeenCalledOnce();
    expect(input).toHaveBeenCalledWith({
      message: 'Default "from" email address:',
      validate: expect.any(Function),
    });
  });

  it('validates email format - rejects invalid emails', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(true);

    // Mock input to get the validate function
    let validateFn: ((value: string) => string | boolean) | undefined;
    vi.mocked(input).mockImplementationOnce((options) => {
      validateFn = options.validate as (value: string) => string | boolean;
      return Promise.resolve('valid@example.com');
    });

    await promptDefaultFrom();

    expect(validateFn).toBeDefined();
    if (validateFn) {
      // Test invalid emails
      expect(validateFn('invalid')).toBe('Please enter a valid email address');
      expect(validateFn('invalid@')).toBe('Please enter a valid email address');
      expect(validateFn('@example.com')).toBe('Please enter a valid email address');
      expect(validateFn('user@example')).toBe('Please enter a valid email address');

      // Test valid emails
      expect(validateFn('user@example.com')).toBe(true);
      expect(validateFn('test.user+tag@sub.example.org')).toBe(true);
    }
  });
});

describe('promptSignaturePath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns undefined when user declines to configure', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(false);

    const result = await promptSignaturePath();

    expect(result).toBeUndefined();
    expect(confirm).toHaveBeenCalledWith({
      message: 'Configure email signature file?',
      default: false,
    });
    expect(input).not.toHaveBeenCalled();
  });

  it('returns path when user configures and file exists', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(true);
    vi.mocked(access).mockResolvedValueOnce(undefined);
    vi.mocked(input).mockResolvedValueOnce('/path/to/signature.md');

    const result = await promptSignaturePath();

    expect(result).toBe('/path/to/signature.md');
    expect(confirm).toHaveBeenCalledOnce();
    expect(input).toHaveBeenCalledWith({
      message: 'Path to signature file (Markdown format):',
      default: '~/.mcp-twake-mail/signature.md',
      validate: expect.any(Function),
    });
  });

  it('validates file exists - shows error for missing file', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(true);

    // Mock input to capture the validate function and test it separately
    let validateFn: ((value: string) => Promise<string | boolean>) | undefined;
    vi.mocked(input).mockImplementationOnce((options) => {
      validateFn = options.validate as (value: string) => Promise<string | boolean>;
      return Promise.resolve('/valid/path.md');
    });

    await promptSignaturePath();

    expect(validateFn).toBeDefined();
    if (validateFn) {
      // Set up mock to reject for missing file
      vi.mocked(access).mockReset();
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'));

      // Test missing file
      const result = await validateFn('/missing/file.md');
      expect(typeof result).toBe('string');
      expect(result).toMatch(/File not found or not readable/);
      expect(access).toHaveBeenCalledTimes(1);
      expect(access).toHaveBeenCalledWith('/missing/file.md', 4); // R_OK = 4
    }
  });

  it('validates empty path is rejected', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(true);

    // Mock input to get the validate function
    let validateFn: ((value: string) => Promise<string | boolean>) | undefined;
    vi.mocked(input).mockImplementationOnce((options) => {
      validateFn = options.validate as (value: string) => Promise<string | boolean>;
      return Promise.resolve('valid.md');
    });

    await promptSignaturePath();

    expect(validateFn).toBeDefined();
    if (validateFn) {
      const result = await validateFn('');
      expect(result).toBe('Signature path cannot be empty');
      expect(access).not.toHaveBeenCalled();
    }
  });

  it('expands ~ in path for validation', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(true);

    // Mock input to capture the validate function
    let validateFn: ((value: string) => Promise<string | boolean>) | undefined;
    vi.mocked(input).mockImplementationOnce((options) => {
      validateFn = options.validate as (value: string) => Promise<string | boolean>;
      return Promise.resolve('~/signature.md');
    });

    await promptSignaturePath();

    expect(validateFn).toBeDefined();
    if (validateFn) {
      // Clear previous calls and set up mock for the validation call
      vi.mocked(access).mockClear();
      vi.mocked(access).mockResolvedValueOnce(undefined);

      await validateFn('~/signature.md');

      // Verify access was called with expanded path (not with ~)
      expect(access).toHaveBeenCalledTimes(1);
      const calledPath = vi.mocked(access).mock.calls[0][0] as string;
      expect(calledPath).not.toContain('~');
      expect(calledPath).toMatch(/^\/.*\/signature\.md$/);
    }
  });
});
