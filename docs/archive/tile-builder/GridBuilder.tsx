// The tile builder (experimental). A palette stays pinned at the top. Drag a tile onto a cell, or tap a
// tile and then a cell. Drag a placed tile to move it, tap it to edit it. Rows and columns grow as you
// need them. Preview shows exactly how the table will look when you use it.

import { useRef, useState } from 'react';
import { PanResponder, Text, TextInput, View, type PanResponderInstance } from 'react-native';
import {
  MAX_COLS, TILE_KINDS, addCol, addRow, deleteLastCol, deleteRow, duplicateRow, gymExample, isCovered, lastColEmpty, moveRow, moveTile,
  newGrid, newTile, patchTile, placeTile, removeTile, rowCount, sanitizeGrid, setSpan, tilesOf,
} from '../core/grid';
import { saveGridTracker, useAppState } from '../core/store';
import type { GridDef, Tile, TileKind } from '../core/types';
import { Button, Chip, Icon, Muted, Scroll, Tap, colors, s, topPad } from '../ui/kit';
import { GridLattice, type GridData } from './GridView';

type Brush = TileKind | 'erase' | null;
type Src = { kind: 'new'; tileKind: TileKind } | { kind: 'move'; r: number; c: number };
type Rect = { x: number; y: number; w: number; h: number };

const kindInfo = (k: TileKind) => TILE_KINDS.find((x) => x.kind === k) as (typeof TILE_KINDS)[number];
const GUTTER = 26;
const CELL_H = 54;

