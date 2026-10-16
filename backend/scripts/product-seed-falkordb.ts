import { generateProductSeedData } from '../src/product/seed.js';
import { generateSeedData } from '../src/seed/generate.js';
import { validateProductSeedAgainstOrganization } from '../src/product/validate.js';
import { connectGraph, seedGraph } from '../src/db/falkordb.js';
import { verifyProductSeed } from '../src/product/seed-verification.js';

const data = generateProductSeedData();
const errors = validateProductSeedAgainstOrganization(data, generateSeedData());
if (errors.length) throw new Error(errors.join('\n'));
const { db, graph } = await connectGraph();
try {
  await seedGraph(graph, data);
  const verified = await verifyProductSeed(graph, data);
  console.log(`Seeded Product Progress: ${verified.nodeCount} nodes and ${verified.relationshipCount} relationships verified in the selected graph. Existing organization records were not deleted or recreated.`);
} finally { await db.close(); }
