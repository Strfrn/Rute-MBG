// Antrian prioritas sederhana: selalu mengeluarkan item dengan biaya terkecil
class MinHeap {
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

// Susun jalur dari start ke target (daftar node)
export function buildPath(prev, target) {
  const path = [target];
  while (prev.has(path[path.length - 1])) {
    path.push(prev.get(path[path.length - 1]));
  }
  return path.reverse();
}