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
import {
  ConsoleFormatter,
  MarkdownFormatter,
  FormatterOptions,
  MAX_SIMILAR_SUGGESTIONS,
} from './formatters';

// Constants for similarity threshold
const SIMILARITY_THRESHOLD = 0.5;

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
  private simpleMarkdownFormatter: MarkdownFormatter;

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
    } catch {}
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
    } catch {}
  }

  constructor(options: CodingAgentReporterOptions = {}) {
    this.options = {
      outputDir: options.outputDir || 'test-results',
      includeScreenshots: options.includeScreenshots ?? true,
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
    this.reportsDir = path.join(this.outputDir, 'coding-agent-reports');

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
      maxErrorLength: this.options.maxErrorLength,
      showCodeSnippet: this.options.showCodeSnippet,
      verboseErrors: this.options.verboseErrors,
      capturePageState: this.options.capturePageState,
    };

    this.consoleFormatter = new ConsoleFormatter(formatterOptions);
    this.markdownFormatter = new MarkdownFormatter(formatterOptions, true, true);
    this.simpleMarkdownFormatter = new MarkdownFormatter(formatterOptions, false, false);
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.startTime = Date.now();
    this.workers = config.workers || 1;
    this.totalTests = this.countTests(suite);

    // Warn if our output folder clashes with any project outputDir (mirroring Playwright HTML reporter UX)
    const projects: any[] = (config as any).projects || [];
    const reported = new Set<string>();
    for (const project of projects) {
      const projectOutput: string | undefined = project?.outputDir;
      if (!projectOutput) continue;
      const our = this.outputDir;
      if (this.isSubdirectory(our, projectOutput) || this.isSubdirectory(projectOutput, our)) {
        const key = `${our}|${projectOutput}`;
        if (!reported.has(key)) {
          reported.add(key);
          // eslint-disable-next-line no-console
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
              } catch {}
            }
          } catch {}
        } else {
          // eslint-disable-next-line no-console
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
      } else if (attachment.name === 'page-url') {
        failure.pageUrl = attachment.body?.toString('utf-8');
      } else if (attachment.name === 'console-errors' && attachment.body) {
        try {
          const errors = JSON.parse(attachment.body.toString('utf-8'));
          if (Array.isArray(errors)) {
            failure.consoleErrors = errors;
          }
        } catch {}
      } else if (attachment.name === 'network-errors' && attachment.body) {
        try {
          const errors = JSON.parse(attachment.body.toString('utf-8'));
          if (Array.isArray(errors)) {
            failure.networkErrors = errors;
          }
        } catch {}
      }
    }

    // Fallback to extracting from stdout/stderr if not in attachments
    if (
      this.options.includeConsoleErrors &&
      (!failure.consoleErrors || failure.consoleErrors.length === 0)
    ) {
      failure.consoleErrors = this.extractConsoleErrors(result);
    }

    if (
      this.options.includeNetworkErrors &&
      (!failure.networkErrors || failure.networkErrors.length === 0)
    ) {
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
        // Visible text is already condensed from the test fixture
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

  private findSimilarSelectors(target: string, available: string[]): string[] {
    const similar: string[] = [];
    const targetLower = target.toLowerCase();

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

  async onEnd(result: FullResult): Promise<void> {
    this.testSummary.duration = Date.now() - this.startTime;

    if (this.options.outputFormat === 'markdown') {
      await this.generateMarkdownReports();
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

        const reportPath = path.join(this.reportsDir, 'all-failures.md');
        console.log(`\n  📝 Detailed error report: ${reportPath}`);
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

      // Extract error data and format using ConsoleFormatter
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
    } catch (e) {}
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
    await this.generateIndividualReports();
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

    for (let i = 0; i < this.failures.length; i++) {
      const failure = this.failures[i];

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

      // Screenshots are saved in individual test folders

      // Extract error data and format using MarkdownFormatter
      const errorData = this.markdownFormatter.extractErrorData(failure, i + 1);

      // Override screenshot path for consolidated report
      const testFolderName = this.generateTestFolderName(failure);
      if (errorData.screenshotPath) {
        errorData.screenshotPath = `./${testFolderName}/screenshot.png`;
      }

      const formattedOutput = this.markdownFormatter.formatError(errorData);
      report += formattedOutput;

      // Add link to individual test folder
      report += `\n📁 **Test artifacts folder:** [${testFolderName}](./${testFolderName})\n`;

      report += '\n---\n\n';
    }

    await fs.promises.writeFile(reportPath, report, 'utf-8');
  }

  private async generateIndividualReports(): Promise<void> {
    for (const failure of this.failures) {
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
      const report = await this.generateIndividualErrorReport(failure);
      const reportPath = path.join(testDir, 'report.md');
      await fs.promises.writeFile(reportPath, report, 'utf-8');
    }
  }

  private async generateIndividualErrorReport(failure: FailureContext): Promise<string> {
    // Sort selectors if needed (though individual reports don't sort by similarity)
    // We keep the original order for individual reports

    // Extract error data and format using simple MarkdownFormatter (no collapsible sections, no emoji)
    const errorData = this.simpleMarkdownFormatter.extractErrorData(failure, 1);

    // Override the header to use the simpler format for individual reports
    let report = `# Error Context: ${failure.testTitle}\n\n`;
    report += `## Test Location\n`;
    report += `${failure.testFile}:${failure.lineNumber || 0}\n\n`;

    // Format the rest using the simple markdown formatter
    const formattedOutput = this.simpleMarkdownFormatter.formatError(errorData);

    // Extract just the parts we want (skip the header which we already added)
    const lines = formattedOutput.split('\n');
    const startIndex = lines.findIndex(
      (line) => line.startsWith('### Error') || line.startsWith('## Error')
    );
    if (startIndex !== -1) {
      report += lines.slice(startIndex).join('\n');
    } else {
      report += formattedOutput;
    }

    return report;
  }
}

export default CodingAgentReporter;
