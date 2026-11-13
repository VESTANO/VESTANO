import { getNewsClient, isConfigured, validatePost, imageUrl, textElement, formatNewsDate, siteRoot } from "./news-client.js?v=4";
import { compareNews, previewPosts } from "./news-render.js?v=9";
import { applyCanvasFrames, applyCardLayout, cardWidths, newPreviewId, normalizeCanvasFrame, planLayoutUpdates, reorderVisibleCards } from "./news-layout.js?v=5";
import { clearLocalParts } from "./news-local-layout.js?v=3";

const $ = id => document.getElementById(id);
const form = $("post-form");
const field = name => form.elements.namedItem(name);
let client, posts = [], selected = null, coverPath = null, dirty = false, busy = false, activeUser = null;
let recoveryMode = ["invite", "recovery"].includes(new URLSearchParams(location.hash.slice(1)).get("type"));
let previewPage = "newsroom", previewStoryId = null, previewRevision = 0, previewTimer;
let previewDeviceChosen = false;
const covers = new Map();
let layoutOrder = null;
const layoutWidths = new Map();
const layoutFrames = new Map();
const activePosts = () => posts.filter(post => post.status !== "deleted");
const hasLayoutChanges = () => Boolean(layoutOrder || layoutWidths.size || layoutFrames.size);
function formHasChanges() {
  const defaults = { category: "Company news", card_width: "standard", image_position: "center", cover_path: null };
  return Object.entries(postValues()).some(([key, value]) => value !== (selected ? selected[key] : Object.hasOwn(defaults, key) ? defaults[key] : ""));
}

function message(id, text = "", error = false) { $(id).textContent = text; $(id).classList.toggle("is-error", error); }
function showView(name) { for (const view of ["auth", "dashboard", "recovery"]) $(`${view}-view`).hidden = view !== name; $("sign-out").hidden = name === "auth"; }
function setBusy(value) {
  busy = value;
  form.querySelectorAll("input,textarea,select,button").forEach(control => { control.disabled = value || (selected?.status === "deleted" && control.id !== "restore-post"); });
  $("new-post").disabled = value; renderList(); updateLayoutControls(); syncPreviewInspector();
  // Saving, publishing, and moving to Trash temporarily disable the iframe
  // tools. Re-send the preview once the request has completed.
  if (!value) queueMicrotask(() => updatePreview());
}
function discardChanges() { return !dirty || window.confirm("Leave your unsaved changes?"); }
function postValues() { return { title: field("title").value, category: field("category").value, summary: field("summary").value, body: field("body").value, image_alt: field("image_alt").value, cover_path: coverPath, card_width: field("card_width").value, image_position: field("image_position").value }; }
function storyLabel(post) { return post?.title?.trim() || "Image-only story"; }
function statusBadge(status) { return textElement("span", status === "deleted" ? "Trash" : status, `badge ${status}`); }
async function coverUrl(path) {
  if (!path) return null;
  if (!covers.has(path)) covers.set(path, { expires: Date.now() + 50 * 60000, value: imageUrl(client, path) });
  if (covers.get(path).expires < Date.now()) { covers.delete(path); return coverUrl(path); }
  return covers.get(path).value;
}

async function showCover(path) {
  const image = $("cover-preview");
  const source = await coverUrl(path);
  image.hidden = !source;
  if (source) image.src = source; else image.removeAttribute("src");
  $("remove-cover").hidden = !path;
}

// The preview inspector mirrors the existing form instead of maintaining a second
// copy of a story. That keeps drag/layout work and content edits in one draft.
function syncPreviewInspector() {
  const fields = $("preview-inspector-fields");
  if (!fields) return;
  const editable = Boolean(selected) && selected.status !== "deleted";
  fields.hidden = !editable;
  $("preview-open-full-editor").hidden = !selected;
  $("preview-inspector-title").textContent = selected ? (editable ? "Quick edit this card" : "This story is in Trash") : "Select a card to edit";
  $("preview-inspector-help").textContent = selected
    ? (editable ? "Changes appear below immediately. Save draft keeps the story private; Publish / update makes a saved story public." : "Restore this story in the full editor before making changes.")
    : "Choose Quick edit on a card below. Changes appear in the visitor preview immediately, but are not saved until you choose Save draft or Publish / update.";
  if (!editable) { syncLocalLayoutInspector(); return; }
  for (const name of ["title", "category", "summary", "body", "image_alt", "card_width", "image_position"]) {
    const control = document.querySelector(`[data-preview-field="${name}"]`);
    if (control) { control.value = field(name).value; control.disabled = busy; }
  }
  $("preview-save-draft").disabled = busy;
  $("preview-publish").disabled = busy;
  $("preview-delete").hidden = !editable;
  $("preview-delete").disabled = busy;
  $("preview-save-draft").textContent = selected.status === "published" ? "Move to draft" : "Save draft";
  $("preview-publish").textContent = selected.status === "published" ? "Update published story" : "Publish story";
  syncLocalLayoutInspector();
}

