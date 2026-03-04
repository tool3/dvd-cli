/**
 * Terminal Renderer
 * Renders terminal state with cursor and fixed dimensions
 * Uses shellfie's templates for shell chrome styling
 */

import { parseAnsi, type ParsedLine, type TextSpan, type RGB, darkTheme, type Theme, templates, type Template } from 'shellfie';

export interface TerminalState {
  lines: string[];
  cursorX: number;
  cursorY: number;
  width: number;  // pixels
  height: number; // pixels
  fontSize: number;
  fontFamily: string;
  showCursor: boolean;
  activeCursor?: boolean; // true = solid cursor (typing/moving), false = blinking cursor (idle)
  selectionStart?: number; // Selection start position (for text selection on current line)
  selectionEnd?: number; // Selection end position
}

export interface RenderOptions {
  title?: string;
  template?: 'macos' | 'windows' | 'minimal';
  theme?: Theme;
  padding?: number;
  watermark?: string;
}

/**
 * Get shellfie template by name
 */
function getTemplate(templateName?: 'macos' | 'windows' | 'minimal'): Template {
  if (!templateName || templateName === 'macos') {
    return templates.macos;
  }
  if (templateName === 'windows') {
    return templates.windows;
  }
  return templates.minimal;
}

/**
 * Render terminal state as SVG
 */
