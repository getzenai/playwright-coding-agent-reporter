/**
 * URL formatting utilities for truncating long URLs, especially data URLs
 */

export function formatUrl(url: string): string {
  if (!url) return 'unknown';

  // Handle data URLs specially
  if (url.startsWith('data:')) {
    const semicolonIndex = url.indexOf(';');
    const commaIndex = url.indexOf(',');

    if (semicolonIndex > -1 && commaIndex > -1) {
      // Extract the MIME type and encoding
      const mimeType = url.substring(5, semicolonIndex);
      const encoding = url.substring(semicolonIndex + 1, commaIndex);
      const content = url.substring(commaIndex + 1);

      // Check if content contains HTML
      if (mimeType === 'text/html' && content.includes('<')) {
        // For HTML data URLs, show the content in a code block format
        const preview = content.length > 50 ? content.substring(0, 50) + '...' : content;
        return `\`data:${mimeType};${encoding},${preview}\``;
      }

      // For non-HTML data URLs, just truncate
      return `data:${mimeType};${encoding}... (truncated)`;
    }

    // Fallback for malformed data URLs - check if it contains HTML
    if (url.includes('<') && url.includes('>')) {
      // Wrap in backticks to prevent HTML rendering
      const truncated = url.length > 80 ? url.substring(0, 80) + '...' : url;
      return `\`${truncated}\``;
    }

    return url.length > 80 ? url.substring(0, 80) + '... (truncated)' : url;
  }

  // Regular URLs - return as is
  return url;
}

export function formatActionUrl(action: string): string {
  // Check if the action contains a URL (navigating, page loaded, etc.)
  const urlMatch = action.match(/(→ Navigating to:|✓ Page loaded:|✓ DOM ready:)\s*(.+)$/);
  if (urlMatch) {
    const prefix = urlMatch[1];
    const url = urlMatch[2];
    const formattedUrl = formatUrl(url);
    // Reconstruct the action with the formatted URL
    const timestampMatch = action.match(/^([\d-T:.Z]+\s*-\s*)/);
    const timestamp = timestampMatch ? timestampMatch[1] : '';
    return `${timestamp}${prefix} ${formattedUrl}`;
  }
  // Return action as-is if no URL found
  return action;
}
