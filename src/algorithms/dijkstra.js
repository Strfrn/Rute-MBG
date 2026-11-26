// Antrian prioritas sederhana: selalu mengeluarkan item dengan biaya terkecil
export class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(item) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

// weightKey: 'dist' (meter) atau 'time' (detik)
export function dijkstra(adj, start, weightKey, targets = []) {
  const cost = new Map([[start, 0]]);
  const prev = new Map();
  const done = new Set();
  const remaining = new Set(targets);
  const heap = new MinHeap();
  heap.push([0, start]);

  while (heap.size) {
    const [c, u] = heap.pop();
    if (done.has(u)) continue;
    done.add(u);

    // Berhenti lebih awal kalau semua tujuan sudah ketemu
    remaining.delete(u);
    if (targets.length && remaining.size === 0) break;

    for (const e of adj.get(u) || []) {
      const nc = c + e[weightKey];
      if (nc < (cost.get(e.to) ?? Infinity)) {
        cost.set(e.to, nc);
        prev.set(e.to, u);
        heap.push([nc, e.to]);
      }
    }
  }
  return { cost, prev };
}

// Dijkstra yang sama persis, tapi mencatat urutan simpul yang selesai diproses
// beserta simpul induknya (untuk menggambar garis pencarian).
// targets = daftar tujuan; pencarian berhenti setelah semua tujuan ditemukan.
export function dijkstraTrace(adj, start, targets, weightKey) {
  const cost = new Map([[start, 0]]);
  const prev = new Map();
  const done = new Set();
  const order = [];
  const parent = []; // parent[i] = induk dari order[i] (null untuk titik awal)
  const remaining = new Set(targets);
  const heap = new MinHeap();
  heap.push([0, start]);
  let pushes = 1, pops = 0, examined = 0, relaxed = 0; // hitungan kerja algoritma

  while (heap.size) {
    const [c, u] = heap.pop();
    pops++;
    if (done.has(u)) continue;
    done.add(u);
    order.push(u);
    parent.push(prev.has(u) ? prev.get(u) : null);

    remaining.delete(u);
    if (targets.length && remaining.size === 0) break;

    for (const e of adj.get(u) || []) {
      examined++;
      const nc = c + e[weightKey];
      if (nc < (cost.get(e.to) ?? Infinity)) {
        cost.set(e.to, nc);
        prev.set(e.to, u);
        heap.push([nc, e.to]);
        relaxed++;
        pushes++;
      }
    }
  }

  const results = targets.map(t => ({
    target: t,
    found: done.has(t),
    path: done.has(t) ? buildPath(prev, t) : [],
    cost: done.has(t) ? cost.get(t) : Infinity,
  }));
  return { order, parent, results, stats: { visited: order.length, pops, pushes, examined, relaxed } };
}

// Susun jalur dari start ke target (daftar node)
export function buildPath(prev, target) {
  const path = [target];
  while (prev.has(path[path.length - 1])) {
    path.push(prev.get(path[path.length - 1]));
  }
  return path.reverse();
}

// ─── Peningkatan: Radix Heap + Indexed Typed Arrays ──────────────────────────
// Memanfaatkan sifat monoton Dijkstra (nilai key yang di-pop tidak pernah turun)
// sehingga operasi push menjadi O(1) dan pop menjadi O(log C) amortized.
export class RadixHeap {
  constructor() {
    this.buckets = Array.from({ length: 33 }, () => []);
    this.last = 0;
    this.count = 0;
  }
  get size() { return this.count; }
  push(key, node) {
    const b = key === this.last ? 0 : 32 - Math.clz32(key ^ this.last);
    this.buckets[b].push(key, node);
    this.count++;
  }
  pop() {
    const B = this.buckets;
    if (B[0].length === 0) {
      let i = 1;
      while (i < 33 && B[i].length === 0) i++;
      const arr = B[i];
      let minKey = arr[0];
      for (let j = 2; j < arr.length; j += 2) {
        if (arr[j] < minKey) minKey = arr[j];
      }
      this.last = minKey;
      for (let j = 0; j < arr.length; j += 2) {
        const k = arr[j];
        const b = k === minKey ? 0 : 32 - Math.clz32(k ^ minKey);
        B[b].push(k, arr[j + 1]);
      }
      arr.length = 0;
    }
    const b0 = B[0];
    const node = b0.pop();
    const key = b0.pop();
    this.count--;
    return [key, node];
  }
}

