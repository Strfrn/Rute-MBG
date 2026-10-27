import fs from 'fs';
import { buildGraph } from './graph.js';
import { largestComponent, snapPoint } from './snap.js';
import { buildMatrix } from './matrix.js';
import { routeCost, naiveRoute, nearestNeighbor, bruteForce } from './route.js';

const osm = JSON.parse(fs.readFileSync('public/data/roads.json', 'utf8'));
const data = JSON.parse(fs.readFileSync('public/data/data.json', 'utf8'));

const g = buildGraph(osm);
const main = largestComponent(g.adj);
const places = [data.kitchen, ...data.schools];
const nodes = places.map(p => snapPoint(p, g.coords, main).nodeId);

const names = r => r.map(i => places[i].name).join(' -> ');

for (const key of ['dist', 'time']) {
  const m = buildMatrix(g.adj, nodes, key);
  const unit = key === 'dist' ? 'm' : 'detik';
  console.log('\n===== Tujuan:', key === 'dist' ? 'jarak terpendek' : 'waktu tercepat', '=====');

  const naive = naiveRoute(places.length);
  const nn = nearestNeighbor(m);
  const best = bruteForce(m);
  const cNaive = routeCost(m, naive);

  for (const [label, r] of [['Urutan asal', naive], ['Nearest Neighbor', nn], ['Brute force (optimal)', best]]) {
    const c = routeCost(m, r);
    const saved = (((cNaive - c) / cNaive) * 100).toFixed(1);
    console.log(label + ':', Math.round(c), unit, '| hemat', saved + '%');
    console.log('   ', names(r));
  }
}