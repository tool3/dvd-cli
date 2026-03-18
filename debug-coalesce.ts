import { createGridState, processInput } from './src/pipeline/vterminal';
import { coalesce } from './src/pipeline/coalescer';
import { themes } from './src/pipeline';

// Simulate what the frame capture does:
// ctx.promptPrefix + ctx.currentLine
// Where promptPrefix = '\x1b[36m>\x1b[0m ' and currentLine = 'W'
const content = '\x1b[36m>\x1b[0m ' + 'W';
const grid = createGridState(80, 25);
const processedGrid = processInput(grid, content);

console.log('Grid cells row 0:');
for (let col = 0; col < 10; col++) {
  const cell = processedGrid.cells[0][col];
  console.log(`  Col ${col}: char="${cell.char}" (charCode=${cell.char.charCodeAt(0)}) fg.mode=${cell.fg.mode}`);
}

console.log('\nCoalesced rows:');
const rows = coalesce(processedGrid, themes.dark);
for (const row of rows.slice(0, 1)) {
  for (const span of row) {
    console.log(`  Span: col=${span.col}, text="${span.text}", text.length=${span.text.length}, fg=${span.style.fg}`);
  }
}
