import { mkdir, writeFile, readFile, unlink, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
/**
 * Path to token storage file
 * ~/.mcp-twake-mail/tokens.json
 */
const TOKEN_PATH = join(homedir(), '.mcp-twake-mail', 'tokens.json');
/**
 * Save tokens to secure file storage
 * Creates parent directory with 0700 permissions
 * Writes token file with 0600 permissions (owner read/write only)
 */
export async function saveTokens(tokens) {
    const dir = dirname(TOKEN_PATH);
    // Create parent directory with restricted permissions
    await mkdir(dir, { recursive: true, mode: 0o700 });
    // Write tokens file
    await writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2), {
        mode: 0o600,
        encoding: 'utf-8',
    });
    // Ensure permissions even if file already existed
    await chmod(TOKEN_PATH, 0o600);
}
/**
 * Load tokens from storage
 * Returns null if no tokens are stored
 */
export async function loadTokens() {
    try {
        const content = await readFile(TOKEN_PATH, 'utf-8');
        return JSON.parse(content);
    }
    catch (error) {
        // File doesn't exist - that's okay, just return null
        if (error.code === 'ENOENT') {
            return null;
        }
        // Re-throw other errors (permission issues, corrupted JSON, etc.)
        throw error;
    }
}
/**
 * Clear stored tokens (logout)
 */
export async function clearTokens() {
    try {
        await unlink(TOKEN_PATH);
    }
    catch (error) {
        // File doesn't exist - already cleared, that's fine
        if (error.code === 'ENOENT') {
            return;
        }
        throw error;
    }
}
/**
 * Export TOKEN_PATH for testing purposes
 */
export { TOKEN_PATH };
//# sourceMappingURL=token-store.js.map