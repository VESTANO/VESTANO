import { canvasColumns, canvasUnit, maxCanvasHeight, minCanvasHeight, normalizeCanvasFrame } from './news-layout.js?v=5';
import { defaultLocalParts, getLocalParts, setLocalParts } from './news-local-layout.js?v=3';

// Runs only inside the authenticated admin's same-origin preview iframe.
// Cards snap to a safe visual grid, but can be placed and sized independently.
export function enablePreviewLayout(list, posts, send, selectedId) {
  list.classList.add('news-layout-editing');
  const desktopCanvas = () => getComputedStyle(list).display === 'block';
  let gesture = null;
  let partGesture = null;
  const cards = [...list.querySelectorAll('.news-card')];
  const findCard = id => cards.find(card => card.dataset.postId === id);
  const frameFor = post => normalizeCanvasFrame(post);
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

  function setPartFrame(card, parts) {
    card.classList.toggle('news-card--freehand-parts', parts.custom);
    if (!parts.custom) return;
    for (const [name, selector] of [['image', '.news-cover,.news-cover-placeholder'], ['text', '.news-card-content']]) {
      const element = card.querySelector(selector);
      if (!element) continue;
      const frame = parts[name];
      element.style.setProperty('--news-part-x', `${frame.x}%`);
      element.style.setProperty('--news-part-y', `${frame.y}%`);
      element.style.setProperty('--news-part-width', `${frame.width}%`);
      element.style.setProperty('--news-part-height', `${frame.height}%`);
    }
    for (const editor of card.querySelectorAll('.freehand-part-editor')) {
      const frame = parts[editor.dataset.part];
      editor.style.left = `${frame.x}%`; editor.style.top = `${frame.y}%`;
      editor.style.width = `${frame.width}%`; editor.style.height = `${frame.height}%`;
    }
  }

  function finishPart(cancel = false) {
    if (!partGesture) return;
    const current = partGesture; partGesture = null;
    current.editor.classList.remove('is-dragging', 'is-resizing');
    if (current.handle.hasPointerCapture(current.pointer)) current.handle.releasePointerCapture(current.pointer);
    if (cancel) setPartFrame(current.card, current.originalParts);
  }

  function startPart(event, card, post, editor, part, kind) {
    if (event.button !== 0 || partGesture || gesture || !desktopCanvas()) return;
    event.preventDefault(); event.stopPropagation();
    const parts = getLocalParts(post.id);
    const originalParts = parts.custom ? parts : { ...defaultLocalParts, image: { ...defaultLocalParts.image }, text: { ...defaultLocalParts.text }, custom: true };
    const bounds = card.getBoundingClientRect();
    partGesture = { card, post, editor, part, kind, handle: event.currentTarget, pointer: event.pointerId, bounds, startX: event.clientX, startY: event.clientY, originalParts, original: { ...originalParts[part] }, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePart(event) {
    if (!partGesture || event.pointerId !== partGesture.pointer) return false;
    event.preventDefault();
    const current = partGesture;
    const deltaX = Math.round(((event.clientX - current.startX) / current.bounds.width) * 100);
    const deltaY = Math.round(((event.clientY - current.startY) / current.bounds.height) * 100);
    if (Math.hypot(deltaX, deltaY) < 1 && !current.moved) return true;
    current.moved = true;
    let frame;
    if (current.kind === 'move') {
      frame = { ...current.original, x: clamp(current.original.x + deltaX, 0, 100 - current.original.width), y: clamp(current.original.y + deltaY, 0, 100 - current.original.height) };
      current.editor.classList.add('is-dragging');
    } else {
      frame = { ...current.original, width: clamp(current.original.width + deltaX, 20, 100 - current.original.x), height: clamp(current.original.height + deltaY, 15, 100 - current.original.y) };
      current.editor.classList.add('is-resizing');
    }
    const parts = setLocalParts(current.post.id, { ...current.originalParts, [current.part]: frame });
    setPartFrame(current.card, parts);
    return true;
  }

  function addPartEditor(card, post) {
    let parts = getLocalParts(post.id);
    if (!parts.custom) parts = setLocalParts(post.id, { ...defaultLocalParts });
    setPartFrame(card, parts);
    for (const [part, label] of [['image', 'IMAGE'], ['text', 'TEXT']]) {
      const target = card.querySelector(part === 'image' ? '.news-cover,.news-cover-placeholder' : '.news-card-content');
      if (!target) continue;
      const editor = document.createElement('div');
      editor.className = 'freehand-part-editor'; editor.dataset.part = part; editor.tabIndex = 0;
      editor.setAttribute('aria-label', `Drag the ${part} area`);
      const name = document.createElement('span'); name.className = 'freehand-part-label'; name.textContent = label;
      const resize = document.createElement('button'); resize.type = 'button'; resize.className = 'freehand-part-resize'; resize.setAttribute('aria-label', `Resize ${part} area`); resize.title = `Drag to resize ${part}`;
      editor.append(name, resize); card.append(editor);
      editor.addEventListener('pointerdown', event => { if (!event.target.closest('.freehand-part-resize')) startPart(event, card, post, editor, part, 'move'); });
      resize.addEventListener('pointerdown', event => startPart(event, card, post, editor, part, 'resize'));
    }
    setPartFrame(card, parts);
  }

  function setFrame(card, frame) {
    card.style.setProperty('--news-x', String(frame.x));
    card.style.setProperty('--news-y', String(frame.y));
    card.style.setProperty('--news-width', String(frame.width));
    card.style.setProperty('--news-height', String(frame.height));
  }
  function finish(cancel = false) {
    if (!gesture) return;
    const current = gesture; gesture = null;
    current.card.classList.remove('layout-dragging', 'layout-resizing');
    if (current.handle.hasPointerCapture(current.pointer)) current.handle.releasePointerCapture(current.pointer);
    if (!cancel && current.moved) send({ type: 'vestano-news-layout-frame', id: current.id, frame: current.frame });
    else if (!cancel && current.kind === 'move') send({ type: 'vestano-news-preview-select', id: current.id });
    else setFrame(current.card, current.original);
  }
  function start(event, card, handle, kind, post) {
    if (event.button !== 0 || gesture || !desktopCanvas()) return;
    const original = frameFor(post);
    if (!original) return;
    event.preventDefault(); event.stopPropagation();
    const bounds = card.getBoundingClientRect();
    const canvas = list.getBoundingClientRect();
    gesture = { card, handle, kind, id: post.id, pointer: event.pointerId, original, frame: { ...original }, startX: event.clientX, startY: event.clientY,
      grabX: event.clientX - bounds.left, grabY: event.clientY - bounds.top, canvas, moved: false };
    handle.setPointerCapture(event.pointerId);
    handle.focus?.({ preventScroll: true });
  }
  function move(event) {
    if (movePart(event)) return;
    if (!gesture || event.pointerId !== gesture.pointer) return;
    event.preventDefault();
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 4 && !gesture.moved) return;
    gesture.moved = true;
    const column = gesture.canvas.width / canvasColumns;
    let frame;
    if (gesture.kind === 'move') {
      frame = { ...gesture.original,
        x: clamp(Math.round((event.clientX - gesture.canvas.left - gesture.grabX) / column), 0, canvasColumns - gesture.original.width),
        y: clamp(Math.round((event.clientY - gesture.canvas.top - gesture.grabY) / canvasUnit), 0, 800 - gesture.original.height) };
      gesture.card.classList.add('layout-dragging');
    } else {
      frame = { ...gesture.original,
        width: clamp(Math.round((event.clientX - gesture.canvas.left) / column) - gesture.original.x, 1, canvasColumns - gesture.original.x),
        height: clamp(Math.round((event.clientY - gesture.canvas.top) / canvasUnit) - gesture.original.y, minCanvasHeight, maxCanvasHeight) };
      gesture.card.classList.add('layout-resizing');
    }
    gesture.frame = frame; setFrame(gesture.card, frame);
  }
  const up = event => { if (partGesture?.pointer === event.pointerId) finishPart(); else if (gesture?.pointer === event.pointerId) finish(); };
  const cancel = () => { finishPart(true); finish(true); };
  const escape = event => {
    if (event.key !== 'Escape' || (!gesture && !partGesture)) return;
    event.preventDefault(); finishPart(true); finish(true);
  };

  for (const post of posts) {
    const card = findCard(post.id);
    if (!card) continue;
    card.classList.toggle('layout-selected', post.id === selectedId);
    card.tabIndex = 0;
    setPartFrame(card, getLocalParts(post.id));
    const toolbar = document.createElement('div'); toolbar.className = 'layout-card-toolbar';
    const hint = document.createElement('span'); hint.className = 'layout-drag-hint'; hint.textContent = 'Drag to place';
    const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Quick edit'; edit.setAttribute('aria-label', `Quick edit ${post.title}`); edit.title = 'Edit text and card settings without leaving the preview.';
    edit.addEventListener('click', () => send({ type: 'vestano-news-preview-edit', id: post.id }));
    const freehand = document.createElement('button'); freehand.type = 'button'; freehand.className = 'freehand-edit-button'; freehand.textContent = 'Freehand edit'; freehand.setAttribute('aria-label', `Freehand edit ${post.title}`); freehand.setAttribute('aria-pressed', 'false'); freehand.title = 'Drag and resize the image and text directly. Changes stay in this browser.';
    freehand.addEventListener('click', () => {
      const enabled = freehand.getAttribute('aria-pressed') !== 'true';
      freehand.setAttribute('aria-pressed', String(enabled));
      freehand.textContent = enabled ? 'Done editing' : 'Freehand edit';
      card.querySelectorAll('.freehand-part-editor').forEach(editor => editor.remove());
      if (enabled) addPartEditor(card, post);
    });
    toolbar.append(hint, edit, freehand); card.prepend(toolbar);
    const resize = document.createElement('button'); resize.type = 'button'; resize.className = 'layout-resize-handle'; resize.textContent = '⤢';
    resize.setAttribute('aria-label', `Resize ${post.title}`); resize.title = 'Drag to resize width and height. Arrow keys adjust its size.';
    resize.addEventListener('pointerdown', event => start(event, card, resize, 'resize', post));
    resize.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || !desktopCanvas()) return;
      event.preventDefault();
      const frame = frameFor(post); if (!frame) return;
      const next = { ...frame };
      if (event.key === 'ArrowLeft') next.width = clamp(next.width - 1, 1, canvasColumns - next.x);
      if (event.key === 'ArrowRight') next.width = clamp(next.width + 1, 1, canvasColumns - next.x);
      if (event.key === 'ArrowUp') next.height = clamp(next.height - 1, minCanvasHeight, maxCanvasHeight);
      if (event.key === 'ArrowDown') next.height = clamp(next.height + 1, minCanvasHeight, maxCanvasHeight);
      send({ type: 'vestano-news-layout-frame', id: post.id, frame: next });
    });
    card.append(resize);
    card.addEventListener('pointerdown', event => {
      if (event.target.closest('button,select,input,textarea,a,label,.freehand-part-editor')) return;
      start(event, card, card, 'move', post);
    });
    card.addEventListener('click', event => {
      if (event.target.closest('button,select,input,textarea,label')) return;
      // In tablet/mobile mode the cards remain responsive, but they can still
      // be selected for Quick edit. In the desktop canvas this also suppresses
      // the story link after a click-to-select gesture.
      event.preventDefault();
      if (!gesture && !desktopCanvas()) send({ type: 'vestano-news-preview-select', id: post.id });
    });
    card.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || event.target !== card || !desktopCanvas()) return;
      event.preventDefault();
      const frame = frameFor(post); if (!frame) return;
      const next = { ...frame };
      if (event.key === 'ArrowLeft') next.x = clamp(next.x - 1, 0, canvasColumns - next.width);
      if (event.key === 'ArrowRight') next.x = clamp(next.x + 1, 0, canvasColumns - next.width);
      if (event.key === 'ArrowUp') next.y = clamp(next.y - 1, 0, 800 - next.height);
      if (event.key === 'ArrowDown') next.y = clamp(next.y + 1, 0, 800 - next.height);
      send({ type: 'vestano-news-layout-frame', id: post.id, frame: next });
    });
  }
  list.addEventListener('pointermove', move); list.addEventListener('pointerup', up); list.addEventListener('pointercancel', cancel);
  document.addEventListener('keydown', escape);
  return () => { finishPart(true); finish(true); list.removeEventListener('pointermove', move); list.removeEventListener('pointerup', up); list.removeEventListener('pointercancel', cancel); document.removeEventListener('keydown', escape); list.classList.remove('news-layout-editing'); };
}
