import { writeFile } from 'node:fs/promises';
import { generateSeedData } from '../src/seed/generate.js';
import { validateSeedData } from '../src/seed/validate.js';
const data=generateSeedData(); const errors=validateSeedData(data); if(errors.length){console.error(errors.join('\n'));process.exitCode=1;} else {await writeFile('seed-data.json',JSON.stringify(data,null,2));console.log(`Generated ${data.nodes.length} nodes and ${data.edges.length} relationships.`);}
