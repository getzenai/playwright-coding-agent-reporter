import { TestSummary, FailureContext } from '../types';

export class SummaryFormatter {
  constructor(private outputDir: string = 'test-report-for-coding-agents') {}

  formatSummary(summary: TestSummary, startTime: number): string {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const totalRun = summary.passed + summary.failed + summary.skipped;

    // Build the one-line summary
    let output = '';

    // Main summary line
    const failedAndSkipped = summary.failed + summary.skipped;
    if (failedAndSkipped > 0) {
      output += `E2E Test Run: ${summary.passed}/${totalRun} passed (${failedAndSkipped} failed/skipped) in ${duration}s\n`;
    } else {
      output += `E2E Test Run: ${summary.passed}/${totalRun} passed in ${duration}s\n`;
    }

    // Failed tests section
    if (summary.failed > 0) {
      output += `\n  FAILED (${summary.failed}):\n`;
      const failedTests = summary.failures.filter(
        (f) => f.error?.message && !this.isSkippedTest(f)
      );

      failedTests.forEach((failure) => {
        const fileName = failure.testFile.replace(process.cwd() + '/', '');
        const errorType = this.extractErrorType(failure);
        const testName = failure.suiteName
          ? `${failure.suiteName} - ${failure.testTitle}`
          : failure.testTitle;

        output += `    ✗ ${fileName}:${failure.lineNumber || '?'} - ${testName} - ${errorType}\n`;
      });
    }

    // Skipped tests section
    if (summary.skipped > 0) {
      output += `\n  SKIPPED (${summary.skipped}):\n`;
      // Note: We don't have direct access to skipped test details in the failures array
      // since Playwright doesn't capture them as failures. This is a limitation.
      // For now, we'll check if any failures might be skip-related
      const skippedTests = summary.failures.filter((f) => this.isSkippedTest(f));

      if (skippedTests.length > 0) {
        skippedTests.forEach((failure) => {
          const fileName = failure.testFile.replace(process.cwd() + '/', '');
          const skipReason = this.extractSkipReason(failure);
          const testName = failure.suiteName
            ? `${failure.suiteName} - ${failure.testTitle}`
            : failure.testTitle;

          output += `    ⊘ ${fileName}:${failure.lineNumber || '?'} - ${testName} - ${skipReason}\n`;
        });
      } else {
        // Generic message when we don't have skip details
        output += `    ⊘ ${summary.skipped} test${summary.skipped > 1 ? 's' : ''} skipped\n`;
      }
    }

    // Add pointer to detailed reports
    if (summary.failed > 0) {
      // Use relative path from current working directory
      const relativePath = this.outputDir.startsWith('./') ? this.outputDir : `./${this.outputDir}`;
      output += `\n  See for failed test details: ${relativePath}/\n`;
    }

    return output;
  }

  private extractErrorType(failure: FailureContext): string {
    const message = failure.error?.message || '';

    // Check for timeout
    if (message.includes('Timeout') || message.includes('exceeded')) {
      // Try to extract the selector or action
      const selectorMatch = message.match(/locator\(['"](.+?)['"]\)/);
      if (selectorMatch) {
        return `Timeout: [${selectorMatch[1]}]`;
      }
      const actionMatch = message.match(/waiting for (.+?)[\s\n]/);
      if (actionMatch) {
        return `Timeout: ${actionMatch[1]}`;
      }
      return 'Timeout';
    }

    // Check for assertion/expect errors
    if (message.includes('expect') || message.includes('Expected')) {
      // Try to extract expected vs actual
      const expectedMatch = message.match(/Expected (.+?), (?:but )?(?:received|got) (.+?)[\s\n.]/);
      if (expectedMatch) {
        return `Expected ${expectedMatch[1]}, got ${expectedMatch[2]}`;
      }
      return 'Assertion failed';
    }

    // Check for element not found
    if (message.includes('not found') || message.includes('no element')) {
      const selectorMatch = message.match(/locator\(['"](.+?)['"]\)/);
      if (selectorMatch) {
        return `Element not found: [${selectorMatch[1]}]`;
      }
      return 'Element not found';
    }

    // Check for other common error types
    if (message.includes('constraint violation')) {
      return 'constraint violation';
    }

    if (message.includes('Network') || message.includes('fetch')) {
      return 'Network error';
    }

    if (message.includes('navigation')) {
      return 'Navigation failed';
    }

    // Return first line of error or generic message
    const firstLine = message.split('\n')[0];
    if (firstLine && firstLine.length < 50) {
      return firstLine;
    }

    return 'Test failed';
  }

  private isSkippedTest(failure: FailureContext): boolean {
    const message = failure.error?.message?.toLowerCase() || '';
    return (
      message.includes('skip') ||
      message.includes('dependency failed') ||
      message.includes('setup failed') ||
      message.includes('condition not met')
    );
  }

  private extractSkipReason(failure: FailureContext): string {
    const message = failure.error?.message?.toLowerCase() || '';

    if (message.includes('dependency failed')) {
      return 'dependency failed';
    }

    if (message.includes('setup failed')) {
      return 'setup failed';
    }

    if (message.includes('condition not met')) {
      return 'condition not met';
    }

    if (message.includes('skip')) {
      return 'skipped';
    }

    return 'unknown reason';
  }
}
