import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_COLS, addCol, addRow, deleteLastCol, duplicateRow, gridCompletion, gymExample, isCovered, moveRow, moveTile, newGrid, newTile, placeTile,
  rowCount, setSpan, tilesOf,
} from './grid';
import type { Entry } from './types';

const entry = (slotId: string): Entry => ({ id: slotId, trackerId: 't', at: 0, slotId, row: 0, done: true, values: {} });

test('placing and moving tiles respects the grid', () => {
  let g = newGrid(5, 3);
  const a = newTile('title', { value: 'A' });
  g = placeTile(g, 0, 0, a) as typeof g;
  assert.equal(g.cells[0][0]?.value, 'A');
  assert.equal(placeTile(g, 0, 0, newTile('check')), null); // occupied
  assert.equal(placeTile(g, 0, 5, newTile('check')), null); // off the edge
  const moved = moveTile(g, { r: 0, c: 0 }, { r: 2, c: 4 });
  assert.equal(moved?.cells[2][4]?.value, 'A');
  assert.equal(moved?.cells[0][0], null);
  const b = placeTile(g, 0, 1, newTile('check')) as typeof g;
  const swapped = moveTile(b, { r: 0, c: 0 }, { r: 0, c: 1 }) as typeof g;
  assert.equal(swapped.cells[0][0]?.kind, 'check'); // dropping on a tile swaps
  assert.equal(swapped.cells[0][1]?.value, 'A');
});

test('a wide tile covers the next cell and only fits when it is free', () => {
  let g = newGrid(4, 1);
  g = placeTile(g, 0, 0, newTile('title', { value: 'T' })) as typeof g;
  const wide = setSpan(g, 0, 0, 2) as typeof g;
  assert.equal(isCovered(wide, 0, 1), true);
  assert.equal(placeTile(wide, 0, 1, newTile('check')), null); // covered
  const blocked = placeTile(g, 0, 1, newTile('check')) as typeof g;
  assert.equal(setSpan(blocked, 0, 0, 2), null); // next cell taken
  assert.equal(setSpan(placeTile(newGrid(4, 1), 0, 3, newTile('text')) as typeof g, 0, 3, 2), null); // no room at the edge
});

test('the grid expands: rows, columns, copies and moves', () => {
  let g = newGrid(5, 2);
  g = addRow(g);
  assert.equal(rowCount(g), 3);
  let wide = g;
  for (let i = 0; i < 10; i++) wide = addCol(wide) ?? wide;
  assert.equal(wide.cols, MAX_COLS);
  assert.equal(addCol(wide), null);
  assert.equal(deleteLastCol(wide)?.cols, MAX_COLS - 1); // empty last column can go
  g = placeTile(g, 0, 0, newTile('number', { label: 'lb' })) as typeof g;
  const dup = duplicateRow(g, 0);
  assert.equal(rowCount(dup), 4);
  assert.notEqual(dup.cells[0][0]?.id, dup.cells[1][0]?.id); // copies get their own ids
  assert.equal(moveRow(dup, 0, 1).cells[1][0]?.label, 'lb');
});

test('completion counts ticked checks, or filled inputs when there are no checks', () => {
  const g = gymExample();
  const checks = tilesOf(g).filter((x) => x.tile.kind === 'check').map((x) => x.tile.id);
  assert.equal(checks.length, 9);
  assert.equal(gridCompletion(g, []), 0);
  assert.equal(gridCompletion(g, [entry(checks[0]), entry(checks[1]), entry(checks[2])]), Math.round((3 / 9) * 100));
  const inputsOnly = newGrid(2, 1);
  inputsOnly.cells[0][0] = newTile('number');
  inputsOnly.cells[0][1] = newTile('number');
  assert.equal(gridCompletion(inputsOnly, [entry(inputsOnly.cells[0][0]!.id)]), 50);
  assert.equal(gridCompletion(undefined, []), 0);
});
