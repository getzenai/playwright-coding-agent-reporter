import { BaseFormatter, ErrorData, FormatterOptions } from './base';
import { formatUrl } from '../helpers/url-formatter';

export class MarkdownFormatter extends BaseFormatter {
  constructor(options: FormatterOptions) {
    super(options);
  }

  formatError(data: ErrorData): string {
    const sections: string[] = [];

    // Header
    sections.push(`${data.testIndex}) ${data.testPath} › ${data.fullTestName}`);
    if (data.duration) {
      sections.push(`Duration: ${data.duration}ms`);
    }
    sections.push('');

    // Error message - output as-is from Playwright
    sections.push('### Error');
    sections.push('```');
    sections.push(data.errorMessage);
    sections.push('```');
    sections.push('');

    // Stack trace if it's separate from the message
    if (data.errorStack && !data.errorMessage.includes(data.errorStack)) {
      sections.push('### Stack Trace');
      sections.push('```');
      sections.push(data.errorStack);
      sections.push('```');
      sections.push('');
    }

    // Code snippet if available
    if (data.codeSnippet && this.options.showCodeSnippet) {
      sections.push('### Code Location');
      sections.push('```typescript');
      sections.push(data.codeSnippet);
      sections.push('```');
      sections.push('');
    }

    // Page state
    if (this.options.capturePageState) {
      sections.push('### Page State When Failed');
      sections.push(`**URL:** ${formatUrl(data.pageUrl || '')}  `);
      sections.push(`**Title:** ${data.pageTitle || 'unknown'}  `);
      if (data.screenshotPath) {
        sections.push(`**Screenshot:**  `);
        sections.push(`![Screenshot](./${data.screenshotPath})  `);
      }
      sections.push('');

      // Action history
      if (data.actionHistory && data.actionHistory.length > 0) {
        sections.push('### Action History');
        data.actionHistory.forEach((action) => {
          sections.push(action + '  '); // Add two spaces for markdown line break
        });
        sections.push('');
      }

      // Available selectors
      if (data.availableSelectors && data.availableSelectors.length > 0) {
        sections.push('### Available Selectors');
        data.availableSelectors.forEach((selector) => {
          sections.push(selector + '  '); // Add two spaces for markdown line break
        });
        sections.push('');
      }

      // Visible text
      if (data.visibleText) {
        sections.push('### Visible Text');
        sections.push(data.visibleText);
        sections.push('');
      }
    }

    // Browser logs (console errors)
    if (data.consoleErrors && data.consoleErrors.length > 0) {
      sections.push('### Browser Logs');
      sections.push('```');
      data.consoleErrors.forEach((error) => {
        sections.push(error);
      });
      sections.push('```');
      sections.push('');
    }

    // Server logs (stdout/stderr)
    const hasStdout = data.stdout && data.stdout.length > 0;
    const hasStderr = data.stderr && data.stderr.length > 0;

    if (hasStdout || hasStderr) {
      sections.push('### Server Logs');

      if (hasStdout) {
        sections.push('**stdout:**  ');
        sections.push('```');
        data.stdout!.slice(-20).forEach((line) => {
          // Last 20 lines
          sections.push(line);
        });
        sections.push('```');
      }

      if (hasStderr) {
        sections.push('**stderr:**  ');
        sections.push('```');
        data.stderr!.slice(-20).forEach((line) => {
          // Last 20 lines
          sections.push(line);
        });
        sections.push('```');
      }
      sections.push('');
    }

    return sections.join('\n');
  }
}
