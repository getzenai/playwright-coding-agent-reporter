import { Page } from '@playwright/test';

export interface PageDebugInfo {
  url: string;
  title: string;
  visibleText: string;
  availableSelectors: string[];
  htmlSnippet?: string;
  suggestedSelectors?: string[];
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

      // Generate suggestions
      const suggestedSelectors = failedSelector
        ? await this.generateSelectorSuggestions(page, failedSelector, availableSelectors)
        : undefined;

      return {
        url,
        title,
        visibleText,
        availableSelectors,
        htmlSnippet,
        suggestedSelectors,
      };
    } catch (error) {
      // Return partial data if capture fails
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
      const texts = await page.evaluate(() => {
        // This code runs in browser context where document is available
        /* eslint-disable */
        // @ts-ignore
        const walker = document.createTreeWalker(
          // @ts-ignore
          document.body,
          // @ts-ignore
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node: any) => {
              const parent = node.parentElement;
              // @ts-ignore
              if (!parent) return NodeFilter.FILTER_REJECT;

              // @ts-ignore
              const style = window.getComputedStyle(parent);
              if (style.display === 'none' || style.visibility === 'hidden') {
                // @ts-ignore
                return NodeFilter.FILTER_REJECT;
              }

              const text = node.textContent?.trim();
              if (!text || text.length === 0) {
                // @ts-ignore
                return NodeFilter.FILTER_REJECT;
              }

              // @ts-ignore
              return NodeFilter.FILTER_ACCEPT;
            },
          }
        );

        const textNodes: string[] = [];
        let node;
        while ((node = walker.nextNode())) {
          const text = node.textContent?.trim();
          if (text && text.length > 0) {
            textNodes.push(text);
          }
        }

        return textNodes.slice(0, 100).join(' | '); // Limit to first 100 text nodes
      });

      return texts.substring(0, 2000); // Limit total length
    } catch {
      return '';
    }
  }

  private static async getAvailableSelectors(page: Page): Promise<string[]> {
    try {
      const selectors = await page.evaluate(() => {
        const elements: string[] = [];

        // @ts-ignore - browser context
        // Get buttons
        document.querySelectorAll('button').forEach((btn: any, i: any) => {
          const text = btn.textContent?.trim();
          if (text) {
            elements.push(`button:has-text("${text.substring(0, 30)}")`);
          }
          if (btn.id) elements.push(`#${btn.id}`);
          if (btn.className) elements.push(`button.${btn.className.split(' ')[0]}`);
        });

        // Get links
        // @ts-ignore
        document.querySelectorAll('a').forEach((link: any, i: any) => {
          const text = link.textContent?.trim();
          if (text && i < 10) {
            // Limit links
            elements.push(`a:has-text("${text.substring(0, 30)}")`);
          }
          if (link.id) elements.push(`#${link.id}`);
        });

        // Get inputs
        // @ts-ignore
        document.querySelectorAll('input, textarea, select').forEach((input: any) => {
          if (input.id) elements.push(`#${input.id}`);
          const name = input.getAttribute('name');
          if (name) elements.push(`[name="${name}"]`);
          const placeholder = input.getAttribute('placeholder');
          if (placeholder) elements.push(`[placeholder="${placeholder}"]`);
        });

        // Get headings
        // @ts-ignore
        document.querySelectorAll('h1, h2, h3').forEach((heading: any) => {
          const text = heading.textContent?.trim();
          if (text) {
            elements.push(`${heading.tagName.toLowerCase()}:has-text("${text.substring(0, 50)}")`);
          }
        });

        // Get elements with IDs
        // @ts-ignore
        document.querySelectorAll('[id]').forEach((el: any) => {
          if (el.id && !elements.includes(`#${el.id}`)) {
            elements.push(`#${el.id}`);
          }
        });

        // Get elements with specific classes
        // @ts-ignore
        document
          .querySelectorAll('[class*="btn"], [class*="button"], [class*="link"]')
          .forEach((el: any) => {
            const classes = el.className.split(' ').filter((c: any) => c.length > 0);
            if (classes.length > 0) {
              elements.push(`.${classes[0]}`);
            }
          });

        return [...new Set(elements)].slice(0, 50); // Remove duplicates, limit to 50
      });

      return selectors;
    } catch {
      return [];
    }
  }

  private static async getHtmlAroundSelector(page: Page, selector: string): Promise<string> {
    try {
      // Try to find parent context around where selector was expected
      const html = await page.evaluate((sel) => {
        // Try to find elements that might be related
        // @ts-ignore
        let context = document.body;

        // If selector is an ID, try to find container
        if (sel.startsWith('#')) {
          const id = sel.substring(1);
          // Look for partial matches or containers
          // @ts-ignore
          const similar = document.querySelector(
            `[id*="${id.substring(0, Math.min(5, id.length))}"]`
          );
          if (similar) {
            context = similar.parentElement || context;
          }
        }

        // If selector is a class
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

        // Get relevant HTML snippet
        const container =
          context.querySelector('main, [role="main"], article, .container, .content') || context;
        const html = container.innerHTML || container.outerHTML;

        // Clean and truncate
        return html
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/\s+/g, ' ')
          .substring(0, 3000);
      }, selector);

      return html;
    } catch {
      return '';
    }
  }

  private static async generateSelectorSuggestions(
    page: Page,
    failedSelector: string,
    availableSelectors: string[]
  ): Promise<string[]> {
    const suggestions: string[] = [];

    // Extract key parts from failed selector
    const parts = failedSelector.match(/[a-zA-Z0-9_-]+/g) || [];

    for (const part of parts) {
      // Find similar selectors
      const similar = availableSelectors.filter((sel) =>
        sel.toLowerCase().includes(part.toLowerCase())
      );
      suggestions.push(...similar);
    }

    // If it was looking for specific text, suggest text-based selectors
    if (failedSelector.includes('text=') || failedSelector.includes('has-text')) {
      const textMatch = failedSelector.match(/["']([^"']+)["']/);
      if (textMatch) {
        const searchText = textMatch[1];
        suggestions.push(`text="${searchText}"`);
        suggestions.push(`*:has-text("${searchText}")`);
      }
    }

    // Remove duplicates and limit
    return [...new Set(suggestions)].slice(0, 5);
  }
}
