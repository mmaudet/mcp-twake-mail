# Phase 5: Email Creation & Sending - Research

**Researched:** 2026-01-29
**Domain:** JMAP Email/set create, EmailSubmission/set, threading headers
**Confidence:** HIGH

## Summary

This phase implements two MCP tools (send_email, reply_email) that enable AI assistants to compose and send emails via JMAP. The implementation requires three JMAP methods: Email/set create (draft creation), EmailSubmission/set (sending), and Identity/get (sender resolution). Threading for replies uses RFC 5322 headers (In-Reply-To, References) which JMAP exposes as Email properties.

The key architectural insight is that JMAP sending is a two-phase process: first create an Email object, then submit it via EmailSubmission/set. The onSuccessUpdateEmail pattern handles the Drafts-to-Sent mailbox transition atomically. This approach is already partially implemented in the existing create_draft tool and should be extended rather than rewritten.

**Primary recommendation:** Build on the existing create_draft implementation, adding bodyStructure for multipart/alternative (text + HTML), EmailSubmission/set for sending, and threading header handling for replies.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| JMAP RFC 8621 | N/A | Email/set, EmailSubmission/set protocol | Official IETF standard for JMAP Mail |
| @modelcontextprotocol/sdk | Existing | MCP tool registration | Already in project |
| Zod | Existing | Input validation | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| uuid | ^11.0.0 | Generate Message-ID for new emails | Optional - JMAP server can auto-generate |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Client-generated Message-ID | Server-generated | Server handles uniqueness guarantees, simpler client |
| Inline HTML body | Separate HTML tool | HTML inline is simpler, matches create_draft pattern |

**Installation:**
No additional dependencies required - uses existing stack.

## Architecture Patterns

### Recommended Project Structure
```
src/
  mcp/tools/
    email-operations.ts      # Existing - add send_email, reply_email
  types/
    jmap.ts                  # Add EmailSubmissionResponse, Identity types
    dto.ts                   # Add SendEmailResult DTO (optional)
```

### Pattern 1: Two-Phase Email Sending

**What:** Create Email object first, then submit via EmailSubmission/set
**When to use:** All email sending operations
**Example:**
```typescript
// Source: RFC 8621 Section 7.5, JMAP specification
// Step 1: Create email (may be done in same request)
// Step 2: Submit for delivery with onSuccessUpdateEmail

const response = await jmapClient.request([
  // Create the email
  ['Email/set', {
    accountId: session.accountId,
    create: {
      'draft': {
        mailboxIds: { [draftsMailboxId]: true },
        keywords: { '$draft': true },
        from: [{ name: 'Sender Name', email: 'sender@example.com' }],
        to: [{ name: 'Recipient', email: 'recipient@example.com' }],
        subject: 'Email Subject',
        // For text-only email:
        bodyStructure: { type: 'text/plain', partId: 'body' },
        bodyValues: { 'body': { value: 'Plain text body' } },
      },
    },
  }, 'createEmail'],

  // Submit the created email
  ['EmailSubmission/set', {
    accountId: session.accountId,
    create: {
      'send': {
        identityId: identityId,
        emailId: '#draft',  // Reference to created email
        // envelope is optional - server derives from headers if omitted
      },
    },
    // Move from Drafts to Sent on success
    onSuccessUpdateEmail: {
      '#send': {
        [`mailboxIds/${draftsMailboxId}`]: null,
        [`mailboxIds/${sentMailboxId}`]: true,
        'keywords/$draft': null,
      },
    },
  }, 'sendEmail'],
]);
```

### Pattern 2: Multipart Alternative for Text + HTML

**What:** MIME multipart/alternative structure for emails with both plain text and HTML
**When to use:** When both textBody and htmlBody are provided
**Example:**
```typescript
// Source: RFC 8621 Section 4.1.4, JMAP Mail specification
const emailCreate = {
  from: [{ name: 'Sender', email: 'sender@example.com' }],
  to: [{ name: 'Recipient', email: 'recipient@example.com' }],
  subject: 'Subject',
  bodyStructure: {
    type: 'multipart/alternative',
    subParts: [
      { partId: 'text', type: 'text/plain' },
      { partId: 'html', type: 'text/html' },
    ],
  },
  bodyValues: {
    'text': { value: 'Plain text version' },
    'html': { value: '<html><body>HTML version</body></html>' },
  },
};
```

### Pattern 3: Threading Headers for Replies

