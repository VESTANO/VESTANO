export const cardWidths = ['standard', 'wide', 'full'];
export const newPreviewId = 'preview-new-story';
export const canvasColumns = 12;
export const canvasUnit = 10;
export const minCanvasHeight = 24;
export const maxCanvasHeight = 120;

export function reorderCards(ids, source, target, placement = 'before') {
  if (!ids.includes(source) || !ids.includes(target) || !['before', 'after'].includes(placement)) throw new Error('Choose a story in this preview.');
  if (source === target) return [...ids];
  const result = ids.filter(id => id !== source);
  result.splice(result.indexOf(target) + (placement === 'after' ? 1 : 0), 0, source);
  return result;
}

// Move the visible cards without changing the slots of unrelated hidden drafts.
export function reorderVisibleCards(allIds, visibleIds, source, target, placement) {
  const reordered = reorderCards(visibleIds, source, target, placement);
  const visible = new Set(visibleIds);
  let index = 0;
  return allIds.map(id => visible.has(id) ? reordered[index++] : id);
}

export function resizeCardWidth(originalWidth, startPixels, delta, columnPixels, gap, columns) {
  const initialSpan = Math.min(columns, cardWidths.indexOf(originalWidth) + 1 || 1);
  const span = Math.max(1, Math.min(columns, Math.round((startPixels + delta + gap) / (columnPixels + gap))));
  if (span === initialSpan) return originalWidth;
  return cardWidths[span - 1];
}

function canvasWidthFor(post) { return post.card_width === 'full' ? 12 : post.card_width === 'wide' ? 8 : 4; }

export function normalizeCanvasFrame(frame) {
  const raw = frame && { x: frame.x ?? frame.layout_x, y: frame.y ?? frame.layout_y, width: frame.width ?? frame.layout_width, height: frame.height ?? frame.layout_height };
  if (!raw || ![raw.x, raw.y, raw.width, raw.height].every(Number.isInteger)) return null;
  if (raw.x < 0 || raw.x >= canvasColumns || raw.y < 0 || raw.y > 800 || raw.width < 1 || raw.width > canvasColumns || raw.height < minCanvasHeight || raw.height > maxCanvasHeight || raw.x + raw.width > canvasColumns) return null;
  return { x: raw.x, y: raw.y, width: raw.width, height: raw.height };
}

export function canvasFrameValues(frame) {
  const normalized = normalizeCanvasFrame(frame);
  if (!normalized) throw new Error('Choose a valid card position and size.');
  return { layout_x: normalized.x, layout_y: normalized.y, layout_width: normalized.width, layout_height: normalized.height };
}

export function defaultCanvasFrames(posts) {
  const frames = new Map();
  let x = 0, y = 0, rowHeight = 0;
  for (const post of posts) {
    const width = canvasWidthFor(post), height = 46;
    if (x + width > canvasColumns) { y += rowHeight; x = 0; rowHeight = 0; }
    frames.set(post.id, { x, y, width, height });
    x += width; rowHeight = Math.max(rowHeight, height);
    if (x === canvasColumns) { y += rowHeight; x = 0; rowHeight = 0; }
  }
  return frames;
}

export function applyCanvasFrames(posts, frames = new Map()) {
  const defaults = defaultCanvasFrames(posts);
  return posts.map(post => {
    const frame = normalizeCanvasFrame(frames.get(post.id)) || normalizeCanvasFrame(post) || defaults.get(post.id);
    return { ...post, ...canvasFrameValues(frame) };
  });
}

export function canvasHeight(posts) {
  const bottom = posts.reduce((maximum, post) => Math.max(maximum, (post.layout_y || 0) + (post.layout_height || minCanvasHeight)), 0);
  return Math.max(46, bottom + 4);
}

export function applyCardLayout(posts, order, widths, frames) {
  const ranks = new Map((order || []).map((id, index) => [id, index]));
  const arranged = posts.map(post => ({ ...post, card_width: widths.get(post.id) || post.card_width })).sort((a, b) => {
    if (!order) return (a.display_order ?? 0) - (b.display_order ?? 0) || String(a.id).localeCompare(String(b.id));
    return (ranks.get(a.id) ?? order.length) - (ranks.get(b.id) ?? order.length);
  });
  return frames ? applyCanvasFrames(arranged, frames) : arranged;
}

export function planLayoutUpdates(posts, order, widths, frames = new Map()) {
  const active = posts.filter(post => post.status !== 'deleted');
  const ids = new Set(active.map(post => post.id));
  if (order?.includes(newPreviewId) || widths.has(newPreviewId) || frames.has(newPreviewId)) throw new Error('Save the new story as a draft first, then save its layout.');
  if (order && (order.length !== ids.size || new Set(order).size !== ids.size || order.some(id => !ids.has(id)))) throw new Error('The story list changed. Discard this layout and arrange the current stories again.');
  for (const [id, width] of widths) {
    if (!ids.has(id)) throw new Error('A story was removed. Discard this layout and try again.');
    if (!cardWidths.includes(width)) throw new Error('Choose a supported card width.');
  }
  for (const [id, frame] of frames) {
    if (!ids.has(id)) throw new Error('A story was removed. Discard this layout and try again.');
    if (!normalizeCanvasFrame(frame)) throw new Error('Choose a valid card position and size.');
  }
  const updates = [];
  for (const post of active) {
    const values = {};
    if (order && post.display_order !== order.indexOf(post.id)) values.display_order = order.indexOf(post.id);
    if (widths.has(post.id) && widths.get(post.id) !== post.card_width) values.card_width = widths.get(post.id);
    if (frames.has(post.id)) {
      const frame = canvasFrameValues(frames.get(post.id));
      if (frame.layout_x !== post.layout_x || frame.layout_y !== post.layout_y || frame.layout_width !== post.layout_width || frame.layout_height !== post.layout_height) Object.assign(values, frame);
    }
    if (Object.keys(values).length) updates.push({ id: post.id, updated_at: post.updated_at, values });
  }
  return updates;
}
