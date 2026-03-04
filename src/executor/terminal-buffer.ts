/**
 * Terminal Buffer
 * Virtual terminal buffer that handles ANSI cursor positioning and movement
 * Used to properly render output from commands like neofetch that use cursor movement
 */

export interface TerminalCell {
  char: string;
  ansiPrefix: string; // ANSI codes that apply to this character
}

export class TerminalBuffer {
  private buffer: TerminalCell[][];
  private cursorX: number = 0;
  private cursorY: number = 0;
  private currentAnsi: string = '';
  private width: number;
  private height: number;

  constructor(width: number = 200, height: number = 100) {
    this.width = width;
    this.height = height;
    this.buffer = [];
    this.ensureLine(0);
  }

  /**
   * Ensure a line exists in the buffer
   */
  private ensureLine(y: number): void {
    while (this.buffer.length <= y) {
      this.buffer.push([]);
    }
  }

  /**
   * Ensure a cell exists at position
   */
  private ensureCell(x: number, y: number): void {
    this.ensureLine(y);
    while (this.buffer[y].length <= x) {
      this.buffer[y].push({ char: ' ', ansiPrefix: '' });
    }
  }

  /**
   * Write a character at the current cursor position
   */
  private writeChar(char: string): void {
    if (char === '\n') {
      this.cursorY++;
      this.cursorX = 0;
      this.ensureLine(this.cursorY);
      return;
    }

    if (char === '\r') {
      this.cursorX = 0;
      return;
    }

    this.ensureCell(this.cursorX, this.cursorY);
    this.buffer[this.cursorY][this.cursorX] = {
      char,
      ansiPrefix: this.currentAnsi,
    };
    this.cursorX++;
  }

  /**
   * Process output data with ANSI escape sequences
   */
  write(data: string): void {
    let i = 0;
    while (i < data.length) {
      // Check for ANSI escape sequence
      if (data[i] === '\x1b' && data[i + 1] === '[') {
        const escEnd = this.findEscapeEnd(data, i + 2);
        if (escEnd !== -1) {
          const sequence = data.substring(i + 2, escEnd);
          const command = data[escEnd];
          this.processEscape(sequence, command);
          i = escEnd + 1;
          continue;
        }
      }

      // Regular character
      this.writeChar(data[i]);
      i++;
    }
  }

  /**
   * Find the end of an ANSI escape sequence
   */
  private findEscapeEnd(data: string, start: number): number {
    for (let i = start; i < data.length; i++) {
      const c = data[i];
      // ANSI escape sequences end with a letter
      if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')) {
        return i;
      }
      // Valid intermediate characters are digits, semicolons, and ?
      if (!((c >= '0' && c <= '9') || c === ';' || c === '?')) {
        return -1; // Invalid sequence
      }
    }
    return -1; // Incomplete sequence
  }

  /**
   * Process an ANSI escape sequence
   */
  private processEscape(sequence: string, command: string): void {
    const params = sequence.split(';').map(p => parseInt(p, 10) || 0);
    const param1 = params[0] || 1;
    const param2 = params[1] || 1;

    switch (command) {
      case 'A': // Cursor Up
        this.cursorY = Math.max(0, this.cursorY - param1);
        break;

      case 'B': // Cursor Down
        this.cursorY += param1;
        this.ensureLine(this.cursorY);
        break;

      case 'C': // Cursor Forward
        this.cursorX += param1;
        break;

      case 'D': // Cursor Back
        this.cursorX = Math.max(0, this.cursorX - param1);
        break;

      case 'H': // Cursor Position (row;col)
      case 'f': // Same as H
        this.cursorY = Math.max(0, param1 - 1); // 1-indexed
        this.cursorX = Math.max(0, param2 - 1); // 1-indexed
        this.ensureLine(this.cursorY);
        break;

      case 'J': // Erase in Display
        if (param1 === 2) {
          // Clear entire screen
          this.buffer = [];
          this.ensureLine(0);
        }
        break;

      case 'K': // Erase in Line
        if (this.buffer[this.cursorY]) {
          if (param1 === 0) {
            // Clear from cursor to end of line
            this.buffer[this.cursorY].length = this.cursorX;
          } else if (param1 === 1) {
            // Clear from start of line to cursor
            for (let i = 0; i < this.cursorX; i++) {
              if (this.buffer[this.cursorY][i]) {
                this.buffer[this.cursorY][i] = { char: ' ', ansiPrefix: '' };
              }
            }
          } else if (param1 === 2) {
            // Clear entire line
            this.buffer[this.cursorY] = [];
          }
        }
        break;

      case 'm': // SGR (Select Graphic Rendition) - color/style codes
        // Handle SGR codes - accumulate styles until reset
        if (sequence === '0' || sequence === '') {
          this.currentAnsi = ''; // Reset all attributes
        } else {
          // Accumulate ANSI codes (append to current)
          // This handles cases like \x1b[32m\x1b[1m (green + bold)
          this.currentAnsi += `\x1b[${sequence}m`;
        }
        break;

      case 'h': // Enable mode (ignore most)
      case 'l': // Disable mode (ignore most)
        // Ignore cursor visibility and other modes
        break;

      default:
        // Unknown command, ignore
        break;
    }
  }

  /**
   * Get the buffer as an array of strings with ANSI codes embedded
   */
  getLines(): string[] {
    const result: string[] = [];

    for (const row of this.buffer) {
      let line = '';
      let lastAnsi = '';

      for (const cell of row) {
        // Only add ANSI prefix if it changed
        if (cell.ansiPrefix !== lastAnsi) {
          // Reset before applying new style if we had a previous style
          if (lastAnsi && cell.ansiPrefix) {
            line += '\x1b[0m';
          }
          line += cell.ansiPrefix;
          lastAnsi = cell.ansiPrefix;
        }
        line += cell.char;
      }

      // Reset at end of line if we had any styling
      if (lastAnsi) {
        line += '\x1b[0m';
      }

      result.push(line);
    }

    // Trim trailing empty lines
    while (result.length > 0 && result[result.length - 1].trim() === '') {
      result.pop();
    }

    return result;
  }

  /**
   * Get current cursor position
   */
  getCursor(): { x: number; y: number } {
    return { x: this.cursorX, y: this.cursorY };
  }
}
