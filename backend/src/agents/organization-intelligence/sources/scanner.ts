import type { Graph } from 'falkordb';
import type { DiscoveredSource } from '../types.js';
import { discoverRouteSources } from './routes-catalog.js';
import { loadDocumentationSources } from './docs-loader.js';
import { extractDatabaseSources } from './database-extractor.js';

export interface ScanOptions {
  graph?: Graph;
  docsDir?: string;
  sourceFilter?: Array<DiscoveredSource['type']>;
}

export async function discoverAllSources(options: ScanOptions = {}): Promise<DiscoveredSource[]> {
  const routes = (!options.sourceFilter || options.sourceFilter.includes('route'))
    ? discoverRouteSources()
    : [];

  const docs = (!options.sourceFilter || options.sourceFilter.includes('documentation'))
    ? loadDocumentationSources(options.docsDir)
    : [];

  const database = (!options.sourceFilter || options.sourceFilter.includes('database'))
    ? await extractDatabaseSources(options.graph)
    : [];

  return [...routes, ...docs, ...database];
}
