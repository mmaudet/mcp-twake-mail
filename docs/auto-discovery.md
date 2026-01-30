# Auto-Discovery

mcp-twake-mail supports automatic discovery of JMAP server and OIDC configuration from just an email address. This simplifies setup by eliminating the need to manually find server URLs.

## How It Works

When you provide an email address (e.g., `user@example.com`), the auto-discovery system performs the following steps:

### 1. DNS SRV Lookup

First, the system queries DNS for a SRV record:

```
_jmap._tcp.example.com
```

If found, this returns the JMAP server hostname and port. For example:
```
_jmap._tcp.example.com. 3600 IN SRV 0 1 443 jmap.example.com.
```

This indicates the JMAP server is at `jmap.example.com` on port 443.

### 2. Well-Known JMAP Endpoint

If DNS SRV fails or as a verification step, the system tries the `.well-known/jmap` endpoint:

```
https://example.com/.well-known/jmap
```

This endpoint should redirect (302/307) or return the JMAP session URL directly. Per RFC 8620, the response provides the full session URL like:
```
https://jmap.example.com/jmap/session
```

### 3. OAuth/OIDC Discovery

Once the JMAP server is found, the system attempts to discover OAuth/OIDC configuration:

#### Protected Resource Metadata (RFC 9728)

The system checks for OAuth metadata at the JMAP URL:
```
https://jmap.example.com/.well-known/oauth-protected-resource
```

This may return the authorization server (OIDC issuer) URL.

#### WWW-Authenticate Header

If the above fails, the system makes an unauthenticated request to the JMAP session URL and parses the `WWW-Authenticate` header:

```http
WWW-Authenticate: Bearer realm="example.com", authorization_uri="https://sso.example.com"
```

#### Common SSO Patterns

As a fallback, the system tries common SSO subdomain patterns:
- `https://sso.example.com`
- `https://auth.example.com`
- `https://login.example.com`
- `https://id.example.com`
- `https://accounts.example.com`

For each, it checks if `/.well-known/openid-configuration` exists.

## Using Auto-Discovery

### Setup Wizard

Run the setup wizard and choose auto-discovery mode:

```bash
npx mcp-twake-mail setup
```

```
=== MCP Twake Mail Setup Wizard ===

Setup mode:
  1. Auto-discover from email address (Recommended)
  2. Manual configuration
Choose [1-2]: 1

Email address: user@example.com

Discovering JMAP server...
✓ Found JMAP server: https://jmap.example.com/jmap/session
✓ Found OIDC issuer: https://sso.example.com

Use discovered settings? [Y/n]: y
```

### Programmatic Usage

The discovery module can be used programmatically:

```typescript
import { discoverFromEmail } from 'mcp-twake-mail/discovery';

const result = await discoverFromEmail('user@example.com');

console.log(result.jmapUrl);    // https://jmap.example.com/jmap/session
console.log(result.jmapMethod); // 'dns-srv' | 'well-known'

if (result.oidc) {
  console.log(result.oidc.issuer);   // https://sso.example.com
  console.log(result.oidc.method);   // 'protected-resource' | 'www-authenticate' | 'sso-pattern'
}
```

## Discovery Methods

### JMAP Discovery

| Method | Priority | Description |
|--------|----------|-------------|
| DNS SRV | 1 (first) | `_jmap._tcp.{domain}` lookup |
| .well-known/jmap | 2 (fallback) | HTTPS endpoint at domain root |

### OIDC Discovery

| Method | Priority | Description |
|--------|----------|-------------|
| Protected Resource Metadata | 1 | RFC 9728 OAuth metadata |
| WWW-Authenticate | 2 | Parse Bearer challenge header |
| SSO Patterns | 3 | Try common subdomain patterns |

## Configuration After Discovery

After discovery, you'll have:

- **JMAP Session URL** — Required for all operations
- **OIDC Issuer** — Optional, for OAuth authentication

You can then choose your authentication method:

1. **Basic** — Username/password (no OIDC needed)
2. **Bearer** — Pre-existing JWT token (no OIDC needed)
3. **OIDC** — Full OAuth flow using discovered issuer

## Timeout Handling

All discovery operations have built-in timeouts:

| Operation | Timeout |
|-----------|---------|
| DNS SRV lookup | 3 seconds |
| HTTP requests | 10 seconds |

If discovery fails or times out, the setup wizard automatically falls back to manual configuration.

## Troubleshooting

### DNS SRV Not Found

This is normal for many domains. The system will automatically try `.well-known/jmap`.

### .well-known/jmap Returns 404

The domain doesn't support JMAP auto-discovery. You'll need to manually enter the JMAP session URL.

### OIDC Discovery Fails

OIDC discovery is optional. If it fails:
- You can still use Basic or Bearer authentication
- You can manually enter the OIDC issuer URL

### Firewall Blocking DNS

Corporate firewalls may block DNS SRV queries. The system will fall back to HTTPS-based discovery.

## Server Requirements

For auto-discovery to work, your JMAP server should implement:

### RFC 8620 Service Discovery

1. **DNS SRV record** (recommended):
   ```
   _jmap._tcp.example.com. 3600 IN SRV 0 1 443 jmap.example.com.
   ```

2. **.well-known/jmap endpoint**:
   ```
   https://example.com/.well-known/jmap
   ```
   Should redirect to or return the JMAP session URL.

### OAuth Discovery (Optional)

For OIDC auto-discovery:

1. **Protected Resource Metadata** (RFC 9728):
   ```
   https://jmap.example.com/.well-known/oauth-protected-resource
   ```

2. **WWW-Authenticate header** on 401 responses:
   ```
   WWW-Authenticate: Bearer realm="example.com", authorization_uri="https://sso.example.com"
   ```

## References

- [RFC 8620](https://datatracker.ietf.org/doc/html/rfc8620) — JMAP Core (Section 2.2: Service Autodiscovery)
- [RFC 9728](https://datatracker.ietf.org/doc/html/rfc9728) — OAuth 2.0 Protected Resource Metadata
- [OpenID Connect Discovery](https://openid.net/specs/openid-connect-discovery-1_0.html) — OIDC Discovery specification
