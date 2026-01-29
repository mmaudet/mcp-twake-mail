/**
 * TypeScript types for JMAP protocol (RFC 8620/8621)
 */

/** JMAP capabilities object - maps capability URIs to their configurations */
export type JMAPCapabilities = Record<string, unknown>;

/** JMAP account from session response */
export interface JMAPAccount {
  name: string;
  isPersonal: boolean;
  accountCapabilities: JMAPCapabilities;
}

/** JMAP session response from .well-known/jmap endpoint */
export interface JMAPSessionResponse {
  capabilities: JMAPCapabilities;
  accounts: Record<string, JMAPAccount>;
  primaryAccounts: Record<string, string>;
  apiUrl: string;
  state: string;
  downloadUrl?: string;
  uploadUrl?: string;
  eventSourceUrl?: string;
}

/**
 * JMAP method call: [methodName, arguments, callId]
 * Example: ['Email/get', { accountId: '...', ids: ['msg1'] }, 'c1']
 */
export type JMAPMethodCall = [
  methodName: string,
  args: Record<string, unknown>,
  callId: string,
];

/**
 * JMAP method response: [methodName, response, callId]
 * Example: ['Email/get', { accountId: '...', list: [...], state: '...' }, 'c1']
 */
export type JMAPMethodResponse = [
  methodName: string,
  response: Record<string, unknown>,
  callId: string,
];

/** JMAP request body */
export interface JMAPRequest {
  using: string[];
  methodCalls: JMAPMethodCall[];
}

/** JMAP response body */
export interface JMAPResponse {
  methodResponses: JMAPMethodResponse[];
  sessionState?: string;
}

/** JMAP error response (method-level error) */
export interface JMAPErrorResponse {
  type: string;
  description?: string;
}

/** JMAP Email/set response (RFC 8621 Section 4.3) */
export interface EmailSetResponse {
  accountId: string;
  oldState: string;
  newState: string;
  created?: Record<string, { id: string; blobId: string; threadId: string }>;
  updated?: Record<string, null>;
  destroyed?: string[];
  notCreated?: Record<string, { type: string; description?: string }>;
  notUpdated?: Record<string, { type: string; description?: string }>;
  notDestroyed?: Record<string, { type: string; description?: string }>;
}

/** JMAP Identity for email sending (RFC 8621 Section 6) */
export interface Identity {
  id: string;
  name: string;
  email: string;
  replyTo?: Array<{ name?: string; email: string }> | null;
  bcc?: Array<{ name?: string; email: string }> | null;
  textSignature?: string;
  htmlSignature?: string;
  mayDelete: boolean;
}

/** JMAP EmailSubmission/set response (RFC 8621 Section 7.5) */
export interface EmailSubmissionSetResponse {
  accountId: string;
  oldState: string | null;
  newState: string;
  created?: Record<string, { id: string }>;
  notCreated?: Record<string, { type: string; description?: string }>;
}
