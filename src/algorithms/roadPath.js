import { dijkstra, buildPath } from './dijkstra.js';

// route = [0, 3, 1, 2, 0] (nomor tempat), nodes = node jalan tiap tempat
export function routeToCoords(adj, coords, nodes, route, key) {
  const line = [];
  for (let i = 0; i < route.length - 1; i++) {
    const from = nodes[route[i]];
    const to = nodes[route[i + 1]];
    const { prev } = dijkstra(adj, from, key, [to]);
    for (const id of buildPath(prev, to)) {
      const c = coords.get(id);
      line.push([c.lat, c.lon]);
    }
  }
  return line;
}