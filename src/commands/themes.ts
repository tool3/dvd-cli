//#region Imports

import { themes } from 'shellfie';


//#region Themes Command

export const themesCommand = (): void => {
  console.log('Available themes:\n');

  const themeNames = Object.keys(themes);
  themeNames.forEach((name) => {
    console.log(`  ${name}`);
  });

  console.log(`\nTotal: ${themeNames.length} themes`);
  console.log('\nUsage: Set Theme <name>');
  console.log('Example: Set Theme dracula');
};

