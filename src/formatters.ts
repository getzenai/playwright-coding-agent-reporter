import { FailureContext, PageState } from './types';

// Constants for formatting limits
export const MAX_VISIBLE_TEXT_LENGTH = 500;
export const MAX_SELECTORS_TO_SHOW = 50;
export const MAX_ACTION_HISTORY = 20;
export const MAX_HTML_SNIPPET_LENGTH = 2000;
export const MAX_SIMILAR_SUGGESTIONS = 5;
export const MAX_SELECTORS_PER_CATEGORY = 10;

export interface FormatterOptions {
  maxErrorLength: number;
  showCodeSnippet: boolean;
  verboseErrors: boolean;
  capturePageState: boolean;
}

export interface ErrorData {
  errorMessage: string;
  codeSnippet?: string;
  errorLineNumber?: number;
  testPath: string;
  testIndex: number;
  duration?: number;
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

export abstract class ErrorFormatter {
  protected options: FormatterOptions;

  constructor(options: FormatterOptions) {
    this.options = options;
  }

  abstract formatError(data: ErrorData): string;
  abstract formatHeader(data: ErrorData): string;
  abstract formatErrorMessage(message: string): string;
  abstract formatCodeSnippet(snippet: string): string;
  abstract formatPageState(data: ErrorData): string;
  abstract formatSelectors(selectors: string[], failedSelector?: string): string;
  abstract formatActionHistory(actions: string[]): string;
  abstract formatVisibleText(text: string): string;
  abstract formatHtmlSnippet(html: string): string;
  abstract formatConsoleErrors(errors: string[]): string;
  abstract formatNetworkErrors(errors: string[]): string;
  abstract formatStdout(stdout: string[]): string;
  abstract formatStderr(stderr: string[]): string;
  abstract formatScreenshot(path?: string): string;

