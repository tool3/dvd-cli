//#region SVG Optimization Utilities

export const r = (n: number): number => Math.round(n * 10) / 10;

export const rx = (n: number): number => Math.round(n);

export const fmt = (n: number): string => {
  const rounded = r(n);
  return rounded === Math.floor(rounded) ? String(Math.floor(rounded)) : String(rounded);
};


//#region Text Utilities

export const stripAnsi = (text: string): string =>
  text
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\x1b\[[0-9;]*[A-HJKSTfsu]/g, '')
    .replace(/\x1b\[\?[0-9;]*[hl]/g, '');

export const escapeXml = (text: string): string =>
  stripAnsi(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');


//#region Color Utilities

export const isTruecolor = (color: string | null): boolean =>
  color !== null && color.startsWith('rgb(');

