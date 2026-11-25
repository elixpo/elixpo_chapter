export function countBlockWords(blocks) {
  const parts = [];
  // Inline runs of one block are joined without spaces: a word split across
  // styles ("Hel" + bold "lo") is one word. Link labels live in `content`.
  const inline = (nodes) => {
    if (!Array.isArray(nodes)) return '';
    let out = '';
    for (const node of nodes) {
      if (typeof node === 'string') out += node;
      else if (node && typeof node === 'object') {
        if (typeof node.text === 'string') out += node.text;
        else out += inline(node.content);
      }
    }
    return out;
  };
  // Tables store { type: 'tableContent', rows: [{ cells }] } instead of an
  // inline array. A cell is { type: 'tableCell', content } in BlockNote 0.47
  // and a bare inline array in older posts.
  const tableText = (content) => (content.rows || [])
    .flatMap((row) => row?.cells || [])
    .map((cell) => inline(Array.isArray(cell) ? cell : cell?.content));
  const walk = (items) => {
    if (!Array.isArray(items)) return;
    for (const block of items) {
      const content = block?.content;
      if (content?.type === 'tableContent') parts.push(...tableText(content));
      else parts.push(inline(content));
      walk(block?.children);
    }
  };
  walk(blocks);
  const trimmed = parts.join(' ').trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
