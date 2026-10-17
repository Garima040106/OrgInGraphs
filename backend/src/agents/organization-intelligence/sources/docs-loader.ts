import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { DiscoveredSource } from '../types.js';

const SUPPORTED_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.json']);

function scanDirectory(dirPath: string): string[] {
  const results: string[] = [];
  if (!existsSync(dirPath)) return results;

  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist') {
        results.push(...scanDirectory(fullPath));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function extractTitle(content: string, filePath: string): string {
  const firstHeading = content.match(/^#\s+(.+)$/m);
  if (firstHeading?.[1]) return firstHeading[1].trim();
  return path.basename(filePath);
}

export function loadDocumentationSources(customDocsDir?: string): DiscoveredSource[] {
  const rootDir = process.cwd();
  // Check docs directory at workspace root, backend root, or custom
  const candidateDirs = [
    customDocsDir,
    path.resolve(rootDir, 'docs'),
    path.resolve(rootDir, '..', 'docs')
  ].filter((dir): dir is string => Boolean(dir && existsSync(dir)));

  const scannedPaths = new Set<string>();
  const filePaths: string[] = [];

  for (const dir of candidateDirs) {
    for (const file of scanDirectory(dir)) {
      const normalized = path.normalize(file);
      if (!scannedPaths.has(normalized)) {
        scannedPaths.add(normalized);
        filePaths.push(normalized);
      }
    }
  }

  // Also check README.md in workspace root or backend root
  const readmeCandidates = [
    path.resolve(rootDir, 'README.md'),
    path.resolve(rootDir, '..', 'README.md')
  ];
  for (const readme of readmeCandidates) {
    if (existsSync(readme)) {
      const normalized = path.normalize(readme);
      if (!scannedPaths.has(normalized)) {
        scannedPaths.add(normalized);
        filePaths.push(normalized);
      }
      break;
    }
  }

  return filePaths.map((filePath) => {
    const content = readFileSync(filePath, 'utf-8');
    const title = extractTitle(content, filePath);
    const stats = statSync(filePath);
    const hash = createHash('sha256').update(content).digest('hex');
    const relativePath = path.relative(path.resolve(rootDir, '..'), filePath).replace(/\\/g, '/');

    return {
      id: `doc:${relativePath}`,
      type: 'documentation',
      path: relativePath,
      title,
      content,
      metadata: {
        absolutePath: filePath,
        fileName: path.basename(filePath),
        fileSize: stats.size,
        extension: path.extname(filePath)
      },
      hash,
      lastModified: stats.mtime.toISOString()
    };
  });
}
