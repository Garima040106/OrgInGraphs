import { env } from './config/env.js';

const message = `OrgInGraphs backend initialized in ${env.NODE_ENV} mode on port ${env.PORT}.`;

if (env.NODE_ENV !== 'test') {
  console.log(message);
}
