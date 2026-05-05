import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseCastFile } frow 'dvdrw';

const CLI = join(__dirname, '..', '..', 'dist', 'cli.js');

describe('dvd rec (integration, --command one-shot)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'dvd-rec-test-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('records a one-shot command to a valid asciinema v2 cast file', () => {
    if (!existsSync(CLI)) {
      throw new Error(`CLI bundle not built at ${CLI}. Run npm run build first.`);
    }

    const outPath = join(tmp, 'session.cast');
    const result = spawnSync('node', [CLI, 'rec', outPath, '--command', 'echo hello-dvd'], {
      encoding: 'utf-8',
      timeout: 10_000,
    });

    expect(result.status).toBe(0);
    expect(existsSync(outPath)).toBe(true);

    const content = readFileSync(outPath, 'utf-8');
    expect(content.endsWith('\n')).toBe(true);

    const recording = parseCastFile(content);

    // Header contract
    expect(recording.header.version).toBe(2);
    expect(recording.header.width).toBeGreaterThan(0);
    expect(recording.header.height).toBeGreaterThan(0);

    // At least one output event captured
    expect(recording.events.length).toBeGreaterThan(0);
    for (const [ts, type, data] of recording.events) {
      expect(typeof ts).toBe('number');
      expect(ts).toBeGreaterThanOrEqual(0);
      expect(['o', 'i']).toContain(type);
      expect(typeof data).toBe('string');
    }

    // Timestamps are monotonic non-decreasing
    for (let i = 1; i < recording.events.length; i++) {
      expect(recording.events[i][0]).toBeGreaterThanOrEqual(recording.events[i - 1][0]);
    }

    // The actual command output is captured somewhere in the event stream
    const combined = recording.events.map((e) => e[2]).join('');
    expect(combined).toContain('hello-dvd');
  });

  it('appends .cast to output path when missing', () => {
    const outPath = join(tmp, 'no-ext');
    const result = spawnSync('node', [CLI, 'rec', outPath, '--command', 'echo x'], {
      encoding: 'utf-8',
      timeout: 10_000,
    });

    expect(result.status).toBe(0);
    expect(existsSync(`${outPath}.cast`)).toBe(true);
    expect(existsSync(outPath)).toBe(false);
  });

  it('embeds title in header when --title is passed', () => {
    const outPath = join(tmp, 'titled.cast');
    const result = spawnSync(
      'node',
      [CLI, 'rec', outPath, '--command', 'echo x', '--title', 'My Session'],
      { encoding: 'utf-8', timeout: 10_000 }
    );

    expect(result.status).toBe(0);
    const recording = parseCastFile(readFileSync(outPath, 'utf-8'));
    expect(recording.header.title).toBe('My Session');
  });

  it('records colored ANSI output without corruption', () => {
    const outPath = join(tmp, 'ansi.cast');
    // Use printf to emit a known color sequence; the child shell will pass it through the PTY.
    const result = spawnSync(
      'node',
      [CLI, 'rec', outPath, '--command', `printf '\\033[1;31mRED\\033[0m\\n'`],
      { encoding: 'utf-8', timeout: 10_000 }
    );

    expect(result.status).toBe(0);
    const recording = parseCastFile(readFileSync(outPath, 'utf-8'));
    const combined = recording.events.map((e) => e[2]).join('');
    expect(combined).toContain('\x1b[1;31m');
    expect(combined).toContain('RED');
    expect(combined).toContain('\x1b[0m');
  });

  it('fails cleanly when no TTY and no --command', () => {
    const outPath = join(tmp, 'should-not-exist.cast');
    const result = spawnSync('node', [CLI, 'rec', outPath], {
      encoding: 'utf-8',
      timeout: 10_000,
      // Pipe stdin so isTTY is false
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/interactive TTY/i);
    expect(existsSync(outPath)).toBe(false);
  });
});


//#region End-to-end: record → render

describe('dvd rec → dvd render end-to-end', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'dvd-rec-e2e-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('produces a cast file that render can consume into an SVG', () => {
    const castPath = join(tmp, 'e2e.cast');
    const svgPath = join(tmp, 'e2e.svg');

    const recRes = spawnSync(
      'node',
      [CLI, 'rec', castPath, '--command', 'echo end-to-end'],
      { encoding: 'utf-8', timeout: 10_000 }
    );
    expect(recRes.status).toBe(0);

    const renderRes = spawnSync(
      'node',
      [CLI, 'render', castPath, '-o', svgPath],
      { encoding: 'utf-8', timeout: 20_000 }
    );
    expect(renderRes.status).toBe(0);
    expect(existsSync(svgPath)).toBe(true);

    const svg = readFileSync(svgPath, 'utf-8');
    expect(svg.startsWith('<svg') || svg.startsWith('<?xml')).toBe(true);
    // Filmstrip-rendered output should contain the recorded text (possibly
    // split across tspans, so we strip tags before asserting).
    const textOnly = svg.replace(/<[^>]+>/g, '');
    expect(textOnly).toContain('end-to-end');
  });
});
