import { generateProductSeedData } from '../src/product/seed.js';
import { generateSeedData } from '../src/seed/generate.js';
import { validateProductSeedAgainstOrganization } from '../src/product/validate.js';
import { connectGraph, seedGraph } from '../src/db/falkordb.js';

const data = generateProductSeedData();
const errors = validateProductSeedAgainstOrganization(data, generateSeedData());
if (errors.length) throw new Error(errors.join('\n'));
const { db, graph } = await connectGraph();
try {
  await seedGraph(graph, data);
  console.log(`Seeded Product Progress: ${data.nodes.length} nodes and ${data.edges.length} relationships created or matched. Existing organization records were not deleted or recreated.`);
} finally { await db.close(); }
