import {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
  TestStep,
} from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';
import { CodingAgentReporterOptions, FailureContext, TestSummary } from './types';

export class CodingAgentReporter implements Reporter {
  private options: Required<CodingAgentReporterOptions>;
  private failures: FailureContext[] = [];
  private testSummary: TestSummary;
  private startTime: number = 0;
  private outputDir: string;
  private testCounter: number = 0;
  private totalTests: number = 0;
  private workers: number = 1;

  constructor(options: CodingAgentReporterOptions = {}) {
    this.options = {
      outputDir: options.outputDir || 'test-results',
      includeScreenshots: options.includeScreenshots ?? true,
      includeAccessibilityTree: options.includeAccessibilityTree ?? true,
      includeConsoleErrors: options.includeConsoleErrors ?? true,
      includeNetworkErrors: options.includeNetworkErrors ?? true,
      includeVideo: options.includeVideo ?? false,
      silent: options.silent ?? false,
      maxErrorLength: options.maxErrorLength ?? 5000,
      outputFormat: options.outputFormat || 'markdown',
      singleReportFile: options.singleReportFile ?? true,
      verboseErrors: options.verboseErrors ?? true,
      maxInlineErrors: options.maxInlineErrors ?? 5,
      showCodeSnippet: options.showCodeSnippet ?? true,
      capturePageState: options.capturePageState ?? true,
    };

    this.outputDir = path.resolve(process.cwd(), this.options.outputDir);

    this.testSummary = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0,
      failures: [],
    };
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.startTime = Date.now();
    this.workers = config.workers || 1;
    this.totalTests = this.countTests(suite);

    if (fs.existsSync(this.outputDir)) {
      fs.rmSync(this.outputDir, { recursive: true });
    }
    fs.mkdirSync(this.outputDir, { recursive: true });

