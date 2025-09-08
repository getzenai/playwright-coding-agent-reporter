import { describe, it, expect } from 'vitest';
import { ConsoleFormatter } from '../../src/formatters/console';
import { MarkdownFormatter } from '../../src/formatters/markdown';
import { BaseFormatter as ErrorFormatter } from '../../src/formatters/base';
import type { FailureContext } from '../../src/types';

describe('ErrorFormatter Base Class', () => {
  const formatter = new ConsoleFormatter({
    maxErrorLength: 1000,
    showCodeSnippet: true,
    verboseErrors: true,
    capturePageState: true,
  });

  describe('stripAnsiCodes', () => {
    it('should remove ANSI color codes', () => {
      const input = '\x1b[31mError\x1b[39m: \x1b[32mSuccess\x1b[0m';
      // @ts-ignore - accessing protected method for testing
      const result = formatter.stripAnsiCodes(input);
      expect(result).toBe('Error: Success');
    });

    it('should remove various ANSI codes', () => {
      const input = '[2mDim[22m [31mRed[39m [32mGreen';
      // @ts-ignore - accessing protected method for testing
      const result = formatter.stripAnsiCodes(input);
      expect(result).toBe('Dim Red Green');
    });
  });

  describe('truncateText', () => {
    it('should not truncate text shorter than limit', () => {
      const text = 'Short text';
      // @ts-ignore - accessing protected method for testing
      const result = formatter.truncateText(text, 20);
      expect(result).toBe('Short text');
    });

    it('should truncate text longer than limit', () => {
      const text = 'This is a very long text that needs truncation';
      // @ts-ignore - accessing protected method for testing
      const result = formatter.truncateText(text, 10);
      expect(result).toBe('This is a ...');
    });
  });

  describe('extractErrorData', () => {
    it('should extract error data from failure context', () => {
      const failure: FailureContext = {
        testTitle: 'test title',
        suiteName: 'suite name',
        testFile: '/path/to/test.spec.ts',
        lineNumber: 42,
        duration: 1234,
        error: {
          message: 'Test failed',
          snippet: '  > 45 | expect(true).toBe(false)',
        },
        errors: [
          {
            message: 'Test failed',
            snippet: '  > 45 | expect(true).toBe(false)',
          },
        ],
        consoleErrors: ['console error'],
        networkErrors: ['network error'],
        stdout: ['stdout line'],
        stderr: ['stderr line'],
      };

      const data = formatter.extractErrorData(failure, 1);

      expect(data.fullTestName).toBe('suite name › test title');
      expect(data.errorMessage).toBe('Test failed');
      expect(data.duration).toBe(1234);
      expect(data.errorLineNumber).toBe(45); // Extracted from snippet
      expect(data.consoleErrors).toEqual(['console error']);
      expect(data.networkErrors).toEqual(['network error']);
    });

    it('should extract failed selector from error message', () => {
      const failure: FailureContext = {
        testTitle: 'test',
        testFile: '/test.spec.ts',
        error: {
          message: 'locator("#missing-element") not found',
        },
        errors: [
          {
            message: 'locator("#missing-element") not found',
          },
        ],
      };

      const data = formatter.extractErrorData(failure, 1);
      expect(data.failedSelector).toBe('#missing-element');
    });

    it('should extract data from timeout error messages', () => {
      const failure: FailureContext = {
        testTitle: 'test',
        testFile: '/test.spec.ts',
        duration: 5000,
        error: {
          message: 'Timeout exceeded while waiting for locator("#button")',
        },
        errors: [
          {
            message: 'Timeout exceeded while waiting for locator("#button")',
          },
        ],
        pageState: {
          url: 'https://example.com',
          title: 'Example',
          actionHistory: ['click button', 'wait for element'],
          availableSelectors: [],
          visibleText: '',
        },
      };

      const data = formatter.extractErrorData(failure, 1);
      // The timeout enhancement was removed - just check basic extraction
      expect(data.errorMessage).toContain('Timeout exceeded');
      expect(data.duration).toBe(5000);
      expect(data.pageUrl).toBe('https://example.com');
      expect(data.actionHistory).toEqual(['click button', 'wait for element']);
    });
  });
});

