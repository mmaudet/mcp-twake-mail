/**
 * .well-known/jmap endpoint discovery
 * RFC 8620 Section 2.2 - Service Discovery via .well-known URI
 */

/**
 * Verify JMAP URL by making a request and checking response
 * Accepts both 200 (public session) and 401 (needs auth) as valid endpoints
 *
 * @param url - URL to verify
 * @param timeout - Timeout in milliseconds (default: 10000)
 * @returns Final URL after redirects, or null if not a valid JMAP endpoint
 */
export async function verifyJmapUrl(
  url: string,
  timeout = 10000
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Accept both 200 (public session info) and 401 (needs auth) as valid JMAP endpoints
    if (response.status === 200 || response.status === 401) {
      // Return final URL after any redirects
      return response.url;
    }

    // Other status codes (404, 500, etc.) mean this is not a JMAP endpoint
    return null;
  } catch (error) {
    // Network errors, timeouts, and other fetch failures
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn(`JMAP URL verification timeout for ${url}`);
    } else {
      console.warn(`JMAP URL verification failed for ${url}:`, error);
    }
    return null;
  }
}

/**
 * Fetch .well-known/jmap endpoint for a domain
 * Always uses HTTPS per RFC 8620 security requirements
 *
 * @param domain - Email domain (e.g., "example.com")
 * @returns Session URL after redirects, or null if not found
 */
export async function fetchWellKnownJmap(domain: string): Promise<string | null> {
  const url = `https://${domain}/.well-known/jmap`;
  return verifyJmapUrl(url);
}
