// Drawing a route on a map without a native map library: the standard web-map tiles (256-pixel squares, numbered by zoom, x and
// y) placed as plain images, with the route drawn over them. This file is the arithmetic: which zoom fits the route in a box,
// which tiles cover it, and where each point lands in pixels.
//
// Tiles come from OpenStreetMap for now. Its usage policy allows light use only; before release this needs a tile provider
// with an agreement (MapTiler, Stadia, Thunderforest all have free tiers), which is a one-line change of TILE_URL.

export const TILE = 256;
export const TILE_URL = (z: number, x: number, y: number): string => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
export const ATTRIBUTION = '© OpenStreetMap contributors';

// World pixel position at a zoom (Web Mercator).
export function project(lat: number, lon: number, z: number): { x: number; y: number } {
  const scale = TILE * 2 ** z;
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * scale, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale };
}

export interface View { z: number; left: number; top: number; w: number; h: number } // the box's top-left in world pixels

// The closest zoom that fits every point in a w by h box with some margin, centred on the route.
export function fitView(pts: { lat: number; lon: number }[], w: number, h: number, pad = 24, maxZ = 17): View | undefined {
  if (pts.length === 0) return undefined;
  for (let z = maxZ; z >= 1; z--) {
    const p = pts.map((q) => project(q.lat, q.lon, z));
    const xs = p.map((q) => q.x); const ys = p.map((q) => q.y);
    const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
    if (maxX - minX <= w - pad * 2 && maxY - minY <= h - pad * 2) {
      return { z, left: (minX + maxX) / 2 - w / 2, top: (minY + maxY) / 2 - h / 2, w, h };
    }
  }
  const c = project(pts[0].lat, pts[0].lon, 1);
  return { z: 1, left: c.x - w / 2, top: c.y - h / 2, w, h };
}

// The tiles that cover the view, with where each one sits in the box.
export function tilesFor(v: View): { key: string; url: string; x: number; y: number }[] {
  const n = 2 ** v.z;
  const out: { key: string; url: string; x: number; y: number }[] = [];
  for (let ty = Math.floor(v.top / TILE); ty <= Math.floor((v.top + v.h) / TILE); ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(v.left / TILE); tx <= Math.floor((v.left + v.w) / TILE); tx++) {
      const wx = ((tx % n) + n) % n;
      out.push({ key: `${v.z}/${tx}/${ty}`, url: TILE_URL(v.z, wx, ty), x: tx * TILE - v.left, y: ty * TILE - v.top });
    }
  }
  return out;
}

export function toBox(v: View, lat: number, lon: number): { x: number; y: number } {
  const p = project(lat, lon, v.z);
  return { x: p.x - v.left, y: p.y - v.top };
}
