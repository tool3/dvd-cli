import { describe, it, expect } from 'vitest';
import { generateChrome, generateFooter, type ChromeConfig, type FooterConfig } from './chrome';
import type { Theme } from '../../types';

//#region Test Data

const testTheme: Theme = {
  name: 'test',
  foreground: '#ffffff',
  background: '#1e1e1e',
  black: '#000000',
  red: '#ff0000',
  green: '#00ff00',
  yellow: '#ffff00',
  blue: '#0000ff',
  magenta: '#ff00ff',
  cyan: '#00ffff',
  white: '#ffffff',
  brightBlack: '#808080',
  brightRed: '#ff8080',
  brightGreen: '#80ff80',
  brightYellow: '#ffff80',
  brightBlue: '#8080ff',
  brightMagenta: '#ff80ff',
  brightCyan: '#80ffff',
  brightWhite: '#ffffff',
};

const createChromeConfig = (overrides: Partial<ChromeConfig> = {}): ChromeConfig => ({
  template: 'macos',
  width: 800,
  height: 600,
  headerHeight: 40,
  padding: 12,
  borderRadius: 8,
  theme: testTheme,
  ...overrides,
});

const createFooterConfig = (overrides: Partial<FooterConfig> = {}): FooterConfig => ({
  width: 800,
  height: 600,
  footerHeight: 30,
  borderRadius: 8,
  theme: testTheme,
  ...overrides,
});


//#region generateChrome Tests

describe('generateChrome', () => {
  it('returns empty string for minimal template', () => {
    const config = createChromeConfig({ template: 'minimal' });

    const result = generateChrome(config);

    expect(result).toBe('');
  });

  it('generates macOS buttons', () => {
    const config = createChromeConfig({ template: 'macos' });

    const result = generateChrome(config);

    expect(result).toContain('<circle');
    expect(result).toContain('fill="#ff5f56"'); // red button
    expect(result).toContain('fill="#ffbd2e"'); // yellow button
    expect(result).toContain('fill="#27c93f"'); // green button
  });

  it('generates Windows buttons', () => {
    const config = createChromeConfig({ template: 'windows' });

    const result = generateChrome(config);

    // Windows uses lines for button icons
    expect(result).toContain('<line');
    expect(result).toContain('<rect');
  });

  it('includes header background', () => {
    const config = createChromeConfig();

    const result = generateChrome(config);

    expect(result).toContain('class="header-bg"');
    expect(result).toContain(`fill="${testTheme.background}"`);
  });

  it('uses custom header background when provided', () => {
    const config = createChromeConfig({ headerBackground: '#333333' });

    const result = generateChrome(config);

    expect(result).toContain('fill="#333333"');
  });

  it('includes title when provided', () => {
    const config = createChromeConfig({ title: 'My Terminal' });

    const result = generateChrome(config);

    expect(result).toContain('>My Terminal</text>');
  });

  it('escapes special characters in title', () => {
    const config = createChromeConfig({ title: '<script>alert("xss")</script>' });

    const result = generateChrome(config);

    expect(result).toContain('&lt;script&gt;');
    expect(result).not.toContain('<script>alert');
  });

  it('includes header border when enabled', () => {
    const config = createChromeConfig({ headerBorder: true });

    const result = generateChrome(config);

    expect(result).toContain('<line');
    expect(result).toContain(`y1="${config.headerHeight}"`);
    expect(result).toContain(`y2="${config.headerHeight}"`);
  });

  it('uses custom header border color and width', () => {
    const config = createChromeConfig({
      headerBorder: true,
      headerBorderColor: '#ff0000',
      headerBorderWidth: 2,
    });

    const result = generateChrome(config);

    expect(result).toContain('stroke="#ff0000"');
    expect(result).toContain('stroke-width="2"');
  });

  it('applies border radius to header background', () => {
    const config = createChromeConfig({ borderRadius: 10 });

    const result = generateChrome(config);

    expect(result).toContain('rx="10"');
    expect(result).toContain('ry="10"');
  });
});


//#region generateFooter Tests

describe('generateFooter', () => {
  it('returns empty string when footer height is 0', () => {
    const config = createFooterConfig({ footerHeight: 0 });

    const result = generateFooter(config);

    expect(result).toBe('');
  });

  it('returns empty string when footer height is negative', () => {
    const config = createFooterConfig({ footerHeight: -10 });

    const result = generateFooter(config);

    expect(result).toBe('');
  });

  it('includes footer background', () => {
    const config = createFooterConfig();

    const result = generateFooter(config);

    expect(result).toContain('class="footer-bg"');
  });

  it('positions footer at correct Y position', () => {
    const config = createFooterConfig({ height: 600, footerHeight: 30 });

    const result = generateFooter(config);

    // y = height - footerHeight = 600 - 30 = 570
    expect(result).toContain('y="570"');
  });

  it('uses custom footer background when provided', () => {
    const config = createFooterConfig({ footerBackground: '#444444' });

    const result = generateFooter(config);

    expect(result).toContain('fill="#444444"');
  });

  it('includes footer border when enabled', () => {
    const config = createFooterConfig({ footerBorder: true, height: 600, footerHeight: 30 });

    const result = generateFooter(config);

    expect(result).toContain('<line');
    expect(result).toContain('y1="570"');
    expect(result).toContain('y2="570"');
  });

  it('uses custom footer border color and width', () => {
    const config = createFooterConfig({
      footerBorder: true,
      footerBorderColor: '#00ff00',
      footerBorderWidth: 3,
    });

    const result = generateFooter(config);

    expect(result).toContain('stroke="#00ff00"');
    expect(result).toContain('stroke-width="3"');
  });

  it('applies border radius to footer background', () => {
    const config = createFooterConfig({ borderRadius: 12 });

    const result = generateFooter(config);

    expect(result).toContain('rx="12"');
    expect(result).toContain('ry="12"');
  });
});

