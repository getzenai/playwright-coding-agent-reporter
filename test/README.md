# Test Structure

This directory contains two types of tests for the Playwright Coding Agent Reporter:

## `/unit` - Unit Tests (Vitest)

Fast, isolated unit tests that don't require a browser:

- `reporter.test.ts` - Tests for the main reporter class safety features
- `formatters.test.ts` - Tests for console and markdown formatters
- `page-helper.test.ts` - Tests for page state capture utilities

Run with: `npm run test:unit`

## `/e2e` - End-to-End Demo Tests (Playwright)

Example tests that demonstrate the reporter's output:

- `reporter-demo.spec.ts` - Comprehensive test scenarios demonstrating all reporter features
- `playwright.config.ts` - Playwright configuration for demo tests

Run with: `npm run test:example`

## Available Test Commands

- `npm test` - Run unit tests only (used in CI/CD)
- `npm run test:unit` - Run unit tests
- `npm run test:unit:watch` - Run unit tests in watch mode
- `npm run test:unit:ui` - Run unit tests with Vitest UI
- `npm run test:e2e` - Run end-to-end demo tests
- `npm run test:example` - Run example tests (alias for test:e2e)
