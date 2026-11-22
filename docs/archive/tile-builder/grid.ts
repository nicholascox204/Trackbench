// The tile grid (experimental): a lattice of cells you fill with tiles (a title, a check, a planned range,
// a number to enter, a text to enter). A tile can be one cell wide or two. Rows and columns can be added
// as you need them. Entries reuse the existing store: each tile is its own slot (slotId = tile id) and its
// value is kept under the key "v".

import type { Entry, GridDef, Tile, TileKind } from './types';

export const DEFAULT_COLS = 5;
export const DEFAULT_ROWS = 6;
export const MAX_COLS = 6;

export const TILE_KINDS: { kind: TileKind; name: string; icon: string; hint: string }[] = [
  { kind: 'title', name: 'Title', icon: 'text-outline', hint: 'A name, like Bench Press.' },
  { kind: 'check', name: 'Check', icon: 'checkmark-circle-outline', hint: 'Tick it when it is done.' },
  { kind: 'range', name: 'Range', icon: 'swap-horizontal-outline', hint: 'A planned target you read, like 8-10.' },
  { kind: 'number', name: 'Number', icon: 'keypad-outline', hint: 'A number you enter, like weight or reps.' },
  { kind: 'text', name: 'Text', icon: 'create-outline', hint: 'A note you type.' },
];

const DEFAULT_LABEL: Record<TileKind, string> = { title: '', check: '', range: '', number: '', text: '' };
const id = (): string => Math.random().toString(36).slice(2, 8);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export const newTile = (kind: TileKind, patch: Partial<Tile> = {}): Tile => ({ id: id(), kind, label: DEFAULT_LABEL[kind], value: '', ...patch });

export function newGrid(cols = DEFAULT_COLS, rows = DEFAULT_ROWS): GridDef {
  return { cols, cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => null)) };
}

export const rowCount = (g: GridDef): number => g.cells.length;

// Is this cell hidden under a wide tile to its left?
export const isCovered = (g: GridDef, r: number, c: number): boolean => c > 0 && (g.cells[r]?.[c - 1]?.span ?? 1) >= 2;

export const tilesOf = (g: GridDef): { tile: Tile; r: number; c: number }[] =>
  g.cells.flatMap((row, r) => row.map((tile, c) => (tile ? { tile, r, c } : null)).filter((x): x is { tile: Tile; r: number; c: number } => !!x));

// Normalise anything stored (older shapes, missing fields) into a usable grid.
export function sanitizeGrid(g: GridDef | undefined): GridDef {
  if (!g || !Array.isArray(g.cells) || typeof g.cols !== 'number') return newGrid();
  return g;
}

function canPlace(g: GridDef, r: number, c: number, span: number): boolean {
  if (r < 0 || r >= rowCount(g) || c < 0 || c + span > g.cols) return false;
  for (let k = 0; k < span; k++) {
    if (g.cells[r][c + k]) return false;
    if (k === 0 && isCovered(g, r, c)) return false;
  }
  return true;
}

export function placeTile(g: GridDef, r: number, c: number, tile: Tile): GridDef | null {
  const out = clone(g);
  if (!canPlace(out, r, c, tile.span ?? 1)) return null;
  out.cells[r][c] = tile;
  return out;
}

// Move a tile to another cell. Dropping onto a one-cell tile swaps the two.
export function moveTile(g: GridDef, from: { r: number; c: number }, to: { r: number; c: number }): GridDef | null {
  if (from.r === to.r && from.c === to.c) return null;
  const out = clone(g);
  const tile = out.cells[from.r][from.c];
  if (!tile) return null;
  const target = out.cells[to.r]?.[to.c];
  if (target && !isCovered(out, to.r, to.c)) {
    if ((tile.span ?? 1) !== 1 || (target.span ?? 1) !== 1) return null;
    out.cells[from.r][from.c] = target;
    out.cells[to.r][to.c] = tile;
    return out;
  }
  out.cells[from.r][from.c] = null;
  if (!canPlace(out, to.r, to.c, tile.span ?? 1)) return null;
  out.cells[to.r][to.c] = tile;
  return out;
}

