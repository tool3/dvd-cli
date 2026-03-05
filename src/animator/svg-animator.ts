/**
 * SVG Animator
 * Combines pre-rendered terminal SVGs into animated SVG
 */

import type { TerminalFrame } from '../executor/cd-executor';

export interface AnimationOptions {
  fps?: number;
  loop?: boolean;
  pauseAtEnd?: number;
}

/**
 * Extract style block from SVG
 */
function extractStyleBlock(svg: string): string {
  const styleMatch = svg.match(/<style>([\s\S]*?)<\/style>/);
  return styleMatch ? styleMatch[1] : '';
}

/**
 * Extract SVG body content (everything inside <svg>)
 * Always strips <style> blocks since they're handled separately
 */
function extractSVGBody(svg: string, frameId: string): string {
  const contentMatch = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  if (!contentMatch) return '';

  let content = contentMatch[1];

  // Strip style blocks (handled separately to avoid duplication)
  content = content.replace(/<style>[\s\S]*?<\/style>/g, '');

  // Make IDs unique (but don't modify classes - they contain color definitions)
  content = content
    .replace(/id="([^"]*)"/g, `id="$1-${frameId}"`)
    .replace(/url\(#([^)]*)\)/g, `url(#$1-${frameId})`);

  return content;
}

/**
 * Get SVG dimensions from first frame
 */
function getSVGDimensions(svg: string): { width: number; height: number } {
  const widthMatch = svg.match(/width="(\d+)"/);
  const heightMatch = svg.match(/height="(\d+)"/);

  return {
    width: widthMatch ? parseInt(widthMatch[1], 10) : 800,
    height: heightMatch ? parseInt(heightMatch[1], 10) : 600,
  };
}

/**
 * Create CSS keyframes for animation
 *
 * Strategy: Use step-start timing with clean transitions.
 * - Each frame is visible from its start time until the next frame's start time
 * - No gaps or overlaps in the percentage values
 * - Uses step-start timing so transitions happen instantly at the keyframe point
 */
function createKeyframes(frames: TerminalFrame[]): string {
  if (frames.length === 0) return '';

  const totalDuration = frames[frames.length - 1].timestamp;
  if (totalDuration === 0) return '';

  const css: string[] = [];

  // Calculate frame start percentages with high precision
  const framePercents = frames.map(f => (f.timestamp / totalDuration) * 100);

  for (let i = 0; i < frames.length; i++) {
    const startPercent = framePercents[i];
    const endPercent = i < frames.length - 1 ? framePercents[i + 1] : 100;

    if (i === 0) {
      // First frame: visible from 0%, becomes hidden when next frame starts
      css.push(`
    @keyframes frame-${i}-anim {
      0%, ${endPercent.toFixed(6)}% { opacity: 1; }
      ${endPercent.toFixed(6)}% { opacity: 0; }
    }`);
    } else if (i === frames.length - 1) {
      // Last frame: hidden until start, then visible through end
      css.push(`
    @keyframes frame-${i}-anim {
      0%, ${startPercent.toFixed(6)}% { opacity: 0; }
      ${startPercent.toFixed(6)}% { opacity: 1; }
    }`);
    } else {
      // Middle frames: hidden, then visible, then hidden
      css.push(`
    @keyframes frame-${i}-anim {
      0%, ${startPercent.toFixed(6)}% { opacity: 0; }
      ${startPercent.toFixed(6)}%, ${endPercent.toFixed(6)}% { opacity: 1; }
      ${endPercent.toFixed(6)}% { opacity: 0; }
    }`);
    }
  }

  return css.join('');
}

/**
 * Create animated SVG from frames
 */
export async function createAnimatedSVG(
  frames: TerminalFrame[],
  options: AnimationOptions = {}
): Promise<string> {
  if (frames.length === 0) {
    throw new Error('No frames to animate');
  }

  // Get dimensions from first frame
  const { width, height } = getSVGDimensions(frames[0].svg);

  // Calculate duration
  const totalDuration = frames[frames.length - 1].timestamp;
  const pauseAtEnd = options.pauseAtEnd || 1000;
  const animationDuration = ((totalDuration + pauseAtEnd) / 1000).toFixed(2);
  const animationIterationCount = options.loop !== false ? 'infinite' : '1';

  // Create keyframes
  const keyframes = createKeyframes(frames);

  // Extract base stylesheet from first frame (contains color definitions, font styles, etc.)
  const baseStyles = extractStyleBlock(frames[0].svg);

  // Extract frame contents - styles are handled separately
  const frameBodies = frames.map((frame, i) => ({
    id: `frame-${i}`,
    content: extractSVGBody(frame.svg, `f${i}`),
  }));

  // Build animated SVG
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    /* Base styles from first frame */
    ${baseStyles}

    /* Animation keyframes */
    ${keyframes}

    .frame {
      animation-duration: ${animationDuration}s;
      animation-timing-function: step-start;
      animation-iteration-count: ${animationIterationCount};
      animation-fill-mode: both;
    }

    ${frames.map((_, i) => `
    .frame-${i} {
      animation-name: frame-${i}-anim;
    }`).join('')}
  </style>

  <defs>
    ${frameBodies.map((frame) => `
    <g id="${frame.id}">
      ${frame.content}
    </g>`).join('')}
  </defs>

  ${frameBodies.map((frame, i) => `
  <use href="#${frame.id}" class="frame frame-${i}" />`).join('')}
</svg>`;

  return svg;
}

/**
 * Get animation metadata
 */
export function getAnimationMetadata(frames: TerminalFrame[]): {
  duration: number;
  frameCount: number;
  fps: number;
} {
  const duration = frames.length > 0 ? frames[frames.length - 1].timestamp : 0;
  const frameCount = frames.length;
  const fps = frameCount > 1 ? frameCount / (duration / 1000) : 0;

  return {
    duration,
    frameCount,
    fps: Math.round(fps * 10) / 10,
  };
}
