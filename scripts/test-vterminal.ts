import { createGridState, processInput, coalesce, themes } from '../src/pipeline';

// Simulate neofetch-like output
// 17 lines of "logo", then cursor up 17 and overlay "info"
const logo = [
  "Logo line 0",
  "Logo line 1",
  "Logo line 2",
  "Logo line 3",
  "Logo line 4",
  "Logo line 5",
  "Logo line 6",
  "Logo line 7",
  "Logo line 8",
  "Logo line 9",
  "Logo line 10",
  "Logo line 11",
  "Logo line 12",
  "Logo line 13",
  "Logo line 14",
  "Logo line 15",
  "Logo line 16 (last)",
];

// Build output like neofetch does
let output = logo.join('\n') + '\n';

// Cursor up 17, move to column 20, then print info
output += '\x1b[17A\x1b[20C';  // Up 17, Right 20

// Print info lines
const info = [
  "Info 0",
  "Info 1",
  "Info 2",
  "Info 3",
  "Info 4",
  "Info 5",
  "Info 6",
  "Info 7",
  "Info 8",
  "Info 9",
  "Info 10",
  "Info 11",
  "Info 12",
  "Info 13",
  "Info 14 (last info)",
];

for (let i = 0; i < info.length; i++) {
  if (i > 0) output += '\n\x1b[20C';  // newline + move right
  output += info[i];
}

// After last info, add 2 newlines and color blocks
output += '\n\n\x1b[20C';  // 2 newlines, then move right
output += '\x1b[41m   \x1b[42m   \x1b[43m   \x1b[0m';  // Color blocks with bg

let state = createGridState(80, 24);
state = processInput(state, output);

console.log('=== GRID CONTENT ===\n');
for (let row = 0; row < 20; row++) {
  const rowCells = state.cells[row];
  let text = '';
  let hasBg = false;
  for (let col = 0; col < 50; col++) {
    text += rowCells[col]?.char || ' ';
    if (rowCells[col]?.bg?.mode !== 'default') hasBg = true;
  }
  console.log('Row ' + row.toString().padStart(2) + ' [bg=' + (hasBg ? 'Y' : 'N') + ']: ' + text.trimEnd());
}

// Check coalesced output
const rows = coalesce(state, themes.dracula);
console.log('\n=== COALESCED SPANS ===');
for (let i = 14; i <= 18; i++) {
  const spans = rows[i];
  if (spans.length > 0) {
    const texts = spans.map(s => `"${s.text.substring(0,15)}" row=${s.row} bg=${!!s.style.bg}`).join(', ');
    console.log('Array[' + i + ']: ' + texts);
  } else {
    console.log('Array[' + i + ']: <empty>');
  }
}
