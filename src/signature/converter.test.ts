import { describe, it, expect } from 'vitest';
import { markdownToHtml, markdownToPlainText } from './converter.js';

describe('markdownToHtml', () => {
  it('converts simple paragraph to HTML', () => {
    const result = markdownToHtml('Hello world');
    expect(result).toContain('<p>Hello world</p>');
  });

  it('converts bold **text** to <strong>', () => {
    const result = markdownToHtml('This is **bold** text');
    expect(result).toContain('<strong>bold</strong>');
  });

  it('converts italic *text* to <em>', () => {
    const result = markdownToHtml('This is *italic* text');
    expect(result).toContain('<em>italic</em>');
  });

  it('converts links [text](url) to <a> tags', () => {
    const result = markdownToHtml('[Click here](https://example.com)');
    expect(result).toContain('<a href="https://example.com">Click here</a>');
  });

  it('preserves paragraphs on double newlines', () => {
    const result = markdownToHtml('Line one\n\nLine two');
    expect(result).toContain('<p>Line one</p>');
    expect(result).toContain('<p>Line two</p>');
  });

  it('converts mixed formatting correctly', () => {
    const markdown = 'Hello **world**!\n\nThis is [a link](https://example.com)';
    const result = markdownToHtml(markdown);
    expect(result).toContain('<strong>world</strong>');
    expect(result).toContain('<a href="https://example.com">a link</a>');
  });
});

describe('markdownToPlainText', () => {
  it('strips heading markers', () => {
    expect(markdownToPlainText('# Heading 1')).toBe('Heading 1');
    expect(markdownToPlainText('## Heading 2')).toBe('Heading 2');
    expect(markdownToPlainText('### Heading 3')).toBe('Heading 3');
  });

  it('strips bold markers **text**', () => {
    const result = markdownToPlainText('This is **bold** text');
    expect(result).toBe('This is bold text');
  });

  it('strips bold markers __text__', () => {
    const result = markdownToPlainText('This is __bold__ text');
    expect(result).toBe('This is bold text');
  });

  it('strips italic markers *text*', () => {
    const result = markdownToPlainText('This is *italic* text');
    expect(result).toBe('This is italic text');
  });

  it('strips italic markers _text_', () => {
    const result = markdownToPlainText('This is _italic_ text');
    expect(result).toBe('This is italic text');
  });

  it('converts links to "text (url)" format', () => {
    const result = markdownToPlainText('[Click here](https://example.com)');
    expect(result).toBe('Click here (https://example.com)');
  });

  it('strips inline code backticks', () => {
    const result = markdownToPlainText('Use `const` instead of `var`');
    expect(result).toBe('Use const instead of var');
  });

  it('converts list markers to bullets', () => {
    const markdown = '* Item 1\n- Item 2\n+ Item 3';
    const result = markdownToPlainText(markdown);
    expect(result).toContain('• Item 1');
    expect(result).toContain('• Item 2');
    expect(result).toContain('• Item 3');
  });

  it('handles mixed formatting', () => {
    const markdown = '## Welcome\n\nThis is **bold** and *italic*.\n\n[Link](https://example.com)';
    const result = markdownToPlainText(markdown);
    expect(result).toContain('Welcome');
    expect(result).toContain('This is bold and italic.');
    expect(result).toContain('Link (https://example.com)');
    expect(result).not.toContain('##');
    expect(result).not.toContain('**');
    expect(result).not.toContain('*');
  });

  it('trims whitespace', () => {
    const result = markdownToPlainText('  \n\nHello  \n\n  ');
    expect(result).toBe('Hello');
  });
});
