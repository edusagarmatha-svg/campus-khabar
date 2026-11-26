export function collectMediaIds(node, ids = new Set()) {
  if (!node) return ids;
  if ((node.type === 'image' || node.type === 'video') && node.attrs && node.attrs.mediaId) {
    ids.add(Number(node.attrs.mediaId));
  }
  if (Array.isArray(node.content)) {
    node.content.forEach((child) => collectMediaIds(child, ids));
  }
  return ids;
}
