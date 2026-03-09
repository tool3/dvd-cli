/**
 * SVG Optimizer
 * Lightweight optimization for animated SVGs - no dependencies
 */

/**
 * Round a number to reduce decimal precision
 * 32.80000 → 32.8, 10.123456 → 10.12
 */
function roundNumber(num: string): string {
  const n = parseFloat(num);
  if (Number.isInteger(n)) return n.toString();
  // Round to 2 decimal places max, strip trailing zeros
  return parseFloat(n.toFixed(2)).toString();
}

/**
 * Format number for path data (no trailing zeros, minimal precision)
 */
function fmtNum(n: number): string {
  if (Number.isInteger(n)) return n.toString();
  return parseFloat(n.toFixed(1)).toString();
}

/**
 * Convert rect to path (more compact)
 * <rect x="24" y="84" width="8.4" height="14" .../>
 * → <path d="M24 84h8.4v14H24z" .../>
 */
function rectToPath(rect: string): string {
  const x = parseFloat(rect.match(/x="([^"]+)"/)?.[1] || '0');
  const y = parseFloat(rect.match(/y="([^"]+)"/)?.[1] || '0');
  const w = parseFloat(rect.match(/width="([^"]+)"/)?.[1] || '0');
  const h = parseFloat(rect.match(/height="([^"]+)"/)?.[1] || '0');

  // Skip rects with % values or rx/ry (rounded corners)
  if (rect.includes('width="100%"') || rect.includes('rx="') || rect.includes('ry="')) {
    return rect;
  }

  // Extract other attributes (fill, class, etc.)
  const fill = rect.match(/fill="([^"]+)"/)?.[0] || '';
  const fillOpacity = rect.match(/fill-opacity="([^"]+)"/)?.[0] || '';
  const cls = rect.match(/class="([^"]+)"/)?.[0] || '';
  const shapeRendering = rect.match(/shape-rendering="([^"]+)"/)?.[0] || '';

  // Build path: M(move to x,y) h(horizontal line +w) v(vertical line +h) H(horizontal to x) z(close)
  const d = `M${fmtNum(x)} ${fmtNum(y)}h${fmtNum(w)}v${fmtNum(h)}H${fmtNum(x)}z`;

  const attrs = [fill, fillOpacity, cls, shapeRendering].filter(Boolean).join(' ');
  return `<path d="${d}" ${attrs}/>`;
}

/**
 * Optimize SVG content
 * - Reduces numeric precision (biggest win)
 * - Removes comments
 * - Minifies whitespace
 * - Shortens color values where possible
 */
export function optimizeSvg(svg: string): string {
  let result = svg;

  // Remove XML comments
  result = result.replace(/<!--[\s\S]*?-->/g, '');

  // Convert rects to paths FIRST (before whitespace removal changes structure)
  // Match any rect element (self-closing, with optional space before />)
  let rectCount = 0;
  let pathCount = 0;
  result = result.replace(/<rect\s+([^>]*?)\s*\/>/g, (match) => {
    rectCount++;
    const converted = rectToPath(match);
    if (converted.startsWith('<path')) pathCount++;
    return converted;
  });

  // Reduce numeric precision in attributes (x="32.80000" → x="32.8")
  result = result.replace(/(\s(?:x|y|width|height|rx|ry|cx|cy|r|x1|x2|y1|y2)=")(\d+\.\d+)(")/g,
    (_, pre, num, post) => pre + roundNumber(num) + post
  );

  // Reduce precision in fill-opacity
  result = result.replace(/(fill-opacity=")(\d+\.\d+)(")/g,
    (_, pre, num, post) => pre + roundNumber(num) + post
  );

  // Reduce precision in keyTimes (0.006118 → 0.01)
  result = result.replace(/(keyTimes=")([^"]+)(")/g, (_, pre, times, post) => {
    const optimized = times.split(';').map((t: string) => {
      const n = parseFloat(t);
      if (n === 0) return '0';
      if (n === 1) return '1';
      return parseFloat(n.toFixed(4)).toString();
    }).join(';');
    return pre + optimized + post;
  });

  // Reduce precision in dur (7.50s → 7.5s)
  result = result.replace(/(dur=")(\d+\.\d+)(s")/g,
    (_, pre, num, post) => pre + roundNumber(num) + post
  );

  // Shorten hex colors where possible (#ffffff → #fff, #000000 → #000)
  result = result.replace(/#([0-9a-fA-F])\1([0-9a-fA-F])\2([0-9a-fA-F])\3/g, '#$1$2$3');

  // Remove empty class attributes
  result = result.replace(/\s+class=""/g, '');

  // Remove default visibility="visible" (it's the default)
  // But keep visibility in animate values
  result = result.replace(/(<[^a][^>]*)\s+visibility="visible"/g, '$1');

  // Remove redundant calcMode="discrete" (common default for visibility animations)
  // Actually keep this as it's necessary for correct behavior

  // Optimize animate elements: remove repeatCount="indefinite" when not needed
  // (We keep it since our animations do loop)

  // Remove shape-rendering="auto" (it's the default)
  result = result.replace(/\s+shape-rendering="auto"/g, '');

  // Remove fill-opacity="1" (it's the default)
  result = result.replace(/\s+fill-opacity="1"/g, '');

  // Remove opacity="1" (it's the default)
  result = result.replace(/\s+opacity="1"/g, '');

  // Shorten common attribute values
  // visibility="hidden" → visibility="hidden" (can't shorten this one)

  // Remove unnecessary whitespace between tags (do this LAST)
  result = result.replace(/>\s+</g, '><');

  // Collapse multiple spaces/newlines in content
  result = result.replace(/\n\s*\n/g, '\n');

  return result;
}
