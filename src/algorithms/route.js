// Rute = daftar nomor tempat, selalu mulai dan selesai di 0 (dapur).
// Contoh: [0, 3, 1, 2, 0]

// Total biaya sebuah rute berdasarkan tabel
export function routeCost(matrix, route) {
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    total += matrix[route[i]][route[i + 1]];
  }
  return total;
}

// 1. Urutan asal: 0, 1, 2, ..., n-1, kembali ke 0
export function naiveRoute(n) {
  const r = [0];
  for (let i = 1; i < n; i++) r.push(i);
  r.push(0);
  return r;
}

// 2. Nearest Neighbor (Heuristik Cepat)
export function nearestNeighbor(matrix) {
  const n = matrix.length;
  const visited = new Set([0]);
  const route = [0];
  let cur = 0;
  while (visited.size < n) {
    let best = -1;
    for (let j = 1; j < n; j++) {
      if (visited.has(j)) continue;
      if (best === -1 || matrix[cur][j] < matrix[cur][best]) best = j;
    }
    visited.add(best);
    route.push(best);
    cur = best;
  }
  route.push(0);
  return route;
}

// 3. Brute Force (Pre-Peningkatan: Baseline)
// Mencoba seluruh permutasi (n-1)! secara menyeluruh
// Kompleksitas Waktu: O((n - 1)!) - Faktorial
export function bruteForce(matrix) {
  const n = matrix.length;
  if (n <= 1) return [0, 0];
  if (n === 2) return [0, 1, 0];
  if (n > 11) throw new Error('Terlalu banyak sekolah untuk brute force');

  let bestRoute = null;
  let bestCost = Infinity;
  let permutationsCount = 0;
  const others = [];
  for (let i = 1; i < n; i++) others.push(i);

  function permute(arr, k) {
    if (k === arr.length) {
      permutationsCount++;
      const route = [0, ...arr, 0];
      const c = routeCost(matrix, route);
      if (c < bestCost) {
        bestCost = c;
        bestRoute = route;
      }
      return;
    }
    for (let i = k; i < arr.length; i++) {
      [arr[k], arr[i]] = [arr[i], arr[k]];
      permute(arr, k + 1);
      [arr[k], arr[i]] = [arr[i], arr[k]];
    }
  }
  permute(others, 0);
  return bestRoute;
}

// 4. Dynamic Programming - Algoritma Held-Karp dengan Bitmasking (Peningkatan Efisiensi)
// Memecah masalah ke sub-problem terkecil dengan memoization state (mask, last_node)
// Kompleksitas Waktu: O(n^2 * 2^n) - Penurunan eksponensial dari O(n!)
// Jaminan: 100% Solusi Optimal Global Sama Persis dengan Brute Force
export function heldKarp(matrix) {
  const n = matrix.length;
  if (n <= 1) return [0, 0];
  if (n === 2) return [0, 1, 0];

  const totalStates = 1 << n;
  // dp[mask][u] = biaya minimum mengunjungi subset 'mask' yang berakhir di simpul 'u'
  const dp = Array.from({ length: totalStates }, () => new Float64Array(n).fill(Infinity));
  const parent = Array.from({ length: totalStates }, () => new Int8Array(n).fill(-1));

  dp[1][0] = 0; // Mulai di dapur (simpul 0, bit 0 aktif: mask = 1)

  for (let mask = 1; mask < totalStates; mask++) {
    if ((mask & 1) === 0) continue; // Dapur harus selalu termasuk
    for (let u = 0; u < n; u++) {
      if ((mask & (1 << u)) === 0) continue;
      const c = dp[mask][u];
      if (c === Infinity) continue;

      for (let v = 1; v < n; v++) {
        if ((mask & (1 << v)) !== 0) continue;
        const nextMask = mask | (1 << v);
        const newCost = c + matrix[u][v];
        if (newCost < dp[nextMask][v]) {
          dp[nextMask][v] = newCost;
          parent[nextMask][v] = u;
        }
      }
    }
  }

  // Cari simpul terakhir 'u' terbaik untuk kembali pulang ke dapur (simpul 0)
  const finalMask = totalStates - 1;
  let bestCost = Infinity;
  let bestLast = -1;

  for (let u = 1; u < n; u++) {
    const totalCost = dp[finalMask][u] + matrix[u][0];
    if (totalCost < bestCost) {
      bestCost = totalCost;
      bestLast = u;
    }
  }

  if (bestLast === -1) return naiveRoute(n);

  // Rekonstruksi rute optimal dari state tabel parent
  const route = [0];
  let curr = bestLast;
  let currMask = finalMask;

  while (curr !== 0) {
    route.push(curr);
    const prev = parent[currMask][curr];
    currMask ^= (1 << curr);
    curr = prev;
  }
  route.push(0);
  return route.reverse();
}
