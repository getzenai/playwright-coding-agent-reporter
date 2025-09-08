import { describe, it, expect } from 'vitest';
import { formatUrl, formatActionUrl } from '../../src/helpers/url-formatter';

describe('url-formatter', () => {
  describe('formatUrl', () => {
    it('should return unknown for empty or null URL', () => {
      expect(formatUrl('')).toBe('unknown');
      expect(formatUrl(null as any)).toBe('unknown');
      expect(formatUrl(undefined as any)).toBe('unknown');
    });

    it('should truncate data URLs', () => {
      const dataUrl =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      const result = formatUrl(dataUrl);

      expect(result).toBe('data:image/png;base64... (truncated)');
      expect(result).not.toContain(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
      );
    });

    it('should handle data URLs without encoding', () => {
      const dataUrl = 'data:text/plain,Hello World';
      const result = formatUrl(dataUrl);

      // Short data URLs are not truncated
      expect(result).toBe('data:text/plain,Hello World');
    });

    it('should handle data URLs with charset', () => {
      const dataUrl = 'data:text/html;charset=utf-8,<html>content</html>';
      const result = formatUrl(dataUrl);

      // HTML data URLs are wrapped in backticks
      expect(result).toBe('`data:text/html;charset=utf-8,<html>content</html>`');
    });

    it('should return normal URLs unchanged', () => {
      const url = 'https://example.com/path/to/page?query=value#hash';
      expect(formatUrl(url)).toBe(url);
    });

    it('should handle file URLs', () => {
      const fileUrl = 'file:///path/to/file.html';
      expect(formatUrl(fileUrl)).toBe(fileUrl);
    });

    it('should handle blob URLs', () => {
      const blobUrl = 'blob:https://example.com/550e8400-e29b-41d4-a716-446655440000';
      expect(formatUrl(blobUrl)).toBe(blobUrl);
    });

    it('should handle about URLs', () => {
      expect(formatUrl('about:blank')).toBe('about:blank');
      expect(formatUrl('about:config')).toBe('about:config');
    });
  });

  describe('formatActionUrl', () => {
    it('should format action with URL containing data URL', () => {
      const action =
        '2025-01-01T10:00:00.000Z - → Navigating to: data:text/html;base64,PGh0bWw+PGJvZHk+SGVsbG88L2JvZHk+PC9odG1sPg==';
      const result = formatActionUrl(action);

      expect(result).toBe(
        '2025-01-01T10:00:00.000Z - → Navigating to: data:text/html;base64... (truncated)'
      );
    });

    it('should format action with normal URL unchanged', () => {
      const action = '2025-01-01T10:00:00.000Z - Navigating to: https://example.com';
      const result = formatActionUrl(action);

      expect(result).toBe('2025-01-01T10:00:00.000Z - Navigating to: https://example.com');
    });

    it('should handle actions without URLs', () => {
      const action = '2025-01-01T10:00:00.000Z - Clicking button';
      const result = formatActionUrl(action);

      expect(result).toBe('2025-01-01T10:00:00.000Z - Clicking button');
    });

    it('should handle actions with multiple URLs', () => {
      const action = 'Redirected from data:text/html,test to https://example.com';
      const result = formatActionUrl(action);

      // formatActionUrl only handles specific patterns with arrows
      expect(result).toBe('Redirected from data:text/html,test to https://example.com');
    });

    it('should handle empty action', () => {
      expect(formatActionUrl('')).toBe('');
    });

    it('should handle action with data URL in the middle', () => {
      const action = 'Loading resource data:image/png;base64,longbase64string for element';
      const result = formatActionUrl(action);

      // formatActionUrl only handles specific patterns with arrows
      expect(result).toBe('Loading resource data:image/png;base64,longbase64string for element');
    });
  });
});
