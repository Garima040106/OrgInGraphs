import { createHash } from 'node:crypto';
import type { ChunkMetadata, DiscoveredSource, DocumentChunk } from '../types.js';

export interface ChunkingOptions {
  targetChunkSize?: number;
  overlap?: number;
  orgId?: string;
}

export function chunkSource(source: DiscoveredSource, options: ChunkingOptions = {}): DocumentChunk[] {
  // About 500 word tokens in English prose, using a conservative 4 chars/token estimate.
  const targetSize = options.targetChunkSize ?? Number(process.env.RAG_CHUNK_MAX_CHARS ?? 2000);
  const overlap = options.overlap ?? Number(process.env.RAG_CHUNK_OVERLAP_CHARS ?? 300);
  const orgId = options.orgId ?? 'hirenova';
  const now = new Date().toISOString();

  const content = source.content.replace(/\r\n/g, '\n').trim();
  if (!content) return [];

  // Split by markdown headings if present
  const sectionRegex = /(^#{1,3}\s+.+$)/m;
  const rawSections = content.split(/(?=^#{1,3}\s+)/m).map((s) => s.trim()).filter(Boolean);

  const chunks: DocumentChunk[] = [];
  let chunkIndex = 0;

  for (const rawSection of rawSections) {
    const headingMatch = rawSection.match(/^#{1,3}\s+(.+)$/m);
    const sectionName = headingMatch ? headingMatch[1].trim() : undefined;

    // If section is short enough, keep it as single chunk
    if (rawSection.length <= targetSize + overlap) {
      const chunkText = rawSection;
      const contentHash = createHash('sha256').update(chunkText).digest('hex');
      const chunkId = `${source.type}:${encodeURIComponent(source.path)}:${source.hash}:${chunkIndex++}`;

      const metadata: ChunkMetadata = {
        chunkId,
        orgId,
        sourceType: source.type,
        sourcePath: source.path,
        title: source.title,
        ...(sectionName ? { section: sectionName } : {}),
        contentHash,
        docHash: source.hash,
        createdAt: source.lastModified ?? now,
        updatedAt: now,
        ...source.metadata
      };

      chunks.push({ id: chunkId, text: chunkText, metadata });
    } else {
      // Split section into paragraphs or sliding windows
      const paragraphs = rawSection.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
      let currentChunkText = '';

      for (const paragraph of paragraphs) {
        if (paragraph.length > targetSize) {
          if (currentChunkText.trim()) {
            const textToCommit = sectionName && !currentChunkText.startsWith('#') ? `[${sectionName}]\n\n${currentChunkText}` : currentChunkText;
            const contentHash = createHash('sha256').update(textToCommit).digest('hex');
            const chunkId = `${source.type}:${encodeURIComponent(source.path)}:${source.hash}:${chunkIndex++}`;
            chunks.push({ id: chunkId, text: textToCommit, metadata: { chunkId, orgId, sourceType: source.type, sourcePath: source.path, title: source.title, ...(sectionName ? { section: sectionName } : {}), contentHash, docHash: source.hash, createdAt: source.lastModified ?? now, updatedAt: now, ...source.metadata } });
            currentChunkText = '';
          }
          for (let offset = 0; offset < paragraph.length; offset += Math.max(1, targetSize - overlap)) {
            const fragment = paragraph.slice(offset, offset + targetSize).trim();
            if (!fragment) continue;
            const textToCommit = sectionName ? `[${sectionName}]\n\n${fragment}` : fragment;
            const contentHash = createHash('sha256').update(textToCommit).digest('hex');
            const chunkId = `${source.type}:${encodeURIComponent(source.path)}:${chunkIndex++}`;
            chunks.push({ id: chunkId, text: textToCommit, metadata: { chunkId, orgId, sourceType: source.type, sourcePath: source.path, title: source.title, ...(sectionName ? { section: sectionName } : {}), contentHash, docHash: source.hash, createdAt: source.lastModified ?? now, updatedAt: now, ...source.metadata } });
          }
          continue;
        }
        if (!currentChunkText) {
          currentChunkText = paragraph;
        } else if (currentChunkText.length + paragraph.length + 2 <= targetSize) {
          currentChunkText += `\n\n${paragraph}`;
        } else {
          // Commit current chunk
          const textToCommit = sectionName && !currentChunkText.startsWith('#')
            ? `[${sectionName}]\n\n${currentChunkText}`
            : currentChunkText;

          const contentHash = createHash('sha256').update(textToCommit).digest('hex');
          const chunkId = `${source.type}:${encodeURIComponent(source.path)}:${source.hash}:${chunkIndex++}`;

          chunks.push({
            id: chunkId,
            text: textToCommit,
            metadata: {
              chunkId,
              orgId,
              sourceType: source.type,
              sourcePath: source.path,
              title: source.title,
              ...(sectionName ? { section: sectionName } : {}),
              contentHash,
              docHash: source.hash,
              createdAt: source.lastModified ?? now,
              updatedAt: now,
              ...source.metadata
            }
          });

          // Start next chunk with overlap from end of previous
          const tail = currentChunkText.slice(-overlap);
          currentChunkText = `${tail}\n\n${paragraph}`;
        }
      }

      if (currentChunkText.trim()) {
        const textToCommit = sectionName && !currentChunkText.startsWith('#')
          ? `[${sectionName}]\n\n${currentChunkText}`
          : currentChunkText;

        const contentHash = createHash('sha256').update(textToCommit).digest('hex');
        const chunkId = `${source.type}:${encodeURIComponent(source.path)}:${source.hash}:${chunkIndex++}`;

        chunks.push({
          id: chunkId,
          text: textToCommit,
          metadata: {
            chunkId,
            orgId,
            sourceType: source.type,
            sourcePath: source.path,
            title: source.title,
            ...(sectionName ? { section: sectionName } : {}),
            contentHash,
            docHash: source.hash,
            createdAt: source.lastModified ?? now,
            updatedAt: now,
            ...source.metadata
          }
        });
      }
    }
  }

  return chunks;
}

export function chunkAllSources(sources: DiscoveredSource[], options: ChunkingOptions = {}): Map<string, DocumentChunk[]> {
  const result = new Map<string, DocumentChunk[]>();
  for (const source of sources) {
    const chunks = chunkSource(source, options);
    result.set(source.path, chunks);
  }
  return result;
}
