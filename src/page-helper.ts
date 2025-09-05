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
    } catch (error) {
      // Return partial data if capture fails
      console.error('Error in capturePageState:', error);
      return {
        url: page.url(),
        title: 'Error capturing page state',
        visibleText: '',
        availableSelectors: [],
      };
    }
  }

  private static async getVisibleText(page: Page): Promise<string> {
    try {
      console.log('Getting visible text from page...');
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
      const selectors = await page.evaluate(() => {
        const elements: string[] = [];

        // Simple check - are we even in a page with content?
        // @ts-ignore
        if (!document.body) {
          return ['No document body found'];
        }

        // @ts-ignore - browser context
        document.querySelectorAll('button').forEach((btn: any, i: any) => {
          const text = btn.textContent?.trim();
          if (text) {
            elements.push(`button:has-text("${text.substring(0, 30)}")`);
          }
          if (btn.id) elements.push(`#${btn.id}`);
          if (btn.className) elements.push(`button.${btn.className.split(' ')[0]}`);
        });

        // @ts-ignore
        document.querySelectorAll('a').forEach((link: any, i: any) => {
          const text = link.textContent?.trim();
          if (text && i < 10) {
            elements.push(`a:has-text("${text.substring(0, 30)}")`);
          }
          if (link.id) elements.push(`#${link.id}`);
        });

        // @ts-ignore
        document.querySelectorAll('input, textarea, select').forEach((input: any) => {
          if (input.id) elements.push(`#${input.id}`);
          const name = input.getAttribute('name');
          if (name) elements.push(`[name="${name}"]`);
          const placeholder = input.getAttribute('placeholder');
          if (placeholder) elements.push(`[placeholder="${placeholder}"]`);
        });

        // @ts-ignore
        document.querySelectorAll('h1, h2, h3').forEach((heading: any) => {
          const text = heading.textContent?.trim();
          if (text) {
            elements.push(`${heading.tagName.toLowerCase()}:has-text("${text.substring(0, 50)}")`);
          }
        });

        // @ts-ignore
        document.querySelectorAll('[id]').forEach((el: any) => {
          if (el.id && !elements.includes(`#${el.id}`)) {
            elements.push(`#${el.id}`);
          }
        });

        // @ts-ignore
        document
          .querySelectorAll('[class*="btn"], [class*="button"], [class*="link"]')
          .forEach((el: any) => {
            const classes = el.className.split(' ').filter((c: any) => c.length > 0);
            if (classes.length > 0) {
              elements.push(`.${classes[0]}`);
            }
          });

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
