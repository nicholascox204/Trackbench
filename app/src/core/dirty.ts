// Has something changed from how it was? Compared by value: key order does not matter, a key set to undefined counts as missing,
// and a list is compared in order. So changing something and changing it back is no change, which a "you touched it" flag can't say.

function plain(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = plain(x);
    }
    return out;
  }
  return v;
}

export const isChanged = (before: unknown, after: unknown): boolean => JSON.stringify(plain(before)) !== JSON.stringify(plain(after));