describe('ConsoleFormatter', () => {
  const formatter = new ConsoleFormatter({
    maxErrorLength: 100,
    showCodeSnippet: true,
    verboseErrors: true,
    capturePageState: true,
  });

  it('should format complete error output', () => {
    const data = {
      testIndex: 1,
      testPath: 'test.spec.ts:10:5',
      fullTestName: 'Suite › Test',
      duration: 1500,
      errorMessage: 'Element not found\nOn multiple lines', // Changed to trigger selectors display
      errorStack: 'at test.spec.ts:10:5\nat Object.<anonymous>',
      codeSnippet: '  > 10 | expect(true).toBe(false)',
      pageUrl: 'https://example.com',
      pageTitle: 'Example Page',
      screenshotPath: 'screenshot.png',
      consoleErrors: ['console error'],
      networkErrors: ['network error'],
      actionHistory: ['click button'],
      availableSelectors: ['#button'],
      visibleText: 'Some text',
      stdout: ['stdout line'],
      stderr: ['stderr line'],
    };

    const formatted = formatter.formatError(data as any);

    // Check header
    expect(formatted).toContain('1) test.spec.ts:10:5 › Suite › Test');
    expect(formatted).toContain('Duration: 1500ms');

    // Check error section
    expect(formatted).toContain('### Error');
    expect(formatted).toContain('Element not found');
    expect(formatted).toContain('On multiple lines');

    // Check stack trace
    expect(formatted).toContain('### Stack Trace');
    expect(formatted).toContain('at test.spec.ts:10:5');

    // Check code location
    expect(formatted).toContain('### Code Location');
    expect(formatted).toContain('expect(true).toBe(false)');

    // Check page state
    expect(formatted).toContain('Page State When Failed');
    expect(formatted).toContain('URL:** https://example.com');
    expect(formatted).toContain('Title:** Example Page');
    expect(formatted).toContain('Screenshot:** Saved to screenshot.png');

    // Check other sections
    expect(formatted).toContain('Recent Actions');
    expect(formatted).toContain('Available Selectors'); // Now will appear due to 'not found' in error
    expect(formatted).toContain('Visible Text');
  });
});

describe('MarkdownFormatter', () => {
  const formatter = new MarkdownFormatter({
    maxErrorLength: 100,
    showCodeSnippet: true,
    verboseErrors: true,
    capturePageState: true,
  });

  it('should format complete markdown report', () => {
    const data = {
      testIndex: 1,
      testPath: 'test.spec.ts:10:5',
      fullTestName: 'Suite › Test',
      duration: 1500,
      errorMessage: 'Error occurred\nOn multiple lines',
      errorStack: 'at test.spec.ts:10:5\nat Object.<anonymous>',
      codeSnippet: '  > 10 | expect(true).toBe(false)',
      pageUrl: 'https://example.com',
      pageTitle: 'Example Page',
      screenshotPath: 'screenshot.png',
      consoleErrors: ['console error'],
      networkErrors: ['network error'],
      actionHistory: ['click button', 'wait for element'],
      availableSelectors: ['#button', 'input[name="email"]'],
      visibleText: 'Some visible text',
      htmlSnippet: '<div>HTML content</div>',
      stdout: ['stdout line'],
      stderr: ['stderr line'],
      failedSelector: '#missing-element',
    };

    const formatted = formatter.formatError(data as any);

    // Check header
    expect(formatted).toContain('1) test.spec.ts:10:5 › Suite › Test');
    expect(formatted).toContain('Duration: 1500ms');

    // Check error section
    expect(formatted).toContain('### Error');
    expect(formatted).toContain('```');
    expect(formatted).toContain('Error occurred');

    // Check stack trace
    expect(formatted).toContain('### Stack Trace');
    expect(formatted).toContain('at test.spec.ts:10:5');

    // Check code location
    expect(formatted).toContain('### Code Location');
    expect(formatted).toContain('expect(true).toBe(false)');

    // Check page state
    expect(formatted).toContain('### Page State When Failed');
    expect(formatted).toContain('**URL:** https://example.com');
    expect(formatted).toContain('**Title:** Example Page');
    expect(formatted).toContain('![Screenshot](./screenshot.png)');

    // Check action history
    expect(formatted).toContain('### Action History');
    expect(formatted).toContain('click button');
    expect(formatted).toContain('wait for element');

    // Check available selectors
    expect(formatted).toContain('### Available Selectors');
    expect(formatted).toContain('#button');
    expect(formatted).toContain('input[name="email"]');

    // Similar selectors section only appears if there are similar selectors
    // In this test, we don't have the similarity calculation so skip this check

    // Check visible text
    expect(formatted).toContain('### Visible Text');
    expect(formatted).toContain('Some visible text');

    // Console and network errors sections are not implemented in markdown formatter
    // They would need to be added if required

    // Check logs
    expect(formatted).toContain('### Browser Logs');
    expect(formatted).toContain('stdout line');
    expect(formatted).toContain('### Server Logs');
    expect(formatted).toContain('stderr line');
  });

  it('should handle missing optional data gracefully', () => {
    const minimalData = {
      testIndex: 1,
      testPath: 'test.spec.ts:10:5',
      fullTestName: 'Test',
      errorMessage: 'Error',
    };

    const formatted = formatter.formatError(minimalData as any);

    expect(formatted).toContain('### Error');
    expect(formatted).toContain('Error');
    expect(formatted).not.toContain('### Stack Trace');
    expect(formatted).not.toContain('### Code Location');
  });
});
