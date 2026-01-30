/**
 * JMAP server discovery module
 * Exports DNS SRV, .well-known/jmap, and OAuth discovery functions
 */

export {
  JmapDiscoveryResult,
  OidcDiscoveryResult,
  DiscoveryError,
} from './types.js';
export { resolveSrvRecord } from './dns-srv.js';
export { fetchWellKnownJmap, verifyJmapUrl } from './well-known.js';
export {
  discoverOAuthFromResource,
  parseWwwAuthenticate,
} from './oauth-discovery.js';
