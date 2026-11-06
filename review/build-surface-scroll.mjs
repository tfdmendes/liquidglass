import { writeFileSync } from 'node:fs';
import { reviewDocument } from './surface-scroll-review.mjs';

const { html, base } = reviewDocument();
const output = process.argv[2] || new URL('./surface-scroll.html', import.meta.url);
writeFileSync(output, html);
console.log(`Built ${output} (${Buffer.byteLength(html)} bytes; original ${base})`);
