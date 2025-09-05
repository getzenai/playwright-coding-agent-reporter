import { Page } from '@playwright/test';

// Constants for limits
const MAX_TEXT_NODES = 100;
const MAX_VISIBLE_TEXT_LENGTH = 2000;
const MAX_SELECTORS = 50;
const MAX_LINK_COUNT = 10;
const MAX_SUGGESTIONS = 5;
const MAX_HTML_SNIPPET_LENGTH = 3000;

export interface PageDebugInfo {
  url: string;
  title: string;
  visibleText: string;
  availableSelectors: string[];
  htmlSnippet?: string;
}

export class PageStateCapture {
  static async capturePageState(page: Page, failedSelector?: string): Promise<PageDebugInfo> {
    try {
      // Add timeout for page state capture (5 seconds max)
      const capturePromise = this.capturePageStateInternal(page, failedSelector);
      const timeoutPromise = new Promise<PageDebugInfo>((_, reject) =>
        setTimeout(() => reject(new Error('Page state capture timeout')), 5000)
      );

      return await Promise.race([capturePromise, timeoutPromise]);
    } catch (error) {
      // Return partial data if capture fails or times out
      console.error('Error in capturePageState:', error);
      return {
        url: page.url(),
        title: 'Error capturing page state',
        visibleText: '',
        availableSelectors: [],
      };
    }
  }

  private static async capturePageStateInternal(
    page: Page,
    failedSelector?: string
  ): Promise<PageDebugInfo> {
    // Basic page info
    const url = page.url();
    const title = await page.title().catch(() => 'Unable to get title');

    // Capture visible text
    const visibleText = await this.getVisibleText(page);

    // Capture available selectors
    const availableSelectors = await this.getAvailableSelectors(page);

    // Get HTML snippet if we have a failed selector
    let htmlSnippet: string | undefined;
    if (failedSelector) {
      htmlSnippet = await this.getHtmlAroundSelector(page, failedSelector);
    }

    return {
      url,
      title,
      visibleText,
      availableSelectors,
      htmlSnippet,
    };
  }

  private static async getVisibleText(page: Page): Promise<string> {
    try {
      console.log('Getting visible text from page...');
      // Add timeout for evaluate (2 seconds)
      const texts = await page.evaluate(() => {
        // Simple text extraction
        // @ts-ignore - browser context
        const bodyText = document.body?.innerText || document.body?.textContent || '';
        return bodyText.substring(0, 2000);
      });

      return texts.substring(0, MAX_VISIBLE_TEXT_LENGTH);
    } catch (e) {
      console.log('Error getting visible text:', e);
      return '';
    }
  }

