export interface MaterialTextBlock {
  type: 'text';
  text: string;
}

export interface MaterialTableBlock {
  type: 'table';
  rows: string[][];
}

export type MaterialContentBlock = MaterialTextBlock | MaterialTableBlock;

const CONTENT_PREFIX = 'STANDUPINDO_MATERIAL_BLOCKS:';

export function parseMaterialContent(content: string): MaterialContentBlock[] {
  if (!content.startsWith(CONTENT_PREFIX)) return [{ type: 'text', text: content }];
  try {
    const blocks = JSON.parse(content.slice(CONTENT_PREFIX.length)) as MaterialContentBlock[];
    if (Array.isArray(blocks) && blocks.every((block) => block && (block.type === 'text' || (block.type === 'table' && Array.isArray(block.rows))))) return blocks;
  } catch {
    // Keep malformed or older content readable as plain text.
  }
  return [{ type: 'text', text: content }];
}

export function serializeMaterialContent(blocks: MaterialContentBlock[]): string {
  const visibleBlocks = blocks.filter((block) => block.type === 'table' || block.text.trim());
  if (!visibleBlocks.some((block) => block.type === 'table')) {
    return visibleBlocks.map((block) => block.type === 'text' ? block.text : '').join('\n\n').trim();
  }
  return `${CONTENT_PREFIX}${JSON.stringify(visibleBlocks)}`;
}