function syncLocalLayoutInspector() {
  const controls = $("local-layout-controls");
  if (!controls) return;
  const editable = Boolean(selected?.id) && selected.status !== "deleted";
  controls.hidden = !editable;
}

async function editPost(post = null) {
  if (!discardChanges()) return;
  if (!selected) { layoutWidths.delete(newPreviewId); layoutFrames.delete(newPreviewId); if (layoutOrder) layoutOrder = layoutOrder.filter(id => id !== newPreviewId); }
  selected = post;
  form.reset();
  for (const name of ["title", "category", "summary", "body", "image_alt", "card_width", "image_position"]) field(name).value = post?.[name] || ({ category: "Company news", card_width: "standard", image_position: "center" }[name] || "");
  field("card_width").value = layoutWidths.get(post?.id || newPreviewId) || field("card_width").value;
  coverPath = post?.cover_path || null;
  dirty = false;
  $("editor-title").textContent = post ? "Edit story" : "New story";
  $("editor-meta").textContent = post ? `Last saved ${formatNewsDate(post.updated_at)}` : "Start with a title. Your changes stay private until published.";
  $("editor-status").replaceWith(Object.assign(statusBadge(post?.status || "draft"), { id: "editor-status" }));
  $("save-draft").textContent = post?.status === "published" ? "Move to draft" : "Save draft";
  $("publish-post").textContent = post?.status === "published" ? "Update published story" : "Publish story";
  $("archive-post").hidden = !post || post.status === "archived";
  const trashed = post?.status === "deleted";
  $("archive-post").hidden ||= trashed;
  $("delete-post").hidden = !post || trashed;
  $("restore-post").hidden = !trashed;
  $("save-draft").hidden = trashed; $("publish-post").hidden = trashed; $("preview-post").hidden = trashed;
  if (trashed) $("editor-meta").textContent = "This story is in Trash and hidden from visitors. Restore it as a draft to edit it.";
  message("editor-message");
  setBusy(busy);
  await showCover(coverPath);
  previewStoryId = post?.id || "preview-new-story";
  syncPreviewInspector();
  await updatePreview();
}

function renderList() {
  const query = $("post-search").value.trim().toLowerCase();
  const filter = $("post-filter").value;
  const ordered = applyCardLayout(posts, layoutOrder, layoutWidths).filter(post => filter === "all" ? post.status !== "deleted" : post.status === filter);
  const shown = ordered.filter(post => `${post.title} ${post.category}`.toLowerCase().includes(query));
  $("post-count").textContent = `${shown.length} ${shown.length === 1 ? "story" : "stories"}`;
  const nodes = shown.map(post => {
    const item = textElement("div", "", `story-item${selected?.id === post.id ? " is-selected" : ""}`);
    const button = textElement("button", "", "story-card");
    button.type = "button";
    button.append(statusBadge(post.status), textElement("h3", storyLabel(post)), textElement("p", `${post.category} · ${formatNewsDate(post.updated_at)}`));
    button.addEventListener("click", () => { if (!busy) editPost(post); });
    item.append(button);
    if (post.status !== "deleted") {
      const controls = textElement("div", "", "story-order");
      controls.append(textElement("span", `${ordered.indexOf(post) + 1} · ${post.card_width || "standard"}`));
      for (const [direction, label] of [["up", "↑"], ["down", "↓"]]) {
        const move = textElement("button", label); move.type = "button";
        move.setAttribute("aria-label", `Move ${storyLabel(post)} ${direction}`);
        move.disabled = busy || hasLayoutChanges() || (direction === "up" ? ordered.indexOf(post) === 0 : ordered.indexOf(post) === ordered.length - 1);
        if (hasLayoutChanges()) move.title = "Save or discard the preview layout before using sidebar arrows.";
        move.addEventListener("click", () => movePost(post.id, direction)); controls.append(move);
      }
      item.append(controls);
    }
    return item;
  });
  $("post-list").replaceChildren(...(nodes.length ? nodes : [textElement("p", posts.length ? "No stories match this search." : "Your newsroom is ready for its first story.", "empty-list")]));
}

