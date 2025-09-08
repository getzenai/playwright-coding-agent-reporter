import { BaseFormatter, ErrorData, FormatterOptions } from './base';
import { formatUrl } from '../helpers/url-formatter';

export class ConsoleFormatter extends BaseFormatter {
  constructor(options: FormatterOptions) {
    super(options);
  }

  formatError(data: ErrorData): string {
    const sections: string[] = [];

    // Header with test info
    sections.push(`  ## ${data.testIndex}) ${data.testPath} › ${data.fullTestName}`);
    if (data.duration) {
      sections.push(`     Duration: ${data.duration}ms`);
    }

    // Error message
    sections.push('  ### Error');
    const errorLines = data.errorMessage.split('\n');
    errorLines.forEach((line) => {
      sections.push(`  ${line}`);
    });

    // Stack trace (if available)
    if (data.errorStack) {
      sections.push('\n  ### Stack Trace');
      const stackLines = data.errorStack.split('\n');
      // Skip the first line if it's just repeating the error message
      const startIndex = stackLines[0].includes(data.errorMessage.split('\n')[0]) ? 1 : 0;
      const relevantStackLines = stackLines.slice(startIndex).filter((line) => line.trim());
      if (relevantStackLines.length > 0) {
        sections.push('  ```');
        relevantStackLines.slice(0, 5).forEach((line) => {
          // Limit to 5 lines for console
          sections.push(`  ${line}`);
        });
        if (relevantStackLines.length > 5) {
          sections.push(`  ... and ${relevantStackLines.length - 5} more lines`);
        }
        sections.push('  ```');
      }
    }

    // Code snippet (always show if available)
    if (data.codeSnippet) {
      sections.push('\n  ### Code Location');
      sections.push('  ```typescript');
      const snippetLines = data.codeSnippet.split('\n');
      snippetLines.forEach((line) => {
        sections.push(`  ${line}`);
      });
      sections.push('  ```');
    }

    // Page state
    if (this.options.capturePageState) {
      sections.push('  ### 🔍 Page State When Failed');
      sections.push(`  **URL:** ${formatUrl(data.pageUrl || '')}`);
      sections.push(`  **Title:** ${data.pageTitle || 'unknown'}`);

      if (data.screenshotPath) {
        sections.push(`  **Screenshot:** Saved to ${data.screenshotPath}`);
      }

      // Recent actions (last 3)
      if (data.actionHistory && data.actionHistory.length > 0) {
        sections.push('\n  ### 📜 Recent Actions');
        sections.push('  ```');
        const recentActions = data.actionHistory.slice(-3);
        recentActions.forEach((action) => {
          sections.push(`  ${action}`);
        });
        sections.push('  ```');
      }

      // Available selectors (for element not found errors)
      if (data.availableSelectors && data.availableSelectors.length > 0) {
        const isElementNotFound =
          data.errorMessage.includes('not found') ||
          data.errorMessage.includes('no element') ||
          data.errorMessage.includes('<element(s) not found>');

        if (isElementNotFound) {
          sections.push('\n  ### 🎯 Available Selectors (sorted by relevance)');
          sections.push('  ```');
          const limitedSelectors = data.availableSelectors.slice(0, 10);
          limitedSelectors.forEach((selector) => {
            sections.push(`  ${selector}`);
          });
          if (data.availableSelectors.length > 10) {
            sections.push(`  ... and ${data.availableSelectors.length - 10} more`);
          }
          sections.push('  ```');
        }
      }

      // Visible text (first 500 chars)
      if (data.visibleText) {
        const truncated = this.truncateText(data.visibleText, 500);
        sections.push(`\n  ### 📄 Visible Text (first 500 chars)`);
        sections.push('  ```');
        sections.push(`  ${truncated}`);
        sections.push('  ```');
      }
    }

    return sections.join('\n');
  }
}
