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

  let state = createGridState(104, 24);  // Width 104 like the example
  state = processInput(state, output);

  console.log('=== ROWS 14-20 ===\n');
  for (let row = 14; row <= 20; row++) {
    const cells = state.cells[row];
    let left = '';
    let right = '';
    let hasBgRight = false;

    for (let col = 0; col < 70; col++) {
      const cell = cells[col];
      const char = cell?.char || ' ';
      const hasBg = cell?.bg?.mode !== 'default';

      if (col < 32) {
        left += char;
      } else {
        right += char;
        if (hasBg) hasBgRight = true;
      }
    }

    const leftText = left.trimEnd() || '<empty>';
    const rightText = hasBgRight ? '[COLORS]' : (right.trimEnd() || '<empty>');
    console.log('Row ' + row + ':');
    console.log('  Left (0-31):  ' + leftText);
    console.log('  Right (32+):  ' + rightText);
    console.log('');
  }

  // Also check coalesced spans
  const rows = coalesce(state, themes.dracula);
  console.log('\n=== COALESCED SPANS (rows 15-18) ===\n');
  for (let i = 15; i <= 18; i++) {
    const spans = rows[i];
    console.log('Array[' + i + ']:');
    for (const span of spans) {
      console.log('  span.row=' + span.row + ' col=' + span.col + ' hasBg=' + !!span.style.bg + ' text="' + span.text.substring(0, 20) + '"');
    }
  }
}

debug().catch(console.error);