**What:** Set In-Reply-To and References headers for proper thread grouping
**When to use:** reply_email tool
**Example:**
```typescript
// Source: RFC 8621, RFC 5322 threading
// To reply to an email:
// 1. Fetch original email's messageId and references
// 2. Set inReplyTo to original's messageId
// 3. Set references to original's references + original's messageId

// First fetch the original email
const originalResponse = await jmapClient.request([
  ['Email/get', {
    accountId: session.accountId,
    ids: [originalEmailId],
    properties: ['messageId', 'references', 'subject', 'from', 'to', 'cc', 'threadId'],
  }, 'getOriginal'],
]);

const original = originalResponse.methodResponses[0][1].list[0];

// Build threading headers
const inReplyTo = original.messageId; // Array of message IDs
const references = [
  ...(original.references || []),
  ...(original.messageId || []),
];

// Create reply email
const replyEmail = {
  mailboxIds: { [draftsMailboxId]: true },
  inReplyTo: inReplyTo,
  references: references,
  subject: original.subject?.startsWith('Re:') ? original.subject : `Re: ${original.subject}`,
  // ... other properties
};
```

### Pattern 4: Finding Mailboxes by Role

**What:** Query mailboxes by role (sent, drafts) to get IDs
**When to use:** Before sending to determine target mailbox IDs
**Example:**
```typescript
// Source: RFC 8621 Section 2, existing codebase pattern
// Already implemented in create_draft and delete_email - reuse pattern
const mailboxResponse = await jmapClient.request([
  ['Mailbox/query', {
    accountId: session.accountId,
    filter: { role: 'sent' },
  }, 'findSent'],
  ['Mailbox/query', {
    accountId: session.accountId,
    filter: { role: 'drafts' },
  }, 'findDrafts'],
]);

const sentMailboxId = mailboxResponse.methodResponses[0][1].ids[0];
const draftsMailboxId = mailboxResponse.methodResponses[1][1].ids[0];
```

### Pattern 5: Identity Resolution

**What:** Fetch Identity to get identityId for EmailSubmission
**When to use:** Before sending - needed for EmailSubmission/set
**Example:**
```typescript
// Source: RFC 8621 Section 6
// Get available identities
const identityResponse = await jmapClient.request([
  ['Identity/get', {
    accountId: session.accountId,
  }, 'getIdentities'],
]);

const identities = identityResponse.methodResponses[0][1].list;
// Use first identity or match by email address
const identity = identities[0]; // or find by email
const identityId = identity.id;
```

### Anti-Patterns to Avoid

- **Sending without Identity lookup:** EmailSubmission requires identityId - always fetch Identity first
- **Ignoring onSuccessUpdateEmail:** Emails stay in Drafts without this - always move to Sent
- **Skipping threading headers on reply:** Breaks thread grouping in email clients
- **Creating envelope manually when not needed:** Let server derive from headers - simpler and less error-prone
- **Using bodyStructure with textBody/htmlBody shorthand:** Don't mix approaches - use one or the other

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Message-ID generation | Custom UUID-based ID | Server auto-generation | Server guarantees uniqueness and format |
| MIME encoding | Manual Content-Transfer-Encoding | JMAP bodyValues | JMAP handles encoding transparently |
| Recipient deduplication | Manual Set operations | Server envelope derivation | Server deduplicates from To/Cc/Bcc headers |
| Thread ID assignment | Manual threadId | Server assignment | Server manages thread relationships |

**Key insight:** JMAP servers handle many RFC 5322 complexities. The client should provide structured data and let the server handle serialization.

## Common Pitfalls

### Pitfall 1: Missing urn:ietf:params:jmap:submission Capability
**What goes wrong:** EmailSubmission/set returns unknownMethod error
**Why it happens:** Project uses `['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail']` by default
**How to avoid:** Add submission capability to `using` array for send operations:
```typescript
await jmapClient.request([...], [
  'urn:ietf:params:jmap:core',
  'urn:ietf:params:jmap:mail',
  'urn:ietf:params:jmap:submission',
]);
```
**Warning signs:** `unknownMethod` error when calling EmailSubmission/set

### Pitfall 2: EmailSubmission Reference Resolution Failure
**What goes wrong:** `invalidResultReference` error when referencing created email
**Why it happens:** Using wrong reference syntax or Email/set failed silently
**How to avoid:**
1. Check Email/set response for notCreated before EmailSubmission
2. Use correct reference syntax: `emailId: '#creationId'` (not `#creationId/id`)
**Warning signs:** `invalidResultReference` in methodResponses

