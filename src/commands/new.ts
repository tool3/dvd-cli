//#region Imports

import { writeFileSync } from 'node:fs';
import { createSpinner } from '../utils/spinner';


//#region Templates

const TEMPLATES = {
  basic: `# Basic CD Script
Output {name}.svg

Set Title "My Terminal Demo"
Set Theme dracula
Set Width 800
Set Height 600

Type "echo 'Hello, Cinema Display!'"
Enter
Sleep 1s
`,

  showcase: `# Feature Showcase
Output {name}.svg

Set Title "CD Feature Showcase"
Set Theme nord
Set Width 1000
Set Height 700
Set TypingSpeed 50

# Show typing
Type "cd showcase"
Enter
Sleep 500ms

Type "# This demonstrates CD features"
Enter
Sleep 1s

# Show command execution
Type "echo 'Animated terminal recordings!'"
Enter
Sleep 2s

# Take a screenshot
Screenshot {name}_frame.svg
`,

  keyboard: `# Keyboard Navigation Demo
Output {name}.svg

Set Title "Keyboard Navigation"
Set Theme tokyoNight
Set Width 900
Set Height 600

Type "echo 'Testing keyboard shortcuts'"
Enter
Sleep 1s

# Type and navigate
Type "Hello World"
Sleep 500ms

# Move cursor left
Left 5
Sleep 500ms

# Select text
Shift+Right
Shift+Right
Shift+Right
Sleep 1s
`,
};


//#region Types

interface NewArgs {
  name?: string;
  template?: keyof typeof TEMPLATES;
}


//#region New Command

export const newCommand = async (args: NewArgs): Promise<void> => {
  const spinner = createSpinner('Creating new script');
  spinner.start();

  try {
    const name = args.name || 'demo';
    const template = args.template || 'basic';

    if (!(template in TEMPLATES)) {
      throw new Error(`Unknown template: ${template}. Available: ${Object.keys(TEMPLATES).join(', ')}`);
    }

    const filename = `${name}.cd`;
    const content = TEMPLATES[template].replace(/{name}/g, name);

    writeFileSync(filename, content, 'utf-8');

    spinner.success(`Created ${filename} from ${template} template`);
    console.log(`\nNext steps:`);
    console.log(`  dvd ${filename}`);
    console.log(`  # or: dvd render ${filename} -o output.svg`);
  } catch (err) {
    spinner.fail('Failed to create script');
    throw err;
  }
};

