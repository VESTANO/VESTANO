import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePost, validateConfiguration, textElement } from "../assets/js/news-client.js";
import { previewPosts } from "../assets/js/news-render.js";

const article = { title: "Vestano company update", category: "Company news", summary: "An official update from the Vestano team.", body: "A complete article that is long enough to publish." };
test("valid articles are trimmed and preserve plain text", () => {
  const value = validatePost({ ...article, title: "  Vestano update  ", body: '<script>alert("xss")</script> This is article text.' });
  assert.equal(value.title, "Vestano update");
  assert.ok(value.body.startsWith("<script>")); // Rendered as text, not executable HTML.
});
test("oversized fields and unsupported categories are rejected", () => {
  assert.throws(() => validatePost({ ...article, title: "a".repeat(161) }), /title/);
  assert.throws(() => validatePost({ ...article, summary: "a".repeat(301) }), /summary/);
  assert.throws(() => validatePost({ ...article, body: "short" }), /Upload an image/);
  assert.throws(() => validatePost({ ...article, category: "Invalid" }), /category/);
});
test("an uploaded image may be the entire news card", () => {
  const imageOnly = validatePost({ title: '', summary: '', body: '', cover_path: 'cover.png', image_alt: '' });
  assert.deepEqual(imageOnly, { title:'', category:'Company news', summary:'', body:'', cover_path:'cover.png', image_alt:'', card_width:'standard', image_position:'center' });
  assert.throws(() => validatePost({ title:'', summary:'', body:'', cover_path:null }), /Upload an image/);
});
test("secret and service role keys are rejected", () => {
  assert.throws(() => validateConfiguration({ supabaseUrl: "https://project.supabase.co", publishableKey: "sb_secret_not_a_browser_key" }), /public publishable/);
  const token = `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
  assert.throws(() => validateConfiguration({ supabaseUrl: "https://project.supabase.co", publishableKey: token }), /service_role/);
});
test("public keys and local Supabase development URLs are accepted", () => {
  validateConfiguration({ supabaseUrl: "https://project.supabase.co", publishableKey: "sb_publishable_example_public_key" });
  const token = `header.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.signature`;
  validateConfiguration({ supabaseUrl: "http://127.0.0.1:54321", publishableKey: token });
  assert.throws(() => validateConfiguration({ supabaseUrl: "http://external.example", publishableKey: token }), /HTTPS/);
});
test("untrusted story text is inserted through textContent", () => {
  globalThis.document = { createElement: tag => ({ tag, set innerHTML(_) { throw new Error("Unsafe HTML rendering"); } }) };
  const el = textElement("h1", '<img src=x onerror="alert(1)">');
  assert.equal(el.textContent, '<img src=x onerror="alert(1)">');
  delete globalThis.document;
});

test('layout choices are constrained rather than accepting arbitrary CSS', () => {
  assert.equal(validatePost({ ...article, card_width: 'wide', image_position: 'top' }).card_width, 'wide');
  assert.throws(() => validatePost({ ...article, card_width: '5000px' }), /card width/);
  assert.throws(() => validatePost({ ...article, image_position: 'url(javascript:alert(1))' }), /image position/);
});

const saved = [
  { ...article, id: 'one', status: 'published', display_order: 1 },
  { ...article, id: 'two', status: 'published', display_order: 2 },
  { ...article, id: 'draft', status: 'draft', display_order: 0 },
  { ...article, id: 'trash', status: 'deleted', display_order: -1 },
];
test('preview includes a new unsaved article first without mutating saved news', () => {
  const result = previewPosts(saved, { ...article, title: 'My unsaved story', status: 'draft' }, null, true);
  assert.deepEqual(result.map(post => post.id), ['preview-new-story', 'one', 'two']);
  assert.equal(saved.length, 4); assert.equal(saved[0].title, article.title);
});
test('preview includes a new image-only story', () => {
  const result = previewPosts(saved, { title:'', summary:'', body:'', cover_path:'image.jpg', status:'draft' }, null, true);
  assert.equal(result[0].id, 'preview-new-story');
});
test('preview replaces an edited story once and follows the stored order', () => {
  const result = previewPosts(saved, { ...saved[1], title: 'Edited headline' }, 'two', true);
  assert.equal(result.length, 2); assert.equal(result[1].title, 'Edited headline');
  assert.equal(previewPosts(saved, { ...saved[1], title: 'Edited' }, 'two', false)[1].title, article.title);
});
test('preview excludes unrelated drafts and Trash and can include the selected draft', () => {
  assert.deepEqual(previewPosts(saved, null, null).map(post => post.id), ['one', 'two']);
  assert.deepEqual(previewPosts(saved, saved[2], 'draft').map(post => post.id), ['draft', 'one', 'two']);
  assert.deepEqual(previewPosts(saved, saved[3], 'trash').map(post => post.id), ['one', 'two']);
});
