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

// 2. Nearest Neighbor
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

// 3. Brute force: coba semua urutan (hanya untuk jumlah sekolah kecil)
export function bruteForce(matrix) {
  const n = matrix.length;
  if (n > 10) throw new Error('Terlalu banyak sekolah untuk brute force');

  let bestRoute = null;
  let bestCost = Infinity;
  const others = [];
  for (let i = 1; i < n; i++) others.push(i);

  function permute(arr, k) {
    if (k === arr.length) {
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