import { generateSeedData } from '../src/seed/generate.js';
import { generateProductSeedData } from '../src/product/seed.js';
import { validateProductSeedAgainstOrganization } from '../src/product/validate.js';

const errors = validateProductSeedAgainstOrganization(generateProductSeedData(), generateSeedData());
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log('Product Progress seed validation passed: synthetic records, references, connectivity, and stable IDs are valid.');