  protected stripAnsiCodes(text: string): string {
    return text
      .replace(/\x1b\[[0-9;]*m/g, '')
      .replace(/\[2m|\[22m|\[31m|\[39m|\[32m/g, '')
      .replace(/\u001b/g, '');
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

    let errorMessage = failure.error.message || failure.error.value || 'Unknown error';

    // Enhance timeout error messages with context
    if (errorMessage.includes('Timeout') || errorMessage.includes('exceeded')) {
      const waitingForMatch = errorMessage.match(/waiting for (.+?)(?:\n|$)/);
      if (waitingForMatch) {
        errorMessage += `\n\n⏱️ Timeout Context:\n`;
        errorMessage += `- Was waiting for: ${waitingForMatch[1]}\n`;
        errorMessage += `- Duration before timeout: ${duration}ms\n`;
        if (failure.pageState?.url) {
          errorMessage += `- Page URL at timeout: ${failure.pageState.url}\n`;
        }
        if (failure.pageState?.actionHistory && failure.pageState.actionHistory.length > 0) {
          const lastAction =
            failure.pageState.actionHistory[failure.pageState.actionHistory.length - 1];
          errorMessage += `- Last action before timeout: ${lastAction}\n`;
        }
      }
    }

    const cleanMessage = this.stripAnsiCodes(errorMessage);

    // Extract failed selector from error message if available
    let failedSelector: string | undefined;
    const failedSelectorMatch = errorMessage.match(/locator\(['"](.+?)['"]\)/);
    if (failedSelectorMatch) {
      failedSelector = failedSelectorMatch[1];
    }

    return {
      errorMessage: cleanMessage,
      codeSnippet: failure.error.snippet ? this.stripAnsiCodes(failure.error.snippet) : undefined,
      errorLineNumber,
      testPath,
      testIndex: failure.testIndex || testIndex,
      duration,
      fullTestName,
      pageUrl: failure.pageState?.url || failure.pageUrl,
      pageTitle: failure.pageState?.title,
      actionHistory: failure.pageState?.actionHistory,
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

  protected categorizeSelectors(selectors: string[]): {
    buttons: string[];
    links: string[];
    inputs: string[];
    ids: string[];
    others: string[];
  } {
    const buttons = selectors.filter((s) => s.includes('button'));
    const links = selectors.filter((s) => s.includes('a:') || s.includes('href'));
    const inputs = selectors.filter(
      (s) => s.includes('input') || s.includes('[name=') || s.includes('[placeholder=')
    );
    const ids = selectors.filter((s) => s.startsWith('#'));
    const others = selectors.filter(
      (s) => !buttons.includes(s) && !links.includes(s) && !inputs.includes(s) && !ids.includes(s)
    );

    return { buttons, links, inputs, ids, others };
  }
}

export class ConsoleFormatter extends ErrorFormatter {
  formatError(data: ErrorData): string {
    const sections: string[] = [];

    sections.push(this.formatHeader(data));
    sections.push('');
    sections.push(this.formatErrorMessage(data.errorMessage));

    if (data.codeSnippet && this.options.showCodeSnippet) {
      sections.push(this.formatCodeSnippet(data.codeSnippet));
    }

    if (this.options.capturePageState) {
      const pageState = this.formatPageState(data);
      if (pageState) sections.push(pageState);
    }

    return sections.join('\n');
  }

  formatHeader(data: ErrorData): string {
    const duration = data.duration ? ` (${data.duration}ms)` : '';
    return `  ## ${data.testIndex}) ${data.testPath} › ${data.fullTestName}${duration}`;
  }

  formatErrorMessage(message: string): string {
    return `  ### Error\n  \`\`\`\n  ${message.split('\n').join('\n  ')}\n  \`\`\``;
  }

  formatCodeSnippet(snippet: string): string {
    return `  ### Error Location\n  \`\`\`typescript\n  ${snippet.split('\n').join('\n  ')}\n  \`\`\``;
  }

  formatPageState(data: ErrorData): string {
    const sections: string[] = [];

    sections.push('  ### 🔍 Page State When Failed');

    // Always show URL and title
    sections.push(`  **URL:** ${data.pageUrl || 'unknown'}`);
    sections.push(`  **Title:** ${data.pageTitle || 'unknown'}`);

    // Add screenshot reference if available
    if (data.screenshotPath) {
      sections.push(`  **Screenshot:** Saved to ${data.screenshotPath}`);
    }

    if (data.actionHistory && data.actionHistory.length > 0) {
      sections.push(this.formatActionHistory(data.actionHistory));
    }

    if (data.availableSelectors && data.availableSelectors.length > 0) {
      const isElementNotFound =
        data.errorMessage.includes('not found') ||
        data.errorMessage.includes('no element') ||
        data.errorMessage.includes('<element(s) not found>');

      if (isElementNotFound) {
        sections.push(this.formatSelectors(data.availableSelectors, data.failedSelector));
      }
    }

    if (data.visibleText) {
      sections.push(this.formatVisibleText(data.visibleText));
    }

    return sections.join('\n');
  }

  formatSelectors(selectors: string[], failedSelector?: string): string {
    const limitedSelectors = selectors.slice(0, MAX_SELECTORS_TO_SHOW);
    let result = '\n  ### 🎯 Available Selectors (sorted by relevance)\n  ```\n';
    limitedSelectors.forEach((selector) => {
      result += `  ${selector}\n`;
    });
    if (selectors.length > MAX_SELECTORS_TO_SHOW) {
      result += `  ... and ${selectors.length - MAX_SELECTORS_TO_SHOW} more\n`;
    }
    result += '  ```';
    return result;
  }

  formatActionHistory(actions: string[]): string {
    const recentActions = actions.slice(-3);
    let result = '\n  ### 📜 Recent Actions\n  ```\n';
    recentActions.forEach((action) => {
      result += `  ${action}\n`;
    });
    result += '  ```';
    return result;
  }

  formatVisibleText(text: string): string {
    const truncated = this.truncateText(text, MAX_VISIBLE_TEXT_LENGTH);
    return `\n  ### 📄 Visible Text (first ${MAX_VISIBLE_TEXT_LENGTH} chars)\n  \`\`\`\n  ${truncated}\n  \`\`\``;
  }

  formatHtmlSnippet(html: string): string {
    // Not shown in console output
    return '';
  }

  formatConsoleErrors(errors: string[]): string {
    // Not shown in detailed console output (already in stderr)
    return '';
  }

  formatNetworkErrors(errors: string[]): string {
    // Not shown in detailed console output (already in stderr)
    return '';
  }

  formatStdout(stdout: string[]): string {
    // Not shown in detailed console output
    return '';
  }

  formatStderr(stderr: string[]): string {
    // Not shown in detailed console output
    return '';
  }

  formatScreenshot(path?: string): string {
    // Not shown in console output
    return '';
  }
}

export class MarkdownFormatter extends ErrorFormatter {
  private useCollapsibleSections: boolean;
  private includeEmoji: boolean;

  constructor(options: FormatterOptions, useCollapsibleSections = true, includeEmoji = true) {
    super(options);
    this.useCollapsibleSections = useCollapsibleSections;
    this.includeEmoji = includeEmoji;
  }

  formatError(data: ErrorData): string {
    const sections: string[] = [];

    sections.push(this.formatHeader(data));
    sections.push('');
    sections.push(this.formatErrorMessage(data.errorMessage));

    if (data.codeSnippet && this.options.showCodeSnippet) {
      sections.push(this.formatCodeSnippet(data.codeSnippet));
    }

    if (this.options.capturePageState) {
      const pageState = this.formatPageState(data);
      if (pageState) sections.push(pageState);
    }

    if (data.consoleErrors && data.consoleErrors.length > 0) {
      sections.push(this.formatConsoleErrors(data.consoleErrors));
    }

    if (data.networkErrors && data.networkErrors.length > 0) {
      sections.push(this.formatNetworkErrors(data.networkErrors));
    }

    if (data.stdout && data.stdout.length > 0) {
      sections.push(this.formatStdout(data.stdout));
    }

    if (data.stderr && data.stderr.length > 0) {
      sections.push(this.formatStderr(data.stderr));
    }

    if (data.screenshotPath) {
      sections.push(this.formatScreenshot(data.screenshotPath));
    }

    return sections.join('\n');
  }

  formatHeader(data: ErrorData): string {
    const duration = data.duration ? ` (${data.duration}ms)` : '';
    if (this.includeEmoji) {
      return `## ✘  ${data.testIndex} ${data.testPath} › ${data.fullTestName}${duration}`;
    } else {
      return `## Test ${data.testIndex}: ${data.fullTestName}`;
    }
  }

  formatErrorMessage(message: string): string {
    const truncated =
      message.length > this.options.maxErrorLength
        ? message.substring(0, this.options.maxErrorLength) + '\n... (truncated)'
        : message;

    return `### Error\n${truncated}\n`;
  }

  formatCodeSnippet(snippet: string): string {
    if (this.useCollapsibleSections) {
      return `<details>\n<summary>Error Location</summary>\n\n\`\`\`typescript\n${snippet}\n\`\`\`\n</details>\n`;
    } else {
      return `## Code Location\n\`\`\`\n${snippet}\n\`\`\`\n`;
    }
  }

  formatPageState(data: ErrorData): string {
    const sections: string[] = [];
    const emoji = this.includeEmoji ? '🔍 ' : '';

    sections.push(`### ${emoji}Page State When Failed\n`);

    // Always show URL and title, even if they're unknown
    sections.push(`**URL:** ${data.pageUrl || 'unknown'}`);
    sections.push(`**Title:** ${data.pageTitle || 'unknown'}`);

    // Add screenshot reference if available
    if (data.screenshotPath) {
      sections.push(`**Screenshot:** [View Screenshot](./${data.screenshotPath})`);
    }
    sections.push(''); // Add blank line for spacing

    if (data.actionHistory && data.actionHistory.length > 0) {
      sections.push(this.formatActionHistory(data.actionHistory));
    }

    if (data.availableSelectors && data.availableSelectors.length > 0) {
      sections.push(this.formatSelectors(data.availableSelectors, data.failedSelector));
    }

    if (data.visibleText) {
      sections.push(this.formatVisibleText(data.visibleText));
    }

    if (data.htmlSnippet) {
      sections.push(this.formatHtmlSnippet(data.htmlSnippet));
    }

    return sections.join('\n');
  }

  formatSelectors(selectors: string[], failedSelector?: string): string {
    const emoji = this.includeEmoji ? '🎯 ' : '';

    if (this.useCollapsibleSections) {
      let result = `<details>\n<summary>${emoji}Available Selectors on Page (${selectors.length} found)</summary>\n\n`;

      if (failedSelector) {
        result += `Looking for: **${failedSelector}**\n\n`;
        const topSimilar = selectors.slice(0, MAX_SIMILAR_SUGGESTIONS);
        if (topSimilar.length > 0) {
          const bulletEmoji = this.includeEmoji ? '💡 ' : '';
          result += `**${bulletEmoji}Most similar selectors:**\n\`\`\`\n`;
          topSimilar.forEach((s) => (result += `${s}\n`));
          result += '```\n\n';
        }
      }

      result += 'These selectors were actually present on the page:\n\n```\n';

      const categorized = this.categorizeSelectors(selectors);

      if (categorized.buttons.length > 0) {
        result += '# Buttons:\n';
        categorized.buttons.slice(0, MAX_SELECTORS_PER_CATEGORY).forEach((btn) => {
          result += `  ${btn}\n`;
        });
      }

      if (categorized.links.length > 0) {
        result += '\n# Links:\n';
        categorized.links.slice(0, MAX_SELECTORS_PER_CATEGORY).forEach((link) => {
          result += `  ${link}\n`;
        });
      }

      if (categorized.inputs.length > 0) {
        result += '\n# Inputs:\n';
        categorized.inputs.slice(0, MAX_SELECTORS_PER_CATEGORY).forEach((input) => {
          result += `  ${input}\n`;
        });
      }

      if (categorized.ids.length > 0) {
        result += '\n# Elements with IDs:\n';
        categorized.ids.slice(0, 15).forEach((id) => {
          result += `  ${id}\n`;
        });
      }

      if (categorized.others.length > 0) {
        result += '\n# Other Elements:\n';
        categorized.others.slice(0, MAX_SELECTORS_PER_CATEGORY).forEach((other) => {
          result += `  ${other}\n`;
        });
      }

      result += '```\n</details>\n';
      return result;
    } else {
      // Simple format for individual reports
      let result = `### Available Selectors\n`;
      selectors.forEach((selector) => {
        result += `${selector}\n`;
      });
      result += '\n';
      return result;
    }
  }

  formatActionHistory(actions: string[]): string {
    const emoji = this.includeEmoji ? '📜 ' : '';

    if (this.useCollapsibleSections) {
      let result = `<details>\n<summary>${emoji}Action History (last ${actions.length} actions)</summary>\n\n\`\`\`\n`;
      actions.forEach((action) => {
        result += `${action}\n`;
      });
      result += '```\n</details>\n';
      return result;
    } else {
      let result = `### Action History\n`;
      actions.forEach((action) => {
        result += `${action}\n`;
      });
      result += '\n';
      return result;
    }
  }

  formatVisibleText(text: string): string {
    const emoji = this.includeEmoji ? '📄 ' : '';

    if (this.useCollapsibleSections) {
      return `<details>\n<summary>${emoji}Visible Text on Page</summary>\n\n\`\`\`\n${text}\n\`\`\`\n</details>\n`;
    } else {
      return `### Visible Text\n${text}\n\n`;
    }
  }

  formatHtmlSnippet(html: string): string {
    const emoji = this.includeEmoji ? '🔧 ' : '';
    const truncated =
      html.length > MAX_HTML_SNIPPET_LENGTH
        ? html.substring(0, MAX_HTML_SNIPPET_LENGTH) + '\n... (truncated)'
        : html;

    if (this.useCollapsibleSections) {
      return `<details>\n<summary>${emoji}HTML Context</summary>\n\n\`\`\`html\n${truncated}\n\`\`\`\n</details>\n`;
    } else {
      return `### HTML Context\n${truncated}\n`;
    }
  }

  formatConsoleErrors(errors: string[]): string {
    let result = `### Console Errors\n\`\`\`\n`;
    errors.forEach((error) => {
      result += `${error}\n`;
    });
    result += '```\n';
    return result;
  }

  formatNetworkErrors(errors: string[]): string {
    let result = `### Network Errors\n\`\`\`\n`;
    errors.forEach((error) => {
      result += `${error}\n`;
    });
    result += '```\n';
    return result;
  }

  formatStdout(stdout: string[]): string {
    if (this.useCollapsibleSections) {
      return `<details>\n<summary>Test Output (stdout)</summary>\n\n\`\`\`\n${stdout.join('\n')}\n\`\`\`\n</details>\n`;
    } else {
      return '';
    }
  }

  formatStderr(stderr: string[]): string {
    if (this.useCollapsibleSections) {
      return `<details>\n<summary>Test Errors (stderr)</summary>\n\n\`\`\`\n${stderr.join('\n')}\n\`\`\`\n</details>\n`;
    } else {
      return '';
    }
  }

  formatScreenshot(path?: string): string {
    if (!path) return '';
    const emoji = this.includeEmoji ? '📸 ' : '';
    return `### ${emoji}Screenshot\n![Screenshot](./${path})\n`;
  }
}