async function loadPosts() {
  const all = [];
  for (let offset = 0; ; offset += 250) {
    const { data, error } = await client.from("news_posts").select("*").order("display_order").order("id").range(offset, offset + 249);
    if (error) throw error;
    all.push(...data); if (data.length < 250) break;
  }
  posts = all.sort(compareNews);
  if (selected) selected = posts.find(post => post.id === selected.id) || selected;
  renderList();
}

async function movePost(id, direction) {
  if (busy) return;
  setBusy(true); message("dashboard-message", "Saving story order…");
  try {
    const filter = $("post-filter").value;
    const { error } = await client.rpc("move_news_post", { p_post_id: id, p_direction: direction, p_scope: filter === "deleted" ? "all" : filter });
    if (error) throw error;
    await loadPosts(); await updatePreview();
    message("dashboard-message", "Story order saved. The newsroom and preview use this order.");
  } catch (error) { message("dashboard-message", `Order could not be saved: ${error.message}`, true); }
  finally { setBusy(false); }
}

async function activateSession(session, recovery = false) {
  if (!session) { activeUser = null; showView("auth"); return; }
  if (activeUser === session.user.id && !recovery) return;
  const { data: identity, error: identityError } = await client.auth.getUser();
  const { data: permitted, error: permissionError } = await client.rpc("news_admin_access");
  if (identityError || !identity.user || permissionError || permitted !== true) {
    await client.auth.signOut();
    activeUser = null;
    message("auth-message", permissionError ? "Admin access could not be verified. Check the project setup or contact your website administrator." : "This account does not have news administrator access.", true);
    return;
  }
  activeUser = identity.user.id;
  if (recovery) { recoveryMode = true; showView("recovery"); return; }
  showView("dashboard");
  try { await loadPosts(); await editPost(posts.find(post => post.status === "published") || null); }
  catch (error) { message("dashboard-message", `Stories could not be loaded: ${error.message}`, true); }
}

$("login-form").addEventListener("submit", async event => {
  event.preventDefault();
  $("login-button").disabled = true;
  message("auth-message", "Signing in…");
  try {
    const { data, error } = await client.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value });
    $("password").value = "";
    if (error) throw new Error("The email or password is incorrect, or the account has not been confirmed.");
    await activateSession(data.session);
  } catch (error) { message("auth-message", error.message, true); }
  finally { $("login-button").disabled = false; }
});

$("reset-password").addEventListener("click", async () => {
  if (!$("email").reportValidity()) return;
  $("reset-password").disabled = true;
  try {
    const { error } = await client.auth.resetPasswordForEmail($("email").value.trim(), { redirectTo: new URL("admin/", siteRoot).href });
    if (error) throw error;
    message("auth-message", "If this email belongs to an existing account, a password reset link will arrive shortly.");
  } catch (error) {
    const localPreview = ["localhost", "127.0.0.1"].includes(location.hostname);
    const detail = error instanceof Error ? error.message : "Unknown Supabase error";
    message(
      "auth-message",
      localPreview
        ? `The reset email could not be requested: ${detail}`
        : "The reset email could not be requested. Please try again later.",
      true,
    );
  }
  finally { $("reset-password").disabled = false; }
});

$("recovery-form").addEventListener("submit", async event => {
  event.preventDefault();
  if ($("new-password").value !== $("confirm-password").value) { message("recovery-message", "The passwords do not match.", true); return; }
  const button = event.submitter;
  button.disabled = true;
  try {
    const { error } = await client.auth.updateUser({ password: $("new-password").value });
    if (error) throw error;
    $("recovery-form").reset();
    await client.auth.signOut();
    recoveryMode = false;
    showView("auth");
    message("auth-message", "Your password is saved. Sign in to continue.");
  } catch (error) { message("recovery-message", error.message, true); }
  finally { button.disabled = false; }
});

