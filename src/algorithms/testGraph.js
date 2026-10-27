import fs from 'fs';
import { buildGraph } from './graph.js';

const osm = JSON.parse(fs.readFileSync('public/data/roads.json', 'utf8'));
const g = buildGraph(osm);

let edges = 0;
for (const list of g.adj.values()) edges += list.length;

console.log('titik jalan:', g.adj.size);
console.log('ruas jalan:', edges);