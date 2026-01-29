/**
 * JMAP client with session management, authentication, and request handling.
 * Implements JMAP Core (RFC 8620) patterns.
 */
import type { Config } from '../config/schema.js';
import type { Logger } from '../config/logger.js';
import type { JMAPCapabilities, JMAPMethodCall, JMAPMethodResponse, JMAPResponse, JMAPErrorResponse } from '../types/jmap.js';
/** Extracted session data from JMAP session response */
export interface JMAPSession {
    apiUrl: string;
    accountId: string;
    capabilities: JMAPCapabilities;
    state: string;
}
/**
 * JMAP client for interacting with JMAP mail servers.
 * Handles authentication, session management, and request batching.
 */
export declare class JMAPClient {
    private session;
    private readonly config;
    private readonly logger;
    private readonly stateTracker;
    constructor(config: Config, logger: Logger);
    /**
     * Generate authentication headers based on configured auth method.
     * @returns Headers object with Authorization and Content-Type
     */
    private getAuthHeaders;
    /**
     * Fetch JMAP session from the server.
     * Discovers apiUrl, accountId, and capabilities.
     * @returns JMAPSession with extracted session data
     * @throws JMAPError if session fetch fails or no mail account found
     */
    fetchSession(): Promise<JMAPSession>;
    /**
     * Get the current session.
     * @returns JMAPSession
     * @throws JMAPError if session not initialized
     */
    getSession(): JMAPSession;
    /**
     * Make a batched JMAP request with multiple method calls.
     * @param methodCalls Array of method calls to execute
     * @param using Optional array of capability URIs (defaults to core + mail)
     * @returns JMAPResponse with method responses
     * @throws JMAPError on HTTP errors or timeouts
     */
    request(methodCalls: JMAPMethodCall[], using?: string[]): Promise<JMAPResponse>;
    /**
     * Parse a method response and extract success/error status.
     * @param response The method response tuple
     * @returns Object with success flag and data or error
     */
    parseMethodResponse(response: JMAPMethodResponse): {
        success: boolean;
        data?: Record<string, unknown>;
        error?: JMAPErrorResponse;
    };
    /**
     * Extract state from method response and update tracker.
     * @param response The method response tuple
     */
    private extractAndUpdateState;
    /**
     * Update tracked state for an object type.
     * @param type Object type (e.g., 'Email', 'Mailbox')
     * @param state New state string
     */
    updateState(type: string, state: string): void;
    /**
     * Get tracked state for an object type.
     * @param type Object type (e.g., 'Email', 'Mailbox')
     * @returns State string or undefined if not tracked
     */
    getState(type: string): string | undefined;
    /**
     * Clear tracked state.
     * @param type Optional object type to clear. If not provided, clears all state.
     */
    clearState(type?: string): void;
}
