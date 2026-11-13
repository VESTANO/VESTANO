// This is deliberately browser-only. Nothing in this file sends a layout to
// Supabase or changes the public story data.
const storagePrefix = 'vestano-local-news-parts:';
const minimumWidth = 20;
const minimumHeight = 15;

export const defaultLocalParts = Object.freeze({
  image: Object.freeze({ x: 0, y: 0, width: 100, height: 45 }),
  text: Object.freeze({ x: 0, y: 45, width: 100, height: 55 }),
  custom: false,
});

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function frame(value, fallback, minWidth = minimumWidth, minHeight = minimumHeight) {
  const width = Math.max(minWidth, Math.min(100, number(value?.width, fallback.width)));
  const height = Math.max(minHeight, Math.min(100, number(value?.height, fallback.height)));
  return { width, height, x: Math.max(0, Math.min(100 - width, number(value?.x, fallback.x))), y: Math.max(0, Math.min(100 - height, number(value?.y, fallback.y))) };
}

export function normalizeLocalParts(value = {}) {
  return { image: frame(value.image, defaultLocalParts.image), text: frame(value.text, defaultLocalParts.text), custom: value.custom === true };
}

export function getLocalParts(id) {
  if (!id || typeof localStorage === 'undefined') return normalizeLocalParts();
  try { return normalizeLocalParts(JSON.parse(localStorage.getItem(`${storagePrefix}${id}`) || '{}')); }
  catch { return normalizeLocalParts(); }
}

export function setLocalParts(id, value) {
  const parts = normalizeLocalParts({ ...value, custom: true });
  if (id && typeof localStorage !== 'undefined') localStorage.setItem(`${storagePrefix}${id}`, JSON.stringify(parts));
  return parts;
}

export function clearLocalParts(id) {
  if (id && typeof localStorage !== 'undefined') localStorage.removeItem(`${storagePrefix}${id}`);
  return normalizeLocalParts();
}
