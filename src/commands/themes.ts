/**
 * Themes Command
 * List available themes
 */

import { themes } from 'shellfie';

export function themesCommand(): void {
  console.log('Available themes:\n');

  const themeNames = Object.keys(themes);
  themeNames.forEach((name) => {
    console.log(`  ${name}`);
  });

  console.log(`\nTotal: ${themeNames.length} themes`);
  console.log('\nUsage: Set Theme <name>');
  console.log('Example: Set Theme dracula');
}
