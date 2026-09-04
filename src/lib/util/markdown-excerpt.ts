/**
 * Flattens Markdown to a plain text approximation.
 *
 * This is only meant for excerpts and other non-rendered contexts (like meta
 * descriptions) — use a real Markdown renderer to display the full text.
 */
export const markdownToPlainText = (markdown: string): string =>
  markdown
    // Fenced code blocks: drop entirely, they never read well in an excerpt
    .replace(/```[\s\S]*?(?:```|$)/g, ' ')
    // Images: keep the alt text only
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Links: keep the link text only
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Autolinks: <https://example.com> -> https://example.com
    .replace(/<((?:https?|mailto):[^>\s]+)>/g, '$1')
    // Line-leading markers: headings, blockquotes, list bullets, ordered items
    .replace(/^[ \t]{0,3}(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+|\d+\.[ \t]+)/gm, '')
    // Thematic breaks
    .replace(/^[ \t]{0,3}(?:[-*_][ \t]*){3,}$/gm, ' ')
    // Emphasis, strong and inline code markers
    .replace(/(\*\*\*|\*\*|\*|___|__|`)/g, '')
    // Escaped characters: \* -> *
    .replace(/\\([\\`*_{}[\]()#+\-.!>])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * A plain-text, word-boundary-aware excerpt of a Markdown text.
 *
 * @param maxLength the maximum length in characters, ellipsis excluded.
 */
export const markdownExcerpt = (markdown: string, maxLength = 260): string => {
  const plain = markdownToPlainText(markdown);
  if (plain.length <= maxLength) {
    return plain;
  }
  const truncated = plain.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  // Only cut on a word boundary if that doesn't throw away most of the excerpt
  const cut = lastSpace > maxLength * 0.6 ? truncated.slice(0, lastSpace) : truncated;
  return `${cut.replace(/[\s.,;:!?—–-]+$/, '')}…`;
};
