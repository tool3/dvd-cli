import { describe, expect, it } from 'vitest';
import {
  buildCastHeader,
  resolveOutputPath,
  resolveShell,
  serializeCast,
  type CastEvent,
  type CastHeader,
} from './rec';


//#region resolveShell

describe('resolveShell', () => {
  it('returns $SHELL on unix', () => {
    expect(resolveShell({ SHELL: '/bin/zsh' }, 'darwin')).toBe('/bin/zsh');
    expect(resolveShell({ SHELL: '/usr/bin/fish' }, 'linux')).toBe('/usr/bin/fish');
  });

  it('falls back to /bin/bash on unix when SHELL is unset', () => {
    expect(resolveShell({}, 'darwin')).toBe('/bin/bash');
    expect(resolveShell({}, 'linux')).toBe('/bin/bash');
  });

  it('returns COMSPEC on windows', () => {
    expect(resolveShell({ COMSPEC: 'C:\\Windows\\System32\\cmd.exe' }, 'win32'))
      .toBe('C:\\Windows\\System32\\cmd.exe');
  });

  it('falls back to cmd.exe on windows when COMSPEC is unset', () => {
    expect(resolveShell({}, 'win32')).toBe('cmd.exe');
  });

  it('ignores SHELL on windows', () => {
    expect(resolveShell({ SHELL: '/bin/zsh', COMSPEC: 'cmd.exe' }, 'win32')).toBe('cmd.exe');
  });
});


//#region resolveOutputPath

describe('resolveOutputPath', () => {
  it('defaults to recording.cast when not provided', () => {
    expect(resolveOutputPath(undefined)).toBe('recording.cast');
  });

  it('preserves .cast suffix if already present', () => {
    expect(resolveOutputPath('session.cast')).toBe('session.cast');
    expect(resolveOutputPath('/tmp/foo.cast')).toBe('/tmp/foo.cast');
  });

  it('appends .cast if missing', () => {
    expect(resolveOutputPath('session')).toBe('session.cast');
    expect(resolveOutputPath('/tmp/foo')).toBe('/tmp/foo.cast');
  });

  it('does not special-case other extensions', () => {
    // Appends .cast even if a different extension is present — users who
    // actually want foo.bar.cast or foo.cast can pass either
    expect(resolveOutputPath('session.txt')).toBe('session.txt.cast');
  });
});


//#region buildCastHeader

describe('buildCastHeader', () => {
  it('builds a v2 header with expected shape', () => {
    const header = buildCastHeader({
      cols: 120,
      rows: 40,
      startTimeMs: 1700000000_000,
      shell: '/bin/zsh',
    });

    expect(header).toEqual<CastHeader>({
      version: 2,
      width: 120,
      height: 40,
      timestamp: 1700000000,
      env: {
        SHELL: '/bin/zsh',
        TERM: 'xterm-256color',
      },
    });
  });

  it('converts ms timestamp to unix seconds', () => {
    const header = buildCastHeader({
      cols: 80,
      rows: 24,
      startTimeMs: 1700000001_500,
      shell: '/bin/bash',
    });
    expect(header.timestamp).toBe(1700000001);
  });

  it('includes title when provided', () => {
    const header = buildCastHeader({
      cols: 80,
      rows: 24,
      startTimeMs: 0,
      shell: '/bin/bash',
      title: 'My Demo',
    });
    expect(header.title).toBe('My Demo');
  });

  it('omits title when not provided (no undefined key)', () => {
    const header = buildCastHeader({
      cols: 80,
      rows: 24,
      startTimeMs: 0,
      shell: '/bin/bash',
    });
    expect('title' in header).toBe(false);
  });
});


//#region serializeCast

describe('serializeCast', () => {
  const header: CastHeader = {
    version: 2,
    width: 80,
    height: 24,
    timestamp: 1700000000,
    env: { SHELL: '/bin/zsh', TERM: 'xterm-256color' },
  };

  it('emits NDJSON with header on line 1 and events after', () => {
    const events: CastEvent[] = [
      [0.1, 'o', 'hello\r\n'],
      [0.2, 'o', 'world\r\n'],
    ];
    const out = serializeCast(header, events);
    const lines = out.split('\n').filter((l) => l.length > 0);

    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0])).toEqual(header);
    expect(JSON.parse(lines[1])).toEqual([0.1, 'o', 'hello\r\n']);
    expect(JSON.parse(lines[2])).toEqual([0.2, 'o', 'world\r\n']);
  });

  it('ends with a trailing newline', () => {
    const out = serializeCast(header, []);
    expect(out.endsWith('\n')).toBe(true);
  });

  it('handles empty event list (header only)', () => {
    const out = serializeCast(header, []);
    const lines = out.split('\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual(header);
  });

  it('escapes ANSI control sequences in event data', () => {
    const events: CastEvent[] = [
      [0.0, 'o', '\x1b[1;32mcolored\x1b[0m'],
    ];
    const out = serializeCast(header, events);
    const lines = out.split('\n').filter((l) => l.length > 0);
    const parsed = JSON.parse(lines[1]) as CastEvent;
    expect(parsed[2]).toBe('\x1b[1;32mcolored\x1b[0m');
  });

  it('preserves input events', () => {
    const events: CastEvent[] = [
      [0.5, 'i', 'l'],
      [0.6, 'i', 's'],
    ];
    const out = serializeCast(header, events);
    const parsed = out
      .split('\n')
      .filter((l) => l.length > 0)
      .slice(1)
      .map((l) => JSON.parse(l) as CastEvent);
    expect(parsed.every((e) => e[1] === 'i')).toBe(true);
  });
});
