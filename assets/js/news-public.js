import { getNewsClient, isConfigured, imageUrl, textElement } from './news-client.js?v=4';
import { applyNewsCanvasLayout, newsListFields, renderNewsCard, renderNewsArticle } from './news-render.js?v=9';
import { enablePreviewLayout } from './news-preview-layout.js?v=9';

const list = document.querySelector('[data-news-list]');
const detail = document.querySelector('[data-news-detail]');
const status = document.getElementById('news-status');
const preview = new URLSearchParams(location.search).get('admin-preview') === '1' && window.parent !== window;
let client, page = 0, loading = false;

async function loadNews() {
  if (loading) return;
  loading = true;
  const more = document.getElementById('news-more');
  more.disabled = true; list.setAttribute('aria-busy', 'true');
  try {
    const { data, error } = await client.from('news_posts').select(newsListFields)
      .eq('status', 'published').order('display_order').order('id').range(page * 12, page * 12 + 11);
    if (error) throw error;
    const displayed = applyNewsCanvasLayout(list, data);
    const cards = await Promise.all(displayed.map(async post => renderNewsCard(post, await imageUrl(client, post.cover_path))));
    if (page === 0) list.replaceChildren();
    list.append(...cards);
    if (!data.length && page === 0) list.append(textElement('p', 'Our next story is on its way. Check back for the latest from Vestano.', 'news-empty'));
    more.hidden = data.length < 12; more.textContent = 'More stories'; status.textContent = ''; page++;
  } catch {
    status.textContent = 'News could not be loaded. Please try again shortly.';
    more.hidden = false; more.textContent = 'Try again';
  } finally { loading = false; more.disabled = false; list.setAttribute('aria-busy', 'false'); }
}

async function loadStory() {
  const id = new URLSearchParams(location.search).get('post');
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) { status.textContent = 'This story is unavailable. Visit the newsroom for our latest updates.'; return; }
  try {
    const { data: post, error } = await client.from('news_posts').select(`${newsListFields},body`).eq('id', id).eq('status', 'published').maybeSingle();
    if (error) throw error;
    if (!post) { status.textContent = 'This story is unavailable. It may have been moved or unpublished.'; return; }
    document.title = `${post.title || 'Image'} | Vestano News`;
    detail.replaceChildren(renderNewsArticle(post, await imageUrl(client, post.cover_path))); status.textContent = '';
  } catch { status.textContent = 'This story could not be loaded. Please try again shortly.'; }
}

function storyDialog() {
  let dialog = document.getElementById('news-story-dialog');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'news-story-dialog';
  dialog.className = 'news-story-dialog';
  dialog.setAttribute('aria-label', 'News story');
  const close = document.createElement('button');
  close.type = 'button'; close.className = 'dialog-close'; close.setAttribute('aria-label', 'Close story'); close.textContent = '×';
  const content = document.createElement('div'); content.id = 'news-story-dialog-content';
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.append(close, content); document.body.append(dialog);
  return dialog;
}

async function openStoryDialog(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const dialog = storyDialog();
  const content = dialog.querySelector('#news-story-dialog-content');
  content.replaceChildren(textElement('p', 'Loading story…', 'news-status'));
  if (!dialog.open) dialog.showModal();
  try {
    const { data: post, error } = await client.from('news_posts').select(`${newsListFields},body`).eq('id', id).eq('status', 'published').maybeSingle();
    if (error) throw error;
    if (!post) throw new Error('Story unavailable');
    content.replaceChildren(renderNewsArticle(post, await imageUrl(client, post.cover_path)));
  } catch {
    content.replaceChildren(textElement('p', 'This story could not be loaded. Please try again shortly.', 'news-status'));
  }
}

function openNewsroomStory(event) {
  const link = event.target.closest('a[href]');
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin || !url.pathname.endsWith('/news.html')) return;
  const id = url.searchParams.get('post');
  if (!id) return;
  event.preventDefault(); openStoryDialog(id);
}

function initializePreview() {
  let previewData = [], previewPages = 1, layoutEditing = false, selectedId, disposeLayout;
  const more = document.getElementById('news-more');
  function renderPreviewList() {
    disposeLayout?.();
    const shown = layoutEditing ? previewData : previewData.slice(0, previewPages * 12);
    const displayed = applyNewsCanvasLayout(list, shown, layoutEditing);
    list.replaceChildren(...displayed.map(post => renderNewsCard(post, post.preview_cover_url)));
    if (!displayed.length) list.append(textElement('p', 'Our next story is on its way. Check back for the latest from Vestano.', 'news-empty'));
    more.hidden = layoutEditing || previewData.length <= shown.length;
    if (layoutEditing) disposeLayout = enablePreviewLayout(list, displayed, data => window.parent.postMessage(data, location.origin), selectedId);
  }
  status.textContent = 'Preparing page preview…';
  if (list) { list.classList.add('news-list'); more.addEventListener('click', () => { previewPages++; renderPreviewList(); }); }
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'vestano-news-preview') return;
    const posts = Array.isArray(event.data.posts) ? event.data.posts : [];
    layoutEditing = event.data.layoutEditing === true; selectedId = event.data.selectedId;
    if (list) {
      previewData = posts; renderPreviewList();
    }
    if (detail) {
      const post = posts.find(post => post.id === event.data.selectedId);
      detail.replaceChildren(...(post ? [renderNewsArticle(post, post.preview_cover_url)] : [textElement('p', 'Select or write a story to preview its article page.', 'news-empty')]));
    }
    status.textContent = '';
  });
  document.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link) return;
    event.preventDefault();
    const url = new URL(link.href);
    if (url.origin !== location.origin) return;
    if (url.pathname.endsWith('/news.html')) window.parent.postMessage({ type: 'vestano-news-preview-open', id: url.searchParams.get('post') }, location.origin);
    else if (url.pathname.endsWith('/about/newsroom.html')) window.parent.postMessage({ type: 'vestano-news-preview-list' }, location.origin);
  });
  window.parent.postMessage({ type: 'vestano-news-preview-ready' }, location.origin);
}

async function initialize() {
  if (preview) { initializePreview(); return; }
  if (!isConfigured()) { status.textContent = 'The newsroom is being connected. Please check back shortly.'; return; }
  try {
    client = await getNewsClient();
    if (list) { list.classList.add('news-list'); list.addEventListener('click', openNewsroomStory); document.getElementById('news-more').addEventListener('click', loadNews); await loadNews(); }
    if (detail) await loadStory();
  } catch { status.textContent = 'News is temporarily unavailable. Please try again shortly.'; }
}
initialize();
