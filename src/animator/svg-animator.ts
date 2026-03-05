/**
 * SVG Animator
 * Combines pre-rendered terminal SVGs into animated SVG
 *
 * Uses SMIL <animate> with calcMode="discrete" for flicker-free animations.
 * Strategy:
 * - Static background is always visible (never animated)
 * - Each frame is stacked with visibility animation
 * - calcMode="discrete" ensures instant transitions with no interpolation
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
 * Get background color from first frame
 */
function getBackgroundColor(svg: string): string {
  const bgMatch = svg.match(/class="window-bg"[^>]*fill="([^"]*)"/);
  return bgMatch ? bgMatch[1] : '#282a36';
}

/**
 * Create animated SVG from frames using SMIL animations
 */
export async function createAnimatedSVG(
  frames: TerminalFrame[],
  options: AnimationOptions = {}
): Promise<string> {
  if (frames.length === 0) {
    throw new Error('No frames to animate');
  }

  // Get dimensions and background from first frame
  const { width, height } = getSVGDimensions(frames[0].svg);
  const bgColor = getBackgroundColor(frames[0].svg);

  // Calculate duration in seconds
  const totalDuration = frames[frames.length - 1].timestamp;
  const pauseAtEnd = options.pauseAtEnd || 1000;
  const animationDurationMs = totalDuration + pauseAtEnd;
  const animationDurationS = (animationDurationMs / 1000).toFixed(2);
  const repeatCount = options.loop !== false ? 'indefinite' : '1';

  // Extract base stylesheet from first frame (contains color definitions, font styles, etc.)
  const baseStyles = extractStyleBlock(frames[0].svg);

  // Calculate keyTimes for each frame (normalized 0-1)
  const keyTimes: number[] = frames.map(f => f.timestamp / animationDurationMs);

  // Build visibility values for each frame
  // Each frame needs: hidden until its time, visible during its window, hidden after
  const frameAnimations: string[] = [];

  for (let i = 0; i < frames.length; i++) {
    const frameContent = extractSVGBody(frames[i].svg, `f${i}`);

    // Build keyTimes and values for this frame's visibility
    const times: number[] = [];
    const values: string[] = [];

    if (i === 0) {
      // First frame: visible from start until next frame
      times.push(0);
      values.push('visible');

      if (frames.length > 1) {
        times.push(keyTimes[1]);
        values.push('hidden');
      }

      times.push(1);
      values.push('hidden');
    } else if (i === frames.length - 1) {
      // Last frame: hidden until its time, then visible to end
      times.push(0);
      values.push('hidden');

      times.push(keyTimes[i]);
      values.push('visible');

      times.push(1);
      values.push('visible');
    } else {
      // Middle frames: hidden, visible during window, hidden
      times.push(0);
      values.push('hidden');

      times.push(keyTimes[i]);
      values.push('visible');

      times.push(keyTimes[i + 1]);
      values.push('hidden');

      times.push(1);
      values.push('hidden');
    }

    // Dedupe consecutive identical times/values
    const dedupedTimes: number[] = [times[0]];
    const dedupedValues: string[] = [values[0]];
    for (let j = 1; j < times.length; j++) {
      if (times[j] !== dedupedTimes[dedupedTimes.length - 1]) {
        dedupedTimes.push(times[j]);
        dedupedValues.push(values[j]);
      }
    }

    const keyTimesStr = dedupedTimes.map(t => t.toFixed(6)).join(';');
    const valuesStr = dedupedValues.join(';');

    // Initial visibility: first frame visible, rest hidden
    const initialVisibility = i === 0 ? 'visible' : 'hidden';

    frameAnimations.push(`
  <g id="frame-${i}" visibility="${initialVisibility}">
    ${frameContent}
    <animate
      attributeName="visibility"
      values="${valuesStr}"
      keyTimes="${keyTimesStr}"
      dur="${animationDurationS}s"
      repeatCount="${repeatCount}"
      calcMode="discrete"
      fill="freeze"
    />
  </g>`);
  }

  // Build animated SVG with persistent background
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    ${baseStyles}
  </style>

  <!-- Persistent background - never animated -->
  <rect width="100%" height="100%" fill="${bgColor}" />

  <!-- Animated frames with discrete visibility transitions -->
  ${frameAnimations.join('\n')}
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
