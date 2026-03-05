/**
 * Persistent Shell - Maintains a shell session across commands
 *
 * Uses sentinel-based command completion detection.
 * Pure Node.js stdlib - no node-pty dependency.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

// ============================================================================
// Types
// ============================================================================

export interface CommandResult {
  output: Buffer;
  exitCode: number;
  duration: number;
}

export interface ShellOptions {
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
  width?: number;
  height?: number;
}

export interface OutputChunk {
  data: Buffer;
  timestamp: number;
}

// ============================================================================
// Persistent Shell
// ============================================================================

export class PersistentShell extends EventEmitter {
  private proc: ChildProcess | null = null;
  private commandId = 0;
  private pendingCommand: {
    id: number;
    chunks: Buffer[];
    resolve: (result: CommandResult) => void;
    reject: (error: Error) => void;
    startTime: number;
  } | null = null;
  private outputBuffer: Buffer = Buffer.alloc(0);
  private isDestroyed = false;

  private shell: string;
  private cwd: string;
  private env: Record<string, string>;
  private width: number;
  private height: number;

  constructor(options: ShellOptions = {}) {
    super();
    this.shell = options.shell ?? process.env.SHELL ?? '/bin/bash';
    this.cwd = options.cwd ?? process.cwd();
    this.env = options.env ?? {};
    this.width = options.width ?? 80;
    this.height = options.height ?? 24;
  }

  /**
   * Start the shell process
   */
  async start(): Promise<void> {
    if (this.proc) {
      throw new Error('Shell already started');
    }

    const env = {
      ...process.env,
      ...this.env,
      TERM: 'xterm-256color',
      COLUMNS: String(this.width),
      LINES: String(this.height),
      FORCE_COLOR: '1',
      CLICOLOR_FORCE: '1',
    };

    // Use 'script' command to allocate a PTY on macOS/Linux
    // This gives us proper terminal behavior without node-pty
    const isLinux = process.platform === 'linux';
    const isMac = process.platform === 'darwin';

    if (isLinux || isMac) {
      // script -qec on Linux, script -q on macOS
      const scriptArgs = isLinux
        ? ['-qec', this.shell, '/dev/null']
        : ['-q', '/dev/null', this.shell];

      this.proc = spawn('script', scriptArgs, {
        cwd: this.cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } else {
      // Fallback for other platforms - direct shell spawn
      this.proc = spawn(this.shell, ['-i'], {
        cwd: this.cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    }

    this.proc.stdout?.on('data', (data: Buffer) => {
      this.handleOutput(data);
    });

    this.proc.stderr?.on('data', (data: Buffer) => {
      this.handleOutput(data);
    });

    this.proc.on('close', (code) => {
      this.emit('close', code);
      this.proc = null;
    });

    this.proc.on('error', (err) => {
      this.emit('error', err);
    });

    // Wait for shell to be ready
    await this.waitForPrompt();
  }

  /**
   * Wait for the shell prompt to appear
   */
  private async waitForPrompt(): Promise<void> {
    return new Promise((resolve) => {
      // Give the shell a moment to start
      setTimeout(resolve, 100);
    });
  }

  /**
   * Handle output from the shell
   */
  private handleOutput(data: Buffer): void {
    this.emit('data', data);

    if (this.pendingCommand) {
      this.outputBuffer = Buffer.concat([this.outputBuffer, data]);
      this.pendingCommand.chunks.push(data);

      // Check for sentinel
      const output = this.outputBuffer.toString();
      const sentinel = `___DVD_SENTINEL_${this.pendingCommand.id}_`;
      const sentinelIndex = output.indexOf(sentinel);

      if (sentinelIndex !== -1) {
        // Extract exit code from sentinel: ___DVD_SENTINEL_123_0___
        const afterSentinel = output.slice(sentinelIndex + sentinel.length);
        const match = afterSentinel.match(/^(\d+)___/);
        const exitCode = match ? parseInt(match[1], 10) : 0;

        // Remove sentinel from output
        const cleanOutput = output.slice(0, sentinelIndex);
        const outputBuffer = Buffer.from(cleanOutput);

        const duration = Date.now() - this.pendingCommand.startTime;
        const pending = this.pendingCommand;
        this.pendingCommand = null;
        this.outputBuffer = Buffer.alloc(0);

        pending.resolve({
          output: outputBuffer,
          exitCode,
          duration,
        });
      }
    }
  }

  /**
   * Execute a command and capture output
   */
  async execute(command: string): Promise<CommandResult> {
    if (!this.proc) {
      throw new Error('Shell not started');
    }

    if (this.isDestroyed) {
      throw new Error('Shell has been destroyed');
    }

    if (this.pendingCommand) {
      throw new Error('Another command is already executing');
    }

    const id = ++this.commandId;
    const sentinel = `___DVD_SENTINEL_${id}_`;

    return new Promise((resolve, reject) => {
      this.pendingCommand = {
        id,
        chunks: [],
        resolve,
        reject,
        startTime: Date.now(),
      };

      this.outputBuffer = Buffer.alloc(0);

      // Write command with sentinel
      // The sentinel echoes the exit code of the previous command
      const fullCommand = `${command}; echo "${sentinel}$?___"\n`;
      this.proc!.stdin?.write(fullCommand);
    });
  }

  /**
   * Execute a command with streaming output
   */
  executeStreaming(
    command: string,
    onData: (chunk: OutputChunk) => void
  ): Promise<CommandResult> {
    if (!this.proc) {
      throw new Error('Shell not started');
    }

    const id = ++this.commandId;
    const sentinel = `___DVD_SENTINEL_${id}_`;
    const startTime = Date.now();
    const chunks: Buffer[] = [];
    let buffer = Buffer.alloc(0);

    return new Promise((resolve, reject) => {
      const dataHandler = (data: Buffer) => {
        buffer = Buffer.concat([buffer, data]);
        chunks.push(data);

        const output = buffer.toString();
        const sentinelIndex = output.indexOf(sentinel);

        if (sentinelIndex === -1) {
          // Not found yet - emit the chunk
          onData({ data, timestamp: Date.now() - startTime });
        } else {
          // Found sentinel - extract and complete
          const cleanOutput = output.slice(0, sentinelIndex);
          const afterSentinel = output.slice(sentinelIndex + sentinel.length);
          const match = afterSentinel.match(/^(\d+)___/);
          const exitCode = match ? parseInt(match[1], 10) : 0;

          // Emit final clean chunk
          if (cleanOutput.length > 0) {
            const lastChunkStart = output.lastIndexOf(data.toString());
            if (lastChunkStart < sentinelIndex) {
              const cleanData = Buffer.from(cleanOutput.slice(lastChunkStart));
              if (cleanData.length > 0) {
                onData({ data: cleanData, timestamp: Date.now() - startTime });
              }
            }
          }

          // Remove listener and resolve
          this.proc?.stdout?.off('data', dataHandler);
          this.proc?.stderr?.off('data', dataHandler);

          resolve({
            output: Buffer.from(cleanOutput),
            exitCode,
            duration: Date.now() - startTime,
          });
        }
      };

      this.proc!.stdout?.on('data', dataHandler);
      this.proc!.stderr?.on('data', dataHandler);

      // Write command with sentinel
      const fullCommand = `${command}; echo "${sentinel}$?___"\n`;
      this.proc!.stdin?.write(fullCommand);
    });
  }

  /**
   * Write raw input to the shell (for interactive commands)
   */
  write(data: string | Buffer): void {
    if (!this.proc) {
      throw new Error('Shell not started');
    }
    this.proc.stdin?.write(data);
  }

  /**
   * Send a signal to the shell process
   */
  signal(sig: NodeJS.Signals): void {
    if (this.proc) {
      this.proc.kill(sig);
    }
  }

  /**
   * Send Ctrl+C to interrupt current command
   */
  interrupt(): void {
    this.write('\x03');
  }

  /**
   * Destroy the shell
   */
  destroy(): void {
    this.isDestroyed = true;
    if (this.proc) {
      this.proc.kill('SIGTERM');
      this.proc = null;
    }

    if (this.pendingCommand) {
      this.pendingCommand.reject(new Error('Shell destroyed'));
      this.pendingCommand = null;
    }
  }

  /**
   * Check if shell is running
   */
  isRunning(): boolean {
    return this.proc !== null && !this.isDestroyed;
  }
}

// ============================================================================
// Simple Shell (Non-Persistent)
// ============================================================================

/**
 * Execute a single command without persistent shell
 * Simpler but doesn't preserve state between commands
 */
export async function executeCommand(
  command: string,
  options: ShellOptions = {}
): Promise<CommandResult> {
  const startTime = Date.now();
  const chunks: Buffer[] = [];

  const env = {
    ...process.env,
    ...options.env,
    TERM: 'xterm-256color',
    COLUMNS: String(options.width ?? 80),
    LINES: String(options.height ?? 24),
    FORCE_COLOR: '1',
    CLICOLOR_FORCE: '1',
  };

  return new Promise((resolve, reject) => {
    const proc = spawn(command, [], {
      shell: true,
      cwd: options.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stdout?.on('data', (data: Buffer) => {
      chunks.push(data);
    });

    proc.stderr?.on('data', (data: Buffer) => {
      chunks.push(data);
    });

    proc.on('close', (code) => {
      resolve({
        output: Buffer.concat(chunks),
        exitCode: code ?? 0,
        duration: Date.now() - startTime,
      });
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Execute a command with streaming output
 */
export function executeCommandStreaming(
  command: string,
  onData: (chunk: OutputChunk) => void,
  options: ShellOptions = {}
): Promise<CommandResult> {
  const startTime = Date.now();
  const chunks: Buffer[] = [];

  const env = {
    ...process.env,
    ...options.env,
    TERM: 'xterm-256color',
    COLUMNS: String(options.width ?? 80),
    LINES: String(options.height ?? 24),
    FORCE_COLOR: '1',
    CLICOLOR_FORCE: '1',
  };

  return new Promise((resolve, reject) => {
    const proc = spawn(command, [], {
      shell: true,
      cwd: options.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stdout?.on('data', (data: Buffer) => {
      chunks.push(data);
      onData({ data, timestamp: Date.now() - startTime });
    });

    proc.stderr?.on('data', (data: Buffer) => {
      chunks.push(data);
      onData({ data, timestamp: Date.now() - startTime });
    });

    proc.on('close', (code) => {
      resolve({
        output: Buffer.concat(chunks),
        exitCode: code ?? 0,
        duration: Date.now() - startTime,
      });
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}