export function removeTile(g: GridDef, r: number, c: number): GridDef {
  const out = clone(g);
  if (out.cells[r]) out.cells[r][c] = null;
  return out;
}

export function patchTile(g: GridDef, r: number, c: number, p: Partial<Tile>): GridDef {
  const out = clone(g);
  const t = out.cells[r]?.[c];
  if (t) out.cells[r][c] = { ...t, ...p };
  return out;
}

// One cell or two. Two only fits when the next cell is free.
export function setSpan(g: GridDef, r: number, c: number, span: 1 | 2): GridDef | null {
  const out = clone(g);
  const t = out.cells[r]?.[c];
  if (!t) return null;
  if (span === 2) {
    if (c + 1 >= out.cols || out.cells[r][c + 1]) return null;
  }
  out.cells[r][c] = { ...t, span };
  return out;
}

export function addRow(g: GridDef): GridDef { const out = clone(g); out.cells.push(Array.from({ length: out.cols }, () => null)); return out; }
export function deleteRow(g: GridDef, r: number): GridDef { const out = clone(g); out.cells.splice(r, 1); if (out.cells.length === 0) out.cells.push(Array.from({ length: out.cols }, () => null)); return out; }
export function moveRow(g: GridDef, r: number, dir: -1 | 1): GridDef {
  const out = clone(g);
  const j = r + dir;
  if (j < 0 || j >= out.cells.length) return out;
  [out.cells[r], out.cells[j]] = [out.cells[j], out.cells[r]];
  return out;
}
export function duplicateRow(g: GridDef, r: number): GridDef {
  const out = clone(g);
  const copy = out.cells[r].map((t) => (t ? { ...t, id: id() } : null));
  out.cells.splice(r + 1, 0, copy);
  return out;
}
export function addCol(g: GridDef): GridDef | null {
  if (g.cols >= MAX_COLS) return null;
  const out = clone(g);
  out.cols += 1;
  out.cells.forEach((row) => row.push(null));
  return out;
}
export function lastColEmpty(g: GridDef): boolean { return g.cols > 1 && g.cells.every((row) => !row[g.cols - 1] && !((row[g.cols - 2]?.span ?? 1) >= 2)); }
export function deleteLastCol(g: GridDef): GridDef | null {
  if (!lastColEmpty(g)) return null;
  const out = clone(g);
  out.cols -= 1;
  out.cells.forEach((row) => row.pop());
  return out;
}

// Percent finished today. With checks, it is the ticked checks. With none, it is the filled-in number and
// text tiles.
export function gridCompletion(grid: GridDef | undefined, done: Entry[]): number {
  if (!grid || !Array.isArray(grid.cells)) return 0;
  const all = tilesOf(grid).map((x) => x.tile);
  const checks = all.filter((t) => t.kind === 'check');
  const inputs = all.filter((t) => t.kind === 'number' || t.kind === 'text');
  const pool = checks.length > 0 ? checks : inputs;
  if (pool.length === 0) return 0;
  const ids = new Set(pool.map((t) => t.id));
  const got = new Set(done.filter((e) => e.slotId && ids.has(e.slotId)).map((e) => e.slotId));
  return Math.round((got.size / pool.length) * 100);
}

// A gym-style example: each exercise is three set rows. Only the first row carries the title and range.
export function gymExample(): GridDef {
  const g = newGrid(DEFAULT_COLS, 9);
  const names: [string, string][] = [['Bench Press', '6-8'], ['Incline Press', '8-10'], ['Cable Row', '10-12']];
  names.forEach(([name, range], i) => {
    for (let s = 0; s < 3; s++) {
      const r = i * 3 + s;
      if (s === 0) {
        g.cells[r][0] = newTile('title', { value: name });
        g.cells[r][1] = newTile('range', { value: range, label: 'Reps' });
      }
      g.cells[r][2] = newTile('number', { label: s === 0 ? 'lb' : '' });
      g.cells[r][3] = newTile('number', { label: s === 0 ? 'Reps' : '' });
      g.cells[r][4] = newTile('check');
    }
  });
  return g;
}
