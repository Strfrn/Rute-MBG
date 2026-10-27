import fs from 'fs';
import { buildGraph } from './graph.js';
import { largestComponent, snapPoint } from './snap.js';
import { dijkstra, buildPath } from './dijkstra.js';

const osm = JSON.parse(fs.readFileSync('public/data/roads.json', 'utf8'));
const data = JSON.parse(fs.readFileSync('public/data/data.json', 'utf8'));

const g = buildGraph(osm);
const main = largestComponent(g.adj);

const kitchenNode = snapPoint(data.kitchen, g.coords, main).nodeId;
const schoolNodes = data.schools.map(s => snapPoint(s, g.coords, main).nodeId);

for (const key of ['dist', 'time']) {
  const { cost, prev } = dijkstra(g.adj, kitchenNode, key, schoolNodes);
  console.log('\n=== Dari dapur, berdasarkan', key, '===');
  data.schools.forEach((s, i) => {
    const c = cost.get(schoolNodes[i]);
    if (c === undefined) { console.log(s.name, '-> TIDAK TERJANGKAU'); return; }
    const label = key === 'dist' ? Math.round(c) + ' m' : (c / 60).toFixed(1) + ' menit';
    const steps = buildPath(prev, schoolNodes[i]).length;
    console.log(s.name, '->', label, '(', steps, 'titik jalan )');
  });
}