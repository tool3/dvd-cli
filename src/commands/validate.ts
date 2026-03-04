/**
 * Validate Command
 * Validate a .cd script
 */

import { readFileSync } from 'node:fs';
import { parseCD, CDParseError } from '../parser/cd-parser';
import { createSpinner } from '../utils/spinner';

interface ValidateArgs {
  file: string;
}

export async function validateCommand(args: ValidateArgs): Promise<void> {
  const spinner = createSpinner('Validating script');
  spinner.start();

  try {
    const content = readFileSync(args.file, 'utf-8');
    const script = parseCD(content);

    spinner.success(`Valid! Found ${script.commands.length} commands`);

    // Show summary
    console.log('\nScript summary:');
    console.log(`  Output: ${script.output || '(not specified)'}`);
    console.log(`  Commands: ${script.commands.length}`);
    console.log(`  Settings: ${script.settings.size}`);
    console.log(`  Requirements: ${script.requirements.length || 'none'}`);

    if (script.settings.size > 0) {
      console.log('\nSettings:');
      script.settings.forEach((value: string, key: string) => {
        console.log(`  ${key}: ${value}`);
      });
    }
  } catch (err: unknown) {
    spinner.fail('Validation failed');

    if (err instanceof CDParseError) {
      console.error(`\nError at line ${err.line}:`);
      console.error(`  ${err.message}`);
    } else {
      throw err;
    }

    process.exit(1);
  }
}
