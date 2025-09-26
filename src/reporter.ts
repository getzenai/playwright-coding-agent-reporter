import {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';
import { CodingAgentReporterOptions, FailureContext, TestSummary } from './types';
import { ConsoleFormatter } from './formatters/console';
import { MarkdownFormatter } from './formatters/markdown';
import { SummaryFormatter } from './formatters/summary';
import { FormatterOptions } from './formatters/base';

// Constants
const SIMILARITY_THRESHOLD = 0.5;
const MAX_SIMILAR_SUGGESTIONS = 5;

export class CodingAgentReporter implements Reporter {
  private options: Required<CodingAgentReporterOptions>;
  private failures: FailureContext[] = [];
  private testSummary: TestSummary;
  private startTime: number = 0;
  private outputDir: string;
  private reportsDir: string;
  private testCounter: number = 0;
  private totalTests: number = 0;
  private workers: number = 1;
  private consoleFormatter: ConsoleFormatter;
  private markdownFormatter: MarkdownFormatter;
  private summaryFormatter: SummaryFormatter;
  private dotColumn: number = 0;
  private failedTestsForDotMode: Array<{ test: TestCase; result: TestResult }> = [];

  // Safety helpers
  private isSubdirectory(parentDir: string, dir: string): boolean {
    const relativePath = path.relative(parentDir, dir);
    return !!relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
  }

  private isSafeToRemove(dir: string): boolean {
    // Resolve against CWD and guard against removing root or project root
    const cwd = process.cwd();
    const abs = path.resolve(cwd, dir);
    let realAbs = abs;
    try {
      if (fs.existsSync(abs)) realAbs = fs.realpathSync(abs);
    } catch {
      // Ignore file system errors when resolving path
    }
    const root = path.parse(realAbs).root;
    const relToCwd = path.relative(cwd, realAbs);
    // Must be inside CWD, not equal to CWD, and not filesystem root
    if (!relToCwd || relToCwd === '' || relToCwd === '.') return false;
    if (realAbs === cwd) return false;
    if (realAbs === root) return false;
    if (relToCwd.startsWith('..') || path.isAbsolute(relToCwd)) return false;
    return true;
  }

  private ensureOutputDir(): void {
    try {
      fs.mkdirSync(this.outputDir, { recursive: true });
    } catch {
      // Ignore directory creation errors
    }
  }

  constructor(options: CodingAgentReporterOptions = {}) {
    this.options = {
      outputDir: options.outputDir || 'test-report-for-coding-agents',
      includeScreenshots: options.includeScreenshots ?? true,
      includeConsoleErrors: options.includeConsoleErrors ?? true,
      includeNetworkErrors: options.includeNetworkErrors ?? true,
      includeVideo: options.includeVideo ?? false,
      silent: options.silent ?? false,
      maxErrorLength: options.maxErrorLength ?? 5000,
      singleReportFile: options.singleReportFile ?? true,
      verboseErrors: options.verboseErrors ?? true,
      maxInlineErrors: options.maxInlineErrors ?? 5,
      showCodeSnippet: options.showCodeSnippet ?? true,
      capturePageState: options.capturePageState ?? true,
    };

    this.outputDir = path.resolve(process.cwd(), this.options.outputDir);
    this.reportsDir = this.outputDir;

    this.testSummary = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0,
      failures: [],
    };

    // Initialize formatters
    const formatterOptions: FormatterOptions = {
      maxInlineErrors: this.options.maxInlineErrors,
      maxErrorLength: this.options.maxErrorLength,
      showCodeSnippet: this.options.showCodeSnippet,
      verboseErrors: this.options.verboseErrors,
      capturePageState: this.options.capturePageState,
    };

    this.consoleFormatter = new ConsoleFormatter(formatterOptions);
    this.markdownFormatter = new MarkdownFormatter(formatterOptions);
    this.summaryFormatter = new SummaryFormatter();
  }

  printsToStdio(): boolean {
    return true;
  }

  private isListMode(): boolean {
    return process.argv.includes('--list');
  }

  private listAllTests(suite: Suite): void {
    const tests = suite.allTests();

    if (tests.length === 0) {
      console.log('No tests found.');
      return;
    }

    console.log('Listing tests:');

    // Track unique files for the summary
    const uniqueFiles = new Set<string>();

    for (const test of tests) {
      const location = test.location;
      const fileName = location.file;
      const line = location.line;
      const column = location.column;
      const testPath = this.getFullTestPath(test);

      uniqueFiles.add(fileName);
      console.log(`  ${fileName}:${line}:${column} › ${testPath}`);
    }

    // Print summary like Playwright's line reporter
    const fileCount = uniqueFiles.size;
    const fileWord = fileCount === 1 ? 'file' : 'files';
    console.log(`\nTotal: ${tests.length} tests in ${fileCount} ${fileWord}`);
  }

  private getFullTestPath(test: TestCase): string {
    const parts: string[] = [];
    let current: Suite | undefined = test.parent;

    while (current && current.title) {
      parts.unshift(current.title);
      current = current.parent;
    }
    parts.push(test.title);

    return parts.join(' › ');
  }

  onBegin(config: FullConfig, suite: Suite): void {
    // Handle list mode - exit early without setting up test execution
    if (this.isListMode()) {
      this.listAllTests(suite);
      return;
    }

    this.startTime = Date.now();
    this.workers = config.workers || 1;
    this.totalTests = this.countTests(suite);

    // Warn if our output folder clashes with any project outputDir (mirroring Playwright HTML reporter UX)
    const projects = (config as { projects?: Array<{ outputDir?: string }> }).projects || [];
    const reported = new Set<string>();
    for (const project of projects) {
      const projectOutput = project.outputDir;
      if (!projectOutput) continue;
      const our = this.outputDir;
      if (this.isSubdirectory(our, projectOutput) || this.isSubdirectory(projectOutput, our)) {
        const key = `${our}|${projectOutput}`;
        if (!reported.has(key)) {
          reported.add(key);
          console.log(
            `\n\x1b[31mConfiguration Warning:\x1b[0m Reporter output folder may clash with Playwright test output folder:\n\n` +
              `    reporter folder: ${our}\n` +
              `    test output:    ${projectOutput}\n\n` +
              `Reporter may clear or overwrite files it manages in its folder. Use a distinct folder to avoid artifact loss.\n`
          );
        }
      }
    }

    // Clear only if safe and not opted out
    const doNotRemove = process.env.PLAYWRIGHT_AGENT_DO_NOT_REMOVE;
    if (!doNotRemove) {
      if (fs.existsSync(this.outputDir)) {
        if (this.isSafeToRemove(this.outputDir)) {
          try {
            // Only remove our coding-agent-reports directory
            if (fs.existsSync(this.reportsDir)) {
              try {
                fs.rmSync(this.reportsDir, { recursive: true, force: true });
              } catch {
                // Ignore removal errors
              }
            }
          } catch {
            // Ignore cleanup errors
          }
        } else {
          console.log(
            `\n\x1b[33mSafety Warning:\x1b[0m Skipping cleanup of outputDir because it is not safely contained within the project: ${this.outputDir}\n`
          );
        }
      }
    }

    this.ensureOutputDir();

    if (!this.options.silent) {
      console.log(
        `\nRunning ${this.totalTests} tests using ${this.workers} worker${this.workers > 1 ? 's' : ''}\n`
      );
    }
  }

  private countTests(suite: Suite): number {
    let count = 0;
    for (const _test of suite.allTests()) {
      count++;
    }
    return count;
  }

  onTestBegin(_test: TestCase, _result: TestResult): void {
    // Skip processing in list mode
    if (this.isListMode()) {
      return;
    }

    this.testSummary.total++;
    this.testCounter++;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    // Skip processing in list mode
    if (this.isListMode()) {
      return;
    }

    if (!this.options.silent) {
      this.printTestResult(test, result);
    }

    if (result.status === 'passed') {
      this.testSummary.passed++;
    } else if (result.status === 'failed' || result.status === 'timedOut') {
      this.testSummary.failed++;
      this.captureFailure(test, result);

      // Write individual report immediately to prevent data loss on timeout
      const lastFailure = this.failures[this.failures.length - 1];
      if (lastFailure) {
        // Fire and forget - don't wait for the write to complete
        this.writeIndividualReport(lastFailure).catch(() => {
          // Ignore write errors
        });
      }
    } else if (result.status === 'skipped') {
      this.testSummary.skipped++;
    }
  }

  private printTestResult(test: TestCase, result: TestResult): void {
    // Print dot progress indicator
    let symbol: string;
    let color: string;

    if (result.status === 'passed') {
      symbol = '·';
      color = '\x1b[32m'; // Green
    } else if (result.status === 'skipped') {
      symbol = '-';
      color = '\x1b[33m'; // Yellow
    } else {
      symbol = 'F';
      color = '\x1b[31m'; // Red
      // Store failed test for later listing
      this.failedTestsForDotMode.push({ test, result });
    }

    const reset = '\x1b[0m';
    process.stdout.write(`${color}${symbol}${reset}`);

    this.dotColumn++;

    // Wrap at 80 characters
    if (this.dotColumn >= 80) {
      process.stdout.write('\n');
      this.dotColumn = 0;
    }
  }

  private captureFailure(test: TestCase, result: TestResult): void {
    if (!result.errors || result.errors.length === 0) return;

    const failure: FailureContext = {
      testTitle: test.title,
      suiteName: test.parent.title || '',
      testFile: test.location.file,
      lineNumber: test.location.line,
      error: result.errors[0], // Keep for compatibility
      errors: result.errors, // All errors from Playwright
      stdout: result.stdout.map((item) => item.toString()),
      stderr: result.stderr.map((item) => item.toString()),
      duration: result.duration,
      retries: result.retry,
      testIndex: this.testCounter,
    };

    // Extract all data from attachments
    this.extractFromAttachments(result, failure);

    // Sort selectors if element not found
    if (failure.pageState?.availableSelectors && failure.errors[0]?.message) {
      const errorMsg = failure.errors[0].message;
      const failedSelectorMatch = errorMsg.match(/locator\(['"](.+?)['"]\)/);
      if (failedSelectorMatch && errorMsg.includes('not found')) {
        const failedSelector = failedSelectorMatch[1];
        failure.pageState.availableSelectors = this.sortSelectorsBySimilarity(
          failedSelector,
          failure.pageState.availableSelectors
        ).slice(0, 30); // Limit to 30 most relevant
      }
    }

    this.failures.push(failure);
    this.testSummary.failures.push(failure);
  }

  private extractFromAttachments(result: TestResult, failure: FailureContext): void {
    // Initialize page state
    failure.pageState = {
      url: undefined,
      title: undefined,
      visibleText: undefined,
      availableSelectors: undefined,
      htmlSnippet: undefined,
      actionHistory: undefined,
      debuggingSuggestions: undefined,
    };

    failure.consoleErrors = [];
    failure.networkErrors = [];
    // Extract attachments first
    for (const attachment of result.attachments) {
      // Handle screenshots - Playwright may use different names
      if (
        (attachment.name === 'screenshot' || attachment.name.includes('screenshot')) &&
        this.options.includeScreenshots
      ) {
        // If there's a path, read the file; otherwise use the body
        if (attachment.path && fs.existsSync(attachment.path)) {
          failure.screenshot = fs.readFileSync(attachment.path);
        } else if (attachment.body) {
          failure.screenshot = attachment.body;
        }
      } else if (attachment.name === 'page-url' && attachment.body) {
        failure.pageUrl = attachment.body.toString('utf-8');
        if (failure.pageState) {
          failure.pageState.url = failure.pageUrl;
        }
      } else if (attachment.name === 'console-errors' && attachment.body) {
        try {
          const errors: unknown = JSON.parse(attachment.body.toString('utf-8'));
          if (Array.isArray(errors)) {
            failure.consoleErrors = errors;
          }
        } catch {
          // Ignore JSON parsing errors for console-errors
        }
      } else if (attachment.name === 'network-errors' && attachment.body) {
        try {
          const errors: unknown = JSON.parse(attachment.body.toString('utf-8'));
          if (Array.isArray(errors)) {
            failure.networkErrors = errors;
          }
        } catch {
          // Ignore JSON parsing errors for network-errors
        }
      } else if (attachment.name === 'page-state' && attachment.body) {
        try {
          const fullState: unknown = JSON.parse(attachment.body.toString('utf-8'));
          if (typeof fullState === 'object' && fullState !== null) {
            failure.pageState = { ...failure.pageState, ...(fullState as Record<string, unknown>) };
          }
        } catch {
          // Ignore JSON parsing errors for page-state
        }
      } else if (attachment.name === 'page-title' && attachment.body) {
        if (failure.pageState) {
          failure.pageState.title = attachment.body.toString('utf-8');
        }
      } else if (attachment.name === 'visible-text' && attachment.body) {
        if (failure.pageState) {
          failure.pageState.visibleText = attachment.body.toString('utf-8');
        }
      } else if (attachment.name === 'available-selectors' && attachment.body) {
        try {
          const selectors: unknown = JSON.parse(attachment.body.toString('utf-8'));
          if (failure.pageState && Array.isArray(selectors)) {
            failure.pageState.availableSelectors = selectors;
          }
        } catch {
          // Ignore JSON parsing errors for available-selectors
        }
      } else if (attachment.name === 'html-snippet' && attachment.body) {
        if (failure.pageState) {
          failure.pageState.htmlSnippet = attachment.body.toString('utf-8');
        }
      } else if (attachment.name === 'action-history' && attachment.body) {
        if (failure.pageState) {
          failure.pageState.actionHistory = attachment.body.toString('utf-8').split('\n');
        }
      }
    }
  }

  private findSimilarSelectors(target: string, available: string[]): string[] {
    const similar: string[] = [];
    const _targetLower = target.toLowerCase();

    const parts = target.match(/[a-zA-Z0-9_-]+/g) || [];

    for (const selector of available) {
      const selectorLower = selector.toLowerCase();

      if (parts.some((part) => selectorLower.includes(part.toLowerCase()))) {
        similar.push(selector);
        continue;
      }

      if (target.startsWith('#') && selector.startsWith('#')) {
        const targetId = target.substring(1);
        const selectorId = selector.substring(1);
        if (this.calculateSimilarity(targetId, selectorId) > SIMILARITY_THRESHOLD) {
          similar.push(selector);
        }
      }
    }

    return [...new Set(similar)].slice(0, MAX_SIMILAR_SUGGESTIONS);
  }

  private sortSelectorsBySimilarity(target: string, available: string[]): string[] {
    // Calculate similarity scores for all selectors
    const scoredSelectors = available.map((selector) => {
      let score = 0;
      const targetLower = target.toLowerCase();
      const selectorLower = selector.toLowerCase();

      // Exact match gets highest score
      if (selectorLower === targetLower) {
        score = 1000;
      }
      // Contains the full target
      else if (selectorLower.includes(targetLower) || targetLower.includes(selectorLower)) {
        score = 100;
      }
      // Extract meaningful parts from target
      else {
        const parts = target.match(/[a-zA-Z0-9_-]+/g) || [];

        // Score based on how many parts match
        for (const part of parts) {
          if (part.length > 2 && selectorLower.includes(part.toLowerCase())) {
            score += 10 * part.length;
          }
        }

        // Use Levenshtein distance for similar strings
        if (selector.length < 50 && target.length < 50) {
          const similarity = this.calculateSimilarity(target, selector);
          score += similarity * 50;
        }

        // Bonus for matching selector types (class, id, etc)
        if (target.startsWith('.') && selector.startsWith('.')) {
          score += 5;
        } else if (target.startsWith('#') && selector.startsWith('#')) {
          score += 5;
        }
      }

      return { selector, score };
    });

    // Sort by score descending
    scoredSelectors.sort((a, b) => b.score - a.score);

    return scoredSelectors.map((item) => item.selector);
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

  async onEnd(_result: FullResult): Promise<void> {
    // Skip processing in list mode
    if (this.isListMode()) {
      return;
    }

    this.testSummary.duration = Date.now() - this.startTime;

    // Print newline after dots if we ended mid-line
    if (!this.options.silent && this.dotColumn > 0) {
      console.log('');
    }

    // Print the new summary format first
    if (!this.options.silent) {
      console.log('');
      const summary = this.summaryFormatter.formatSummary(this.testSummary, this.startTime);
      console.log(summary);
    }

    await this.generateMarkdownReports();

    // Optionally print detailed failures if verboseErrors is true and not in silent mode
    if (!this.options.silent && this.options.verboseErrors && this.failures.length > 0) {
      console.log('\n### Detailed Failures\n');
      this.printDetailedFailures();
    }
  }

  private printDetailedFailures(): void {
    const shouldTruncate =
      !this.options.verboseErrors || this.failures.length > this.options.maxInlineErrors;
    const failuresToShow = shouldTruncate
      ? this.failures.slice(0, this.options.maxInlineErrors)
      : this.failures;

    failuresToShow.forEach((failure, index) => {
      // Sort selectors if needed
      if (failure.pageState?.availableSelectors) {
        const errorMsg = failure.error.message || '';
        const failedSelectorMatch = errorMsg.match(/locator\(['"](.+?)['"]\)/);
        const failedSelector = failedSelectorMatch ? failedSelectorMatch[1] : null;

        if (failedSelector && errorMsg.includes('not found')) {
          failure.pageState.availableSelectors = this.sortSelectorsBySimilarity(
            failedSelector,
            failure.pageState.availableSelectors
          );
        }
      }

      // Format and output error using ConsoleFormatter
      const errorData = this.consoleFormatter.extractErrorData(failure, index + 1);
      const formattedOutput = this.consoleFormatter.formatError(errorData);
      console.log(formattedOutput);

      // Show link to detailed report
      const testFolder = this.generateTestFolderName(failure);
      const reportPath = path.join(this.reportsDir, testFolder, 'report.md');
      console.log(`\n  📝 **Full Error Context:** ${reportPath}`);
      console.log('');
    });

    if (shouldTruncate && this.failures.length > this.options.maxInlineErrors) {
      const remaining = this.failures.length - this.options.maxInlineErrors;
      const reportPath = path.join(this.reportsDir, 'all-failures.md');
      console.log(
        `  ... and ${remaining} more failure${remaining > 1 ? 's' : ''}. See ${reportPath} for complete details.\n`
      );
    }
  }

  private async generateMarkdownReports(): Promise<void> {
    if (this.failures.length === 0) {
      return;
    }

    // Create our reports directory
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }

    // Generate consolidated report (all-failures.md)
    await this.generateConsolidatedReport();

    // Generate individual test reports in their own folders
    this.generateIndividualReports();
  }

  private generateTestFolderName(failure: FailureContext): string {
    const parts = [];

    // Add suite name if present
    if (failure.suiteName) {
      parts.push(failure.suiteName);
    }

    // Add test title
    parts.push(failure.testTitle);

    // Create base name
    const baseName = parts
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 80); // Leave room for index

    // Add test index for uniqueness (testIndex is set when test is captured)
    const uniqueName = `${baseName}-${failure.testIndex || Date.now()}`;

    return uniqueName;
  }

  private async generateConsolidatedReport(): Promise<void> {
    const reportPath = path.join(this.reportsDir, 'all-failures.md');

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

    // Add quick navigation to individual test reports
    report += `## Failed Tests Quick Links\n\n`;

    // Group failures by type
    const timeoutFailures = this.failures.filter(
      (f) => f.error.message?.includes('Timeout') || f.error.message?.includes('exceeded')
    );
    const assertionFailures = this.failures.filter(
      (f) => f.error.message?.includes('expect') || f.error.message?.includes('assertion')
    );
    const elementNotFoundFailures = this.failures.filter(
      (f) => f.error.message?.includes('not found') || f.error.message?.includes('no element')
    );
    const otherFailures = this.failures.filter(
      (f) =>
        !timeoutFailures.includes(f) &&
        !assertionFailures.includes(f) &&
        !elementNotFoundFailures.includes(f)
    );

    if (timeoutFailures.length > 0) {
      report += `### ⏱️ Timeout Failures (${timeoutFailures.length})\n`;
      for (const failure of timeoutFailures) {
        const testFolder = this.generateTestFolderName(failure);
        report += `- [${failure.testTitle}](./${testFolder}/report.md)\n`;
      }
      report += `\n`;
    }

    if (elementNotFoundFailures.length > 0) {
      report += `### 🔍 Element Not Found (${elementNotFoundFailures.length})\n`;
      for (const failure of elementNotFoundFailures) {
        const testFolder = this.generateTestFolderName(failure);
        report += `- [${failure.testTitle}](./${testFolder}/report.md)\n`;
      }
      report += `\n`;
    }

    if (assertionFailures.length > 0) {
      report += `### ✗ Assertion Failures (${assertionFailures.length})\n`;
      for (const failure of assertionFailures) {
        const testFolder = this.generateTestFolderName(failure);
        report += `- [${failure.testTitle}](./${testFolder}/report.md)\n`;
      }
      report += `\n`;
    }

    if (otherFailures.length > 0) {
      report += `### 🔧 Other Failures (${otherFailures.length})\n`;
      for (const failure of otherFailures) {
        const testFolder = this.generateTestFolderName(failure);
        report += `- [${failure.testTitle}](./${testFolder}/report.md)\n`;
      }
      report += `\n`;
    }

    report += `---\n\n`;
    report += `# Detailed Failures\n\n`;

    // Simply concatenate the content from individual reports
    for (const failure of this.failures) {
      const testFolder = this.generateTestFolderName(failure);
      const individualReportPath = path.join(this.reportsDir, testFolder, 'report.md');

      // Read the individual report if it exists
      if (fs.existsSync(individualReportPath)) {
        const individualReport = await fs.promises.readFile(individualReportPath, 'utf-8');
        report += individualReport;
        report += `\n---\n\n`;
      }
    }

    await fs.promises.writeFile(reportPath, report, 'utf-8');
  }

  private async writeIndividualReport(failure: FailureContext): Promise<void> {
    // Ensure reports directory exists
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }

    // Create folder for this test
    const testFolder = this.generateTestFolderName(failure);
    const testDir = path.join(this.reportsDir, testFolder);

    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Save screenshot if present
    if (failure.screenshot) {
      const screenshotPath = path.join(testDir, 'screenshot.png');
      fs.writeFileSync(screenshotPath, failure.screenshot);
    }

    // Generate the individual error report
    const report = this.generateIndividualErrorReport(failure);
    const reportPath = path.join(testDir, 'report.md');
    await fs.promises.writeFile(reportPath, report, 'utf-8');
  }

  private generateIndividualReports(): void {
    // This method is now deprecated since reports are written immediately
    // We keep it for backward compatibility but it will do nothing since
    // reports are already written in onTestEnd
    for (const _failure of this.failures) {
      // Skip - already written in onTestEnd
    }
  }

  private generateIndividualErrorReport(failure: FailureContext): string {
    // Sort selectors by similarity if it's an element not found error
    if (failure.pageState?.availableSelectors) {
      const errorMsg = failure.error.message || '';
      const failedSelectorMatch = errorMsg.match(/locator\(['"](.+?)['"]\)/);
      const failedSelector = failedSelectorMatch ? failedSelectorMatch[1] : null;

      if (failedSelector && errorMsg.includes('not found')) {
        failure.pageState.availableSelectors = this.sortSelectorsBySimilarity(
          failedSelector,
          failure.pageState.availableSelectors
        );
      }
    }

    // Extract error data and format using MarkdownFormatter
    const errorData = this.markdownFormatter.extractErrorData(failure, 1);

    // Generate report header
    let report = `# Error Context: ${failure.testTitle}\n\n`;
    report += `## Test Location\n`;
    report += `${failure.testFile}:${failure.lineNumber || 0}\n\n`;

    // Format the rest using the markdown formatter
    const formattedOutput = this.markdownFormatter.formatError(errorData);

    // Add the formatted output
    report += formattedOutput;

    return report;
  }
}

export default CodingAgentReporter;