### Pitfall 3: No Sent Mailbox Found
**What goes wrong:** Email sends but doesn't appear in Sent folder
**Why it happens:** Server may not have 'sent' role mailbox, or onSuccessUpdateEmail fails
**How to avoid:**
1. Handle case where Sent mailbox doesn't exist (log warning, skip move)
2. Verify onSuccessUpdateEmail syntax carefully
**Warning signs:** Email not visible in Sent, user confusion

### Pitfall 4: Incorrect Threading Headers Format
**What goes wrong:** Replies don't thread correctly in email clients
**Why it happens:** inReplyTo and references must be arrays of strings, not single strings
**How to avoid:**
```typescript
// CORRECT:
inReplyTo: ['<message-id@example.com>'],
references: ['<msg1@ex.com>', '<msg2@ex.com>'],

// WRONG:
inReplyTo: '<message-id@example.com>',  // Not an array
```
**Warning signs:** Replies appear as new threads instead of grouped

### Pitfall 5: Identity Permission Errors
**What goes wrong:** `forbiddenFrom` or `forbiddenToSend` errors
**Why it happens:** User trying to send from address not in their Identity list
**How to avoid:**
1. Always fetch Identity/get first
2. Validate from address matches an Identity
3. Provide helpful error message with available identities
**Warning signs:** `forbiddenFrom`, `forbiddenToSend` SetError types

### Pitfall 6: Missing From Address
**What goes wrong:** Email/set create fails with invalidProperties
**Why it happens:** `from` is required for sending (not for drafts)
**How to avoid:** Always populate `from` field when creating emails for sending
**Warning signs:** `invalidProperties` mentioning `from`

## Code Examples

Verified patterns from official sources:

### Complete send_email Implementation Pattern
```typescript
// Source: RFC 8621 Section 7.5, verified against spec
async function sendEmail(
  jmapClient: JMAPClient,
  params: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    textBody?: string;
    htmlBody?: string;
  }
): Promise<{ emailId: string; submissionId: string }> {
  const session = jmapClient.getSession();

  // Step 1: Get Identity and mailbox IDs
  const setupResponse = await jmapClient.request([
    ['Identity/get', { accountId: session.accountId }, 'getIdentity'],
    ['Mailbox/query', { accountId: session.accountId, filter: { role: 'sent' } }, 'findSent'],
    ['Mailbox/query', { accountId: session.accountId, filter: { role: 'drafts' } }, 'findDrafts'],
  ], [
    'urn:ietf:params:jmap:core',
    'urn:ietf:params:jmap:mail',
    'urn:ietf:params:jmap:submission',
  ]);

  const identity = setupResponse.methodResponses[0][1].list[0];
  const sentMailboxId = setupResponse.methodResponses[1][1].ids?.[0];
  const draftsMailboxId = setupResponse.methodResponses[2][1].ids?.[0];

  if (!identity) throw new Error('No sending identity available');
  if (!draftsMailboxId) throw new Error('No Drafts mailbox found');

  // Step 2: Build email object
  const toAddresses = params.to.map(email => ({ email }));
  const ccAddresses = params.cc?.map(email => ({ email }));
  const bccAddresses = params.bcc?.map(email => ({ email }));

  // Determine body structure
  let bodyStructure: Record<string, unknown>;
  let bodyValues: Record<string, { value: string }>;

  if (params.htmlBody && params.textBody) {
    // Multipart alternative
    bodyStructure = {
      type: 'multipart/alternative',
      subParts: [
        { partId: 'text', type: 'text/plain' },
        { partId: 'html', type: 'text/html' },
      ],
    };
    bodyValues = {
      'text': { value: params.textBody },
      'html': { value: params.htmlBody },
    };
  } else if (params.htmlBody) {
    bodyStructure = { type: 'text/html', partId: 'body' };
    bodyValues = { 'body': { value: params.htmlBody } };
  } else {
    bodyStructure = { type: 'text/plain', partId: 'body' };
    bodyValues = { 'body': { value: params.textBody || '' } };
  }

  const emailCreate: Record<string, unknown> = {
    mailboxIds: { [draftsMailboxId]: true },
    from: [{ name: identity.name, email: identity.email }],
    to: toAddresses,
    subject: params.subject,
    bodyStructure,
    bodyValues,
  };

  if (ccAddresses?.length) emailCreate.cc = ccAddresses;
  if (bccAddresses?.length) emailCreate.bcc = bccAddresses;

  // Step 3: Create and send in single batch
  const onSuccessUpdate: Record<string, unknown> = {
    'keywords/$draft': null,
  };

  if (sentMailboxId) {
    onSuccessUpdate[`mailboxIds/${draftsMailboxId}`] = null;
    onSuccessUpdate[`mailboxIds/${sentMailboxId}`] = true;
  }

  const sendResponse = await jmapClient.request([
    ['Email/set', {
      accountId: session.accountId,
      create: { 'email': emailCreate },
    }, 'createEmail'],
    ['EmailSubmission/set', {
      accountId: session.accountId,
      create: {
        'submission': {
          identityId: identity.id,
          emailId: '#email',
        },
      },
      onSuccessUpdateEmail: { '#submission': onSuccessUpdate },
    }, 'submitEmail'],
  ], [
    'urn:ietf:params:jmap:core',
    'urn:ietf:params:jmap:mail',
    'urn:ietf:params:jmap:submission',
  ]);

  // Verify success
  const emailResult = sendResponse.methodResponses[0][1];
  const submissionResult = sendResponse.methodResponses[1][1];

  if (emailResult.notCreated?.email) {
    throw new Error(`Failed to create email: ${emailResult.notCreated.email.type}`);
  }
  if (submissionResult.notCreated?.submission) {
    throw new Error(`Failed to send: ${submissionResult.notCreated.submission.type}`);
  }

  return {
    emailId: emailResult.created.email.id,
    submissionId: submissionResult.created.submission.id,
  };
}
```