$("sign-out").addEventListener("click", async () => {
  if (!discardChanges()) return;
  if (hasLayoutChanges() && !window.confirm("Discard your unsaved preview layout and sign out?")) return;
  await client.auth.signOut();
  activeUser = null; posts = []; selected = null; dirty = false; recoveryMode = false;
  layoutOrder = null; layoutWidths.clear(); layoutFrames.clear();
  form.reset(); $("post-list").replaceChildren(); showView("auth");
  message("auth-message", "You have signed out.");
});
$("new-post").addEventListener("click", () => { if (!busy) { showWorkspace(false); editPost(); } });
$("post-search").addEventListener("input", renderList);
$("post-filter").addEventListener("change", renderList);
function recordFormInput(event) {
  dirty = formHasChanges();
  if (event.target.name === "card_width") {
    const id = selected?.id || newPreviewId;
    if (field("card_width").value === (selected?.card_width || "standard")) layoutWidths.delete(id); else layoutWidths.set(id, field("card_width").value);
    updateLayoutControls(); renderList();
  }
  syncPreviewInspector();
  clearTimeout(previewTimer); previewTimer = setTimeout(updatePreview, 200);
}
form.addEventListener("input", recordFormInput);

for (const control of document.querySelectorAll("[data-preview-field]")) {
  control.addEventListener("input", () => {
    if (!selected || busy) return;
    const target = field(control.dataset.previewField);
    target.value = control.value;
    target.dispatchEvent(new Event("input", { bubbles: true }));
  });
  control.addEventListener("change", () => {
    if (!selected || busy) return;
    const target = field(control.dataset.previewField);
    target.value = control.value;
    target.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

$("reset-local-layout").addEventListener("click", () => { if (selected?.id && !busy) { clearLocalParts(selected.id); updatePreview(); } });
$("preview-save-draft").addEventListener("click", () => { if (selected && !busy) form.requestSubmit($("save-draft")); });
$("preview-publish").addEventListener("click", () => { if (selected && !busy) form.requestSubmit($("publish-post")); });
$("preview-delete").addEventListener("click", () => {
  if (!selected || busy || selected.status === "deleted") return;
  $("delete-description").textContent = storyLabel(selected);
  $("delete-dialog").showModal();
});
for (const id of ["preview-open-full-editor", "preview-more-options"]) $(id).addEventListener("click", () => showWorkspace(false));
window.addEventListener("beforeunload", event => { if (dirty || hasLayoutChanges()) { event.preventDefault(); event.returnValue = ""; } });

$("cover-file").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
    message("editor-message", "Choose a JPG, PNG, or WebP image smaller than 5 MB.", true); event.target.value = ""; return;
  }
  setBusy(true); message("editor-message", "Uploading cover image…");
  try {
    const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
    const path = `${crypto.randomUUID()}.${extension}`;
    const { error } = await client.storage.from("news-images").upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    coverPath = path; dirty = true;
    await showCover(path);
    await updatePreview();
    message("editor-message", "Image uploaded. Add an image description, then save your story.");
  } catch (error) { message("editor-message", error.message, true); }
  finally { setBusy(false); event.target.value = ""; }
});
$("remove-cover").addEventListener("click", () => { coverPath = null; field("image_alt").value = ""; dirty = true; showCover(null); updatePreview(); });

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy) return;
  const status = event.submitter?.dataset.status;
  if (!["draft", "published"].includes(status)) return;
  setBusy(true); message("editor-message", "Saving your story…");
  try {
    const values = { ...validatePost(postValues()), status };
    const query = selected ? client.from("news_posts").update(values).eq("id", selected.id) : client.from("news_posts").insert(values);
    const { data, error } = await query.select().single();
    if (error) throw error;
    const previousId = selected?.id || newPreviewId;
    if (layoutOrder) layoutOrder = layoutOrder.map(id => id === previousId ? data.id : id);
    layoutWidths.delete(previousId);
    dirty = false;
    await loadPosts();
    await editPost(data);
    message("editor-message", status === "published" ? "Published. Your story is now available in the newsroom." : "Draft saved. Only administrators can see it.");
  } catch (error) { message("editor-message", error.message, true); }
  finally { setBusy(false); }
});

