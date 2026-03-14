import { createGridState, processInput } from '../src/pipeline';

// Simulate what happens step by step

// Step 1: Just logo (17 lines)
const logo = Array.from({length: 17}, (_, i) => `Logo line ${i}`);
let output1 = logo.join('\n') + '\n';

let state1 = createGridState(80, 24);
state1 = processInput(state1, output1);
console.log('After logo (17 lines + final newline):');
console.log('  cursor.row =', state1.cursor.row, ', cursor.col =', state1.cursor.col);

// Step 2: Add cursor up 17
let output2 = output1 + '\x1b[17A';
let state2 = createGridState(80, 24);
state2 = processInput(state2, output2);
console.log('\nAfter cursor up 17:');
console.log('  cursor.row =', state2.cursor.row, ', cursor.col =', state2.cursor.col);

// Step 3: Add 15 info lines (going from row 0 to row 14)
let output3 = output2 + '\x1b[20C';  // Move right
for (let i = 0; i < 15; i++) {
  if (i > 0) output3 += '\n\x1b[20C';
  output3 += `Info ${i}`;
}
let state3 = createGridState(80, 24);
state3 = processInput(state3, output3);
console.log('\nAfter 15 info lines:');
console.log('  cursor.row =', state3.cursor.row, ', cursor.col =', state3.cursor.col);

// Step 4: Add 2 newlines
let output4 = output3 + '\n\n';
let state4 = createGridState(80, 24);
state4 = processInput(state4, output4);
console.log('\nAfter 2 newlines (\\n\\n):');
console.log('  cursor.row =', state4.cursor.row, ', cursor.col =', state4.cursor.col);
console.log('  Expected: row 16 (14 + 2 = 16), but logo line 16 is still there');

// Step 5: What's in row 15 and 16?
console.log('\nGrid contents:');
for (let row = 14; row <= 17; row++) {
  const cells = state4.cells[row];
  let text = '';
  for (let col = 0; col < 40; col++) {
    text += cells[col]?.char || ' ';
  }
  console.log('  Row', row, ':', text.trimEnd());
}
