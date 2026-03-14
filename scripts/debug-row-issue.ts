import { createGridState, processInput, coalesce, themes } from '../src/pipeline';
import { spawn } from 'child_process';

async function debug() {
  const proc = spawn('neofetch', [], {
    shell: true,
    env: { ...process.env, TERM: 'xterm-256color' },
  });

  let output = '';
  proc.stdout.on('data', (data) => {
    output += data.toString();
  });
  proc.stderr.on('data', (data) => {
    output += data.toString();
  });

  await new Promise((resolve) => proc.on('close', resolve));

  let state = createGridState(80, 24);
  state = processInput(state, output);

  const rows = coalesce(state, themes.dracula);

  console.log('=== ROWS 15-18 SPAN DETAILS ===\n');

  for (let rowIdx = 15; rowIdx <= 18 && rowIdx < rows.length; rowIdx++) {
    const spans = rows[rowIdx];
    console.log('Row ' + rowIdx + ' has ' + spans.length + ' spans:');

    for (const span of spans) {
      const hasBg = !!span.style.bg;
      console.log('  span.row=' + span.row + ' span.col=' + span.col + ' hasBg=' + hasBg + ' text="' + span.text.substring(0, 20) + '"');
    }
    console.log('');
  }
}

debug().catch(console.error);
