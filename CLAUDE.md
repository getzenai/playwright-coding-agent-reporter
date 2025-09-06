# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Core Commands

### Build & Development

- `npm run build` - Compile TypeScript to JavaScript (required before testing)
- `npm run watch` - Watch mode for development
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check formatting without applying changes

### Testing

- `npm run test:example` - Run example tests with the custom reporter (MUST use this to see reporter outputs)
- `npm run test` - Run tests with standard Playwright configuration

**Important**: Always build before testing the reporter: `npm run build && npm run test:example`

## Architecture Overview

This is a Playwright custom reporter designed for AI/LLM coding agents. The reporter captures comprehensive failure context to help AI agents debug test failures effectively.

### Key Components

1. **Reporter Core** (`src/reporter.ts`)
   - Main `CodingAgentReporter` class implementing Playwright's Reporter interface
   - Manages test lifecycle events and failure collection
   - Generates both console output and markdown reports
   - Safety checks to prevent directory traversal attacks

2. **Formatters** (`src/formatters.ts`)
   - `ConsoleFormatter` - Terminal output with color support
   - `MarkdownFormatter` - Structured markdown reports for AI consumption
   - Handles error formatting, code snippets, and selector suggestions

3. **Page State Capture** (`src/page-helper.ts`)
   - `PageStateCapture` class for extracting page context on failures
   - Captures available selectors, visible text, console errors, network failures
   - Implements Levenshtein distance for selector similarity suggestions

4. **Test Fixture** (`src/test-fixture.ts`)
   - Extended Playwright test fixture with automatic page state capture
   - Tracks console errors, network failures, and action history

### Report Generation Flow

1. Test fails → Reporter captures error context
2. Page state extracted (URL, selectors, console logs, etc.)
3. Similar selectors calculated using Levenshtein distance
4. Reports generated:
   - Consolidated `error-context.md` with all failures
   - Per-test `ai-error-report.md` in test result folders
   - Console output with inline errors

### Configuration

Reporter options are set in `playwright.config.ts`:

- `outputDir` - Where to write reports (default: 'test-results')
- `includeScreenshots` - Include screenshot references
- `singleReportFile` - Generate consolidated error-context.md
- `silent` - Suppress per-test console output
- `capturePageState` - Capture page context on failures

### Publishing

This package uses semantic-release for automated NPM publishing:

- Commits to main trigger automatic releases
- Version determined by conventional commit messages (feat:, fix:, etc.)
- NPM_TOKEN required in GitHub secrets for publishing
