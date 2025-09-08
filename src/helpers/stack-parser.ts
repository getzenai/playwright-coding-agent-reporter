/**
 * Simplified error combination utilities
 * We don't parse stacks - Playwright already provides formatted errors
 */

import { TestError } from '@playwright/test/reporter';

export interface ParsedStack {
  message: string;
  stackLines: string[];
  userCodeLocation?: string;
}

/**
 * Parse an error stack to extract message, stack lines, and user code location
 */
export function parseErrorStack(stack: string): ParsedStack {
  if (!stack) {
    return {
      message: '',
      stackLines: [],
    };
  }

  const lines = stack.split('\n');
  const stackStartIndex = lines.findIndex((line) => line.trim().startsWith('at '));

  if (stackStartIndex === -1) {
    // No stack trace found, it's all message
    return {
      message: stack,
      stackLines: [],
    };
  }

  const message = lines.slice(0, stackStartIndex).join('\n');
  const stackLines = lines.slice(stackStartIndex);

  // Find first user code location (not node internals)
  let userCodeLocation: string | undefined;
  for (const line of stackLines) {
    const match = line.match(/at .* \(([^)]+)\)|at ([^\s]+)$/);
    if (match) {
      const location = match[1] || match[2];
      if (location && !location.includes('node:') && !location.includes('node_modules')) {
        userCodeLocation = location;
        break;
      }
    }
  }

  return {
    message,
    stackLines,
    userCodeLocation,
  };
}

/**
 * Combine multiple errors into a comprehensive error message
 * Playwright already provides formatted errors, so we just concatenate them
 */
export function combineErrors(errors: TestError[]): {
  message: string;
  stack?: string;
  snippet?: string;
} {
  if (!errors || errors.length === 0) {
    return { message: 'Unknown error' };
  }

  // If there's only one error, return it as-is
  if (errors.length === 1) {
    return {
      message: errors[0].message || 'Unknown error',
      stack: errors[0].stack,
      snippet: errors[0].snippet,
    };
  }

  // For multiple errors (common with timeouts), combine them intelligently
  // Playwright has already formatted these nicely, so we just concatenate
  const messages: string[] = [];
  const stacks: string[] = [];
  let snippet: string | undefined;

  for (const error of errors) {
    // Collect unique messages
    if (error.message && !messages.some((m) => m.includes(error.message!))) {
      messages.push(error.message);
    }

    // Collect stack traces (already formatted by Playwright)
    if (error.stack) {
      // Extract stack lines (skip the message part if it's at the beginning)
      const stackLines = error.stack.split('\n');
      const messageLineCount = error.message ? error.message.split('\n').length : 0;

      // Get the actual stack trace part (after the message)
      let actualStack = error.stack;
      if (error.message && error.stack.startsWith(error.message)) {
        // Skip the message lines and get just the stack trace
        actualStack = stackLines.slice(messageLineCount).join('\n').trim();
      }

      if (actualStack && !stacks.includes(actualStack)) {
        stacks.push(actualStack);
      }
    }

    // Use the first snippet we find
    if (!snippet && error.snippet) {
      snippet = error.snippet;
    }
  }

  // Combine messages with clear separation
  const combinedMessage = messages.length > 1 ? messages.join('\n---\n') : messages.join('\n');

  // Combine stack traces with deduplication of common lines
  let combinedStack: string | undefined;
  if (stacks.length > 0) {
    // Collect all unique stack lines
    const allStackLines = new Set<string>();
    for (const stack of stacks) {
      const lines = stack.split('\n').filter((line) => line.trim());
      lines.forEach((line) => allStackLines.add(line));
    }
    combinedStack = Array.from(allStackLines).join('\n');
  }

  // For multiple snippets, combine them
  let combinedSnippet = snippet;
  if (errors.length > 1) {
    const snippets: string[] = [];
    for (const error of errors) {
      if (error.snippet) {
        snippets.push(error.snippet);
      }
    }
    if (snippets.length > 1) {
      combinedSnippet = snippets.join('\n---\n');
    } else if (snippets.length === 1) {
      combinedSnippet = snippets[0];
    }
  }

  return {
    message: combinedMessage,
    stack: combinedStack,
    snippet: combinedSnippet,
  };
}
