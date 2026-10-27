import fs from 'fs';
import { buildGraph } from './graph.js';
import { largestComponent, snapPoint } from './snap.js';

const osm = JSON.parse(fs.readFileSync('public/data/roads.json', 'utf8'));
const data = JSON.parse(fs.readFileSync('public/data/data.json', 'utf8'));

const g = buildGraph(osm);
const main = largestComponent(g.adj);
console.log('titik jalan total:', g.adj.size, '| di jaringan utama:', main.size);

const places = [data.kitchen, ...data.schools];
for (const p of places) {
  const s = snapPoint(p, g.coords, main);
  console.log(p.name, '-> node', s.nodeId, '| jarak ke jalan:', Math.round(s.distance), 'm');
}