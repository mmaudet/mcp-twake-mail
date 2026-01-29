export declare class JMAPError extends Error {
    type: string;
    fix: string;
    constructor(message: string, type: string, fix: string);
    /**
     * Create a JMAPError for HTTP-level errors (4xx, 5xx responses)
     */
    static httpError(status: number, statusText: string): JMAPError;
    /**
     * Create a JMAPError for JMAP method-level errors
     */
    static methodError(type: string, description?: string): JMAPError;
    /**
     * Create a JMAPError for timeout errors
     */
    static timeout(operation: string): JMAPError;
    /**
     * Create a JMAPError for expired access token
     */
    static tokenExpired(refreshAvailable: boolean): JMAPError;
    /**
     * Create a JMAPError for failed token refresh
     */
    static refreshFailed(reason?: string): JMAPError;
    /**
     * Create a JMAPError for OIDC flow errors
     */
    static oidcFlowError(stage: string, details?: string): JMAPError;
    /**
     * Create a JMAPError for missing stored tokens
     */
    static noStoredTokens(): JMAPError;
}
export declare function formatStartupError(error: Error, sessionUrl?: string): string;
