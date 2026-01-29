import * as client from 'openid-client';
import type { StoredTokens } from './token-store.js';
/**
 * Refresh tokens 60 seconds before actual expiry
 * This buffer ensures tokens are refreshed before they become invalid
 */
export declare const TOKEN_EXPIRY_BUFFER = 60;
/**
 * Token refresher with mutex for concurrent access safety
 *
 * When an MCP server handles multiple simultaneous requests, each may try
 * to refresh the token if it's expiring soon. Without coordination, this
 * causes "invalid_grant" errors. This class ensures only one refresh
 * happens at a time and all callers get the fresh token.
 */
export declare class TokenRefresher {
    private issuerUrl;
    private clientId;
    private refreshPromise;
    private cachedConfig;
    constructor(issuerUrl: string, clientId: string);
    /**
     * Get or create cached OIDC issuer configuration
     */
    getIssuerConfig(): Promise<client.Configuration>;
    /**
     * Check if token is valid (not expired or expiring soon)
     * Returns false if token will expire within TOKEN_EXPIRY_BUFFER seconds
     */
    isTokenValid(tokens: StoredTokens): boolean;
    /**
     * Ensure we have a valid token, refreshing if necessary
     *
     * Uses a mutex pattern: if a refresh is already in progress,
     * all callers wait for that same promise rather than starting
     * parallel refresh requests.
     */
    ensureValidToken(): Promise<StoredTokens>;
    /**
     * Perform the actual token refresh
     */
    private doRefresh;
    /**
     * Clear cached configuration (useful for testing)
     */
    clearCache(): void;
}
/**
 * Factory function to create a TokenRefresher instance
 */
export declare function createTokenRefresher(issuerUrl: string, clientId: string): TokenRefresher;
/**
 * Convenience function to ensure valid token with a new refresher
 * For simple use cases that don't need to maintain refresher state
 */
export declare function ensureValidToken(issuerUrl: string, clientId: string): Promise<StoredTokens>;
