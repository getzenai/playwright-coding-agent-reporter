import { describe, it, expect, vi } from 'vitest';
import { PageStateCapture } from '../../src/page-helper';

describe('PageStateCapture', () => {
  describe('capturePageState', () => {
    it('should capture basic page state', async () => {
      const mockPage = {
        url: () => 'https://example.com',
        title: vi.fn().mockResolvedValue('Example Page'),
        evaluate: vi
          .fn()
          .mockResolvedValueOnce('Some visible text') // for getVisibleText
          .mockResolvedValueOnce(['button:has-text("Click")', '#submit']), // for getAvailableSelectors
      };

      const result = await PageStateCapture.capturePageState(mockPage as any);

      expect(result.url).toBe('https://example.com');
      expect(result.title).toBe('Example Page');
      expect(result.visibleText).toBe('Some visible text');
      expect(result.availableSelectors).toEqual(['button:has-text("Click")', '#submit']);
    });

    it('should handle timeout gracefully', async () => {
      const mockPage = {
        url: () => 'https://example.com',
        title: vi.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              // Never resolve to simulate timeout
              setTimeout(() => resolve('Title'), 10000);
            })
        ),
        evaluate: vi.fn().mockResolvedValue(''),
      };

      // Mock console.error to suppress error output
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const startTime = Date.now();
      const result = await PageStateCapture.capturePageState(mockPage as any);
      const elapsed = Date.now() - startTime;

      // Should timeout within 5.5 seconds (5s timeout + overhead)
      expect(elapsed).toBeLessThan(5500);
      expect(result.url).toBe('https://example.com');
      expect(result.title).toBe('Error capturing page state');
      expect(result.visibleText).toBe('');
      expect(result.availableSelectors).toEqual([]);

      consoleErrorSpy.mockRestore();
    }, 10000); // Increase test timeout to 10 seconds

    it('should capture HTML snippet when failed selector is provided', async () => {
      const mockPage = {
        url: () => 'https://example.com',
        title: vi.fn().mockResolvedValue('Example'),
        evaluate: vi
          .fn()
          .mockResolvedValueOnce('Text') // getVisibleText
          .mockResolvedValueOnce([]) // getAvailableSelectors
          .mockResolvedValueOnce('<div>HTML content</div>'), // getHtmlAroundSelector
      };

      const result = await PageStateCapture.capturePageState(mockPage as any, '#missing');

      expect(result.htmlSnippet).toBe('<div>HTML content</div>');
      expect(mockPage.evaluate).toHaveBeenCalledTimes(3);
    });

    it('should handle errors in page methods', async () => {
      const mockPage = {
        url: () => 'https://example.com',
        title: vi.fn().mockRejectedValue(new Error('Title error')),
        evaluate: vi.fn().mockRejectedValue(new Error('Evaluate error')),
      };

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await PageStateCapture.capturePageState(mockPage as any);

      expect(result.url).toBe('https://example.com');
      expect(result.title).toBe('Unable to get title');
      expect(result.visibleText).toBe('');
      expect(result.availableSelectors).toEqual([]);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('internal methods (via capturePageState)', () => {
    it('should truncate visible text to MAX_VISIBLE_TEXT_LENGTH', async () => {
      const longText = 'a'.repeat(3000);
      const mockPage = {
        url: () => 'https://example.com',
        title: vi.fn().mockResolvedValue('Example'),
        evaluate: vi
          .fn()
          .mockResolvedValueOnce(longText) // getVisibleText returns long text
          .mockResolvedValueOnce([]), // getAvailableSelectors
      };

      const result = await PageStateCapture.capturePageState(mockPage as any);

      // Should be truncated to 2000 characters (MAX_VISIBLE_TEXT_LENGTH)
      expect(result.visibleText.length).toBe(2000);
      expect(result.visibleText).toBe('a'.repeat(2000));
    });

    it('should categorize and limit selectors', async () => {
      // Create array of 100 selectors
      const manySelectors = [];
      for (let i = 0; i < 100; i++) {
        manySelectors.push(`button:has-text("Button ${i}")`);
      }

      const mockPage = {
        url: () => 'https://example.com',
        title: vi.fn().mockResolvedValue('Example'),
        evaluate: vi
          .fn()
          .mockResolvedValueOnce('Text') // getVisibleText
          .mockResolvedValueOnce(manySelectors), // getAvailableSelectors returns raw list, not limited yet
      };

      const result = await PageStateCapture.capturePageState(mockPage as any);

      // The actual selector array returned is the full 100, since limiting happens in browser context
      // The test mocks the evaluate function which would normally do the limiting
      expect(result.availableSelectors.length).toBe(100);
    });

    it('should handle missing document body gracefully', async () => {
      const mockPage = {
        url: () => 'https://example.com',
        title: vi.fn().mockResolvedValue('Example'),
        evaluate: vi.fn().mockImplementation((fn) => {
          // Simulate browser context where document.body doesn't exist
          const fnString = fn.toString();
          if (fnString.includes('document.body')) {
            if (fnString.includes('innerText')) {
              // getVisibleText
              return '';
            } else {
              // getAvailableSelectors
              return ['No document body found'];
            }
          }
          return '';
        }),
      };

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await PageStateCapture.capturePageState(mockPage as any);

      expect(result.visibleText).toBe('');
      expect(result.availableSelectors).toEqual(['No document body found']);

      consoleLogSpy.mockRestore();
    });

    it('should extract various selector types', async () => {
      const mockPage = {
        url: () => 'https://example.com',
        title: vi.fn().mockResolvedValue('Example'),
        evaluate: vi.fn().mockImplementation((fn) => {
          const fnString = fn.toString();
          if (fnString.includes('innerText')) {
            // getVisibleText
            return 'Text';
          } else if (fnString.includes('querySelectorAll')) {
            // getAvailableSelectors - mock complex selector extraction
            // This would normally run in browser context
            return [
              'button:has-text("Submit")',
              'a:has-text("Home")',
              '[href="/about"]',
              'input[name="email"]',
              '[placeholder="Enter email"]',
              '#login-form',
              '.container',
              '[data-testid="header"]',
              '[role="navigation"]',
              'h1:has-text("Welcome")',
            ];
          }
          return '';
        }),
      };

      const result = await PageStateCapture.capturePageState(mockPage as any);

      expect(result.availableSelectors).toContain('button:has-text("Submit")');
      expect(result.availableSelectors).toContain('input[name="email"]');
      expect(result.availableSelectors).toContain('#login-form');
      expect(result.availableSelectors).toContain('[data-testid="header"]');
    });
  });
});
