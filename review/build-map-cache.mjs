import { writeFileSync } from 'node:fs';
import { comparisonDocument } from './map-cache-review.mjs';

const output = process.argv[2] || 'review/map-cache.html';
writeFileSync(output, comparisonDocument());
console.log(`Built ${output} with baseline 068ad22 and the working-tree candidate`);