  private static async getAvailableSelectors(page: Page): Promise<string[]> {
    try {
      console.log('Getting available selectors...');
      // Add timeout for evaluate (2 seconds)
      const selectors = await page.evaluate(() => {
        const elements: string[] = [];

        // Simple check - are we even in a page with content?
        // @ts-ignore
        if (!document.body) {
          return ['No document body found'];
        }

        // Categorized selector collection for better organization
        const selectorCategories = {
          interactive: [] as string[],
          forms: [] as string[],
          navigation: [] as string[],
          content: [] as string[],
          structural: [] as string[],
        };

        // Enhanced button selectors with better patterns
        // @ts-ignore - browser context
        document
          .querySelectorAll('button, [role="button"], [type="submit"], [type="button"]')
          .forEach((btn: any) => {
            const text = btn.textContent?.trim();
            const ariaLabel = btn.getAttribute('aria-label');
            const dataTestId = btn.getAttribute('data-testid') || btn.getAttribute('data-test-id');

            if (text && text.length > 0) {
              selectorCategories.interactive.push(`button:has-text("${text.substring(0, 30)}")`);
            }
            if (ariaLabel) {
              selectorCategories.interactive.push(`[aria-label="${ariaLabel}"]`);
            }
            if (dataTestId) {
              selectorCategories.interactive.push(`[data-testid="${dataTestId}"]`);
            }
            if (btn.id) selectorCategories.interactive.push(`#${btn.id}`);
            if (btn.className && typeof btn.className === 'string') {
              const mainClass = btn.className.split(' ').filter((c: string) => c.length > 0)[0];
              if (mainClass) selectorCategories.interactive.push(`button.${mainClass}`);
            }
          });

        // Enhanced link selectors
        // @ts-ignore
        document.querySelectorAll('a[href], [role="link"]').forEach((link: any, i: any) => {
          if (i >= 15) return; // Limit links

          const text = link.textContent?.trim();
          const href = link.getAttribute('href');
          const ariaLabel = link.getAttribute('aria-label');

          if (text && text.length > 0) {
            selectorCategories.navigation.push(`a:has-text("${text.substring(0, 30)}")`);
          }
          if (href && href !== '#' && href !== 'javascript:void(0)') {
            selectorCategories.navigation.push(`[href="${href}"]`);
          }
          if (ariaLabel) {
            selectorCategories.navigation.push(`[aria-label="${ariaLabel}"]`);
          }
          if (link.id) selectorCategories.navigation.push(`#${link.id}`);
        });

        // Enhanced form input selectors
        // @ts-ignore
        document
          .querySelectorAll('input, textarea, select, [contenteditable="true"]')
          .forEach((input: any) => {
            const type = input.getAttribute('type');
            const name = input.getAttribute('name');
            const placeholder = input.getAttribute('placeholder');
            const label = input.getAttribute('aria-label') || input.getAttribute('title');
            const dataTestId =
              input.getAttribute('data-testid') || input.getAttribute('data-test-id');

            if (input.id) selectorCategories.forms.push(`#${input.id}`);
            if (name) selectorCategories.forms.push(`[name="${name}"]`);
            if (placeholder) selectorCategories.forms.push(`[placeholder="${placeholder}"]`);
            if (label) selectorCategories.forms.push(`[aria-label="${label}"]`);
            if (dataTestId) selectorCategories.forms.push(`[data-testid="${dataTestId}"]`);
            if (type && type !== 'hidden') {
              selectorCategories.forms.push(`input[type="${type}"]`);
            }
          });

        // Enhanced heading selectors
        // @ts-ignore
        document.querySelectorAll('h1, h2, h3, h4, [role="heading"]').forEach((heading: any) => {
          const text = heading.textContent?.trim();
          if (text && text.length > 0) {
            const tagName = heading.tagName?.toLowerCase() || 'h1';
            selectorCategories.content.push(`${tagName}:has-text("${text.substring(0, 50)}")`);
          }
          if (heading.id) selectorCategories.content.push(`#${heading.id}`);
        });

        // Enhanced structural selectors with data attributes
        // @ts-ignore
        document
          .querySelectorAll('[data-testid], [data-test-id], [data-cy], [data-test]')
          .forEach((el: any) => {
            const testId =
              el.getAttribute('data-testid') ||
              el.getAttribute('data-test-id') ||
              el.getAttribute('data-cy') ||
              el.getAttribute('data-test');
            if (testId) {
              selectorCategories.structural.push(`[data-testid="${testId}"]`);
            }
          });

        // Role-based selectors
        // @ts-ignore
        document.querySelectorAll('[role]').forEach((el: any) => {
          const role = el.getAttribute('role');
          const ariaLabel = el.getAttribute('aria-label');
          if (role && !['presentation', 'none'].includes(role)) {
            if (ariaLabel) {
              selectorCategories.structural.push(`[role="${role}"][aria-label="${ariaLabel}"]`);
            } else {
              selectorCategories.structural.push(`[role="${role}"]`);
            }
          }
        });

        // Class pattern matching for common UI components
        // @ts-ignore
        const classPatterns = [
          'btn',
          'button',
          'link',
          'nav',
          'menu',
          'card',
          'modal',
          'form',
          'input',
          'submit',
        ];
        classPatterns.forEach((pattern) => {
          // @ts-ignore
          document.querySelectorAll(`[class*="${pattern}"]`).forEach((el: any, i: any) => {
            if (i >= 5) return; // Limit per pattern
            const classes = (el.className?.split(' ') || []).filter(
              (c: any) => typeof c === 'string' && c.length > 0 && c.includes(pattern)
            );
            if (classes.length > 0) {
              selectorCategories.structural.push(`.${classes[0]}`);
            }
          });
        });

        // Combine all selectors with priority order
        elements.push(...selectorCategories.interactive);
        elements.push(...selectorCategories.forms);
        elements.push(...selectorCategories.navigation);
        elements.push(...selectorCategories.content);
        elements.push(...selectorCategories.structural);

        return [...new Set(elements)].slice(0, 50);
      });

      console.log('Found selectors:', selectors.length);
      return selectors;
    } catch (e) {
      console.log('Error getting selectors:', e);
      return [];
    }
  }

  private static async getHtmlAroundSelector(page: Page, selector: string): Promise<string> {
    try {
      const html = await page.evaluate((sel) => {
        // @ts-ignore - browser context
        let context = document.body;

        if (sel.startsWith('#')) {
          const id = sel.substring(1);
          // @ts-ignore
          const similar = document.querySelector(
            `[id*="${id.substring(0, Math.min(5, id.length))}"]`
          );
          if (similar) {
            context = similar.parentElement || context;
          }
        }

        if (sel.startsWith('.')) {
          const className = sel.substring(1);
          // @ts-ignore
          const similar = document.querySelector(
            `[class*="${className.substring(0, Math.min(5, className.length))}"]`
          );
          if (similar) {
            context = similar.parentElement || context;
          }
        }

        const container =
          context.querySelector('main, [role="main"], article, .container, .content') || context;
        const html = container.innerHTML || container.outerHTML;

        return html
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/\s+/g, ' ')
          .substring(0, MAX_HTML_SNIPPET_LENGTH);
      }, selector);

      return html;
    } catch {
      return '';
    }
  }
}
