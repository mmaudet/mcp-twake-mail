/**
 * JMAP server discovery module
 * Exports DNS SRV, .well-known/jmap, OAuth discovery, and high-level orchestration
 */

// Types
export {
  JmapDiscoveryResult,
  OidcDiscoveryResult,
  DiscoveryError,
} from './types.js';

// Low-level discovery functions
export { resolveSrvRecord } from './dns-srv.js';
export { fetchWellKnownJmap, verifyJmapUrl } from './well-known.js';
export {
  discoverOAuthFromResource,
  parseWwwAuthenticate,
} from './oauth-discovery.js';

// High-level orchestration
export {
  discoverFromEmail,
  extractDomain,
  FullDiscoveryResult,
} from './orchestrator.js';
