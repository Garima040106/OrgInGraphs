import { generateSeedData } from '../src/seed/generate.js';
import { validateSeedData } from '../src/seed/validate.js';
const errors=validateSeedData(generateSeedData()); if(errors.length){console.error(errors.join('\n'));process.exitCode=1;} else console.log('Seed validation passed: exactly 56 employees, valid references, and no reporting cycles.');
