import { generateSeedData } from '../src/seed/generate.js';
import { validateSeedData } from '../src/seed/validate.js';
import { connectGraph, seedGraph } from '../src/db/falkordb.js';
const data=generateSeedData(); const errors=validateSeedData(data); if(errors.length) throw new Error(errors.join('\n'));
const {db,graph}=await connectGraph(); try { await seedGraph(graph,data); console.log(`Seeded Hirenova: ${data.nodes.length} nodes and ${data.edges.length} relationships created or matched in FalkorDB.`); } finally { await db.close(); }
