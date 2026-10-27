import { dijkstra, buildPath } from './dijkstra.js';

// Satu garis untuk tiap perjalanan:
// dapur -> sekolah 1, sekolah 1 -> sekolah 2, ..., sekolah terakhir -> dapur
export function routeToLegs(adj, coords, nodes, route, key) {
  const legs = [];
  for (let i = 0; i < route.length - 1; i++) {
    const from = nodes[route[i]];
    const to = nodes[route[i + 1]];
    const { prev } = dijkstra(adj, from, key, [to]);
    legs.push(
      buildPath(prev, to).map(id => {
        const c = coords.get(id);
        return [c.lat, c.lon];
      })
    );
  }
  return legs;
}

// Versi lama: semua perjalanan disambung jadi satu garis
export function routeToCoords(adj, coords, nodes, route, key) {
  return routeToLegs(adj, coords, nodes, route, key).flat();
}