export function renderTerminalSVG(state: TerminalState, options: RenderOptions = {}): string {
  const {
    lines,
    cursorX,
    cursorY,
    width,
    height,
    fontSize,
    fontFamily = "'SF Mono', 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'Courier New', monospace",
    showCursor,
  } = state;

  // Get template configuration from shellfie
  const template = getTemplate(options.template);
  const shell = template.shell;

  const padding = options.padding || shell.padding;
  const headerHeight = shell.titleBar ? shell.titleBarHeight : 0;
  const lineHeight = fontSize * 1.4;
  const borderRadius = shell.borderRadius;

  // Calculate character width (monospace approximation)
  const charWidth = fontSize * 0.6;

  // Use provided theme or default to dark theme
  const theme = options.theme || darkTheme;

  // Background and chrome
  const bgColor = theme.background;
  const textColor = theme.foreground;
  const cursorColor = theme.cursor;

  const svgWidth = width;
  const svgHeight = height;

  let svg = `<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">`;

  // Add styles
  svg += `
  <style>
    .cursor {
      animation: blink 1s step-end infinite;
    }
    .cursor-active {
      /* No animation - solid cursor during typing/movement */
    }
    @keyframes blink {
      0%, 50% { opacity: 1; }
      50.01%, 100% { opacity: 0; }
    }
  </style>`;

  // Background
  svg += `
  <rect width="${svgWidth}" height="${svgHeight}" fill="${bgColor}" rx="${borderRadius}" ry="${borderRadius}"/>`;

  // Border (if template has it)
  if (shell.border && shell.borderWidth > 0) {
    svg += `
  <rect width="${svgWidth}" height="${svgHeight}" fill="none" stroke="${shell.borderColor}" stroke-width="${shell.borderWidth}" rx="${borderRadius}" ry="${borderRadius}"/>`;
  }

  // Header/title bar (if template has it)
  if (shell.titleBar && shell.controls) {
    const controlStyle = shell.controlStyle;
    const controlY = headerHeight / 2;

    svg += `
  <g class="title-bar">
    <rect width="${svgWidth}" height="${headerHeight}" fill="${bgColor}" rx="${borderRadius}" ry="${borderRadius}"/>
    <rect y="${headerHeight - 10}" width="${svgWidth}" height="10" fill="${bgColor}"/>
    <line x1="0" y1="${headerHeight + 0.5}" x2="${svgWidth}" y2="${headerHeight + 0.5}" stroke="#d4d4d41a" stroke-width="1"/>`;

    if (shell.controlsPosition === 'right') {
      // Windows-style controls (right side): minimize, maximize, close
      const startX = svgWidth - padding - controlStyle.size / 2;

      // Close button (X)
      svg += `
    <g transform="translate(${startX}, ${controlY})">
      <line x1="-5" y1="-5" x2="5" y2="5" stroke="${controlStyle.close}" stroke-width="1.5"/>
      <line x1="5" y1="-5" x2="-5" y2="5" stroke="${controlStyle.close}" stroke-width="1.5"/>
    </g>`;

      // Maximize button (square)
      svg += `
    <g transform="translate(${startX - controlStyle.spacing}, ${controlY})">
      <rect x="-5" y="-5" width="10" height="10" fill="none" stroke="${textColor}" stroke-width="1" opacity="0.6"/>
    </g>`;

      // Minimize button (line)
      svg += `
    <g transform="translate(${startX - controlStyle.spacing * 2}, ${controlY})">
      <line x1="-5" y1="0" x2="5" y2="0" stroke="${textColor}" stroke-width="1.5" opacity="0.6"/>
    </g>`;
    } else {
      // macOS-style traffic lights (left side)
      const startX = padding + controlStyle.radius;
      svg += `
    <circle cx="${startX}" cy="${controlY}" r="${controlStyle.radius}" fill="${controlStyle.close}"/>
    <circle cx="${startX + controlStyle.spacing}" cy="${controlY}" r="${controlStyle.radius}" fill="${controlStyle.minimize}"/>
    <circle cx="${startX + controlStyle.spacing * 2}" cy="${controlY}" r="${controlStyle.radius}" fill="${controlStyle.maximize}"/>`;
    }

    if (options.title) {
      svg += `
    <text x="${svgWidth / 2}" y="${controlY + 4}" fill="${textColor}" font-family="${fontFamily}" font-size="12" text-anchor="middle" opacity="0.8">${escapeXml(options.title)}</text>`;
    }

    svg += `
  </g>`;
  }

  // Content area
  const contentY = headerHeight + padding;
  svg += `
  <g class="content">`;

  // Render lines with ANSI color support
  lines.forEach((line, i) => {
    const y = contentY + (i * lineHeight) + fontSize;
    if (line) {
      // Parse ANSI codes
      const parsedLines = parseAnsi(line);
      if (parsedLines.length > 0 && parsedLines[0].spans.length > 0) {
        let xOffset = padding;
        parsedLines[0].spans.forEach((span) => {
          const escapedText = escapeXml(span.text);

          // Handle inverse/reverse video
          let fgColor = resolveColor(span.style.foreground, theme);
          let bgColor = span.style.background ? resolveColor(span.style.background, theme) : null;

          if (span.style.inverse) {
            // Swap foreground and background
            const temp = fgColor;
            fgColor = bgColor || theme.background;
            bgColor = temp;
          }

          // Build style attributes
          let styleAttr = '';
          if (span.style.bold) styleAttr += ' font-weight="bold"';
          if (span.style.italic) styleAttr += ' font-style="italic"';
          if (span.style.underline) styleAttr += ' text-decoration="underline"';

          // Render background if needed (for inverse text)
          if (bgColor) {
            const spanWidth = span.text.length * charWidth;
            svg += `
    <rect x="${xOffset}" y="${y - fontSize}" width="${spanWidth}" height="${lineHeight}" fill="${bgColor}"/>`;
          }

          svg += `
    <text x="${xOffset}" y="${y}" fill="${fgColor}" font-family="${fontFamily}" font-size="${fontSize}"${styleAttr} xml:space="preserve">${escapedText}</text>`;

          // Update x offset for next span
          xOffset += span.text.length * charWidth;
        });
      }
    }
  });

  // Render selection (on current line only, before cursor so cursor appears on top)
  if (state.selectionStart !== undefined && state.selectionEnd !== undefined) {
    const selStart = Math.min(state.selectionStart, state.selectionEnd);
    const selEnd = Math.max(state.selectionStart, state.selectionEnd);

    if (selStart !== selEnd) {
      const selectionXStart = padding + (selStart * charWidth);
      const selectionWidth = (selEnd - selStart) * charWidth;
      const selectionY = contentY + (cursorY * lineHeight);
      const selectionColor = theme.selection || '#4A90E2'; // Default blue if theme doesn't have selection color

      svg += `
    <rect class="selection" x="${selectionXStart}" y="${selectionY}" width="${selectionWidth}" height="${lineHeight}" fill="${selectionColor}" opacity="0.3"/>`;
    }
  }

  // Render cursor
  if (showCursor) {
    const cursorXPos = padding + (cursorX * charWidth);
    const cursorYPos = contentY + (cursorY * lineHeight);
    const cursorClass = state.activeCursor ? 'cursor-active' : 'cursor';
    svg += `
    <rect class="${cursorClass}" x="${cursorXPos}" y="${cursorYPos}" width="${charWidth}" height="${lineHeight}" fill="${cursorColor}" opacity="0.7"/>`;
  }

  svg += `
  </g>`;

  // Render watermark if provided (after content, before closing svg)
  if (options.watermark) {
    // Parse ANSI codes in watermark
    const parsedWatermark = parseAnsi(options.watermark);
    const watermarkFontSize = 12;
    const watermarkY = svgHeight - padding;

    if (parsedWatermark.length > 0 && parsedWatermark[0].spans.length > 0) {
      // Calculate watermark width to right-align it
      const watermarkText = parsedWatermark[0].spans.map(s => s.text).join('');
      const watermarkWidth = watermarkText.length * (watermarkFontSize * 0.6);
      let xOffset = svgWidth - padding - watermarkWidth;

      parsedWatermark[0].spans.forEach((span) => {
        const escapedText = escapeXml(span.text);
        const fgColor = resolveColor(span.style.foreground, theme);
        let styleAttr = '';
        if (span.style.bold) styleAttr += ' font-weight="bold"';
        if (span.style.italic) styleAttr += ' font-style="italic"';
        if (span.style.dim) styleAttr += ' opacity="0.5"';

        svg += `
  <text x="${xOffset}" y="${watermarkY}" fill="${fgColor}" font-family="${fontFamily}" font-size="${watermarkFontSize}"${styleAttr} xml:space="preserve">${escapedText}</text>`;

        xOffset += span.text.length * (watermarkFontSize * 0.6);
      });
    }
  }

  svg += `
</svg>`;

  return svg;
}

