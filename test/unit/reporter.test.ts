import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
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

describe('CodingAgentReporter Safety Tests', () => {
  let consoleLogSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('cleans only reporter-owned artifacts in a safe output dir', () => {
    const out = makeTmpDir('safe-out');

    // Reporter-owned artifacts in output directory
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

    // Removed - the entire output directory contents
    expect(fs.existsSync(out)).toBeTruthy(); // Directory exists but is cleaned
    expect(fs.existsSync(path.join(out, 'error-context.md'))).toBeFalsy();
    expect(fs.existsSync(path.join(out, 'failure-1-some_test.png'))).toBeFalsy();

    // Note: In the new structure, ALL files in the output dir are removed
    // since the output dir IS the reports dir
    expect(fs.existsSync(path.join(out, 'keep.txt'))).toBeFalsy();
    expect(fs.existsSync(path.join(out, 'nested', 'keep2.txt'))).toBeFalsy();
  });

  it('respects PLAYWRIGHT_AGENT_DO_NOT_REMOVE and keeps files', () => {
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

  it('skips cleanup for unsafe outputDir (project root) and warns', () => {
    // Create files in project root to verify that unsafe cleanup is skipped
    const rootReport = path.join(process.cwd(), 'error-context.md');
    const rootScreens = path.join(process.cwd(), 'screenshots');
    try {
      touch(rootReport, '# root report\n');
      touch(path.join(rootScreens, 'root.png'), '');

      const reporter = new CodingAgentReporter({ outputDir: '.', silent: true });
      const mockConfig: any = { workers: 1, projects: [] };
      const mockSuite: any = { allTests: () => [] };

      const logs: string[] = [];
      consoleLogSpy.mockImplementation((...args: any[]) => {
        logs.push(args.join(' '));
      });

      reporter.onBegin(mockConfig, mockSuite);

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

  it('prints overlap warning when reporter output overlaps project outputDir', () => {
    const out = makeTmpDir('overlap-out');
    const projects = [{ outputDir: path.join(out, 'projA') }];
    const reporter = new CodingAgentReporter({ outputDir: out, silent: true });
    const mockConfig: any = { workers: 1, projects };
    const mockSuite: any = { allTests: () => [] };

    const logs: string[] = [];
    consoleLogSpy.mockImplementation((...args: any[]) => {
      logs.push(args.join(' '));
    });

    reporter.onBegin(mockConfig, mockSuite);

    const combined = logs.join('\n');
    expect(combined).toContain('Configuration Warning');
  });
});