    if (!this.options.silent) {
      console.log(
        `\nRunning ${this.totalTests} tests using ${this.workers} worker${this.workers > 1 ? 's' : ''}\n`
      );
    }
  }

  private countTests(suite: Suite): number {
    let count = 0;
    for (const test of suite.allTests()) {
      count++;
    }
    return count;
  }

  onTestBegin(test: TestCase, result: TestResult): void {
    this.testSummary.total++;
    this.testCounter++;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (!this.options.silent) {
      this.printTestResult(test, result);
    }

    if (result.status === 'passed') {
      this.testSummary.passed++;
    } else if (result.status === 'failed' || result.status === 'timedOut') {
      this.testSummary.failed++;
      this.captureFailure(test, result);
    } else if (result.status === 'skipped') {
      this.testSummary.skipped++;
    }
  }

  private printTestResult(test: TestCase, result: TestResult): void {
    const statusSymbol = result.status === 'passed' ? '✓' : result.status === 'skipped' ? '-' : '✘';
    const statusColor =
      result.status === 'passed'
        ? '\x1b[32m'
        : result.status === 'skipped'
          ? '\x1b[2m'
          : '\x1b[31m';
    const reset = '\x1b[0m';

    const fileName = test.location.file.replace(process.cwd() + '/', '');
    const duration = result.duration ? ` (${result.duration}ms)` : '';
    const testPath = `${fileName}:${test.location.line}:${test.location.column}`;
    const suiteName = test.parent.title || '';

    const testNumber = String(this.testCounter).padStart(2);

    console.log(
      `  ${statusColor}${statusSymbol}${reset}  ${testNumber} ${testPath} › ${suiteName} › ${test.title}${duration}`
    );
  }

  private captureFailure(test: TestCase, result: TestResult): void {
    const error = result.errors[0];
    if (!error) return;

    const failure: FailureContext = {
      testTitle: test.title,
      suiteName: test.parent.title || '',
      testFile: test.location.file,
      lineNumber: test.location.line,
      error: error,
      stdout: result.stdout.map((item) => item.toString()),
      stderr: result.stderr.map((item) => item.toString()),
      duration: result.duration,
      retries: result.retry,
      testIndex: this.testCounter,
    };

    this.extractPageContext(result, failure);
    this.extractAttachments(result, failure);
    if (this.options.capturePageState) {
      this.extractPageState(result, failure);
    }

    this.failures.push(failure);
    this.testSummary.failures.push(failure);
  }

  private extractPageContext(result: TestResult, failure: FailureContext): void {
    for (const attachment of result.attachments) {
      if (attachment.name === 'accessibility-tree' && this.options.includeAccessibilityTree) {
        failure.accessibilityTree = attachment.body?.toString('utf-8');
      } else if (attachment.name === 'screenshot' && this.options.includeScreenshots) {
        failure.screenshot = attachment.body;
      } else if (attachment.name === 'page-url') {
        failure.pageUrl = attachment.body?.toString('utf-8');
      }
    }

    if (this.options.includeConsoleErrors) {
      failure.consoleErrors = this.extractConsoleErrors(result);
    }

    if (this.options.includeNetworkErrors) {
      failure.networkErrors = this.extractNetworkErrors(result);
    }
  }

  private extractConsoleErrors(result: TestResult): string[] {
    const consoleErrors: string[] = [];

    for (const step of result.steps) {
      if (step.title?.includes('console.error') || step.title?.includes('console.warn')) {
        consoleErrors.push(step.title);
      }
    }

    for (const line of result.stdout) {
      const text = line.toString();
      if (text.includes('[Console Error]') || text.includes('[Console Warning]')) {
        consoleErrors.push(text);
      }
    }

    return consoleErrors;
  }

  private extractNetworkErrors(result: TestResult): string[] {
    const networkErrors: string[] = [];

    for (const line of result.stdout) {
      const text = line.toString();
      if (text.includes('ERR_') || text.includes('Failed to load resource')) {
        networkErrors.push(text);
      }
    }

    return networkErrors;
  }

  private extractPageState(result: TestResult, failure: FailureContext): void {
    failure.pageState = {
      url: failure.pageUrl,
    };

    // Extract page state from attachments
    for (const attachment of result.attachments) {
      if (attachment.name === 'page-state' && attachment.body) {
        try {
          const fullState = JSON.parse(attachment.body.toString('utf-8'));
          failure.pageState = { ...failure.pageState, ...fullState };
        } catch {}
      }
      if (attachment.name === 'page-title' && attachment.body && failure.pageState) {
        failure.pageState.title = attachment.body.toString('utf-8');
      }
      if (attachment.name === 'visible-text' && attachment.body && failure.pageState) {
        failure.pageState.visibleText = attachment.body.toString('utf-8');
      }
      if (attachment.name === 'available-selectors' && attachment.body && failure.pageState) {
        try {
          failure.pageState.availableSelectors = JSON.parse(attachment.body.toString('utf-8'));
        } catch {}
      }
      if (attachment.name === 'html-snippet' && attachment.body && failure.pageState) {
        failure.pageState.htmlSnippet = attachment.body.toString('utf-8');
      }
      if (attachment.name === 'action-history' && attachment.body && failure.pageState) {
        failure.pageState.actionHistory = attachment.body.toString('utf-8').split('\n');
      }
    }
  }

  private generateDebuggingSuggestions_REMOVED(failure: FailureContext): string[] {
    const suggestions: string[] = [];
    const errorMsg = failure.error.message || '';

    // For element not found errors
    if (
      errorMsg.includes('not found') ||
      errorMsg.includes('no element') ||
      errorMsg.includes('waiting for')
    ) {
      const selectorMatch = errorMsg.match(
        /locator\(['"](.*?)['"]\)|waiting for (.+?)\s|selector:?\s*(.+?)\s/i
      );
      if (selectorMatch) {
        const selector = selectorMatch[1] || selectorMatch[2] || selectorMatch[3];
        suggestions.push(`Element "${selector}" was not found on the page`);

        if (
          failure.pageState?.availableSelectors &&
          failure.pageState.availableSelectors.length > 0
        ) {
          // Find similar selectors
          const similar = this.findSimilarSelectors(selector, failure.pageState.availableSelectors);
          if (similar.length > 0) {
            suggestions.push(`Did you mean one of these? ${similar.slice(0, 3).join(', ')}`);
          }
        }

        suggestions.push(
          'Try using a text-based selector like: text="Your Text" or page.getByText("Your Text")'
        );
        suggestions.push(
          'Element might be loaded dynamically - consider using page.waitForSelector() first'
        );
      }
    }

    // For assertion failures
    if (errorMsg.includes('Expected') && errorMsg.includes('Received')) {
      suggestions.push('The actual value does not match the expected value');
      suggestions.push("Check if the page content has changed or if there's a timing issue");
      suggestions.push('Consider using waitForLoadState() or waitForSelector() before assertions');
    }

    // For timeout errors
    if (errorMsg.includes('Timeout') || errorMsg.includes('exceeded')) {
      suggestions.push('The operation took too long - page might be slow or element never appears');
      suggestions.push('Try increasing the timeout or checking network conditions');
    }

    // For network errors
    if (failure.pageState?.actionHistory) {
      const networkErrors = failure.pageState.actionHistory.filter((a) =>
        a.includes('Network failed')
      );
      if (networkErrors.length > 0) {
        suggestions.push('Network requests failed - this might affect page content');
        suggestions.push('Check API endpoints and network connectivity');
      }
    }

    return suggestions;
  }

  private findSimilarSelectors(target: string, available: string[]): string[] {
    const similar: string[] = [];
    const targetLower = target.toLowerCase();

    // Extract meaningful parts from target
    const parts = target.match(/[a-zA-Z0-9_-]+/g) || [];

    for (const selector of available) {
      const selectorLower = selector.toLowerCase();

      // Direct substring match
      if (parts.some((part) => selectorLower.includes(part.toLowerCase()))) {
        similar.push(selector);
        continue;
      }

      // Fuzzy match for IDs and classes
      if (target.startsWith('#') && selector.startsWith('#')) {
        const targetId = target.substring(1);
        const selectorId = selector.substring(1);
        if (this.calculateSimilarity(targetId, selectorId) > 0.5) {
          similar.push(selector);
        }
      }
    }

    return [...new Set(similar)].slice(0, 5);
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  private extractAttachments(result: TestResult, failure: FailureContext): void {
    for (const attachment of result.attachments) {
      if (attachment.name === 'trace' && attachment.path) {
        const traceDir = path.join(this.outputDir, 'traces');
        if (!fs.existsSync(traceDir)) {
          fs.mkdirSync(traceDir, { recursive: true });
        }
        const traceName = `${failure.testTitle.replace(/[^a-z0-9]/gi, '_')}.zip`;
        const tracePath = path.join(traceDir, traceName);
        if (attachment.path && fs.existsSync(attachment.path)) {
          fs.copyFileSync(attachment.path, tracePath);
        }
      }
    }
  }

  async onEnd(result: FullResult): Promise<void> {
    this.testSummary.duration = Date.now() - this.startTime;

    if (this.options.outputFormat === 'markdown') {
      await this.generateMarkdownReports();
      await this.writeIndividualTestReports();
    }

    if (!this.options.silent && this.failures.length > 0) {
      console.log('');
      this.printDetailedFailures();
    }

    if (!this.options.silent) {
      const passed = this.testSummary.passed;
      const failed = this.testSummary.failed;
      const skipped = this.testSummary.skipped;

      if (failed > 0) {
        console.log(`\n  ${failed} failed`);
        if (passed > 0) console.log(`  ${passed} passed`);
        if (skipped > 0) console.log(`  ${skipped} skipped`);
        console.log(`  ${this.testSummary.total} total`);
        console.log(`  Finished in ${(this.testSummary.duration / 1000).toFixed(1)}s`);

        if (this.options.singleReportFile) {
          const reportPath = path.join(this.outputDir, 'error-context.md');
          console.log(`\n  📝 Detailed error report: ${reportPath}`);
        }
      } else {
        console.log(`\n  ${passed} passed (${(this.testSummary.duration / 1000).toFixed(1)}s)`);
      }
    }
  }

  private printDetailedFailures(): void {
    const shouldTruncate =
      !this.options.verboseErrors || this.failures.length > this.options.maxInlineErrors;
    const failuresToShow = shouldTruncate
      ? this.failures.slice(0, this.options.maxInlineErrors)
      : this.failures;

    failuresToShow.forEach((failure, index) => {
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
      const testIndex = failure.testIndex || index + 1;
      const duration = failure.duration ? ` (${failure.duration}ms)` : '';
      const fullTestName = failure.suiteName
        ? `${failure.suiteName} › ${failure.testTitle}`
        : failure.testTitle;

      console.log(
        `  ${testIndex}) ${testPath} › ${fullTestName}${duration} ${'─'.repeat(Math.max(0, 60 - testPath.length - fullTestName.length))}`
      );

      // Show detailed error information (same as markdown report)
      console.log('');
      console.log('      Error:');
      const errorMessage = failure.error.message || failure.error.value || 'Unknown error';
      const cleanMessage = this.stripAnsiCodes(errorMessage);
      const errorLines = cleanMessage.split('\n');
      errorLines.forEach((line) => {
        console.log(`        ${line}`);
      });
      console.log('');

      // Show error location code snippet
      if (failure.error.snippet) {
        console.log('      Error Location:');
        const cleanSnippet = this.stripAnsiCodes(failure.error.snippet);
        const snippetLines = cleanSnippet.split('\n');
        snippetLines.forEach((line) => {
          console.log(`        ${line}`);
        });
        console.log('');
      }

      // Show page state information
      if (failure.pageState && this.options.capturePageState) {
        console.log('      🔍 Page State When Failed:');

        if (failure.pageState.url || failure.pageUrl) {
          console.log(`        URL: ${failure.pageState.url || failure.pageUrl}`);
        }
        if (failure.pageState.title) {
          console.log(`        Title: ${failure.pageState.title}`);
        }
        console.log('');

        // Show recent actions
        if (failure.pageState.actionHistory && failure.pageState.actionHistory.length > 0) {
          console.log('        📜 Recent Actions:');
          const recentActions = failure.pageState.actionHistory.slice(-3);
          recentActions.forEach((action) => {
            console.log(`          ${action}`);
          });
          console.log('');
        }

        // Show available selectors (limited for console)
        if (
          failure.pageState.availableSelectors &&
          failure.pageState.availableSelectors.length > 0
        ) {
          const errorMsg = failure.error.message || '';
          const isElementNotFound =
            errorMsg.includes('not found') ||
            errorMsg.includes('no element') ||
            errorMsg.includes('<element(s) not found>');

          if (isElementNotFound) {
            console.log('        🎯 Available Selectors (first 50):');
            const selectorsToShow = failure.pageState.availableSelectors.slice(0, 50);
            selectorsToShow.forEach((selector) => {
              console.log(`          ${selector}`);
            });
            if (failure.pageState.availableSelectors.length > 50) {
              console.log(
                `          ... and ${failure.pageState.availableSelectors.length - 50} more`
              );
            }
            console.log('');
          }
        }
      }

      // Show reproduction command
      console.log('      Reproduction Command:');
      console.log(`        npx playwright test "${failure.testFile}" -g "${failure.testTitle}"`);
      console.log('');

      // Show link to detailed report
      const reportPath = this.options.singleReportFile
        ? path.join(this.outputDir, 'error-context.md')
        : path.join(this.outputDir, `${failure.testTitle.replace(/[^a-z0-9]/gi, '_')}.md`);
      console.log(`      📝 Full Error Context: ${reportPath}`);
      console.log('');
    });

    if (shouldTruncate && this.failures.length > this.options.maxInlineErrors) {
      const remaining = this.failures.length - this.options.maxInlineErrors;
      const reportPath = path.join(this.outputDir, 'error-context.md');
      console.log(
        `  ... and ${remaining} more failure${remaining > 1 ? 's' : ''}. See ${reportPath} for complete details.\n`
      );
    }
  }

  private stripAnsiCodes(text: string): string {
    // Remove ANSI escape codes and special formatting
    return text
      .replace(/\x1b\[[0-9;]*m/g, '')
      .replace(/\[2m|\[22m|\[31m|\[39m|\[32m/g, '')
      .replace(/\u001b/g, '');
  }

  private printCodeSnippet(filePath: string, errorLine: number): void {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const lines = fileContent.split('\n');
      const start = Math.max(0, errorLine - 3);
      const end = Math.min(lines.length, errorLine + 2);

      for (let i = start; i < end; i++) {
        const lineNum = i + 1;
        const prefix = lineNum === errorLine ? '    >' : '     ';
        const lineNumStr = String(lineNum).padStart(4);
        console.log(`${prefix}${lineNumStr} | ${lines[i]}`);

        if (lineNum === errorLine) {
          const match = lines[i].match(/\S/);
          const indent = match ? match.index || 0 : 0;
          console.log(`          | ${' '.repeat(indent)}^`);
        }
      }
    } catch (e) {
      // Ignore if we can't read the file
    }
  }

  private async generateMarkdownReports(): Promise<void> {
    if (this.failures.length === 0) {
      return;
    }

    if (this.options.singleReportFile) {
      await this.generateSingleErrorContextReport();
    } else {
      for (const failure of this.failures) {
        await this.generateFailureReport(failure);
      }
      await this.generateSummaryReport();
    }
  }

  private async generateFailureReport(failure: FailureContext): Promise<void> {
    const fileName = `${failure.testTitle.replace(/[^a-z0-9]/gi, '_')}.md`;
    const filePath = path.join(this.outputDir, fileName);

    let report = `# Test Failure: ${failure.testTitle}\n\n`;
    report += `## Test Location\n`;
    report += `- **File**: ${failure.testFile}:${failure.lineNumber || 'unknown'}\n`;
    report += `- **Duration**: ${failure.duration}ms\n`;
    report += `- **Retries**: ${failure.retries}\n\n`;

    report += `## Error Details\n`;
    report += '```\n';
    const errorMessage = failure.error.message || failure.error.value || 'Unknown error';
    report += errorMessage.substring(0, this.options.maxErrorLength);
    if (errorMessage.length > this.options.maxErrorLength) {
      report += '\n... (truncated)';
    }
    report += '\n```\n\n';

    if (failure.error.stack) {
      report += `## Stack Trace\n`;
      report += '```\n';
      report += failure.error.stack;
      report += '\n```\n\n';
    }

    if (failure.pageUrl) {
      report += `## Page URL\n`;
      report += `${failure.pageUrl}\n\n`;
    }

    if (failure.consoleErrors && failure.consoleErrors.length > 0) {
      report += `## Console Errors\n`;
      for (const error of failure.consoleErrors) {
        report += `- ${error}\n`;
      }
      report += '\n';
    }

    if (failure.networkErrors && failure.networkErrors.length > 0) {
      report += `## Network Errors\n`;
      for (const error of failure.networkErrors) {
        report += `- ${error}\n`;
      }
      report += '\n';
    }

    if (failure.accessibilityTree) {
      report += `## Accessibility Tree\n`;
      report += '```\n';
      report += failure.accessibilityTree;
      report += '\n```\n\n';
    }

    if (failure.stdout.length > 0) {
      report += `## Test Output (stdout)\n`;
      report += '```\n';
      report += failure.stdout.join('\n');
      report += '\n```\n\n';
    }

    if (failure.stderr.length > 0) {
      report += `## Test Errors (stderr)\n`;
      report += '```\n';
      report += failure.stderr.join('\n');
      report += '\n```\n\n';
    }

    if (failure.screenshot) {
      const screenshotDir = path.join(this.outputDir, 'screenshots');
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }
      const screenshotName = `${failure.testTitle.replace(/[^a-z0-9]/gi, '_')}.png`;
      const screenshotPath = path.join(screenshotDir, screenshotName);
      fs.writeFileSync(screenshotPath, failure.screenshot);

      report += `## Screenshot\n`;
      report += `![Screenshot](screenshots/${screenshotName})\n\n`;
    }

    report += `## Reproduction Command\n`;
    report += '```bash\n';
    report += `npx playwright test "${failure.testFile}" -g "${failure.testTitle}"\n`;
    report += '```\n';

    await fs.promises.writeFile(filePath, report, 'utf-8');
  }

  private async generateSingleErrorContextReport(): Promise<void> {
    const reportPath = path.join(this.outputDir, 'error-context.md');

    let report = `# Test Error Context Report\n\n`;
    report += `## Summary\n`;
    report += `- **Total Tests**: ${this.testSummary.total}\n`;
    report += `- **Passed**: ${this.testSummary.passed} ✅\n`;
    report += `- **Failed**: ${this.testSummary.failed} ❌\n`;
    report += `- **Skipped**: ${this.testSummary.skipped} ⏭️\n`;
    report += `- **Duration**: ${(this.testSummary.duration / 1000).toFixed(2)}s\n\n`;

    if (this.failures.length === 0) {
      report += `No failures to report! 🎉\n`;
      await fs.promises.writeFile(reportPath, report, 'utf-8');
      return;
    }

    report += `---\n\n`;

    for (let i = 0; i < this.failures.length; i++) {
      const failure = this.failures[i];
      const fileName = failure.testFile.replace(process.cwd() + '/', '');
      const testPath = `${fileName}:${failure.lineNumber || 0}:7`;
      const duration = failure.duration ? ` (${failure.duration}ms)` : '';
      const fullTestName = failure.suiteName
        ? `${failure.suiteName} › ${failure.testTitle}`
        : failure.testTitle;

      // Use Playwright's format: ✘  2 test/fixtures/example.spec.ts:9:7 › Suite › test name (duration)
      report += `## ✘  ${i + 1} ${testPath} › ${fullTestName}${duration}\n\n`;

      report += `### Error\n`;
      report += '```\n';
      const errorMessage = failure.error.message || failure.error.value || 'Unknown error';
      const cleanMessage = this.stripAnsiCodes(errorMessage);
      report += cleanMessage.substring(0, this.options.maxErrorLength);
      if (cleanMessage.length > this.options.maxErrorLength) {
        report += '\n... (truncated)';
      }
      report += '\n```\n\n';

      // Add code snippet showing the error location
      if (failure.error.snippet) {
        report += `<details>\n<summary>Error Location</summary>\n\n`;
        report += '```typescript\n';
        report += this.stripAnsiCodes(failure.error.snippet);
        report += '\n```\n</details>\n\n';
      }

      if (failure.error.stack) {
        report += `<details>\n<summary>Stack Trace</summary>\n\n`;
        report += '```\n';
        // Extract full stack trace, cleaning ANSI codes
        const cleanStack = this.stripAnsiCodes(failure.error.stack);
        const stackLines = cleanStack.split('\n');

        // Find where the actual stack starts (after error message)
        let stackStartIndex = 0;
        for (let i = 0; i < stackLines.length; i++) {
          if (stackLines[i].trim().startsWith('at ')) {
            stackStartIndex = i;
            break;
          }
        }

        // Include all stack frames
        const stackFrames =
          stackStartIndex > 0
            ? stackLines.slice(stackStartIndex).filter((line) => line.trim().length > 0)
            : [stackLines.find((line) => line.includes('at ')) || 'Stack trace not available'];

        report += stackFrames.join('\n');
        report += '\n```\n</details>\n\n';
      }

      if (failure.pageState && this.options.capturePageState) {
        report += `### 🔍 Page State When Failed\n\n`;

        if (failure.pageState.url || failure.pageState.title || failure.pageUrl) {
          report += `**URL:** ${failure.pageState.url || failure.pageUrl || 'unknown'}\n`;
          report += `**Title:** ${failure.pageState.title || 'unknown'}\n\n`;
        }

        // Action history
        if (failure.pageState.actionHistory && failure.pageState.actionHistory.length > 0) {
          report += `<details>\n<summary>📜 Action History (last ${failure.pageState.actionHistory.length} actions)</summary>\n\n`;
          report += '```\n';
          for (const action of failure.pageState.actionHistory) {
            report += `${action}\n`;
          }
          report += '```\n</details>\n\n';
        }

        // Available selectors
        if (
          failure.pageState.availableSelectors &&
          failure.pageState.availableSelectors.length > 0
        ) {
          report += `<details>\n<summary>🎯 Available Selectors on Page (${failure.pageState.availableSelectors.length} found)</summary>\n\n`;
          report += 'These selectors were actually present on the page:\n\n';
          report += '```\n';

          // Group selectors by type
          const buttons = failure.pageState.availableSelectors.filter((s) => s.includes('button'));
          const links = failure.pageState.availableSelectors.filter(
            (s) => s.includes('a:') || s.includes('href')
          );
          const inputs = failure.pageState.availableSelectors.filter(
            (s) => s.includes('input') || s.includes('[name=') || s.includes('[placeholder=')
          );
          const ids = failure.pageState.availableSelectors.filter((s) => s.startsWith('#'));
          const others = failure.pageState.availableSelectors.filter(
            (s) =>
              !buttons.includes(s) && !links.includes(s) && !inputs.includes(s) && !ids.includes(s)
          );

          if (buttons.length > 0) {
            report += '# Buttons:\n';
            for (const btn of buttons.slice(0, 10)) {
              report += `  ${btn}\n`;
            }
          }

          if (links.length > 0) {
            report += '\n# Links:\n';
            for (const link of links.slice(0, 10)) {
              report += `  ${link}\n`;
            }
          }

          if (inputs.length > 0) {
            report += '\n# Inputs:\n';
            for (const input of inputs.slice(0, 10)) {
              report += `  ${input}\n`;
            }
          }

          if (ids.length > 0) {
            report += '\n# Elements with IDs:\n';
            for (const id of ids.slice(0, 15)) {
              report += `  ${id}\n`;
            }
          }

          if (others.length > 0) {
            report += '\n# Other Elements:\n';
            for (const other of others.slice(0, 10)) {
              report += `  ${other}\n`;
            }
          }

          report += '```\n</details>\n\n';
        }

        // Visible text
        if (failure.pageState.visibleText) {
          report += `<details>\n<summary>📄 Visible Text on Page</summary>\n\n`;
          report += '```\n';
          report += failure.pageState.visibleText;
          report += '\n```\n</details>\n\n';
        }

        // HTML snippet
        if (failure.pageState.htmlSnippet) {
          report += `<details>\n<summary>🔧 HTML Context</summary>\n\n`;
          report += '```html\n';
          report += failure.pageState.htmlSnippet.substring(0, 2000);
          if (failure.pageState.htmlSnippet.length > 2000) {
            report += '\n... (truncated)';
          }
          report += '\n```\n</details>\n\n';
        }
      }

      if (failure.consoleErrors && failure.consoleErrors.length > 0) {
        report += `### Console Errors\n`;
        report += '```\n';
        for (const error of failure.consoleErrors) {
          report += `${error}\n`;
        }
        report += '```\n\n';
      }

      if (failure.networkErrors && failure.networkErrors.length > 0) {
        report += `### Network Errors\n`;
        report += '```\n';
        for (const error of failure.networkErrors) {
          report += `${error}\n`;
        }
        report += '```\n\n';
      }

      if (failure.accessibilityTree) {
        report += `<details>\n<summary>Accessibility Tree</summary>\n\n`;
        report += '```\n';
        report += failure.accessibilityTree;
        report += '\n```\n</details>\n\n';
      }

      if (failure.stdout.length > 0) {
        report += `<details>\n<summary>Test Output (stdout)</summary>\n\n`;
        report += '```\n';
        report += failure.stdout.join('\n');
        report += '\n```\n</details>\n\n';
      }

      if (failure.stderr.length > 0) {
        report += `<details>\n<summary>Test Errors (stderr)</summary>\n\n`;
        report += '```\n';
        report += failure.stderr.join('\n');
        report += '\n```\n</details>\n\n';
      }

      if (failure.screenshot) {
        const screenshotName = `failure-${i + 1}-${failure.testTitle.replace(/[^a-z0-9]/gi, '_')}.png`;
        const screenshotPath = path.join(this.outputDir, screenshotName);
        fs.writeFileSync(screenshotPath, failure.screenshot);

        report += `### Screenshot\n`;
        report += `![Screenshot](./${screenshotName})\n\n`;
      }

      report += `### Reproduction Command\n`;
      report += '```bash\n';
      report += `npx playwright test "${failure.testFile}" -g "${failure.testTitle}"\n`;
      report += '```\n\n';

      report += `---\n\n`;
    }

    report += `## Quick Fix Commands\n\n`;
    report += '```bash\n';
    report += '# Run all failed tests\n';
    for (const failure of this.failures) {
      report += `npx playwright test "${failure.testFile}" -g "${failure.testTitle}"\n`;
    }
    report += '```\n';

    await fs.promises.writeFile(reportPath, report, 'utf-8');
  }

  private async writeIndividualTestReports(): Promise<void> {
    // Wait for Playwright to finish writing its files
    await new Promise((resolve) => setTimeout(resolve, 500));

    // After tests have run, write individual error reports to test result directories
    if (!fs.existsSync(this.outputDir)) {
      return;
    }

    const dirs = await fs.promises.readdir(this.outputDir);

    for (const dir of dirs) {
      const dirPath = path.join(this.outputDir, dir);
      const stat = await fs.promises.stat(dirPath);

      if (stat.isDirectory()) {
        // Check if this directory has an error-context.md file (created by Playwright)
        const errorContextPath = path.join(dirPath, 'error-context.md');
        if (fs.existsSync(errorContextPath)) {
          // Find the corresponding failure for this test directory
          let matched = false;

          for (const failure of this.failures) {
            // Create multiple possible patterns to match
            const testWords = failure.testTitle
              .toLowerCase()
              .replace(/[^a-z0-9\s]/g, '')
              .split(/\s+/)
              .filter((w) => w.length > 2);
            const dirLower = dir.toLowerCase();

            // Check if directory name contains key words from test
            const matchCount = testWords.filter((word) => dirLower.includes(word)).length;

            if (matchCount >= 2 || (matchCount >= 1 && testWords.length <= 2)) {
              // Generate the individual error report
              const report = await this.generateIndividualErrorReport(failure);

              // Overwrite the Playwright-generated error-context.md
              await fs.promises.writeFile(errorContextPath, report, 'utf-8');
              matched = true;
              break;
            }
          }

          // If no match found but we have failures, use the first failure as fallback
          if (!matched && this.failures.length > 0) {
            // Try to match by index - assuming order is preserved
            const failureIndex = dirs.indexOf(dir);
            if (failureIndex < this.failures.length) {
              const failure = this.failures[failureIndex];
              const report = await this.generateIndividualErrorReport(failure);
              await fs.promises.writeFile(errorContextPath, report, 'utf-8');
            }
          }
        }
      }
    }
  }

  private async generateIndividualErrorReport(failure: FailureContext): Promise<string> {
    let report = `# Error Context: ${failure.testTitle}\n\n`;
    report += `## Test Location\n`;
    report += `${failure.testFile}:${failure.lineNumber || 0}\n\n`;

    report += `## Error\n`;
    const errorMessage = failure.error.message || failure.error.value || 'Unknown error';
    const cleanMessage = this.stripAnsiCodes(errorMessage);
    report += cleanMessage + '\n\n';

    // Add code snippet showing the error location
    if (failure.error.snippet) {
      report += `## Code Location\n`;
      report += '```\n';
      report += this.stripAnsiCodes(failure.error.snippet);
      report += '\n```\n\n';
    }

    // Add full stack trace
    if (failure.error.stack) {
      report += `## Stack Trace\n`;
      report += '```\n';
      const cleanStack = this.stripAnsiCodes(failure.error.stack);
      const stackLines = cleanStack.split('\n');

      // Find where the actual stack starts (after error message)
      let stackStartIndex = 0;
      for (let i = 0; i < stackLines.length; i++) {
        if (stackLines[i].trim().startsWith('at ')) {
          stackStartIndex = i;
          break;
        }
      }

      // Include all stack frames
      if (stackStartIndex > 0) {
        const stackFrames = stackLines
          .slice(stackStartIndex)
          .filter((line) => line.trim().length > 0);
        report += stackFrames.join('\n');
      } else {
        report += cleanStack;
      }
      report += '\n```\n\n';
    }

    if (failure.pageState) {
      report += `## Page State\n`;
      report += `**URL:** ${failure.pageState.url || failure.pageUrl || 'unknown'}\n`;
      report += `**Title:** ${failure.pageState.title || 'unknown'}\n\n`;

      if (failure.pageState.availableSelectors && failure.pageState.availableSelectors.length > 0) {
        report += `### Available Selectors\n`;
        report += failure.pageState.availableSelectors.join('\n');
        report += '\n\n';
      }

      if (failure.pageState.visibleText) {
        report += `### Visible Text\n`;
        report += failure.pageState.visibleText;
        report += '\n\n';
      }

      if (failure.pageState.actionHistory && failure.pageState.actionHistory.length > 0) {
        report += `### Action History\n`;
        report += failure.pageState.actionHistory.join('\n');
        report += '\n\n';
      }

      if (failure.pageState.htmlSnippet) {
        report += `### HTML Context\n`;
        report += failure.pageState.htmlSnippet.substring(0, 2000);
        if (failure.pageState.htmlSnippet.length > 2000) {
          report += '\n... (truncated)';
        }
        report += '\n';
      }
    }

    return report;
  }

  private async generateSummaryReport(): Promise<void> {
    const summaryPath = path.join(this.outputDir, 'SUMMARY.md');

    let summary = `# Test Execution Summary\n\n`;
    summary += `## Statistics\n`;
    summary += `- **Total Tests**: ${this.testSummary.total}\n`;
    summary += `- **Passed**: ${this.testSummary.passed} ✅\n`;
    summary += `- **Failed**: ${this.testSummary.failed} ❌\n`;
    summary += `- **Skipped**: ${this.testSummary.skipped} ⏭️\n`;
    summary += `- **Duration**: ${(this.testSummary.duration / 1000).toFixed(2)}s\n\n`;

    if (this.failures.length > 0) {
      summary += `## Failed Tests\n\n`;
      for (const failure of this.failures) {
        const fileName = `${failure.testTitle.replace(/[^a-z0-9]/gi, '_')}.md`;
        summary += `### ❌ ${failure.testTitle}\n`;
        summary += `- **Location**: ${failure.testFile}:${failure.lineNumber || 'unknown'}\n`;
        summary += `- **Error**: ${failure.error.message?.split('\n')[0] || 'Unknown error'}\n`;
        summary += `- **Details**: [View Report](./${fileName})\n\n`;
      }

      summary += `## Quick Fix Commands\n\n`;
      summary += '```bash\n';
      summary += '# Run all failed tests\n';
      for (const failure of this.failures) {
        summary += `npx playwright test "${failure.testFile}" -g "${failure.testTitle}"\n`;
      }
      summary += '```\n';
    }

    await fs.promises.writeFile(summaryPath, summary, 'utf-8');
  }
}

export default CodingAgentReporter;