$("preview-post").addEventListener("click", () => { previewStoryId = selected?.id || "preview-new-story"; setPreviewPage("article"); showWorkspace(true); });
$("archive-post").addEventListener("click", () => $("archive-dialog").showModal());
$("cancel-archive").addEventListener("click", () => $("archive-dialog").close());
$("confirm-archive").addEventListener("click", async () => {
  if (!selected || busy) return;
  $("archive-dialog").close(); setBusy(true);
  try {
    const { data, error } = await client.from("news_posts").update({ status: "archived" }).eq("id", selected.id).select().single();
    if (error) throw error;
    dirty = false; await loadPosts(); await editPost(data);
    message("editor-message", "Story archived. Save it as a draft when you want to restore it.");
  } catch (error) { message("editor-message", error.message, true); }
  finally { setBusy(false); }
});

$("delete-post").addEventListener("click", () => {
  if (!selected || busy) return;
  $("delete-description").textContent = storyLabel(selected);
  $("delete-dialog").showModal();
});
$("cancel-delete").addEventListener("click", () => $("delete-dialog").close());
$("confirm-delete").addEventListener("click", async () => {
  if (!selected || busy) return;
  $("delete-dialog").close();
  await changeStoryStatus("deleted", "Story deleted and moved to Trash. It is no longer visible to visitors.");
});
$("restore-post").addEventListener("click", () => changeStoryStatus("draft", "Restored as a private draft. Review it before publishing."));

async function changeStoryStatus(status, success) {
  if (!selected || busy) return;
  setBusy(true);
  try {
    const { data, error } = await client.from("news_posts").update({ status }).eq("id", selected.id).select().single();
    if (error) throw error;
    dirty = false;
    if (status === "deleted") $("post-filter").value = "deleted";
    else if ($("post-filter").value === "deleted") $("post-filter").value = "draft";
    await loadPosts(); await editPost(data);
    message("editor-message", success);
  } catch (error) { message("editor-message", error.message, true); }
  finally { setBusy(false); }
}

function showWorkspace(preview) {
  $("editor-panel").hidden = preview; $("page-preview-panel").hidden = !preview;
  document.querySelector(".workspace").classList.toggle("is-preview", preview);
  for (const [id, active] of [["edit-tab", !preview], ["page-preview-tab", preview]]) {
    $(id).setAttribute("aria-selected", String(active)); $(id).tabIndex = active ? 0 : -1;
  }
  if (preview) {
    if (!previewDeviceChosen) { $("preview-device").value = window.innerWidth < 640 ? "390" : window.innerWidth < 1100 ? "768" : "1280"; previewDeviceChosen = true; }
    ensurePreviewFrame(); resizePreview(); updatePreview();
  }
}
function setPreviewPage(page) {
  previewPage = page;
  $("visual-layout-controls").hidden = page !== "newsroom";
  $("preview-newsroom").setAttribute("aria-pressed", String(page === "newsroom"));
  $("preview-article").setAttribute("aria-pressed", String(page === "article"));
  ensurePreviewFrame();
}
function ensurePreviewFrame() {
  const path = previewPage === "article" ? "news.html" : "about/newsroom.html";
  const url = new URL(`${path}?admin-preview=1`, siteRoot).href;
  const frame = $("page-preview-frame");
  frame.title = previewPage === "article" ? "Article visitor preview" : "Newsroom visitor preview";
  if (frame.src !== url) frame.src = url;
  else updatePreview();
}
function resizePreview() {
  if ($("page-preview-panel").hidden) return;
  const width = Number($("preview-device").value);
  const available = $("preview-stage").clientWidth - 20;
  const scale = Math.min(1, Math.max(0.1, available / width));
  const height = 650;
  const frame = $("page-preview-frame");
  frame.style.width = `${width}px`; frame.style.height = `${height / scale}px`; frame.style.transform = `scale(${scale})`;
  $("preview-frame-shell").style.width = `${width * scale}px`;
  $("preview-frame-shell").style.height = `${height}px`;
}
async function updatePreview() {
  const frame = $("page-preview-frame");
  if ($("page-preview-panel").hidden || !frame.getAttribute("src")) return;
  const revision = ++previewRevision;
  const edits = { ...selected, ...postValues(), status: selected?.status || "draft" };
  const visible = applyCanvasFrames(applyCardLayout(previewPosts(posts, edits, selected?.id, $("include-edits").checked), layoutOrder, layoutWidths), layoutFrames);
  const resolved = await Promise.all(visible.map(async post => ({ ...post, preview_cover_url: await coverUrl(post.cover_path) })));
  if (revision !== previewRevision) return;
  // Card placement is a desktop-only canvas tool. Smaller previews use the
  // same clean, responsive layout that visitors see.
  const layoutEditing = $("edit-preview-layout").checked && !busy && Number($("preview-device").value) >= 1280;
  frame.contentWindow.postMessage({ type: "vestano-news-preview", posts: resolved, selectedId: previewStoryId || selected?.id || newPreviewId, layoutEditing }, location.origin);
}

