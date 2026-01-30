import { marked } from 'marked';

// Configure marked for email-safe output (module-level, runs once)
marked.setOptions({
  gfm: false,       // Disable GitHub Flavored Markdown
  breaks: true,     // Convert \n to <br> for email readability
});

export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}

export function markdownToPlainText(markdown: string): string {
  // Strip markdown formatting for plain text emails
  return markdown
    .replace(/^#{1,6}\s+/gm, '')            // Remove heading markers
    .replace(/\*\*(.+?)\*\*/g, '$1')        // Remove bold **text**
    .replace(/\*(.+?)\*/g, '$1')            // Remove italic *text*
    .replace(/__(.+?)__/g, '$1')            // Remove bold __text__
    .replace(/_(.+?)_/g, '$1')              // Remove italic _text_
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)') // Convert [text](url) to text (url)
    .replace(/`(.+?)`/g, '$1')              // Remove inline code backticks
    .replace(/^[*\-+]\s+/gm, '• ')        // Convert list markers to bullets
    .trim();
}
