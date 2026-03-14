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

  // Use same dimensions as the example
  const fontSize = 16;
  const width = 1000;
  const charWidth = fontSize * 0.6;
  const lineHeight = fontSize * 1.4;
  const termWidth = Math.floor(width / charWidth);
  const termHeight = 24;

  console.log('Term dimensions:', termWidth, 'x', termHeight);
  console.log('charWidth:', charWidth);
  console.log('lineHeight:', lineHeight);
  console.log('');

  let state = createGridState(termWidth, termHeight);
  state = processInput(state, output);

  // Check grid for .cooc,.
  console.log('Grid rows with .cooc,.:');
  for (let row = 0; row < state.cells.length; row++) {
    const rowCells = state.cells[row];
    let text = '';
    for (let col = 0; col < Math.min(rowCells.length, 60); col++) {
      text += rowCells[col].char || ' ';
    }
    if (text.includes('cooc')) {
      console.log('  Grid row ' + row + ': ' + text.trim());
    }
  }

  console.log('');

  const rows = coalesce(state, themes.dracula);

  console.log('Coalesced rows with .cooc,.:');
  rows.forEach((row, rowIdx) => {
    row.forEach((span) => {
      if (span.text.includes('cooc')) {
        const y = 56 + span.row * lineHeight;
        console.log('  Array idx=' + rowIdx + ', span.row=' + span.row + ', Y=' + y.toFixed(1) + ', text="' + span.text.substring(0, 30) + '"');
      }
    });
  });

  console.log('');
  console.log('Coalesced rows with bg colors:');
  rows.forEach((row, rowIdx) => {
    row.forEach((span) => {
      if (span.style.bg && span.text.trim() === '') {
        const y = 56 + span.row * lineHeight;
        console.log('  Array idx=' + rowIdx + ', span.row=' + span.row + ', Y=' + y.toFixed(1) + ', col=' + span.col + ', bg=' + span.style.bg);
      }
    });
  });
}

debug().catch(console.error);
