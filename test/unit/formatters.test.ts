import { describe, it, expect } from 'vitest';
import { ConsoleFormatter, MarkdownFormatter, ErrorFormatter } from '../../src/formatters';
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
      };

      const data = formatter.extractErrorData(failure, 1);
      expect(data.failedSelector).toBe('#missing-element');
    });

    it('should enhance timeout error messages', () => {
      const failure: FailureContext = {
        testTitle: 'test',
        testFile: '/test.spec.ts',
        duration: 5000,
        error: {
          message: 'Timeout exceeded while waiting for locator("#button")',
        },
        pageState: {
          url: 'https://example.com',
          title: 'Example',
          actionHistory: ['click button', 'wait for element'],
          availableSelectors: [],
          visibleText: '',
        },
      };

      const data = formatter.extractErrorData(failure, 1);
      expect(data.errorMessage).toContain('Timeout Context');
      expect(data.errorMessage).toContain('Duration before timeout: 5000ms');
      expect(data.errorMessage).toContain('Page URL at timeout: https://example.com');
      expect(data.errorMessage).toContain('Last action before timeout: wait for element');
    });
  });

  describe('categorizeSelectors', () => {
    it('should categorize selectors correctly', () => {
      const selectors = [
        'button:has-text("Click")',
        'a:has-text("Link")',
        'input[name="email"]',
        '#submit-button',
        '.container',
        '[href="/home"]',
      ];

      // @ts-ignore - accessing protected method for testing
      const result = formatter.categorizeSelectors(selectors);

      expect(result.buttons).toContain('button:has-text("Click")');
      expect(result.links).toContain('a:has-text("Link")');
      expect(result.links).toContain('[href="/home"]');
      expect(result.inputs).toContain('input[name="email"]');
      expect(result.ids).toContain('#submit-button');
      expect(result.others).toContain('.container');
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

  it('should format header with test info', () => {
    const data = {
      testIndex: 1,
      testPath: 'test.spec.ts:10:5',
      fullTestName: 'Suite › Test',
      duration: 1500,
      errorMessage: 'Error',
    };

    const header = formatter.formatHeader(data as any);
    expect(header).toContain('1)');
    expect(header).toContain('test.spec.ts:10:5');
    expect(header).toContain('Suite › Test');
    expect(header).toContain('1500ms');
  });

  it('should format error message in code block', () => {
    const message = 'Error occurred\nOn multiple lines';
    const formatted = formatter.formatErrorMessage(message);

    expect(formatted).toContain('### Error');
    expect(formatted).toContain('```');
    expect(formatted).toContain('Error occurred');
    expect(formatted).toContain('On multiple lines');
  });

  it('should format page state with URL and title', () => {
    const data = {
      pageUrl: 'https://example.com',
      pageTitle: 'Example Page',
      screenshotPath: 'screenshot.png',
      errorMessage: 'Element not found',
    };

    const pageState = formatter.formatPageState(data as any);
    expect(pageState).toContain('Page State When Failed');
    expect(pageState).toContain('URL:** https://example.com');
    expect(pageState).toContain('Title:** Example Page');
    expect(pageState).toContain('Screenshot:** Saved to screenshot.png');
  });
});

describe('MarkdownFormatter', () => {
  describe('with collapsible sections', () => {
    const formatter = new MarkdownFormatter(
      {
        maxErrorLength: 100,
        showCodeSnippet: true,
        verboseErrors: true,
        capturePageState: true,
      },
      true, // useCollapsibleSections
      true // includeEmoji
    );

    it('should format header with emoji', () => {
      const data = {
        testIndex: 1,
        testPath: 'test.spec.ts:10:5',
        fullTestName: 'Suite › Test',
        duration: 1500,
        errorMessage: 'Error',
      };

      const header = formatter.formatHeader(data as any);
      expect(header).toContain('✘');
      expect(header).toContain('test.spec.ts:10:5');
    });

    it('should format code snippet in collapsible section', () => {
      const snippet = 'const x = 1;\nexpect(x).toBe(2);';
      const formatted = formatter.formatCodeSnippet(snippet);

      expect(formatted).toContain('<details>');
      expect(formatted).toContain('<summary>Error Location</summary>');
      expect(formatted).toContain('```typescript');
      expect(formatted).toContain(snippet);
    });

    it('should format selectors with categories', () => {
      const selectors = ['button:has-text("Submit")', 'input[name="email"]', '#login-form'];

      const formatted = formatter.formatSelectors(selectors, 'button#submit');

      expect(formatted).toContain('<details>');
      expect(formatted).toContain('Available Selectors on Page');
      expect(formatted).toContain('Looking for: **button#submit**');
      expect(formatted).toContain('# Buttons:');
      expect(formatted).toContain('# Inputs:');
      expect(formatted).toContain('# Elements with IDs:');
    });

    it('should format action history in collapsible section', () => {
      const actions = ['navigate to page', 'click button', 'wait for element'];
      const formatted = formatter.formatActionHistory(actions);

      expect(formatted).toContain('<details>');
      expect(formatted).toContain('Action History');
      expect(formatted).toContain('navigate to page');
    });
  });

  describe('without collapsible sections', () => {
    const formatter = new MarkdownFormatter(
      {
        maxErrorLength: 100,
        showCodeSnippet: true,
        verboseErrors: true,
        capturePageState: true,
      },
      false, // useCollapsibleSections
      false // includeEmoji
    );

    it('should format header without emoji', () => {
      const data = {
        testIndex: 1,
        fullTestName: 'Suite › Test',
        errorMessage: 'Error',
      };

      const header = formatter.formatHeader(data as any);
      expect(header).not.toContain('✘');
      expect(header).toContain('Test 1:');
    });

    it('should format code snippet without collapsible section', () => {
      const snippet = 'const x = 1;';
      const formatted = formatter.formatCodeSnippet(snippet);

      expect(formatted).not.toContain('<details>');
      expect(formatted).toContain('## Code Location');
      expect(formatted).toContain('```');
    });
  });

  describe('truncation and limits', () => {
    const formatter = new MarkdownFormatter(
      {
        maxErrorLength: 50,
        showCodeSnippet: true,
        verboseErrors: true,
        capturePageState: true,
      },
      true,
      true
    );

    it('should truncate long error messages', () => {
      const longMessage = 'a'.repeat(100);
      const formatted = formatter.formatErrorMessage(longMessage);

      expect(formatted).toContain('a'.repeat(50));
      expect(formatted).toContain('... (truncated)');
    });
  });
});