/**
 * Resolve ANSI color to hex
 */
function resolveColor(color: string | RGB | undefined, theme: Theme): string {
  if (!color) return theme.foreground;

  // Handle RGB objects
  if (typeof color === 'object') {
    return `rgb(${color.r}, ${color.g}, ${color.b})`;
  }

  // Handle ANSI color names
  const colorMap: Record<string, keyof Theme> = {
    ansi0: 'black',
    ansi1: 'red',
    ansi2: 'green',
    ansi3: 'yellow',
    ansi4: 'blue',
    ansi5: 'magenta',
    ansi6: 'cyan',
    ansi7: 'white',
    ansi8: 'brightBlack',
    ansi9: 'brightRed',
    ansi10: 'brightGreen',
    ansi11: 'brightYellow',
    ansi12: 'brightBlue',
    ansi13: 'brightMagenta',
    ansi14: 'brightCyan',
    ansi15: 'brightWhite',
  };

  const themeKey = colorMap[color];
  if (themeKey) {
    return theme[themeKey] as string;
  }

  // Already a hex color
  return color;
}

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Create terminal state from text buffer
 */
export function createTerminalState(
  buffer: string,
  cursorX: number,
  cursorY: number,
  width: number,
  height: number,
  fontSize: number,
  showCursor: boolean = true,
  activeCursor: boolean = false,
  selectionStart?: number,
  selectionEnd?: number
): TerminalState {
  const lines = buffer.split('\n');

  return {
    lines,
    cursorX,
    cursorY,
    width,
    height,
    fontSize,
    fontFamily: "'SF Mono', 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'Courier New', monospace",
    showCursor,
    activeCursor,
    selectionStart,
    selectionEnd,
  };
}
