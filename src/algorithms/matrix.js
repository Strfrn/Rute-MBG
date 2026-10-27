import { dijkstra } from './dijkstra.js';

// places = [dapur, sekolah1, sekolah2, ...] dalam bentuk daftar node
// Hasil: tabel[i][j] = biaya dari tempat i ke tempat j
export function buildMatrix(adj, nodeIds, weightKey) {
  return nodeIds.map(from => {
    const { cost } = dijkstra(adj, from, weightKey, nodeIds);
    return nodeIds.map(to => cost.get(to) ?? Infinity);
  });
}