export function GridBuilder({ trackerId, done, cancel }: { trackerId?: string; done: (id: string) => void; cancel: () => void }) {
  const { state } = useAppState();
  const existing = trackerId ? state.trackers.find((x) => x.id === trackerId) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [grid, setGrid] = useState<GridDef>(() => sanitizeGrid(existing?.grid ? JSON.parse(JSON.stringify(existing.grid)) : undefined));
  const [mode, setMode] = useState<'build' | 'preview'>('build');
  const [brush, setBrush] = useState<Brush>(null);
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null);
  const [selRow, setSelRow] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ src: Src; x: number; y: number } | null>(null);
  const [note, setNote] = useState('');
  const [confirmExample, setConfirmExample] = useState(false);
  const [pv, setPv] = useState<Record<string, string | number>>({});
  const [pd, setPd] = useState<Record<string, boolean>>({});

  // Drag and drop: cell positions are measured when a drag starts; the handlers always read the latest state.
  const cellRefs = useRef<Record<string, { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null>>({});
  const rects = useRef<Record<string, Rect>>({});
  const responders = useRef<Record<string, PanResponderInstance>>({});
  const latest = useRef<{ [k: string]: (...a: never[]) => void }>({});

  const apply = (g: GridDef | null, then?: () => void): boolean => {
    if (!g) { setNote('That tile does not fit there.'); return false; }
    setGrid(g);
    setNote('');
    then?.();
    return true;
  };

  const tapCell = (r: number, c: number) => {
    setSelRow(null);
    if (isCovered(grid, r, c)) return;
    const cur = grid.cells[r][c];
    if (brush === 'erase') { if (cur) setGrid(removeTile(grid, r, c)); setSel(null); return; }
    if (cur) { setSel(sel?.r === r && sel.c === c ? null : { r, c }); return; }
    if (!brush) { setNote('Pick a tile at the top first, or drag one here.'); return; }
    apply(placeTile(grid, r, c, newTile(brush)), () => { if (brush !== 'check') setSel({ r, c }); });
  };
  const tapPalette = (kind: TileKind | 'erase') => { setBrush(brush === kind ? null : kind); setNote(''); };

  const hitTest = (x: number, y: number): { r: number; c: number } | null => {
    for (const [key, rc] of Object.entries(rects.current)) {
      if (x >= rc.x && x <= rc.x + rc.w && y >= rc.y && y <= rc.y + rc.h) {
        const [r, c] = key.split('-').map(Number);
        return { r, c };
      }
    }
    return null;
  };
  const dropOn = (src: Src, hit: { r: number; c: number } | null) => {
    if (!hit) return;
    if (src.kind === 'new') {
      apply(placeTile(grid, hit.r, hit.c, newTile(src.tileKind)), () => { if (src.tileKind !== 'check') setSel({ r: hit.r, c: hit.c }); });
    } else {
      apply(moveTile(grid, { r: src.r, c: src.c }, hit), () => setSel(null));
    }
  };

  latest.current = {
    tapPalette: tapPalette as never,
    tapCell: tapCell as never,
    begin: (() => {
      Object.entries(cellRefs.current).forEach(([key, el]) => el?.measureInWindow((x: number, y: number, w: number, h: number) => { rects.current[key] = { x, y, w, h }; }));
      setSel(null); setSelRow(null);
    }) as never,
    move: ((src: Src, x: number, y: number) => setDrag({ src, x, y })) as never,
    end: ((src: Src, x: number, y: number) => { dropOn(src, hitTest(x, y)); setDrag(null); }) as never,
    cancel: (() => setDrag(null)) as never,
  };

  const responder = (key: string, src: Src, onTap: () => void): PanResponderInstance => {
    if (!responders.current[key]) {
      let moved = false;
      responders.current[key] = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => {
          if (!moved && Math.hypot(g.dx, g.dy) > 8) { moved = true; (latest.current.begin as () => void)(); }
          if (moved) (latest.current.move as (s: Src, x: number, y: number) => void)(src, g.moveX, g.moveY);
        },
        onPanResponderRelease: (_e, g) => {
          if (moved) (latest.current.end as (s: Src, x: number, y: number) => void)(src, g.moveX, g.moveY);
          else onTap();
          moved = false;
        },
        onPanResponderTerminate: () => { moved = false; (latest.current.cancel as () => void)(); },
      });
    }
    return responders.current[key];
  };

  const filled = tilesOf(grid).length;
  const canSave = name.trim().length > 0 && filled > 0;
  const save = () => done(saveGridTracker(name.trim(), grid, existing?.id));
  const dragging = drag !== null;
  const rows = rowCount(grid);

  const previewData: GridData = {
    valueOf: (t) => pv[t.id],
    doneOf: (t) => !!pd[t.id],
    prevOf: () => undefined,
    onNumber: (t, v) => setPv((p) => ({ ...p, [t.id]: v === undefined ? '' : v })),
    onText: (t, v) => setPv((p) => ({ ...p, [t.id]: v })),
    onToggle: (t) => setPd((p) => ({ ...p, [t.id]: !p[t.id] })),
  };

  const editor = (r: number, c: number) => {
    const tile = grid.cells[r][c] as Tile;
    return (
      <View style={{ marginVertical: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.card }}>
        <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>{kindInfo(tile.kind).name} tile · {kindInfo(tile.kind).hint}</Text>
        {tile.kind === 'title' ? (
          <TextInput style={[s.input, { marginBottom: 8 }]} value={tile.value ?? ''} onChangeText={(v) => setGrid(patchTile(grid, r, c, { value: v }))} placeholder="Title text" placeholderTextColor={colors.muted} autoFocus />
        ) : null}
        {tile.kind === 'range' ? (
          <View style={[s.row, { marginBottom: 8 }]}>
            <TextInput style={[s.input, { flex: 1, marginRight: 8 }]} value={tile.value ?? ''} onChangeText={(v) => setGrid(patchTile(grid, r, c, { value: v }))} placeholder="8-10" placeholderTextColor={colors.muted} autoFocus />
            <TextInput style={[s.input, { flex: 1 }]} value={tile.label ?? ''} onChangeText={(v) => setGrid(patchTile(grid, r, c, { label: v }))} placeholder="Label (optional)" placeholderTextColor={colors.muted} />
          </View>
        ) : null}
        {tile.kind === 'number' || tile.kind === 'text' ? (
          <TextInput
            style={[s.input, { marginBottom: 8 }]} value={tile.label ?? ''} onChangeText={(v) => setGrid(patchTile(grid, r, c, { label: v }))}
            placeholder={tile.kind === 'number' ? 'Label, like lb or Reps (optional)' : 'Label, like Note (optional)'} placeholderTextColor={colors.muted} autoFocus
          />
        ) : null}
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <View style={s.row}>
            {tile.kind !== 'check' ? (
              <Chip label="Wide" active={(tile.span ?? 1) === 2} onPress={() => apply(setSpan(grid, r, c, (tile.span ?? 1) === 2 ? 1 : 2))} />
            ) : null}
            <Tap onPress={() => { setGrid(removeTile(grid, r, c)); setSel(null); }} style={{ padding: 8 }}><Text style={{ color: colors.danger, fontSize: 14 }}>Remove</Text></Tap>
          </View>
          <Button label="Done" onPress={() => setSel(null)} />
        </View>
      </View>
    );
  };

  const rowPanel = (r: number) => (
    <View style={{ marginVertical: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.card }}>
      <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>Row {r + 1}</Text>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <View style={s.row}>
          <Tap onPress={() => { setGrid(moveRow(grid, r, -1)); setSelRow(r > 0 ? r - 1 : r); }} disabled={r === 0} style={{ padding: 8, opacity: r === 0 ? 0.3 : 1 }}><Icon name="arrow-up" size={20} color={colors.text} /></Tap>
          <Tap onPress={() => { setGrid(moveRow(grid, r, 1)); setSelRow(r < rows - 1 ? r + 1 : r); }} disabled={r === rows - 1} style={{ padding: 8, opacity: r === rows - 1 ? 0.3 : 1 }}><Icon name="arrow-down" size={20} color={colors.text} /></Tap>
          <Tap onPress={() => { setGrid(duplicateRow(grid, r)); setSelRow(r + 1); }} style={{ padding: 8 }}><Icon name="copy-outline" size={20} color={colors.text} /></Tap>
          <Tap onPress={() => { setGrid(deleteRow(grid, r)); setSelRow(null); }} style={{ padding: 8 }}><Text style={{ color: colors.danger, fontSize: 14 }}>Delete row</Text></Tap>
        </View>
        <Button label="Done" onPress={() => setSelRow(null)} />
      </View>
    </View>
  );

  return (
    <View style={s.screen}>
      {/* pinned header: never scrolls away */}
      <View style={{ paddingTop: topPad, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={[s.row, { justifyContent: 'space-between', marginBottom: 8 }]}>
          <Tap onPress={cancel}><Text style={{ color: colors.muted, fontSize: 15, paddingVertical: 6 }}>Cancel</Text></Tap>
          <View style={s.row}>
            <Chip label="Build" active={mode === 'build'} onPress={() => setMode('build')} />
            <Chip label="Preview" active={mode === 'preview'} onPress={() => { setMode('preview'); setSel(null); setSelRow(null); }} />
          </View>
          <Tap onPress={save} disabled={!canSave}><Text style={{ color: canSave ? colors.accent : colors.muted, fontSize: 16, fontWeight: '700', paddingVertical: 6 }}>Save</Text></Tap>
        </View>
        {mode === 'build' ? (
          <View style={s.row}>
            {TILE_KINDS.map((k) => {
              const on = brush === k.kind;
              const r = responder(`p-${k.kind}`, { kind: 'new', tileKind: k.kind }, () => (latest.current.tapPalette as (k: string) => void)(k.kind));
              return (
                <View
                  key={k.kind} {...r.panHandlers}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 8, marginHorizontal: 2, borderRadius: 10, borderWidth: 2, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentBg : colors.card }}
                >
                  <Icon name={k.icon} size={20} color={on ? colors.accent : colors.text} />
                  <Text style={{ color: on ? colors.accent : colors.text, fontSize: 10, marginTop: 2 }}>{k.name}</Text>
                </View>
              );
            })}
            <Tap
              onPress={() => tapPalette('erase')}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 8, marginHorizontal: 2, borderRadius: 10, borderWidth: 2, borderColor: brush === 'erase' ? colors.danger : colors.border, backgroundColor: colors.card }}
            >
              <Icon name="backspace-outline" size={20} color={brush === 'erase' ? colors.danger : colors.text} />
              <Text style={{ color: brush === 'erase' ? colors.danger : colors.text, fontSize: 10, marginTop: 2 }}>Erase</Text>
            </Tap>
          </View>
        ) : (
          <Muted>This is how it looks when you use it. Nothing here is saved.</Muted>
        )}
      </View>

      <Scroll scrollEnabled={!dragging} contentContainerStyle={[s.content, { paddingTop: 12, paddingBottom: 60 }]}>
        <TextInput
          style={[s.input, { fontSize: 18, marginBottom: 10 }]} value={name} onChangeText={setName}
          placeholder="Name it, like Gym" placeholderTextColor={colors.muted}
        />

        {mode === 'preview' ? (
          <GridLattice grid={grid} data={previewData} editable />
        ) : (
          <View>
            <Muted style={{ marginBottom: 8 }}>
              {note || (brush === 'erase' ? 'Tap a tile to remove it.' : brush ? `${kindInfo(brush).hint} Drag it onto a cell, or tap an empty cell.` : 'Drag a tile onto the grid, or tap a tile and then a cell. Drag a placed tile to move it. Tap the row number for row options.')}
            </Muted>
            {Array.from({ length: rows }, (_, r) => (
              <View key={r}>
                <View style={[s.row, { marginBottom: 3 }]}>
                  <Tap onPress={() => { setSelRow(selRow === r ? null : r); setSel(null); }} style={{ width: GUTTER, height: CELL_H, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: selRow === r ? colors.accent : colors.muted, fontSize: 11 }}>{r + 1}</Text>
                  </Tap>
                  {grid.cells[r].map((tile, c) => {
                    if (isCovered(grid, r, c)) return null;
                    const picked = sel?.r === r && sel.c === c;
                    const span = tile?.span ?? 1;
                    const key = `${r}-${c}`;
                    const rsp = tile ? responder(`c-${r}-${c}`, { kind: 'move', r, c }, () => (latest.current.tapCell as (r: number, c: number) => void)(r, c)) : null;
                    return (
                      <View
                        key={key} ref={(el) => { cellRefs.current[key] = el; }} {...(rsp ? rsp.panHandlers : {})}
                        style={{ flex: span, minWidth: 0, marginHorizontal: 2 }}
                      >
                        {tile ? (
                          <View style={{ height: CELL_H, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: picked ? 2 : 1, borderColor: picked ? colors.accent : colors.border, backgroundColor: colors.accentBg, opacity: drag?.src.kind === 'move' && drag.src.r === r && drag.src.c === c ? 0.35 : 1 }}>
                            <Icon name={kindInfo(tile.kind).icon} size={18} color={colors.accent} />
                            <Text style={{ color: colors.text, fontSize: 10, marginTop: 2, maxWidth: '90%' }} numberOfLines={1}>{(tile.kind === 'title' || tile.kind === 'range' ? tile.value : tile.label) || kindInfo(tile.kind).name}</Text>
                          </View>
                        ) : (
                          <Tap onPress={() => tapCell(r, c)} style={{ height: CELL_H, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: `${colors.muted}88` }}>
                            <View />
                          </Tap>
                        )}
                      </View>
                    );
                  })}
                </View>
                {sel?.r === r && grid.cells[r][sel.c] ? editor(r, sel.c) : null}
                {selRow === r ? rowPanel(r) : null}
              </View>
            ))}

            <View style={[s.row, { marginTop: 8, marginBottom: 8 }]}>
              <Button label="Add row" variant="ghost" onPress={() => setGrid(addRow(grid))} style={{ flex: 1, marginRight: 8 }} />
              <Button label="Add column" variant="ghost" disabled={grid.cols >= MAX_COLS} onPress={() => apply(addCol(grid))} style={{ flex: 1 }} />
            </View>
            {lastColEmpty(grid) ? <Button label="Remove empty last column" variant="ghost" onPress={() => apply(deleteLastCol(grid))} style={{ marginBottom: 8 }} /> : null}
            <Button
              label={filled > 0 && !confirmExample ? 'Replace with a gym example' : filled > 0 ? 'Tap again to replace everything' : 'Start from a gym example'} variant="ghost"
              onPress={() => { if (filled > 0 && !confirmExample) return setConfirmExample(true); setGrid(gymExample()); setConfirmExample(false); setSel(null); }}
              style={{ marginBottom: 8 }}
            />
            {filled > 0 ? <Button label="Clear the grid" variant="danger" onPress={() => { setGrid(newGrid(grid.cols)); setSel(null); setSelRow(null); }} /> : null}
          </View>
        )}
        {!canSave ? <Muted style={{ marginTop: 12, textAlign: 'center' }}>Save needs a name and at least one tile.</Muted> : null}
      </Scroll>

      {/* the tile you are dragging */}
      {drag ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', left: drag.x - 26, top: drag.y - 26, width: 52, height: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
            backgroundColor: colors.accent, opacity: 0.9,
          }}
        >
          <Icon name={kindInfo(drag.src.kind === 'new' ? drag.src.tileKind : (grid.cells[drag.src.r][drag.src.c]?.kind ?? 'title')).icon} size={24} color={colors.onAccent} />
        </View>
      ) : null}
    </View>
  );
}