### Complete reply_email Implementation Pattern
```typescript
// Source: RFC 8621, RFC 5322 threading semantics
async function replyToEmail(
  jmapClient: JMAPClient,
  params: {
    originalEmailId: string;
    textBody: string;
    htmlBody?: string;
    replyAll?: boolean;
  }
): Promise<{ emailId: string; submissionId: string }> {
  const session = jmapClient.getSession();

  // Step 1: Fetch original email for threading info
  const fetchResponse = await jmapClient.request([
    ['Identity/get', { accountId: session.accountId }, 'getIdentity'],
    ['Mailbox/query', { accountId: session.accountId, filter: { role: 'sent' } }, 'findSent'],
    ['Mailbox/query', { accountId: session.accountId, filter: { role: 'drafts' } }, 'findDrafts'],
    ['Email/get', {
      accountId: session.accountId,
      ids: [params.originalEmailId],
      properties: ['messageId', 'references', 'subject', 'from', 'to', 'cc', 'replyTo'],
    }, 'getOriginal'],
  ], [
    'urn:ietf:params:jmap:core',
    'urn:ietf:params:jmap:mail',
    'urn:ietf:params:jmap:submission',
  ]);

  const identity = fetchResponse.methodResponses[0][1].list[0];
  const sentMailboxId = fetchResponse.methodResponses[1][1].ids?.[0];
  const draftsMailboxId = fetchResponse.methodResponses[2][1].ids?.[0];
  const original = fetchResponse.methodResponses[3][1].list?.[0];

  if (!original) throw new Error('Original email not found');
  if (!identity) throw new Error('No sending identity available');
  if (!draftsMailboxId) throw new Error('No Drafts mailbox found');

  // Step 2: Build threading headers
  const inReplyTo = original.messageId || [];
  const references = [
    ...(original.references || []),
    ...(original.messageId || []),
  ];

  // Step 3: Determine recipients
  // Reply-To takes precedence over From
  const replyToAddress = original.replyTo?.[0] || original.from?.[0];
  let toAddresses = replyToAddress ? [replyToAddress] : [];
  let ccAddresses: Array<{ name: string | null; email: string }> = [];

  if (params.replyAll) {
    // Add all To recipients except self
    const selfEmail = identity.email.toLowerCase();
    const additionalTo = (original.to || []).filter(
      addr => addr.email.toLowerCase() !== selfEmail
    );
    toAddresses = [...toAddresses, ...additionalTo];

    // Add all CC recipients except self
    ccAddresses = (original.cc || []).filter(
      addr => addr.email.toLowerCase() !== selfEmail
    );
  }

  // Step 4: Build subject
  const subject = original.subject?.startsWith('Re:')
    ? original.subject
    : `Re: ${original.subject || ''}`;

  // Step 5: Build email with threading headers
  let bodyStructure: Record<string, unknown>;
  let bodyValues: Record<string, { value: string }>;

  if (params.htmlBody) {
    bodyStructure = {
      type: 'multipart/alternative',
      subParts: [
        { partId: 'text', type: 'text/plain' },
        { partId: 'html', type: 'text/html' },
      ],
    };
    bodyValues = {
      'text': { value: params.textBody },
      'html': { value: params.htmlBody },
    };
  } else {
    bodyStructure = { type: 'text/plain', partId: 'body' };
    bodyValues = { 'body': { value: params.textBody } };
  }

  const emailCreate: Record<string, unknown> = {
    mailboxIds: { [draftsMailboxId]: true },
    from: [{ name: identity.name, email: identity.email }],
    to: toAddresses,
    subject,
    inReplyTo,
    references,
    bodyStructure,
    bodyValues,
  };

  if (ccAddresses.length > 0) {
    emailCreate.cc = ccAddresses;
  }

  // Step 6: Create and send
  const onSuccessUpdate: Record<string, unknown> = {
    'keywords/$draft': null,
  };

  if (sentMailboxId) {
    onSuccessUpdate[`mailboxIds/${draftsMailboxId}`] = null;
    onSuccessUpdate[`mailboxIds/${sentMailboxId}`] = true;
  }

  const sendResponse = await jmapClient.request([
    ['Email/set', {
      accountId: session.accountId,
      create: { 'reply': emailCreate },
    }, 'createReply'],
    ['EmailSubmission/set', {
      accountId: session.accountId,
      create: {
        'submission': {
          identityId: identity.id,
          emailId: '#reply',
        },
      },
      onSuccessUpdateEmail: { '#submission': onSuccessUpdate },
    }, 'submitReply'],
  ], [
    'urn:ietf:params:jmap:core',
    'urn:ietf:params:jmap:mail',
    'urn:ietf:params:jmap:submission',
  ]);

  // Verify success
  const emailResult = sendResponse.methodResponses[0][1];
  const submissionResult = sendResponse.methodResponses[1][1];

  if (emailResult.notCreated?.reply) {
    throw new Error(`Failed to create reply: ${emailResult.notCreated.reply.type}`);
  }
  if (submissionResult.notCreated?.submission) {
    throw new Error(`Failed to send reply: ${submissionResult.notCreated.submission.type}`);
  }

  return {
    emailId: emailResult.created.reply.id,
    submissionId: submissionResult.created.submission.id,
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Email/import for sending | Email/set create + EmailSubmission/set | RFC 8621 (2019) | Cleaner separation of creation and submission |
| Manual envelope specification | Server-derived envelope from headers | RFC 8621 | Simpler client, fewer errors |
| Single bodyValue for all | bodyStructure + bodyValues | RFC 8621 | Better multipart support |

**Deprecated/outdated:**
- Using Email/import for outgoing mail (use Email/set create instead)
- Specifying charset in bodyValues (JMAP is UTF-8 native)

## Open Questions

Things that couldn't be fully resolved:

1. **Apache James Identity behavior**
   - What we know: Identity/get is supported
   - What's unclear: Does Apache James auto-create identities or require admin setup?
   - Recommendation: Test against jmap.linagora.com, handle zero-identity case gracefully

2. **Sent mailbox creation**
   - What we know: Standard role is 'sent'
   - What's unclear: What if no Sent mailbox exists on server?
   - Recommendation: Log warning and skip onSuccessUpdateEmail mailbox move if Sent not found

3. **Maximum recipients per submission**
   - What we know: Server may have limits (tooManyRecipients error)
   - What's unclear: Apache James specific limit not documented
   - Recommendation: Handle tooManyRecipients error with helpful message

## Sources

### Primary (HIGH confidence)
- [RFC 8621 - JMAP for Mail](https://datatracker.ietf.org/doc/html/rfc8621) - Email/set, EmailSubmission/set, Identity specification
- [JMAP Mail Specification](https://jmap.io/spec-mail.html) - Official spec site with examples
- [JMAP Message Submission Spec](https://github.com/jmapio/jmap/blob/master/spec/mail/messagesubmission.mdown) - Detailed onSuccessUpdateEmail examples

### Secondary (MEDIUM confidence)
- [JMAP MCP Reference Implementation](https://github.com/wyattjoh/jmap-mcp) - Working implementation patterns
- [Apache James JMAP Configuration](https://james.apache.org/server/config-jmap.html) - Server-side requirements

### Tertiary (LOW confidence)
- Threading header semantics based on RFC 5322 and general email client behavior
- Identity auto-discovery patterns based on common JMAP server implementations

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - RFC 8621 defines all operations clearly
- Architecture: HIGH - Existing codebase patterns + RFC examples
- Pitfalls: MEDIUM - Based on spec + common JMAP implementation issues

**Research date:** 2026-01-29
**Valid until:** 60 days (JMAP spec is stable, RFC from 2019)
