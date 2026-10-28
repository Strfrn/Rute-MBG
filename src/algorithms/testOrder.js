import fs from 'fs';
import { buildGraph } from './graph.js';
import { largestComponent, snapPoint } from './snap.js';
import { buildMatrix } from './matrix.js';
import { routeCost, bruteForce } from './route.js';

const osm = JSON.parse(fs.readFileSync('public/data/roads.json', 'utf8'));
const data = JSON.parse(fs.readFileSync('public/data/data.json', 'utf8'));
const g = buildGraph(osm);
const main = largestComponent(g.adj);

function best(schools, key) {
  const places = [data.kitchen, ...schools];
  const nodes = places.map(p => snapPoint(p, g.coords, main).nodeId);
  const m = buildMatrix(g.adj, nodes, key);
  const r = bruteForce(m);
  return {
    cost: routeCost(m, r),
    ids: r.map(i => (i === 0 ? 'D' : places[i].id)).join(' -> '),
  };
}

for (const key of ['dist', 'time']) {
  const a = best(data.schools, key);
  const b = best([...data.schools].reverse(), key);
  console.log('\n' + key);
  console.log('urutan data asli  :', Math.round(a.cost), '|', a.ids);
  console.log('urutan data dibalik:', Math.round(b.cost), '|', b.ids);
}