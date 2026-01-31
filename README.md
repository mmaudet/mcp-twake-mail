# mcp-twake-mail

[![npm version](https://img.shields.io/npm/v/mcp-twake-mail)](https://www.npmjs.com/package/mcp-twake-mail)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Node.js >= 20](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org/)

**MCP server for [Twake.ai](https://www.twake.ai/) — integrate your sovereign JMAP email server with any MCP-compatible AI assistant**

![Twake Mail](assets/twake-mail-screenshot.png)

## Overview

mcp-twake-mail is a Model Context Protocol (MCP) server that connects any MCP-compatible AI assistant (Claude Desktop, Claude Code, etc.) to your JMAP email server. Compatible with JMAP-compliant servers including Apache James, Cyrus IMAP, and other RFC 8620/8621 implementations.

**Key benefits:**
- Your data stays on your own servers — sovereign infrastructure
- Works with any MCP-compatible AI assistant
- Full control over email data — read, write, send, and organize
- Multiple authentication methods: Basic, Bearer token, or OIDC
- **Auto-discovery** — configure with just your email address
- **Email signatures** — automatic Markdown signature injection
- Secure HTTPS-only connections

## Features

### 29 MCP Tools

**Email Read Tools:**
- `list_emails` - List emails with filtering, search, and pagination
- `get_email` - Get full email content including body and headers
- `search_emails` - Search emails by keywords
- `get_thread` - Get all emails in a conversation thread

**Email Compose Tools:**
- `send_email` - Compose and send a new email (plain text and/or HTML)
- `reply_email` - Reply to an email with proper threading (In-Reply-To, References)
- `forward_email` - Forward an email with attachments and personal note
- `create_draft` - Create a draft email for later editing or sending
- `update_draft` - Update an existing draft (subject, body, recipients)
- `send_draft` - Send a previously saved draft

**Email Management Tools:**
- `mark_as_read` / `mark_as_unread` - Mark email read status
- `delete_email` - Move to trash or permanently delete
- `move_email` - Move an email to a different mailbox
- `add_label` / `remove_label` - Add or remove labels/mailboxes

**Batch Operations (up to 50 emails at once):**
- `batch_mark_read` / `batch_mark_unread` - Mark multiple emails
- `batch_delete` - Delete multiple emails
- `batch_move` - Move multiple emails to a mailbox
- `batch_add_label` / `batch_remove_label` - Add/remove labels from multiple emails

**Mailbox Tools:**
- `list_mailboxes` - List all mailboxes (Inbox, Sent, Drafts, etc.)
- `get_mailbox` - Get mailbox details by ID
- `create_mailbox` - Create a new folder with optional nesting
- `rename_mailbox` - Rename an existing folder (system folders protected)
- `delete_mailbox` - Delete an empty folder with safety checks

**Attachment Tools:**
- `get_attachments` - List attachment metadata for an email
- `download_attachment` - Download attachment content (auto-saves large files)

### Advanced Features

- **Auto-discovery** — Configure with just your email address (DNS SRV + .well-known/jmap)
- **Email signatures** — Markdown signature files automatically appended to emails
- **Default sender identity** — Configure default "from" address
- **Batch operations** — Process up to 50 emails in a single request
- **Draft workflow** — Create, update, and send drafts with atomic transitions
- **Folder management** — Create, rename, and delete custom folders
- **System folder protection** — Cannot modify Inbox, Sent, Drafts, Trash
- OIDC authentication with PKCE (S256) for enterprise SSO
- Automatic token refresh for OIDC sessions
- Thread-based email grouping
- Inline vs regular attachment detection
- Large attachment handling (auto-saves to ~/Downloads for files > 750KB)
- MCP tool annotations (readOnlyHint, destructiveHint, idempotentHint)

## Prerequisites

- **Node.js** >= 20.0.0
- **JMAP Server** - A JMAP-compliant email server such as:
  - Apache James
  - Cyrus IMAP
  - Stalwart Mail Server
  - Fastmail
- **MCP-compatible AI assistant** - Claude Desktop, Claude Code, or any MCP client

## Installation

**From npm (recommended):**
```bash
npx mcp-twake-mail setup
```

**From source:**
```bash
git clone https://github.com/linagora/mcp-twake-mail.git
cd mcp-twake-mail
npm install
npm run build
```

## Quick Setup (Recommended)

The easiest way to configure mcp-twake-mail is to use the interactive setup wizard:

```bash
npx mcp-twake-mail setup
```

The wizard will:
1. **Auto-discover** your JMAP server from your email address (or enter manually)
2. Ask for your authentication method (Basic, Bearer, or OIDC)
3. Collect the required credentials
4. **Configure default sender** and optional email signature
5. Test the connection to your JMAP server
6. Generate and optionally write the configuration to your Claude Desktop config file

### Auto-Discovery Mode

The setup wizard supports **auto-discovery** — just provide your email address and the system will automatically find your JMAP server:

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

The auto-discovery uses:
- **DNS SRV** lookup: `_jmap._tcp.{domain}`
- **.well-known/jmap** endpoint
- **OAuth metadata** discovery for OIDC configuration

See [docs/auto-discovery.md](docs/auto-discovery.md) for details.

### Email Signature Support

Configure an optional Markdown signature file that will be automatically appended to all emails:

```
Configure email signature file? [y/N]: y
Path to signature file (Markdown format): ~/.mcp-twake-mail/signature.md
```

Example signature file (`~/.mcp-twake-mail/signature.md`):
```markdown
**John Doe**
Software Engineer
[john.doe@example.com](mailto:john.doe@example.com)
```

The signature is automatically converted to HTML for rich emails and plain text for simple emails.

See [docs/signature.md](docs/signature.md) for details.

### CLI Commands

| Command | Description |
|---------|-------------|
| `mcp-twake-mail` | Start MCP server (default) |
| `mcp-twake-mail setup` | Interactive configuration wizard |
| `mcp-twake-mail auth` | Re-run OIDC authentication flow |
| `mcp-twake-mail check` | Verify configuration and test connection |

## Configuration

### Environment Variables

#### Basic Auth

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `JMAP_SESSION_URL` | Yes | JMAP session endpoint URL | `https://jmap.example.com/jmap/session` |
| `JMAP_AUTH_METHOD` | No | Set to `basic` (default) | `basic` |
| `JMAP_USERNAME` | Yes | Username for authentication | `user@example.com` |
| `JMAP_PASSWORD` | Yes | Password for authentication | `your-password` |

#### Bearer Token

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `JMAP_SESSION_URL` | Yes | JMAP session endpoint URL | `https://jmap.example.com/jmap/session` |
| `JMAP_AUTH_METHOD` | Yes | Must be set to `bearer` | `bearer` |
| `JMAP_TOKEN` | Yes | JWT Bearer token | `eyJhbGciOiJSUzI1NiIs...` |

#### OIDC Authentication

For enterprise SSO with OpenID Connect (PKCE S256):

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `JMAP_SESSION_URL` | Yes | JMAP session endpoint URL | `https://jmap.example.com/jmap/session` |
| `JMAP_AUTH_METHOD` | Yes | Must be set to `oidc` | `oidc` |
| `JMAP_OIDC_ISSUER` | Yes | OIDC provider issuer URL | `https://sso.example.com` |
| `JMAP_OIDC_CLIENT_ID` | Yes | OIDC client ID | `my-client-id` |
| `JMAP_OIDC_SCOPE` | No | OIDC scopes | `openid profile email offline_access` |
| `JMAP_OIDC_REDIRECT_URI` | No | Callback URI for OIDC flow | `http://localhost:3000/callback` |

See [docs/oidc-configuration.md](docs/oidc-configuration.md) for detailed OIDC setup instructions.

#### Identity & Signature (Optional)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `JMAP_DEFAULT_FROM` | No | Default sender email address | `user@example.com` |
| `JMAP_SIGNATURE_PATH` | No | Path to Markdown signature file | `~/.mcp-twake-mail/signature.md` |

#### Other Options

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Log verbosity: `fatal`, `error`, `warn`, `info`, `debug`, `trace` | `info` |
| `JMAP_REQUEST_TIMEOUT` | Request timeout in milliseconds | `30000` |

### Claude Desktop Configuration

Add the following to your Claude Desktop configuration file:

**Configuration file location:**
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

**Configuration (Basic Auth):**

```json
{
  "mcpServers": {
    "mcp-twake-mail": {
      "command": "npx",
      "args": ["-y", "mcp-twake-mail"],
      "env": {
        "JMAP_SESSION_URL": "https://jmap.example.com/jmap/session",
        "JMAP_AUTH_METHOD": "basic",
        "JMAP_USERNAME": "user@example.com",
        "JMAP_PASSWORD": "your-password",
        "JMAP_DEFAULT_FROM": "user@example.com",
        "JMAP_SIGNATURE_PATH": "~/.mcp-twake-mail/signature.md"
      }
    }
  }
}
```

**Configuration (OIDC):**

```json
{
  "mcpServers": {
    "mcp-twake-mail": {
      "command": "npx",
      "args": ["-y", "mcp-twake-mail"],
      "env": {
        "JMAP_SESSION_URL": "https://jmap.example.com/jmap/session",
        "JMAP_AUTH_METHOD": "oidc",
        "JMAP_OIDC_ISSUER": "https://sso.example.com",
        "JMAP_OIDC_CLIENT_ID": "my-client-id",
        "JMAP_OIDC_SCOPE": "openid profile email offline_access",
        "JMAP_DEFAULT_FROM": "user@example.com",
        "JMAP_SIGNATURE_PATH": "~/.mcp-twake-mail/signature.md"
      }
    }
  }
}
```

After updating the configuration, restart Claude Desktop for changes to take effect.

## Usage Examples

Once configured, you can ask Claude natural language questions about your email:

**Email queries:**
- "What are my unread emails?"
- "Show me emails from Pierre"
- "What's the latest email in my inbox?"
- "Find emails about the budget meeting"
- "Show the conversation thread for this email"

**Email composition:**
- "Send an email to pierre@example.com about the meeting tomorrow"
- "Reply to this email thanking them for the information"
- "Forward this email to the team with a note"
- "Create a draft email to the team about the project update"

**Draft management:**
- "Update the draft to change the subject line"
- "Add Marie to the CC list on that draft"
- "Send the draft I was working on"

**Email management:**
- "Mark this email as read"
- "Move this email to the Archive folder"
- "Delete all spam emails"
- "Add the 'Important' label to this email"

**Batch operations:**
- "Mark all emails from last week as read"
- "Move all newsletters to the Archive folder"
- "Delete all emails older than 30 days in Trash"

**Folder management:**
- "Create a new folder called 'Projects'"
- "Rename the 'Old Stuff' folder to 'Archive 2025'"
- "Delete the empty 'Temp' folder"

**Attachments:**
- "What attachments are in this email?"
- "Download the PDF attachment"

## Documentation

- [Auto-Discovery](docs/auto-discovery.md) — How JMAP and OIDC auto-discovery works
- [Email Signatures](docs/signature.md) — Configure Markdown email signatures
- [OIDC Configuration](docs/oidc-configuration.md) — Detailed OIDC/OAuth setup guide

## Available Tools

| Tool Name | Description | Category |
|-----------|-------------|----------|
| `list_emails` | List emails with optional filters (mailbox, limit, search) | Read |
| `get_email` | Get full email content by ID | Read |
| `search_emails` | Search emails by keywords | Read |
| `get_thread` | Get all emails in a thread | Read |
| `send_email` | Send a new email | Compose |
| `reply_email` | Reply to an email with threading | Compose |
| `forward_email` | Forward an email with attachments | Compose |
| `create_draft` | Create a draft email | Compose |
| `update_draft` | Update an existing draft | Compose |
| `send_draft` | Send a saved draft | Compose |
| `mark_as_read` | Mark email as read | Manage |
| `mark_as_unread` | Mark email as unread | Manage |
| `delete_email` | Delete or trash an email | Manage |
| `move_email` | Move email to another mailbox | Manage |
| `add_label` | Add mailbox/label to email | Manage |
| `remove_label` | Remove mailbox/label from email | Manage |
| `batch_mark_read` | Mark multiple emails as read | Batch |
| `batch_mark_unread` | Mark multiple emails as unread | Batch |
| `batch_delete` | Delete multiple emails | Batch |
| `batch_move` | Move multiple emails | Batch |
| `batch_add_label` | Add label to multiple emails | Batch |
| `batch_remove_label` | Remove label from multiple emails | Batch |
| `list_mailboxes` | List all mailboxes | Mailbox |
| `get_mailbox` | Get mailbox details | Mailbox |
| `create_mailbox` | Create a new folder | Mailbox |
| `rename_mailbox` | Rename a folder | Mailbox |
| `delete_mailbox` | Delete an empty folder | Mailbox |
| `get_attachments` | List attachment metadata | Attachment |
| `download_attachment` | Download attachment content | Attachment |

## Development

```bash
git clone https://github.com/linagora/mcp-twake-mail.git
cd mcp-twake-mail
npm install
npm run build    # compile TypeScript
npm test         # run tests (704 tests)
npm run dev      # watch mode (auto-rebuild on file changes)
```

The server uses the MCP stdio transport and communicates via JSON-RPC on stdin/stdout.

## Architecture

mcp-twake-mail is built with a layered architecture:

1. **Configuration Layer** - Zod-based environment variable validation with fail-fast behavior
2. **Logging Layer** - Pino logger configured for stderr output (prevents stdout contamination)
3. **Authentication Layer** - Multi-method auth support (Basic, Bearer, OIDC with PKCE)
4. **Token Management** - Automatic token refresh for OIDC with secure token storage
5. **Discovery Layer** - Auto-discovery via DNS SRV, .well-known/jmap, and OAuth metadata
6. **JMAP Client Layer** - Session management, request batching, blob download support
7. **Signature Layer** - Markdown-to-HTML conversion for email signatures
8. **Transformation Layer** - Email/Mailbox data transformation for AI-friendly output
9. **MCP Tool Layer** - 29 MCP tools exposing email functionality with tool annotations
10. **Entry Point** - MCP server initialization with stdio transport

**Key design decisions:**
- ESM modules with `.js` import extensions (required by MCP SDK)
- JMAP RFC 8620/8621 compliance for broad server compatibility
- AI-friendly error formatting for troubleshooting
- Large attachment handling (auto-save to disk for files > 750KB)
- MCP tool annotations for AI clients (readOnlyHint, destructiveHint, idempotentHint)
- Batch operations with per-item success/failure reporting
- System folder protection for safe mailbox management

## Version History

| Version | Release | Highlights |
|---------|---------|------------|
| v2.0 | 2026-01-31 | Draft management (update/send), Mailbox management (create/rename/delete), 29 tools total |
| v1.1 | 2026-01-31 | Email forwarding, Batch operations (6 tools) |
| v1.0 | 2026-01-30 | Initial release - 17 tools, 3 auth methods, auto-discovery, signatures |

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

See the [LICENSE](LICENSE) file for details.

**Copyright (c) 2026 LINAGORA** <https://linagora.com>

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) for details on the development workflow, code style, and pull request process.

## Support

For issues, questions, or feature requests, please open an issue on the GitHub repository.

For commercial support or inquiries, contact LINAGORA at <https://linagora.com>.
