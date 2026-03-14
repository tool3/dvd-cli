import { createGridState, processInput } from '../src/pipeline';
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

  const grid = state.cells;

  console.log('Looking for .cooc,. in grid:\n');

  for (let row = 0; row < grid.length; row++) {
    const rowCells = grid[row];
    let text = '';
    for (let col = 0; col < rowCells.length; col++) {
      text += rowCells[col].char || ' ';
    }
    if (text.includes('cooc')) {
      console.log('Row ' + row + ': ' + text.trim());
    }
  }

  console.log('\n\nAll rows 14-19:\n');
  for (let row = 14; row <= 19 && row < grid.length; row++) {
    const rowCells = grid[row];
    let text = '';
    let hasBg = false;
    for (let col = 0; col < Math.min(rowCells.length, 60); col++) {
      text += rowCells[col].char || ' ';
      if (rowCells[col].bg && rowCells[col].bg.mode !== 'default') hasBg = true;
    }
    console.log('Row ' + row + ' [hasBg=' + hasBg + ']: "' + text.trim() + '"');
  }
}

debug().catch(console.error);
