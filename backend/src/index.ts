import { startServer } from './server.js';
startServer().catch((error) => { console.error('Unable to start backend:', error); process.exitCode = 1; });
