import { haversine } from './graph.js';

// Cari kelompok titik jalan yang saling tersambung, ambil yang terbesar
export function largestComponent(adj) {
  const nb = new Map();
  const link = (a, b) => {
    if (!nb.has(a)) nb.set(a, []);
    nb.get(a).push(b);
  };
  for (const [from, list] of adj) {
    for (const e of list) {
      link(from, e.to);
      link(e.to, from);
    }
  }

  const seen = new Set();
  let best = [];
  for (const start of nb.keys()) {
    if (seen.has(start)) continue;
    const comp = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const u = stack.pop();
      comp.push(u);
      for (const v of nb.get(u)) {
        if (!seen.has(v)) {
          seen.add(v);
          stack.push(v);
        }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  return new Set(best);
}

// Cari titik jalan terdekat dari sebuah lokasi
export function snapPoint(point, coords, allowed) {
  let bestId = null;
  let bestDist = Infinity;
  for (const id of allowed) {
    const c = coords.get(id);
    const d = haversine({ lat: point.lat, lon: point.lng }, c);
    if (d < bestDist) {
      bestDist = d;
      bestId = id;
    }
  }
  return { nodeId: bestId, distance: bestDist };
}