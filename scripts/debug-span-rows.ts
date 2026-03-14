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

  // Simulate Y calculation like animated.ts does
  const contentStartY = 40 + 16; // headerHeight + padding
  const lineHeight = 16 * 1.4; // fontSize * 1.4 = 22.4

  console.log('contentStartY =', contentStartY);
  console.log('lineHeight =', lineHeight);
  console.log('');

  // Find spans for .cooc,. and colors
  rows.forEach((row, rowIdx) => {
    row.forEach((span) => {
      const hasCooc = span.text.includes('cooc');
      const isColorSpan = span.style.bg && span.text.trim() === '';

      if (hasCooc || isColorSpan) {
        const y = contentStartY + span.row * lineHeight;
        console.log('Array index=' + rowIdx + ', span.row=' + span.row + ', Y=' + y.toFixed(1) + ', col=' + span.col + ', text="' + span.text.substring(0, 15) + '", hasBg=' + !!span.style.bg);
      }
    });
  });
}

debug().catch(console.error);
