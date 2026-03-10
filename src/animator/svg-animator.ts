import type { TerminalFrame } from '../executor/cd-executor';

//#region Types

export interface AnimationOptions {
  fps?: number;
  loop?: boolean;
  pauseAtEnd?: number;
}


//#region Utilities

// Format keyTime for minimal SVG size (removes trailing zeros)
const fmtKeyTime = (t: number): string => {
  if (t === 0) return '0';
  if (t === 1) return '1';
  return t.toFixed(6).replace(/\.?0+$/, '');
};

const extractStyleBlock = (svg: string): string => {
  const styleMatch = svg.match(/<style>([\s\S]*?)<\/style>/);
  return styleMatch ? styleMatch[1] : '';
};

const extractDynamicContent = (svg: string, frameId: string): string => {
  const contentMatch = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  if (!contentMatch) return '';

  let content = contentMatch[1];
  content = content.replace(/<style>[\s\S]*?<\/style>/g, '');
  content = content.replace(/<defs>[\s\S]*?<\/defs>/g, '');
  content = content.replace(/^\s*<g clip-path="[^"]*">\s*/g, '');
  content = content.replace(/\s*<\/g>\s*$/g, '');
  content = content.replace(/<rect class="window-bg"[^>]*\/>/g, '');
  content = content.replace(/<g class="chrome">[\s\S]*?<\/g>/g, '');
  content = content.replace(/<g class="footer">[\s\S]*?<\/g>/g, '');
  content = content.replace(/<text class="watermark"[^>]*>[\s\S]*?<\/text>/g, '');
  content = content
    .replace(/id="([^"]*)"/g, `id="$1-${frameId}"`)
    .replace(/url\(#([^)]*)\)/g, `url(#$1-${frameId})`);
  content = content.replace(/^\s*[\r\n]/gm, '');

  return content.trim();
};

const extractChrome = (svg: string): string => {
  const chromeMatch = svg.match(/<g class="chrome">([\s\S]*?)<\/g>/);
  return chromeMatch ? chromeMatch[1] : '';
};

const extractFooter = (svg: string): string => {
  const footerMatch = svg.match(/<g class="footer">([\s\S]*?)<\/g>/);
  return footerMatch ? footerMatch[1] : '';
};

const extractWatermark = (svg: string): string => {
  const watermarkMatch = svg.match(/<text class="watermark"[^>]*>[\s\S]*?<\/text>/);
  return watermarkMatch ? watermarkMatch[0] : '';
};

const getSVGDimensions = (svg: string): { width: number; height: number } => {
  const widthMatch = svg.match(/width="(\d+)"/);
  const heightMatch = svg.match(/height="(\d+)"/);
  return {
    width: widthMatch ? parseInt(widthMatch[1], 10) : 800,
    height: heightMatch ? parseInt(heightMatch[1], 10) : 600,
  };
};

const getBackgroundColor = (svg: string): string => {
  const bgMatch = svg.match(/class="window-bg"[^>]*fill="([^"]*)"/);
  return bgMatch ? bgMatch[1] : '#282a36';
};

const getBorderRadius = (svg: string): number => {
  const rxMatch = svg.match(/class="window-bg"[^>]*rx="(\d+)"/);
  return rxMatch ? parseInt(rxMatch[1], 10) : 0;
};


//#region Frame Deduplication

const deduplicateFrames = (frames: TerminalFrame[]): TerminalFrame[] => {
  if (frames.length <= 1) return frames;

  const result: TerminalFrame[] = [];
  let lastContent = '';

  for (let i = 0; i < frames.length; i++) {
    const content = extractDynamicContent(frames[i].svg, 'check');
    if (content !== lastContent || i === frames.length - 1) {
      result.push(frames[i]);
      lastContent = content;
    }
  }

  return result;
};


//#region Animation Generation

