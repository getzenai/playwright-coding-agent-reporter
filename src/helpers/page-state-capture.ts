/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */

import { Page } from '@playwright/test';

// Constants for limits
const MAX_VISIBLE_TEXT_LENGTH = 2000;
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
    } catch {
      // Return partial data if capture fails or times out
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
      // Add timeout for evaluate (2 seconds)
      // DOM operations within page.evaluate have complex typing issues - disable unsafe rules

      const texts = await page.evaluate((): any => {
        // Simple text extraction
        const bodyText =
          (document as any).body?.innerText || (document as any).body?.textContent || '';

        return (bodyText as string).substring(0, 2000);
      });

      if (typeof texts === 'string') {
        return texts.substring(0, MAX_VISIBLE_TEXT_LENGTH);
      }
      return '';
    } catch {
      return '';
    }
  }

  private static async getAvailableSelectors(page: Page): Promise<string[]> {
    try {
      // Add timeout for evaluate (2 seconds)
      // DOM operations within page.evaluate have complex typing issues - disable unsafe rules

      const selectors = await page.evaluate((): any => {
        const elements: string[] = [];

        // Simple check - are we even in a page with content?

        if (!(document as any).body) {
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

        (document as any)
          .querySelectorAll('button, [role="button"], [type="submit"], [type="button"]')

          .forEach((button: any) => {
            const text = button.textContent?.trim();

            const ariaLabel = button.getAttribute('aria-label');

            const dataTestId =
              button.getAttribute('data-testid') || button.getAttribute('data-test-id');

            if (text && text.length > 0) {
              selectorCategories.interactive.push(
                `button:has-text("${(text as string).substring(0, 30)}")`
              );
            }
            if (ariaLabel) {
              selectorCategories.interactive.push(`[aria-label="${ariaLabel as string}"]`);
            }
            if (dataTestId) {
              selectorCategories.interactive.push(`[data-testid="${dataTestId as string}"]`);
            }

            if (button.id) selectorCategories.interactive.push(`#${button.id as string}`);

            if (button.className && typeof button.className === 'string') {
              const mainClass = (button.className as string)
                .split(' ')
                .filter((c: string) => c.length > 0)[0];
              if (mainClass) selectorCategories.interactive.push(`button.${mainClass}`);
            }
          });

        // Enhanced link selectors

        (document as any)
          .querySelectorAll('a[href], [role="link"]')

          .forEach((linkElement: any, i: number) => {
            if (i >= 15) return; // Limit links

            const text = linkElement.textContent?.trim();

            const href = linkElement.getAttribute('href');

            const ariaLabel = linkElement.getAttribute('aria-label');

            if (text && text.length > 0) {
              selectorCategories.navigation.push(
                `a:has-text("${(text as string).substring(0, 30)}")`
              );
            }
            if (href && href !== '#' && href !== 'javascript:void(0)') {
              selectorCategories.navigation.push(`[href="${href as string}"]`);
            }
            if (ariaLabel) {
              selectorCategories.navigation.push(`[aria-label="${ariaLabel as string}"]`);
            }

            if (linkElement.id) selectorCategories.navigation.push(`#${linkElement.id as string}`);
          });

        // Enhanced form input selectors

        (document as any)
          .querySelectorAll('input, textarea, select, [contenteditable="true"]')

          .forEach((inputElement: any) => {
            const type = inputElement.getAttribute('type');

            const name = inputElement.getAttribute('name');

            const placeholder = inputElement.getAttribute('placeholder');

            const label =
              inputElement.getAttribute('aria-label') || inputElement.getAttribute('title');

            const dataTestId =
              inputElement.getAttribute('data-testid') || inputElement.getAttribute('data-test-id');

            if (inputElement.id) selectorCategories.forms.push(`#${inputElement.id as string}`);
            if (name) selectorCategories.forms.push(`[name="${name as string}"]`);
            if (placeholder)
              selectorCategories.forms.push(`[placeholder="${placeholder as string}"]`);
            if (label) selectorCategories.forms.push(`[aria-label="${label as string}"]`);
            if (dataTestId)
              selectorCategories.forms.push(`[data-testid="${dataTestId as string}"]`);
            if (type && type !== 'hidden') {
              selectorCategories.forms.push(`input[type="${type as string}"]`);
            }
          });

        // Enhanced heading selectors

        (document as any)
          .querySelectorAll('h1, h2, h3, h4, [role="heading"]')

          .forEach((headingElement: any) => {
            const text = headingElement.textContent?.trim();

            if (text && text.length > 0) {
              const tagName = headingElement.tagName?.toLowerCase() || 'h1';

              selectorCategories.content.push(
                `${tagName as string}:has-text("${(text as string).substring(0, 50)}")`
              );
            }

            if (headingElement.id)
              selectorCategories.content.push(`#${headingElement.id as string}`);
          });

        // Enhanced structural selectors with data attributes

        (document as any)
          .querySelectorAll('[data-testid], [data-test-id], [data-cy], [data-test]')

          .forEach((element: any) => {
            const testId =
              element.getAttribute('data-testid') ||
              element.getAttribute('data-test-id') ||
              element.getAttribute('data-cy') ||
              element.getAttribute('data-test');
            if (testId) {
              selectorCategories.structural.push(`[data-testid="${testId as string}"]`);
            }
          });

        // Role-based selectors

        (document as any)
          .querySelectorAll('[role]')

          .forEach((element: any) => {
            const role = element.getAttribute('role');

            const ariaLabel = element.getAttribute('aria-label');

            if (role && !['presentation', 'none'].includes(role as string)) {
              if (ariaLabel) {
                selectorCategories.structural.push(
                  `[role="${role as string}"][aria-label="${ariaLabel as string}"]`
                );
              } else {
                selectorCategories.structural.push(`[role="${role as string}"]`);
              }
            }
          });

        // Class pattern matching for common UI components
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
          (document as any)
            .querySelectorAll(`[class*="${pattern}"]`)

            .forEach((el: any, i: number) => {
              if (i >= 5) return; // Limit per pattern

              const classes = ((el.className as string)?.split(' ') || []).filter(
                (c: string) => typeof c === 'string' && c.length > 0 && c.includes(pattern)
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

      if (Array.isArray(selectors)) {
        return selectors;
      }
      return [];
    } catch {
      return [];
    }
  }

  private static async getHtmlAroundSelector(page: Page, selector: string): Promise<string> {
    try {
      // DOM operations within page.evaluate have complex typing issues - disable unsafe rules

      const html = await page.evaluate((sel: string): any => {
        let context = (document as any).body as HTMLElement;

        if (sel.startsWith('#')) {
          const id = sel.substring(1);

          const similar = (document as any).querySelector(
            `[id*="${id.substring(0, Math.min(5, id.length))}"]`
          ) as Element | null;
          if (similar) {
            context = (similar.parentElement as HTMLElement) || context;
          }
        }

        if (sel.startsWith('.')) {
          const className = sel.substring(1);

          const similar = (document as any).querySelector(
            `[class*="${className.substring(0, Math.min(5, className.length))}"]`
          ) as Element | null;
          if (similar) {
            context = (similar.parentElement as HTMLElement) || context;
          }
        }

        const container =
          context.querySelector('main, [role="main"], article, .container, .content') || context;

        const htmlContent =
          (container as HTMLElement).innerHTML || (container as HTMLElement).outerHTML;

        return (htmlContent as string)
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/\s+/g, ' ')
          .substring(0, MAX_HTML_SNIPPET_LENGTH);
      }, selector);

      if (typeof html === 'string') {
        return html;
      }
      return '';
    } catch {
      return '';
    }
  }
}