function updateLayoutControls() {
  const pending = hasLayoutChanges();
  $("save-preview-layout").disabled = busy || !pending;
  $("discard-preview-layout").disabled = busy || !pending;
  $("layout-state").textContent = pending ? "Unsaved layout changes" : "Layout is saved";
  $("layout-state").classList.toggle("is-pending", pending);
}
function stagePreviewResize(id, width) {
  const post = posts.find(item => item.id === id && item.status !== "deleted");
  if (!cardWidths.includes(width) || (!post && id !== newPreviewId)) return;
  if (width === (post?.card_width || "standard")) layoutWidths.delete(id); else layoutWidths.set(id, width);
  if (id === (selected?.id || newPreviewId)) { field("card_width").value = width; dirty = formHasChanges(); }
  message("preview-layout-message", hasLayoutChanges() ? "Card resized. Save layout when you are ready." : "Preview matches the saved layout.");
  updateLayoutControls(); renderList(); updatePreview();
}
function stagePreviewFrame(id, frame) {
  const post = posts.find(item => item.id === id && item.status !== "deleted");
  const normalized = normalizeCanvasFrame(frame);
  if (!post || !normalized) return;
  const edits = { ...selected, ...postValues(), status: selected?.status || "draft" };
  const visible = applyCanvasFrames(applyCardLayout(previewPosts(posts, edits, selected?.id, $("include-edits").checked), layoutOrder, layoutWidths), layoutFrames);
  // The first drag creates a full, stable canvas from the current responsive view.
  // This prevents the untouched cards from reflowing behind a positioned card.
  if (!layoutFrames.size) for (const item of visible) layoutFrames.set(item.id, normalizeCanvasFrame(item));
  layoutFrames.set(id, normalized);
  message("preview-layout-message", "Card position and size updated. Save layout when you are ready.");
  updateLayoutControls(); renderList(); updatePreview();
}
function stagePreviewMove(id, target, placement) {
  const edits = { ...selected, ...postValues(), status: selected?.status || "draft" };
  const visible = applyCardLayout(previewPosts(posts, edits, selected?.id, $("include-edits").checked), layoutOrder, layoutWidths).map(post => post.id);
  let allIds = layoutOrder ? [...layoutOrder] : activePosts().map(post => post.id);
  if (visible.includes(newPreviewId) && !allIds.includes(newPreviewId)) allIds.unshift(newPreviewId);
  const baseline = activePosts().map(post => post.id);
  if (visible.includes(newPreviewId)) baseline.unshift(newPreviewId);
  try {
    const next = reorderVisibleCards(allIds, visible, id, target, placement);
    layoutOrder = next.join() === baseline.join() ? null : next;
    message("preview-layout-message", hasLayoutChanges() ? "Story moved in the preview. Save layout when you are ready." : "Preview matches the saved layout.");
    updateLayoutControls(); renderList(); updatePreview();
  } catch (error) { message("preview-layout-message", error.message, true); }
}
$("save-preview-layout").addEventListener("click", async () => {
  if (busy || !hasLayoutChanges()) return;
  setBusy(true); updatePreview(); message("preview-layout-message", "Saving layout…");
  let saved = 0;
  try {
    await loadPosts();
    const updates = planLayoutUpdates(posts, layoutOrder, layoutWidths, layoutFrames);
    for (const change of updates) {
      // Compare the revision so another editor's changes are never overwritten.
      const { data, error } = await client.from("news_posts").update(change.values).eq("id", change.id).eq("updated_at", change.updated_at).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("A story changed in another session. Review the preview and save again.");
      saved++;
    }
    await loadPosts(); layoutOrder = null; layoutWidths.clear(); layoutFrames.clear(); dirty = formHasChanges();
    message("preview-layout-message", dirty ? "Layout saved. Your unsaved story edits are still in the editor." : "Layout saved. Visitors will see these card positions and sizes when the newsroom is available.");
  } catch (error) {
    try { await loadPosts(); } catch { /* Keep the pending layout for retry. */ }
    message("preview-layout-message", `${saved ? "Some changes were saved. " : "Layout was not saved. "}${error.message} Your remaining changes are kept in this preview.`, true);
  } finally { setBusy(false); updatePreview(); }
});
$("discard-preview-layout").addEventListener("click", () => {
  if (busy) return;
  layoutOrder = null; layoutWidths.clear(); layoutFrames.clear(); field("card_width").value = selected?.card_width || "standard";
  dirty = formHasChanges(); updateLayoutControls(); renderList(); updatePreview();
  message("preview-layout-message", "Preview layout reset to the saved positions and sizes. Your story text is unchanged.");
});
$("edit-preview-layout").addEventListener("change", updatePreview);
$("edit-tab").addEventListener("click", () => showWorkspace(false));
$("return-editor").addEventListener("click", () => showWorkspace(false));
$("page-preview-tab").addEventListener("click", () => showWorkspace(true));
for (const id of ["edit-tab", "page-preview-tab"]) $(id).addEventListener("keydown", event => {
  if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    event.preventDefault(); const preview = event.key === "End" || (event.key !== "Home" && id === "edit-tab");
    showWorkspace(preview); $(preview ? "page-preview-tab" : "edit-tab").focus();
  }
});
$("preview-newsroom").addEventListener("click", () => setPreviewPage("newsroom"));
$("preview-article").addEventListener("click", () => { previewStoryId = selected?.id || "preview-new-story"; setPreviewPage("article"); });
$("preview-device").addEventListener("change", () => { previewDeviceChosen = true; resizePreview(); });
$("include-edits").addEventListener("change", updatePreview);
new ResizeObserver(resizePreview).observe($("preview-stage"));
window.addEventListener("message", event => {
  if (event.origin !== location.origin || event.source !== $("page-preview-frame").contentWindow) return;
  if (event.data?.type === "vestano-news-preview-ready") updatePreview();
  if (event.data?.type === "vestano-news-preview-open") { previewStoryId = event.data.id; setPreviewPage("article"); }
  if (event.data?.type === "vestano-news-preview-list") setPreviewPage("newsroom");
  if (!activeUser || busy || previewPage !== "newsroom") return;
  if (event.data?.type === "vestano-news-layout-resize") stagePreviewResize(event.data.id, event.data.width);
  if (event.data?.type === "vestano-news-layout-move") stagePreviewMove(event.data.id, event.data.target, event.data.placement);
  if (event.data?.type === "vestano-news-layout-frame") stagePreviewFrame(event.data.id, event.data.frame);
  if (event.data?.type === "vestano-news-preview-select") {
    const post = posts.find(item => item.id === event.data.id);
    if (post) editPost(post).then(() => showWorkspace(true));
  }
  if (event.data?.type === "vestano-news-preview-edit") {
    const post = posts.find(item => item.id === event.data.id);
    if (post) { editPost(post).then(() => showWorkspace(true)); }
    else if (event.data.id === newPreviewId) showWorkspace(true);
  }
});

async function initialize() {
  if (!isConfigured()) { $("configuration-note").hidden = false; message("auth-message"); return; }
  try {
    client = await getNewsClient(true);
    $("login-button").disabled = false; $("reset-password").disabled = false;
    message("auth-message");
    client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") { recoveryMode = true; queueMicrotask(() => activateSession(session, true).catch(error => message("auth-message", error.message, true))); }
      if (event === "SIGNED_OUT") { activeUser = null; dirty = false; showView("auth"); }
    });
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (data.session) await activateSession(data.session, recoveryMode);
  } catch (error) { message("auth-message", "Admin sign-in is temporarily unavailable. Please check the Supabase connection.", true); }
}
initialize();
