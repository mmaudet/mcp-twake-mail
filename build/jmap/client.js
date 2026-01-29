import { JMAPError } from '../errors.js';
/** Default JMAP capabilities for mail operations */
const DEFAULT_USING = ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'];
/** Session fetch timeout (quick check) */
const SESSION_TIMEOUT = 5000;
/**
 * JMAP client for interacting with JMAP mail servers.
 * Handles authentication, session management, and request batching.
 */
export class JMAPClient {
    session = null;
    config;
    logger;
    stateTracker = new Map();
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
    }
    /**
     * Generate authentication headers based on configured auth method.
     * @returns Headers object with Authorization and Content-Type
     */
    getAuthHeaders() {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (this.config.JMAP_AUTH_METHOD === 'basic') {
            const credentials = `${this.config.JMAP_USERNAME}:${this.config.JMAP_PASSWORD}`;
            const token = Buffer.from(credentials).toString('base64');
            headers['Authorization'] = `Basic ${token}`;
        }
        else {
            // Both bearer and oidc use Bearer token format
            // OIDC flow (token refresh) will be added in Phase 2
            headers['Authorization'] = `Bearer ${this.config.JMAP_TOKEN}`;
        }
        return headers;
    }
    /**
     * Fetch JMAP session from the server.
     * Discovers apiUrl, accountId, and capabilities.
     * @returns JMAPSession with extracted session data
     * @throws JMAPError if session fetch fails or no mail account found
     */
    async fetchSession() {
        this.logger.info({ url: this.config.JMAP_SESSION_URL }, 'Fetching JMAP session...');
        let response;
        try {
            response = await fetch(this.config.JMAP_SESSION_URL, {
                method: 'GET',
                headers: this.getAuthHeaders(),
                signal: AbortSignal.timeout(SESSION_TIMEOUT),
            });
        }
        catch (error) {
            if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
                throw JMAPError.timeout('session fetch');
            }
            throw error;
        }
        if (!response.ok) {
            throw JMAPError.httpError(response.status, response.statusText);
        }
        const sessionData = (await response.json());
        // Extract primary account for mail capability
        const accountId = sessionData.primaryAccounts['urn:ietf:params:jmap:mail'];
        if (!accountId) {
            throw JMAPError.methodError('noMailAccount', 'No mail account found in JMAP session. The server may not support JMAP Mail.');
        }
        this.session = {
            apiUrl: sessionData.apiUrl,
            accountId,
            capabilities: sessionData.capabilities,
            state: sessionData.state,
        };
        this.logger.info({ accountId, apiUrl: sessionData.apiUrl }, 'JMAP session established');
        return this.session;
    }
    /**
     * Get the current session.
     * @returns JMAPSession
     * @throws JMAPError if session not initialized
     */
    getSession() {
        if (!this.session) {
            throw new JMAPError('Session not initialized', 'sessionNotInitialized', 'Call fetchSession() before making requests.');
        }
        return this.session;
    }
    /**
     * Make a batched JMAP request with multiple method calls.
     * @param methodCalls Array of method calls to execute
     * @param using Optional array of capability URIs (defaults to core + mail)
     * @returns JMAPResponse with method responses
     * @throws JMAPError on HTTP errors or timeouts
     */
    async request(methodCalls, using = DEFAULT_USING) {
        const session = this.getSession();
        const requestBody = {
            using,
            methodCalls,
        };
        this.logger.debug({ methodCount: methodCalls.length, methods: methodCalls.map((mc) => mc[0]) }, 'Sending JMAP request');
        let response;
        try {
            response = await fetch(session.apiUrl, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(requestBody),
                signal: AbortSignal.timeout(this.config.JMAP_REQUEST_TIMEOUT),
            });
        }
        catch (error) {
            if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
                throw JMAPError.timeout('JMAP request');
            }
            throw error;
        }
        if (!response.ok) {
            throw JMAPError.httpError(response.status, response.statusText);
        }
        const jmapResponse = (await response.json());
        // Check for session state changes
        if (jmapResponse.sessionState && jmapResponse.sessionState !== this.session?.state) {
            this.logger.warn({ oldState: this.session?.state, newState: jmapResponse.sessionState }, 'Session state changed - session refresh may be needed');
        }
        // Update state tracking from method responses
        for (const methodResponse of jmapResponse.methodResponses) {
            this.extractAndUpdateState(methodResponse);
        }
        return jmapResponse;
    }
    /**
     * Parse a method response and extract success/error status.
     * @param response The method response tuple
     * @returns Object with success flag and data or error
     */
    parseMethodResponse(response) {
        const [methodName, responseData] = response;
        // Check if this is an error response
        if (methodName === 'error') {
            const errorResponse = {
                type: responseData.type || 'unknownError',
                description: responseData.description,
            };
            this.logger.debug({ error: errorResponse }, 'JMAP method error');
            return {
                success: false,
                error: errorResponse,
            };
        }
        return {
            success: true,
            data: responseData,
        };
    }
    /**
     * Extract state from method response and update tracker.
     * @param response The method response tuple
     */
    extractAndUpdateState(response) {
        const [methodName, responseData] = response;
        // Skip error responses
        if (methodName === 'error') {
            return;
        }
        // Extract object type from method name (e.g., 'Email/get' -> 'Email')
        const objectType = methodName.split('/')[0];
        // Check for state or newState in response
        const state = responseData.newState || responseData.state;
        if (state && objectType) {
            this.updateState(objectType, state);
        }
    }
    /**
     * Update tracked state for an object type.
     * @param type Object type (e.g., 'Email', 'Mailbox')
     * @param state New state string
     */
    updateState(type, state) {
        this.stateTracker.set(type, state);
        this.logger.debug({ type, state }, 'State updated');
    }
    /**
     * Get tracked state for an object type.
     * @param type Object type (e.g., 'Email', 'Mailbox')
     * @returns State string or undefined if not tracked
     */
    getState(type) {
        return this.stateTracker.get(type);
    }
    /**
     * Clear tracked state.
     * @param type Optional object type to clear. If not provided, clears all state.
     */
    clearState(type) {
        if (type) {
            this.stateTracker.delete(type);
            this.logger.debug({ type }, 'State cleared');
        }
        else {
            this.stateTracker.clear();
            this.logger.debug('All state cleared');
        }
    }
}
//# sourceMappingURL=client.js.map