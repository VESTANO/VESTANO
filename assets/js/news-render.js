import { textElement, formatNewsDate, siteRoot } from './news-client.js?v=4';
import { applyCanvasFrames, canvasHeight, canvasUnit, normalizeCanvasFrame } from './news-layout.js?v=5';
import { getLocalParts } from './news-local-layout.js?v=3';

export const newsListFields = 'id,title,category,summary,cover_path,image_alt,published_at,display_order,card_width,image_position,layout_x,layout_y,layout_width,layout_height,legacy_key';
export const compareNews = (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || String(a.id).localeCompare(String(b.id));

// A freehand layout belongs to this browser only. Applying it here means the
// local visitor-facing Newsroom reflects what the admin arranged, without
// writing layout coordinates to Supabase or publishing anything.
function applyLocalParts(card, post) {
  const parts = getLocalParts(post.id);
  if (!parts.custom) return;
  card.classList.add('news-card--freehand-parts');
  for (const [name, selector] of [['image', '.news-cover,.news-cover-placeholder'], ['text', '.news-card-content']]) {
    const element = card.querySelector(selector);
    if (!element) continue;
    const frame = parts[name];
    element.style.setProperty('--news-part-x', `${frame.x}%`);
    element.style.setProperty('--news-part-y', `${frame.y}%`);
    element.style.setProperty('--news-part-width', `${frame.width}%`);
    element.style.setProperty('--news-part-height', `${frame.height}%`);
  }
}

// The admin preview and the public page use the same cards and article markup.
export function renderNewsCard(post, coverUrl) {
  const card = textElement('article', '', `news-card news-card--${['standard', 'wide', 'full'].includes(post.card_width) ? post.card_width : 'standard'}`);
  card.dataset.postId = post.id;
  const frame = normalizeCanvasFrame(post);
  if (frame) {
    card.classList.add('news-card--positioned');
    card.style.setProperty('--news-x', String(frame.x));
    card.style.setProperty('--news-y', String(frame.y));
    card.style.setProperty('--news-width', String(frame.width));
    card.style.setProperty('--news-height', String(frame.height));
  }
  if (post.legacy_key) card.id = post.legacy_key;
  if (coverUrl) {
    const image = document.createElement('img');
    image.src = coverUrl; image.alt = post.image_alt || ''; image.loading = 'lazy'; image.decoding = 'async'; image.className = 'news-cover';
    image.style.objectPosition = ['top', 'center', 'bottom'].includes(post.image_position) ? post.image_position : 'center';
    card.append(image);
  } else {
    const placeholder = textElement('div', 'V', 'news-cover-placeholder'); placeholder.setAttribute('aria-hidden', 'true'); card.append(placeholder);
  }
  if (!String(post.title || '').trim() && !String(post.summary || '').trim()) {
    card.classList.add('news-card--image-only');
    applyLocalParts(card, post);
    return card;
  }
  const content = textElement('div', '', 'news-card-content');
  content.append(textElement('span', post.category, 'news-category'));
  if (post.published_at) { const time = textElement('time', formatNewsDate(post.published_at)); time.dateTime = post.published_at; content.append(time); }
  const href = new URL(`news.html?post=${encodeURIComponent(post.id)}`, siteRoot).href;
  const title = textElement('h2', ''); const link = textElement('a', post.title || 'Untitled story'); link.href = href; title.append(link);
  const read = textElement('a', 'Read story →', 'news-read-link'); read.href = href; read.setAttribute('aria-label', `Read ${post.title || 'story'}`);
  content.append(title, textElement('p', post.summary), read); card.append(content);
  applyLocalParts(card, post);
  return card;
}

// Desktop visitors see the layout prepared in the admin canvas. Narrow screens
// deliberately return to the resilient responsive grid in CSS.
export function applyNewsCanvasLayout(list, posts, forceCanvas = false) {
  const useCanvas = forceCanvas || posts.some(post => normalizeCanvasFrame(post));
  list.classList.toggle('news-free-canvas', useCanvas);
  if (!useCanvas) { list.style.removeProperty('--news-canvas-height'); return posts; }
  const framed = applyCanvasFrames(posts);
  list.style.setProperty('--news-canvas-height', `${canvasHeight(framed) * canvasUnit}px`);
  return framed;
}

export function renderNewsArticle(post, coverUrl) {
  const article = textElement('article', '', 'news-detail');
  const imageOnly = !String(post.title || '').trim() && !String(post.summary || '').trim() && !String(post.body || '').trim();
  const content = textElement('div', '', 'news-detail-content');
  if (!imageOnly) content.append(textElement('p', post.category, 'ey-kicker'), textElement('h1', post.title || 'Untitled story'), textElement('p', post.summary, 'news-detail-summary'));
  if (post.published_at) { const time = textElement('time', formatNewsDate(post.published_at)); time.dateTime = post.published_at; content.append(time); }
  if (content.childNodes.length) article.append(content);
  if (coverUrl) { const image = document.createElement('img'); image.src = coverUrl; image.alt = post.image_alt || ''; image.className = 'news-detail-cover'; article.append(image); }
  const body = textElement('div', '', 'news-detail-body');
  for (const paragraph of String(post.body || '').split(/\n\s*\n/).filter(Boolean)) body.append(textElement('p', paragraph));
  if (body.childNodes.length) article.append(body);
  return article;
}

export function previewPosts(posts, edits, selectedId, includeEdits = true) {
  const visible = posts.filter(post => post.status === 'published' && (!includeEdits || post.id !== selectedId));
  if (includeEdits && edits && (edits.title.trim() || edits.cover_path) && edits.status !== 'deleted') {
    visible.push({ ...edits, id: selectedId || 'preview-new-story', published_at: edits.published_at || new Date().toISOString(),
      display_order: selectedId ? edits.display_order : Math.min(0, ...posts.map(post => post.display_order || 0)) - 1 });
  }
  return visible.sort(compareNews);
}
