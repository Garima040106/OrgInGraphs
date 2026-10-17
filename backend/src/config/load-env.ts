import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(configDirectory, '../../..');

// Load backend/.env regardless of whether the backend was started from the
// repository root or from the backend directory. A root .env is a fallback.
dotenv.config({
  path: [
    path.join(repositoryRoot, 'backend', '.env'),
    path.join(repositoryRoot, '.env')
  ]
});
