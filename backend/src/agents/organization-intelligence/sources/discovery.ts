import type { Graph } from 'falkordb';
import type { DiscoveredSource } from '../types.js';
import { discoverRouteSources } from './routes-catalog.js';
import { loadDocumentationSources } from './docs-loader.js';
import { extractDatabaseSources } from './database-extractor.js';
import { loadSeedGraphSources } from './seed-graph-loader.js';

export async function discoverRagSources(options: {
  graph?: Graph;
  docsDir?: string;
  strictLive?: boolean;
} = {}): Promise<DiscoveredSource[]> {
  const routes = discoverRouteSources();
  const documentation = [...loadDocumentationSources(options.docsDir), ...loadSeedGraphSources()];
  const database = await extractDatabaseSources(options.graph, { strictLive: options.strictLive });
  const sources = [...routes, ...documentation, ...database];
  const byPath = new Map<string, DiscoveredSource>();
  for (const source of sources) {
    if (byPath.has(source.path)) throw new Error(`Source discovery returned duplicate stable path: ${source.path}`);
    byPath.set(source.path, source);
  }
  return [...byPath.values()];
}
