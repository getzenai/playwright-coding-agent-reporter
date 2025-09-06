import type { TestCase, TestResult, TestError } from '@playwright/test/reporter';

export interface CodingAgentReporterOptions {
  outputDir?: string;
  includeScreenshots?: boolean;
  includeConsoleErrors?: boolean;
  includeNetworkErrors?: boolean;
  includeVideo?: boolean;
  silent?: boolean;
  maxErrorLength?: number;
  singleReportFile?: boolean;
  verboseErrors?: boolean;
  maxInlineErrors?: number;
  showCodeSnippet?: boolean;
  capturePageState?: boolean;
}

export interface PageState {
  url?: string;
  title?: string;
  visibleText?: string;
  availableSelectors?: string[];
  htmlSnippet?: string;
  actionHistory?: string[];
  debuggingSuggestions?: string[];
}

export interface FailureContext {
  testTitle: string;
  suiteName?: string;
  testFile: string;
  lineNumber: number | undefined;
  error: TestError;
  stdout: string[];
  stderr: string[];
  consoleErrors?: string[];
  networkErrors?: string[];
  pageUrl?: string;
  pageState?: PageState;
  screenshot?: Buffer;
  duration: number;
  retries: number;
  testIndex?: number;
}

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  failures: FailureContext[];
}
