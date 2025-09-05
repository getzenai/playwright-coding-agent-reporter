import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import CodingAgentReporter from '../../src/reporter';

function makeTmpDir(prefix: string) {
  const base = path.join(process.cwd(), 'test', '.tmp');
  fs.mkdirSync(base, { recursive: true });
  const name = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = path.join(base, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function touch(file: string, content = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

test('cleans only reporter-owned artifacts in a safe output dir', async () => {
  const out = makeTmpDir('safe-out');

  // Reporter-owned artifacts
  touch(path.join(out, 'error-context.md'), '# old report\n');
  touch(path.join(out, 'failure-1-some_test.png'), '');
  touch(path.join(out, 'failure-2-other.png'), '');
  touch(path.join(out, 'screenshots', 'old.png'), '');
  touch(path.join(out, 'traces', 'trace.zip'), 'zip');

  // Non-reporter files should remain
  touch(path.join(out, 'keep.txt'), 'keep');
  touch(path.join(out, 'nested', 'keep2.txt'), 'keep2');

  const reporter = new CodingAgentReporter({ outputDir: out, silent: true });
  const mockConfig: any = { workers: 1, projects: [] };
  const mockSuite: any = { allTests: () => [] };

  reporter.onBegin(mockConfig, mockSuite);

  // Removed
  expect(fs.existsSync(path.join(out, 'error-context.md'))).toBeFalsy();
  expect(fs.existsSync(path.join(out, 'failure-1-some_test.png'))).toBeFalsy();
  expect(fs.existsSync(path.join(out, 'failure-2-other.png'))).toBeFalsy();
  expect(fs.existsSync(path.join(out, 'screenshots'))).toBeFalsy();
  expect(fs.existsSync(path.join(out, 'traces'))).toBeFalsy();

  // Preserved
  expect(fs.existsSync(path.join(out, 'keep.txt'))).toBeTruthy();
  expect(fs.existsSync(path.join(out, 'nested', 'keep2.txt'))).toBeTruthy();
});

test('respects PLAYWRIGHT_AGENT_DO_NOT_REMOVE and keeps files', async () => {
  const out = makeTmpDir('no-remove');
  touch(path.join(out, 'error-context.md'), '# old report\n');
  touch(path.join(out, 'failure-1-some_test.png'), '');
  touch(path.join(out, 'screenshots', 'old.png'), '');
  const prev = process.env.PLAYWRIGHT_AGENT_DO_NOT_REMOVE;
  process.env.PLAYWRIGHT_AGENT_DO_NOT_REMOVE = '1';
  try {
    const reporter = new CodingAgentReporter({ outputDir: out, silent: true });
    const mockConfig: any = { workers: 1, projects: [] };
    const mockSuite: any = { allTests: () => [] };
    reporter.onBegin(mockConfig, mockSuite);

    expect(fs.existsSync(path.join(out, 'error-context.md'))).toBeTruthy();
    expect(fs.existsSync(path.join(out, 'failure-1-some_test.png'))).toBeTruthy();
    expect(fs.existsSync(path.join(out, 'screenshots', 'old.png'))).toBeTruthy();
  } finally {
    if (prev === undefined) delete process.env.PLAYWRIGHT_AGENT_DO_NOT_REMOVE;
    else process.env.PLAYWRIGHT_AGENT_DO_NOT_REMOVE = prev;
  }
});

test('skips cleanup for unsafe outputDir (project root) and warns', async () => {
  // Create files in project root to verify that unsafe cleanup is skipped
  const rootReport = path.join(process.cwd(), 'error-context.md');
  const rootScreens = path.join(process.cwd(), 'screenshots');
  try {
    touch(rootReport, '# root report\n');
    touch(path.join(rootScreens, 'root.png'), '');

    const reporter = new CodingAgentReporter({ outputDir: '.', silent: true });
    const mockConfig: any = { workers: 1, projects: [] };
    const mockSuite: any = { allTests: () => [] };

    // Capture console to detect safety warning
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => {
      logs.push(args.join(' '));
    };
    try {
      reporter.onBegin(mockConfig, mockSuite);
    } finally {
      console.log = origLog;
    }

    // Files should still exist as cleanup is skipped for unsafe path
    expect(fs.existsSync(rootReport)).toBeTruthy();
    expect(fs.existsSync(path.join(rootScreens, 'root.png'))).toBeTruthy();

    // Safety warning should be present
    const combined = logs.join('\n');
    expect(combined).toContain('Safety Warning');
  } finally {
    // Cleanup files we created in project root
    try {
      fs.rmSync(rootReport, { force: true });
    } catch {}
    try {
      fs.rmSync(rootScreens, { recursive: true, force: true });
    } catch {}
  }
});

test('prints overlap warning when reporter output overlaps project outputDir', async () => {
  const out = makeTmpDir('overlap-out');
  const projects = [{ outputDir: path.join(out, 'projA') }];
  const reporter = new CodingAgentReporter({ outputDir: out, silent: true });
  const mockConfig: any = { workers: 1, projects };
  const mockSuite: any = { allTests: () => [] };

  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: any[]) => {
    logs.push(args.join(' '));
  };
  try {
    reporter.onBegin(mockConfig, mockSuite);
  } finally {
    console.log = origLog;
  }

  const combined = logs.join('\n');
  expect(combined).toContain('Configuration Warning');
});
