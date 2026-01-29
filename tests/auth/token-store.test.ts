import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, writeFile, readFile, unlink, stat, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// We need to mock homedir before importing token-store
// Use a temp directory for isolated testing
const testDir = join(tmpdir(), `mcp-twake-mail-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

vi.mock('node:os', async () => {
  const actual = await vi.importActual('node:os');
  return {
    ...actual,
    homedir: () => testDir,
  };
});

// Import after mocking
const { saveTokens, loadTokens, clearTokens, TOKEN_PATH, StoredTokens } = await import(
  '../../src/auth/token-store.js'
);

describe('token-store', () => {
  beforeEach(async () => {
    // Create test directory
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      const tokenDir = join(testDir, '.mcp-twake-mail');
      const tokenFile = join(tokenDir, 'tokens.json');

      // Remove token file if exists
      try {
        await unlink(tokenFile);
      } catch {
        // Ignore if not exists
      }

      // Remove token dir if exists
      try {
        await rmdir(tokenDir);
      } catch {
        // Ignore if not exists
      }

      // Remove test dir
      try {
        await rmdir(testDir);
      } catch {
        // Ignore if not exists or not empty
      }
    } catch {
      // Cleanup failed, that's okay for tests
    }
  });

  describe('saveTokens', () => {
    it('creates file with correct content', async () => {
      const tokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: 1234567890,
        idToken: 'test-id-token',
      };

      await saveTokens(tokens);

      const content = await readFile(TOKEN_PATH, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed).toEqual(tokens);
    });

    it('creates file with 0600 permissions', async () => {
      const tokens = {
        accessToken: 'test-access-token',
      };

      await saveTokens(tokens);

      const stats = await stat(TOKEN_PATH);
      // mode & 0o777 to get permission bits only
      const permissions = stats.mode & 0o777;

      expect(permissions).toBe(0o600);
    });

    it('creates parent directory if not exists', async () => {
      const tokens = {
        accessToken: 'test-access-token',
      };

      await saveTokens(tokens);

      const dirPath = join(testDir, '.mcp-twake-mail');
      const stats = await stat(dirPath);

      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('loadTokens', () => {
    it('returns null when no file exists', async () => {
      const result = await loadTokens();

      expect(result).toBeNull();
    });

    it('returns tokens when file exists', async () => {
      const tokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: 1234567890,
      };

      await saveTokens(tokens);
      const result = await loadTokens();

      expect(result).toEqual(tokens);
    });

    it('returns tokens without optional fields', async () => {
      const tokens = {
        accessToken: 'minimal-token',
      };

      await saveTokens(tokens);
      const result = await loadTokens();

      expect(result).toEqual(tokens);
      expect(result?.refreshToken).toBeUndefined();
      expect(result?.expiresAt).toBeUndefined();
      expect(result?.idToken).toBeUndefined();
    });
  });

  describe('clearTokens', () => {
    it('removes file when it exists', async () => {
      const tokens = {
        accessToken: 'test-access-token',
      };

      await saveTokens(tokens);

      // Verify file exists
      const before = await loadTokens();
      expect(before).not.toBeNull();

      await clearTokens();

      // Verify file is gone
      const after = await loadTokens();
      expect(after).toBeNull();
    });

    it('does not throw when file does not exist', async () => {
      // Should not throw
      await expect(clearTokens()).resolves.toBeUndefined();
    });

    it('can be called multiple times safely', async () => {
      const tokens = {
        accessToken: 'test-access-token',
      };

      await saveTokens(tokens);
      await clearTokens();
      await clearTokens(); // Should not throw
      await clearTokens(); // Should not throw

      const result = await loadTokens();
      expect(result).toBeNull();
    });
  });

  describe('TOKEN_PATH', () => {
    it('points to expected location', () => {
      expect(TOKEN_PATH).toBe(join(testDir, '.mcp-twake-mail', 'tokens.json'));
    });
  });
});
