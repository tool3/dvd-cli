import { describe, it, expect } from 'vitest';
import { getAnimationMetadata, extractStaticElements, createAnimatedSVG } from './svg-animator';
import type { TerminalFrame } from '../executor/cd-executor';

//#region Test Data

const createTestFrame = (timestamp: number, content: string = 'test'): TerminalFrame => ({
  timestamp,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
    <style>.text { font-family: monospace; }</style>
    <rect class="window-bg" x="0" y="0" width="800" height="600" fill="#1e1e1e" rx="8" ry="8"/>
    <g class="text-layer">
      <text class="text" x="16" y="16">${content}</text>
    </g>
  </svg>`,
  state: {
    content,
    cursorX: 0,
    cursorY: 0,
    width: 800,
    height: 600,
    fontSize: 14,
    showCursor: false,
    activeCursor: false,
  },
});


//#region getAnimationMetadata Tests

describe('getAnimationMetadata', () => {
  it('returns correct frame count', () => {
    const frames = [
      createTestFrame(0),
      createTestFrame(100),
      createTestFrame(200),
    ];

    const metadata = getAnimationMetadata(frames);

    expect(metadata.frameCount).toBe(3);
  });

  it('returns correct duration', () => {
    const frames = [
      createTestFrame(0),
      createTestFrame(500),
      createTestFrame(1000),
    ];

    const metadata = getAnimationMetadata(frames);

    expect(metadata.duration).toBe(1000);
  });

  it('calculates fps correctly', () => {
    const frames = [
      createTestFrame(0),
      createTestFrame(250),
      createTestFrame(500),
      createTestFrame(750),
      createTestFrame(1000),
    ];

    const metadata = getAnimationMetadata(frames);

    // 5 frames over 1000ms = 5 fps
    expect(metadata.fps).toBe(5);
  });

  it('handles single frame', () => {
    const frames = [createTestFrame(0)];

    const metadata = getAnimationMetadata(frames);

    expect(metadata.frameCount).toBe(1);
    expect(metadata.duration).toBe(0);
    expect(metadata.fps).toBe(0);
  });

  it('handles empty frames array', () => {
    const metadata = getAnimationMetadata([]);

    expect(metadata.frameCount).toBe(0);
    expect(metadata.duration).toBe(0);
    expect(metadata.fps).toBe(0);
  });
});


//#region extractStaticElements Tests

describe('extractStaticElements', () => {
  it('extracts dimensions from SVG', () => {
    const frames = [createTestFrame(0)];

    const elements = extractStaticElements(frames);

    expect(elements.width).toBe(800);
    expect(elements.height).toBe(600);
  });

  it('extracts background color', () => {
    const frames = [createTestFrame(0)];

    const elements = extractStaticElements(frames);

    expect(elements.bgColor).toBe('#1e1e1e');
  });

  it('extracts border radius', () => {
    const frames = [createTestFrame(0)];

    const elements = extractStaticElements(frames);

    expect(elements.borderRadius).toBe(8);
  });

  it('extracts styles', () => {
    const frames = [createTestFrame(0)];

    const elements = extractStaticElements(frames);

    expect(elements.styles).toContain('font-family: monospace');
  });

  it('handles SVG without chrome', () => {
    const frames = [createTestFrame(0)];

    const elements = extractStaticElements(frames);

    expect(elements.chrome).toBe('');
  });

  it('handles SVG without footer', () => {
    const frames = [createTestFrame(0)];

    const elements = extractStaticElements(frames);

    expect(elements.footer).toBe('');
  });

  it('handles SVG without watermark', () => {
    const frames = [createTestFrame(0)];

    const elements = extractStaticElements(frames);

    expect(elements.watermark).toBe('');
  });
});


//#region createAnimatedSVG Tests

describe('createAnimatedSVG', () => {
  it('throws error for empty frames', async () => {
    await expect(createAnimatedSVG([])).rejects.toThrow('No frames to animate');
  });

  it('creates valid SVG with single frame', async () => {
    const frames = [createTestFrame(0)];

    const svg = await createAnimatedSVG(frames);

    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('width="800"');
    expect(svg).toContain('height="600"');
  });

  it('creates animation with multiple frames', async () => {
    const frames = [
      createTestFrame(0, 'frame1'),
      createTestFrame(100, 'frame2'),
      createTestFrame(200, 'frame3'),
    ];

    const svg = await createAnimatedSVG(frames);

    expect(svg).toContain('<animate');
    expect(svg).toContain('attributeName="visibility"');
  });

  it('includes frame content in animated SVG', async () => {
    const frames = [
      createTestFrame(0, 'hello'),
      createTestFrame(100, 'world'),
    ];

    const svg = await createAnimatedSVG(frames);

    expect(svg).toContain('hello');
    expect(svg).toContain('world');
  });

  it('uses indefinite repeat by default', async () => {
    const frames = [createTestFrame(0), createTestFrame(100)];

    const svg = await createAnimatedSVG(frames);

    expect(svg).toContain('repeatCount="indefinite"');
  });

  it('respects loop: false option', async () => {
    const frames = [createTestFrame(0), createTestFrame(100)];

    const svg = await createAnimatedSVG(frames, { loop: false });

    expect(svg).toContain('repeatCount="1"');
  });

  it('includes rounded corners clip path when border radius exists', async () => {
    const frames = [createTestFrame(0)];

    const svg = await createAnimatedSVG(frames);

    expect(svg).toContain('clip-path="url(#rounded-corners)"');
    expect(svg).toContain('<clipPath id="rounded-corners">');
  });

  it('includes style block', async () => {
    const frames = [createTestFrame(0)];

    const svg = await createAnimatedSVG(frames);

    expect(svg).toContain('<style>');
    expect(svg).toContain('</style>');
  });

  it('deduplicates identical consecutive frames', async () => {
    const frames = [
      createTestFrame(0, 'same'),
      createTestFrame(100, 'same'),
      createTestFrame(200, 'same'),
      createTestFrame(300, 'different'),
    ];

    const svg = await createAnimatedSVG(frames);

    // Should have fewer frame groups than input frames due to deduplication
    const frameMatches = svg.match(/id="frame-\d+"/g) || [];
    expect(frameMatches.length).toBeLessThan(frames.length);
  });
});