export const createAnimatedSVG = async (
  frames: TerminalFrame[],
  options: AnimationOptions = {}
): Promise<string> => {
  if (frames.length === 0) throw new Error('No frames to animate');

  const animationFrames = deduplicateFrames(frames);
  const { width, height } = getSVGDimensions(animationFrames[0].svg);
  const bgColor = getBackgroundColor(animationFrames[0].svg);
  const borderRadius = getBorderRadius(animationFrames[0].svg);

  const lastFrameTimestamp = frames[frames.length - 1].timestamp;
  const pauseAtEnd = options.pauseAtEnd ?? 1000;

  const frameDuration = frames.length > 1
    ? frames[1].timestamp - frames[0].timestamp
    : lastFrameTimestamp;

  const seamlessLoop = pauseAtEnd <= 0;
  const animationDurationMs = seamlessLoop
    ? lastFrameTimestamp + frameDuration
    : lastFrameTimestamp + pauseAtEnd;
  const animationDurationS = (animationDurationMs / 1000).toFixed(2);
  const repeatCount = options.loop !== false ? 'indefinite' : '1';

  const baseStyles = extractStyleBlock(animationFrames[0].svg);
  const chrome = extractChrome(animationFrames[0].svg);
  const footer = extractFooter(animationFrames[0].svg);
  const watermark = extractWatermark(animationFrames[0].svg);

  const keyTimes: number[] = animationFrames.map(f => f.timestamp / animationDurationMs);
  const frameAnimations: string[] = [];

  for (let i = 0; i < animationFrames.length; i++) {
    const frameContent = extractDynamicContent(animationFrames[i].svg, `f${i}`);
    const times: number[] = [];
    const values: string[] = [];

    if (i === 0) {
      times.push(0);
      values.push('visible');
      if (animationFrames.length > 1) {
        times.push(keyTimes[1]);
        values.push('hidden');
      }
      times.push(1);
      values.push('hidden');
    } else if (i === animationFrames.length - 1) {
      times.push(0);
      values.push('hidden');
      times.push(keyTimes[i]);
      values.push('visible');
      times.push(1);
      values.push('visible');
    } else {
      times.push(0);
      values.push('hidden');
      times.push(keyTimes[i]);
      values.push('visible');
      times.push(keyTimes[i + 1]);
      values.push('hidden');
      times.push(1);
      values.push('hidden');
    }

    // Dedupe: only skip if BOTH time and value are the same as previous
    const dedupedTimes: number[] = [times[0]];
    const dedupedValues: string[] = [values[0]];
    for (let j = 1; j < times.length; j++) {
      const sameTime = times[j] === dedupedTimes[dedupedTimes.length - 1];
      const sameValue = values[j] === dedupedValues[dedupedValues.length - 1];
      if (!sameTime || !sameValue) {
        dedupedTimes.push(times[j]);
        dedupedValues.push(values[j]);
      }
    }

    const keyTimesStr = dedupedTimes.map(fmtKeyTime).join(';');
    const valuesStr = dedupedValues.join(';');
    const initialVisibility = i === 0 ? 'visible' : 'hidden';

    frameAnimations.push(`
  <g id="frame-${i}" visibility="${initialVisibility}">
    ${frameContent}
    <animate attributeName="visibility" values="${valuesStr}" keyTimes="${keyTimesStr}" dur="${animationDurationS}s" repeatCount="${repeatCount}" calcMode="discrete" fill="freeze"/>
  </g>`);
  }

  const clipPathDef = borderRadius > 0
    ? `<defs><clipPath id="rounded-corners"><rect x="0" y="0" width="${width}" height="${height}" rx="${borderRadius}" ry="${borderRadius}"/></clipPath></defs>`
    : '';
  const clipStart = borderRadius > 0 ? `<g clip-path="url(#rounded-corners)">` : '';
  const clipEnd = borderRadius > 0 ? '</g>' : '';
  const bgRx = borderRadius > 0 ? ` rx="${borderRadius}" ry="${borderRadius}"` : '';
  const chromeSection = chrome ? `<g class="chrome">${chrome}</g>` : '';
  const footerSection = footer ? `<g class="footer">${footer}</g>` : '';

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  ${clipPathDef}
  <style>
    ${baseStyles}
  </style>

  ${clipStart}
  <!-- Static background (never animated) -->
  <rect width="100%" height="100%" fill="${bgColor}"${bgRx} />

  <!-- Static chrome (title bar) -->
  ${chromeSection}

  <!-- Animated frames (only dynamic content) -->
  ${frameAnimations.join('\n')}

  <!-- Static footer -->
  ${footerSection}
  ${watermark}
  ${clipEnd}
</svg>`;
};


//#region Metadata

export const extractStaticElements = (frames: TerminalFrame[]): {
  width: number;
  height: number;
  bgColor: string;
  borderRadius: number;
  styles: string;
  chrome: string;
  footer: string;
  watermark: string;
} => {
  const firstFrame = frames[0].svg;
  return {
    ...getSVGDimensions(firstFrame),
    bgColor: getBackgroundColor(firstFrame),
    borderRadius: getBorderRadius(firstFrame),
    styles: extractStyleBlock(firstFrame),
    chrome: extractChrome(firstFrame),
    footer: extractFooter(firstFrame),
    watermark: extractWatermark(firstFrame),
  };
};

export const getAnimationMetadata = (frames: TerminalFrame[]): {
  duration: number;
  frameCount: number;
  fps: number;
} => {
  const duration = frames.length > 0 ? frames[frames.length - 1].timestamp : 0;
  const frameCount = frames.length;
  const fps = frameCount > 1 ? frameCount / (duration / 1000) : 0;
  return { duration, frameCount, fps: Math.round(fps * 10) / 10 };
};

