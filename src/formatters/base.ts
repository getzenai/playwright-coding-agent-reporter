import { FailureContext } from '../types';
import { formatActionUrl } from '../helpers/url-formatter';
import { combineErrors } from '../helpers/stack-parser';

export interface ErrorData {
  errorMessage: string;
  errorStack?: string;
  codeSnippet?: string;
  errorLineNumber: number;
  testPath: string;
  testIndex: number;
  duration: number;
  fullTestName: string;
  pageUrl?: string;
  pageTitle?: string;
  actionHistory?: string[];
  availableSelectors?: string[];
  failedSelector?: string;
  visibleText?: string;
  htmlSnippet?: string;
  consoleErrors?: string[];
  networkErrors?: string[];
  stdout?: string[];
  stderr?: string[];
  screenshotPath?: string;
}

export interface FormatterOptions {
  maxInlineErrors: number;
  maxErrorLength: number;
  showCodeSnippet: boolean;
  verboseErrors: boolean;
  capturePageState: boolean;
}

export abstract class BaseFormatter {
  constructor(protected options: FormatterOptions) {}

  abstract formatError(data: ErrorData): string;

  protected stripAnsiCodes(text: string): string {
    return (
      text
        // eslint-disable-next-line no-control-regex
        .replace(/\x1b\[[0-9;]*m/g, '')
        .replace(/\[2m|\[22m|\[31m|\[39m|\[32m/g, '')
        // eslint-disable-next-line no-control-regex
        .replace(/\u001b/g, '')
    );
  }

  protected truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  extractErrorData(failure: FailureContext, testIndex: number): ErrorData {
    const fileName = failure.testFile.replace(process.cwd() + '/', '');

    // Extract the actual error line from the error snippet if available
    let errorLineNumber = failure.lineNumber || 0;
    if (failure.error.snippet) {
      const snippetMatch = failure.error.snippet.match(/>\s*(\d+)\s*\|/);
      if (snippetMatch) {
        errorLineNumber = parseInt(snippetMatch[1], 10);
      }
    }

    const testPath = `${fileName}:${errorLineNumber}:7`;
    const duration = failure.duration;
    const fullTestName = failure.suiteName
      ? `${failure.suiteName} › ${failure.testTitle}`
      : failure.testTitle;

    // Use Playwright's errors directly - they're already well formatted
    const combined = combineErrors(failure.errors);

    // Clean up ANSI codes if present
    const cleanMessage = this.stripAnsiCodes(combined.message);
    const cleanStack = combined.stack ? this.stripAnsiCodes(combined.stack) : undefined;
    const cleanSnippet = combined.snippet ? this.stripAnsiCodes(combined.snippet) : undefined;

    // Extract failed selector from error message if available
    let failedSelector: string | undefined;
    const failedSelectorMatch = cleanMessage.match(/locator\(['"](.+?)['"]\)/);
    if (failedSelectorMatch) {
      failedSelector = failedSelectorMatch[1];
    }

    // Format action history to truncate URLs
    const formattedActionHistory = failure.pageState?.actionHistory?.map((action) =>
      formatActionUrl(action)
    );

    return {
      errorMessage: cleanMessage,
      errorStack: cleanStack,
      codeSnippet: cleanSnippet,
      errorLineNumber,
      testPath,
      testIndex: failure.testIndex || testIndex,
      duration,
      fullTestName,
      pageUrl: failure.pageState?.url || failure.pageUrl,
      pageTitle: failure.pageState?.title,
      actionHistory: formattedActionHistory,
      availableSelectors: failure.pageState?.availableSelectors,
      failedSelector,
      visibleText: failure.pageState?.visibleText,
      htmlSnippet: failure.pageState?.htmlSnippet,
      consoleErrors: failure.consoleErrors,
      networkErrors: failure.networkErrors,
      stdout: failure.stdout,
      stderr: failure.stderr,
      screenshotPath: failure.screenshot ? 'screenshot.png' : undefined,
    };
  }
}
