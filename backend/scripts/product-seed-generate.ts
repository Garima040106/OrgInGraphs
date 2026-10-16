import { mkdir, writeFile } from 'node:fs/promises';
import { generateProductSeedData } from '../src/product/seed.js';
import { generateSeedData } from '../src/seed/generate.js';
import { validateProductSeedAgainstOrganization } from '../src/product/validate.js';

const data = generateProductSeedData();
const errors = validateProductSeedAgainstOrganization(data, generateSeedData());
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else { await mkdir('seed-output', { recursive: true }); await writeFile('seed-output/product-progress-seed.json', JSON.stringify(data, null, 2)); console.log(`Generated ${data.nodes.length} Product Progress nodes and ${data.edges.length} relationships.`); }
