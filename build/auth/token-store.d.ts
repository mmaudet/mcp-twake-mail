/**
 * Structure for stored OIDC tokens
 */
export interface StoredTokens {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    idToken?: string;
}
/**
 * Path to token storage file
 * ~/.mcp-twake-mail/tokens.json
 */
declare const TOKEN_PATH: string;
/**
 * Save tokens to secure file storage
 * Creates parent directory with 0700 permissions
 * Writes token file with 0600 permissions (owner read/write only)
 */
export declare function saveTokens(tokens: StoredTokens): Promise<void>;
/**
 * Load tokens from storage
 * Returns null if no tokens are stored
 */
export declare function loadTokens(): Promise<StoredTokens | null>;
/**
 * Clear stored tokens (logout)
 */
export declare function clearTokens(): Promise<void>;
/**
 * Export TOKEN_PATH for testing purposes
 */
export { TOKEN_PATH };
