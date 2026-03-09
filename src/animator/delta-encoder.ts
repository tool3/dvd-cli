/**
 * Delta Encoder for SVG Animations
 *
 * Encodes animations efficiently by:
 * 1. Storing complete dynamic content for each frame (stripped of static elements)
 * 2. Using a JavaScript player that swaps frame content at runtime
 *
 * This is simpler and more reliable than element-level diffing.
 */

import type { TerminalFrame } from '../executor/cd-executor';

/**
 * Strip static elements from SVG content (chrome, footer, watermark, window-bg)
 * These don't change between frames and are rendered once outside the animation
 */
function extractDynamicContent(svgContent: string): string {
  // Extract content inside the SVG
  const contentMatch = svgContent.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  if (!contentMatch) return '';

  let content = contentMatch[1];

  // Strip style blocks (handled separately)
  content = content.replace(/<style>[\s\S]*?<\/style>/g, '');
  // Strip defs blocks
  content = content.replace(/<defs>[\s\S]*?<\/defs>/g, '');
  // Strip outer clip-path group wrapper
  content = content.replace(/^\s*<g clip-path="[^"]*">\s*/g, '');
  content = content.replace(/\s*<\/g>\s*$/g, '');
  // Strip window background rect
  content = content.replace(/<rect class="window-bg"[^>]*\/>/g, '');
  // Strip chrome group (title bar)
  content = content.replace(/<g class="chrome">[\s\S]*?<\/g>/g, '');
  // Strip footer group
  content = content.replace(/<g class="footer">[\s\S]*?<\/g>/g, '');
  // Strip watermark
  content = content.replace(/<text class="watermark"[^>]*>[\s\S]*?<\/text>/g, '');
  // Clean up whitespace
  content = content.replace(/^\s+/gm, '').replace(/\n+/g, '');

  return content.trim();
}

/**
 * Analyze frames and compute potential savings from delta encoding
 */
export function analyzeDeltaPotential(frames: TerminalFrame[]): {
  currentSize: number;
  estimatedDeltaSize: number;
  savingsPercent: number;
  analysisTimeMs: number;
} {
  const startTime = Date.now();

  let currentSize = 0;
  const uniqueContents = new Set<string>();

  for (const frame of frames) {
    currentSize += frame.svg.length;
    const dynamic = extractDynamicContent(frame.svg);
    uniqueContents.add(dynamic);
  }

  // Estimate: unique content + timestamps + overhead
  let estimatedDeltaSize = 0;
  for (const content of uniqueContents) {
    estimatedDeltaSize += content.length;
  }
  // Add overhead for frame timestamps and structure
  estimatedDeltaSize += frames.length * 20;
  // Add static elements overhead (styles, chrome, etc.)
  estimatedDeltaSize += 5000;

  const analysisTimeMs = Date.now() - startTime;
  const savingsPercent = Math.round((1 - estimatedDeltaSize / currentSize) * 100);

  return {
    currentSize,
    estimatedDeltaSize,
    savingsPercent,
    analysisTimeMs,
  };
}

/**
 * Generate delta-encoded animated SVG
 * Uses JavaScript to swap frame content at runtime
 */
export function generateDeltaAnimatedSVG(
  frames: TerminalFrame[],
  options: {
    width: number;
    height: number;
    bgColor: string;
    borderRadius: number;
    styles: string;
    chrome: string;
    footer: string;
    watermark: string;
    loop: boolean;
  }
): string {
  const { width, height, bgColor, borderRadius, styles, chrome, footer, watermark, loop } = options;

  // Extract dynamic content for each frame and deduplicate
  const frameContents: string[] = [];
  const contentToIndex = new Map<string, number>();
  const frameIndices: number[] = [];

  for (const frame of frames) {
    const content = extractDynamicContent(frame.svg);

    let index = contentToIndex.get(content);
    if (index === undefined) {
      index = frameContents.length;
      frameContents.push(content);
      contentToIndex.set(content, index);
    }
    frameIndices.push(index);
  }

  // Build frame data: [timestamp, contentIndex]
  const frameData = frames.map((f, i) => [f.timestamp, frameIndices[i]]);

  // Build SVG with embedded JavaScript player
  const clipPathDef = borderRadius > 0
    ? `<clipPath id="c"><rect width="${width}" height="${height}" rx="${borderRadius}"/></clipPath>`
    : '';
  const clipAttr = borderRadius > 0 ? ' clip-path="url(#c)"' : '';
  const bgRx = borderRadius > 0 ? ` rx="${borderRadius}"` : '';

  const chromeSection = chrome ? `<g class="chrome">${chrome}</g>` : '';
  const footerSection = footer ? `<g class="footer">${footer}</g>` : '';

  // Escape content for JSON embedding
  const contentsJson = JSON.stringify(frameContents);
  const framesJson = JSON.stringify(frameData);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<defs>${clipPathDef}</defs>
<style>${styles}</style>
<g${clipAttr}>
<rect width="100%" height="100%" fill="${bgColor}"${bgRx}/>
${chromeSection}
<g id="content"></g>
${footerSection}
${watermark}
</g>
<script type="text/javascript"><![CDATA[
(function(){
var contents=${contentsJson};
var frames=${framesJson};
var c=document.getElementById('content');
var loop=${loop};
var i=0;
var lastIdx=-1;
var p=new DOMParser();
function setContent(idx){
if(idx===lastIdx)return;
lastIdx=idx;
var svg='<svg xmlns="http://www.w3.org/2000/svg">'+contents[idx]+'</svg>';
var doc=p.parseFromString(svg,'image/svg+xml');
c.innerHTML='';
var nodes=doc.documentElement.childNodes;
for(var j=0;j<nodes.length;j++){
var n=document.importNode(nodes[j],true);
c.appendChild(n);
}
}
function play(){
var start=performance.now();
i=0;
lastIdx=-1;
function frame(){
var t=performance.now()-start;
while(i<frames.length&&frames[i][0]<=t){
setContent(frames[i][1]);
i++;
}
if(i<frames.length){requestAnimationFrame(frame);}
else if(loop){setTimeout(play,0);}
}
requestAnimationFrame(frame);
}
play();
})();
]]></script>
</svg>`;
}
