import { NEWS_CONFIG } from "../../news-config.js?v=3";

export const siteRoot = new URL("../../", import.meta.url);
export const newsCategories = ["Company news", "Press release", "Corporate updates", "Transformation stories", "Team updates", "Events"];
export const isConfigured = () => Boolean(NEWS_CONFIG.supabaseUrl && NEWS_CONFIG.publishableKey);
const clients = new Map();

export function validateConfiguration(config) {
  let url;
  try { url = new URL(config.supabaseUrl); } catch { throw new Error("Use your Supabase project URL."); }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("The Supabase project must use HTTPS.");
  const key = String(config.publishableKey || "");
  if (key.startsWith("sb_publishable_") && key.length > 25) return;
  try {
    const payload = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.role === "anon") return;
  } catch { /* A browser key must be publishable or a legacy anon JWT. */ }
  throw new Error("Use a public publishable/anon key, never a secret or service_role key.");
}

export async function getNewsClient(admin = false) {
  if (!isConfigured()) throw new Error("SUPABASE_NOT_CONFIGURED");
  validateConfiguration(NEWS_CONFIG);
  if (!clients.has(admin)) {
    clients.set(admin, (async () => {
      const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm");
      return createClient(NEWS_CONFIG.supabaseUrl, NEWS_CONFIG.publishableKey, {
        auth: { persistSession: admin, autoRefreshToken: admin, detectSessionInUrl: admin,
          ...(admin ? { storage: window.sessionStorage, storageKey: "vestano-news-admin" } : {}) },
      });
    })());
  }
  return clients.get(admin);
}

export function validatePost(values) {
  const post = {
    title: String(values.title || "").trim(),
    category: String(values.category || "Company news"),
    summary: String(values.summary || "").trim(),
    body: String(values.body || "").trim(),
    cover_path: values.cover_path || null,
    image_alt: String(values.image_alt || "").trim(),
    card_width: values.card_width || "standard",
    image_position: values.image_position || "center",
  };
  if (post.title.length > 160) throw new Error("Keep the title under 160 characters.");
  if (!newsCategories.includes(post.category)) throw new Error("Choose a news category.");
  if (post.summary.length > 300) throw new Error("Keep the summary under 300 characters.");
  if (post.body.length > 20000) throw new Error("Keep the article text under 20,000 characters.");
  if (post.image_alt.length > 180) throw new Error("Keep the image description under 180 characters.");
  if (!post.cover_path && (post.title.length < 3 || post.summary.length < 10 || post.body.length < 20)) throw new Error("Upload an image, or add a title, summary, and article text.");
  if (!["standard", "wide", "full"].includes(post.card_width)) throw new Error("Choose a card width.");
  if (!["top", "center", "bottom"].includes(post.image_position)) throw new Error("Choose an image position.");
  return post;
}

export async function imageUrl(client, path) {
  if (!path) return null;
  const { data, error } = await client.storage.from("news-images").createSignedUrl(path, 3600);
  return error ? null : data.signedUrl;
}

export function textElement(tag, text, className = "") {
  const el = document.createElement(tag);
  el.textContent = text ?? "";
  if (className) el.className = className;
  return el;
}

export function formatNewsDate(value) {
  return value ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(value)) : "Draft";
}
