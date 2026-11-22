// How a tile grid looks when you use it. One lattice component draws it; the tracker page feeds it the
// saved entries, and the builder's Preview feeds it throwaway local values.

import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { isCovered, rowCount, sanitizeGrid } from '../core/grid';
import { previousRow } from '../core/plan';
import { setRow } from '../core/store';
import { startOfDay } from '../core/time';
import type { Entry, GridDef, Tile, Tracker } from '../core/types';
import { Icon, Muted, Tap, colors } from '../ui/kit';
import { NumInput } from '../ui/NumInput';

export interface GridData {
  valueOf: (tile: Tile) => string | number | undefined;
  doneOf: (tile: Tile) => boolean;
  prevOf: (tile: Tile) => string | number | undefined;
  onNumber: (tile: Tile, v: number | undefined) => void;
  onText: (tile: Tile, v: string) => void;
  onToggle: (tile: Tile) => void;
}

function TextCell({ value, placeholder, disabled, onCommit }: { value: string; placeholder: string; disabled: boolean; onCommit: (v: string) => void }) {
  const [txt, setTxt] = useState(value);
  return (
    <TextInput
      style={{ backgroundColor: colors.raised, borderColor: colors.border, borderWidth: 1, borderRadius: 6, color: colors.text, fontSize: 13, height: 34, paddingHorizontal: 6, minWidth: 0, opacity: disabled ? 0.5 : 1 }}
      value={txt} onChangeText={setTxt} onEndEditing={() => onCommit(txt)} onBlur={() => onCommit(txt)}
      editable={!disabled} placeholder={placeholder} placeholderTextColor={colors.muted}
    />
  );
}

function Cell({ tile, data, editable }: { tile: Tile; data: GridData; editable: boolean }) {
  switch (tile.kind) {
    case 'title':
      return <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }} numberOfLines={3}>{tile.value}</Text>;
    case 'range':
      return (
        <View style={{ alignItems: 'center', justifyContent: 'center', minHeight: 34 }}>
          <Text style={{ color: colors.muted, fontSize: 13 }} numberOfLines={1}>{tile.value || '·'}</Text>
          {tile.label ? <Text style={{ color: colors.muted, fontSize: 9 }} numberOfLines={1}>{tile.label}</Text> : null}
        </View>
      );
    case 'number': {
      const raw = data.valueOf(tile);
      const shown = raw === undefined || raw === '' ? undefined : Number(raw);
      const pv = data.prevOf(tile);
      return (
        <NumInput
          value={shown === undefined || Number.isNaN(shown) ? undefined : shown} disabled={!editable}
          placeholder={pv !== undefined && pv !== '' ? String(pv) : tile.label}
          onCommit={(v) => data.onNumber(tile, v)} style={{ minWidth: 0, width: '100%' }}
        />
      );
    }
    case 'text':
      return <TextCell value={String(data.valueOf(tile) ?? '')} placeholder={tile.label ?? ''} disabled={!editable} onCommit={(v) => data.onText(tile, v)} />;
    case 'check': {
      const done = data.doneOf(tile);
      return (
        <View style={{ alignItems: 'center' }}>
          <Tap
            disabled={!editable} onPress={() => data.onToggle(tile)}
            style={{
              width: 40, height: 34, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
              borderStyle: done ? 'solid' : 'dashed', borderColor: done ? colors.done : colors.muted,
              backgroundColor: done ? colors.doneBg : 'transparent', opacity: editable ? 1 : 0.5,
            }}
          >
            {done ? <Icon name="checkmark" size={18} color={colors.done} /> : null}
          </Tap>
        </View>
      );
    }
  }
}

export function GridLattice({ grid, data, editable }: { grid: GridDef; data: GridData; editable: boolean }) {
  const rows = Array.from({ length: rowCount(grid) }, (_, r) => r).filter((r) => grid.cells[r].some(Boolean));
  if (rows.length === 0) return <Muted>This table is empty. Use Setup to add tiles.</Muted>;
  return (
    <View>
      {rows.map((r) => (
        <View key={r} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, borderBottomWidth: 1, borderBottomColor: `${colors.border}88` }}>
          {grid.cells[r].map((tile, c) => {
            if (isCovered(grid, r, c)) return null;
            const span = tile?.span ?? 1;
            return (
              <View key={c} style={{ flex: span, minWidth: 0, paddingHorizontal: 3, paddingVertical: 4, justifyContent: 'center' }}>
                {tile ? <Cell tile={tile} data={data} editable={editable} /> : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// The tracker page: the grid with saved entries.
export function GridView({ t, entries, day, editable }: { t: Tracker; entries: Entry[]; day: number; editable: boolean }) {
  const grid = sanitizeGrid(t.grid);
  const entryOf = (tile: Tile) => entries.find((x) => x.slotId === tile.id && x.row === 0 && startOfDay(x.at) === day);
  const data: GridData = {
    valueOf: (tile) => entryOf(tile)?.values.v,
    doneOf: (tile) => !!entryOf(tile)?.done,
    prevOf: (tile) => (t.tools.previous ? previousRow(entries, tile.id, 0, day)?.values.v : undefined),
    onNumber: (tile, v) => setRow(t.id, day, tile.id, 0, { values: { v: v === undefined ? '' : v }, done: v !== undefined }),
    onText: (tile, v) => setRow(t.id, day, tile.id, 0, { values: { v }, done: v.trim() !== '' }),
    onToggle: (tile) => setRow(t.id, day, tile.id, 0, { done: !entryOf(tile)?.done }),
  };
  return <GridLattice grid={grid} data={data} editable={editable} />;
}
