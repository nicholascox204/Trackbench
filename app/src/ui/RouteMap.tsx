// A route on a map: map tiles placed as images, the route drawn over them, start and end marked. No native map library, so it
// works the same on the phone and the web preview. See core/mapTiles.ts for the arithmetic and the tile-provider note.
import { Image, Platform, Text, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { ATTRIBUTION, TILE, fitView, tilesFor, toBox } from '../core/mapTiles';
import { colors } from './kit';

const HEADERS = { 'User-Agent': 'Trackbench/1.0 (route map)' }; // the tile servers ask apps to name themselves

export function RouteMap({ pts, w, h, live, empty }: { pts: { lat: number; lon: number }[]; w: number; h: number; live?: boolean; empty?: string }) {
  const v = fitView(pts, w, h, 28, live ? 17 : 17);
  if (!v || pts.length === 0) {
    return (
      <View style={{ width: w, height: h, borderRadius: 12, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.muted, fontSize: 14 }}>{empty ?? (live ? 'Finding your location…' : 'No route')}</Text>
      </View>
    );
  }
  const line = pts.map((p) => toBox(v, p.lat, p.lon));
  const a = line[0]; const b = line[line.length - 1];
  return (
    <View style={{ width: w, height: h, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.raised }}>
      {tilesFor(v).map((t) => (
        <Image key={t.key} source={Platform.OS === 'web' ? { uri: t.url } : { uri: t.url, headers: HEADERS }} style={{ position: 'absolute', left: t.x, top: t.y, width: TILE, height: TILE }} />
      ))}
      <Svg width={w} height={h} style={{ position: 'absolute', left: 0, top: 0 }}>
        {line.length > 1 ? <Polyline points={line.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill="none" stroke="#fff" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} /> : null}
        {line.length > 1 ? <Polyline points={line.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill="none" stroke={colors.accent} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" /> : null}
        <Circle cx={a.x} cy={a.y} r={5} fill="#fff" stroke={colors.accent} strokeWidth={2.5} />
        <Circle cx={b.x} cy={b.y} r={live ? 7 : 5} fill={colors.accent} stroke="#fff" strokeWidth={2.5} />
      </Svg>
      <Text style={{ position: 'absolute', right: 4, bottom: 2, fontSize: 9, color: '#333', backgroundColor: 'rgba(255,255,255,0.7)', paddingHorizontal: 3 }}>{ATTRIBUTION}</Text>
    </View>
  );
}