// Cache indeks graf (0..V-1) per objek adj menggunakan WeakMap
const indexedGraphCache = new WeakMap();
function getIndexedGraph(adj) {
  let cached = indexedGraphCache.get(adj);
  if (cached) return cached;
  const idToIdx = new Map();
  const idxToId = [];
  let n = 0;
  for (const [u, list] of adj) {
    if (!idToIdx.has(u)) { idToIdx.set(u, n); idxToId.push(u); n++; }
    for (const e of list) {
      if (!idToIdx.has(e.to)) { idToIdx.set(e.to, n); idxToId.push(e.to); n++; }
    }
  }
  const adjArr = Array.from({ length: n }, () => []);
  for (const [u, list] of adj) {
    const ui = idToIdx.get(u);
    adjArr[ui] = list.map(e => ({ to: idToIdx.get(e.to), dist: e.dist, time: e.time }));
  }
  cached = { n, idToIdx, idxToId, adjArr };
  indexedGraphCache.set(adj, cached);
  return cached;
}

// Dijkstra menggunakan Radix Heap & TypedArray (kompleksitas O(E + V log C))
export function dijkstraRadixTrace(adj, start, targets, weightKey) {
  const { n, idToIdx, idxToId, adjArr } = getIndexedGraph(adj);
  const sIdx = idToIdx.get(start);
  if (sIdx === undefined) {
    return {
      order: [],
      parent: [],
      results: targets.map(t => ({ target: t, found: false, path: [], cost: Infinity })),
      stats: { visited: 0, pops: 0, pushes: 0, examined: 0, relaxed: 0 },
    };
  }

  const SCALE = 100; // presisi 0.01 m / 0.01 detik dalam integer 32-bit
  const tSet = new Set();
  for (const t of targets) {
    const ti = idToIdx.get(t);
    if (ti !== undefined) tSet.add(ti);
  }

  const cost = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const order = [];
  const parent = [];
  cost[sIdx] = 0;

  const heap = new RadixHeap();
  heap.push(0, sIdx);
  let remaining = tSet.size;
  let pushes = 1, pops = 0, examined = 0, relaxed = 0;

  while (heap.size) {
    const [, u] = heap.pop();
    pops++;
    if (done[u]) continue;
    done[u] = 1;
    order.push(idxToId[u]);
    parent.push(prev[u] === -1 ? null : idxToId[prev[u]]);

    if (tSet.has(u)) {
      remaining--;
      if (remaining === 0) break;
    }

    const c = cost[u];
    const list = adjArr[u];
    for (let i = 0; i < list.length; i++) {
      examined++;
      const e = list[i];
      const nc = c + e[weightKey];
      if (nc < cost[e.to]) {
        cost[e.to] = nc;
        prev[e.to] = u;
        heap.push(Math.round(nc * SCALE), e.to);
        relaxed++;
        pushes++;
      }
    }
  }

  const results = targets.map(t => {
    const ti = idToIdx.get(t);
    const found = ti !== undefined && done[ti] === 1;
    let path = [];
    if (found) {
      let cur = ti;
      while (cur !== -1) {
        path.push(idxToId[cur]);
        cur = prev[cur];
      }
      path.reverse();
    }
    return { target: t, found, path, cost: found ? cost[ti] : Infinity };
  });
  return { order, parent, results, stats: { visited: order.length, pops, pushes, examined, relaxed } };
}
