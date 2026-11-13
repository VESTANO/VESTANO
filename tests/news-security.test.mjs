import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

let db, importedStories;
const admin = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const published = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const draft = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const publicCover = "11111111-1111-4111-8111-111111111111.png";
const draftCover = "22222222-2222-4222-8222-222222222222.png";

async function asRole(role, user = "") {
  await db.exec(`set local role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
}

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select on storage.objects to anon;
    grant select, insert, update, delete on storage.objects to authenticated;
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/202611050001_news_admin.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../supabase/migrations/202611050002_news_layout.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../supabase/migrations/202611050003_news_freeform_layout.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../supabase/migrations/202611050004_image_only_news.sql", import.meta.url), "utf8"));
  importedStories = (await db.query("select title,summary,body,status,legacy_key from public.news_posts order by display_order,id")).rows;
  await db.exec("delete from public.news_posts");
  await db.exec(`
    insert into auth.users values ('${admin}', 'info@vestanoretail.com', now()), ('${other}', 'visitor@example.test', now());
    insert into public.news_posts (id,title,category,summary,body,status,cover_path,image_alt) values
      ('${published}','Published story','Company news','A public company update.','This article is approved for public viewing.','published','${publicCover}','A public cover'),
      ('${draft}','Private draft','Company news','This summary must stay private.','This draft contains unpublished internal content.','draft','${draftCover}','A private cover');
    insert into storage.objects (bucket_id,name) values ('news-images','${publicCover}'),('news-images','${draftCover}');
  `);
});
after(async () => { await db.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback; reset role"); });

test("public visitors can read published news but cannot read drafts", async () => {
  await asRole("anon");
  const result = await db.query("select id,title from public.news_posts");
  assert.deepEqual(result.rows, [{ id: published, title: "Published story" }]);
});
test("public visitors cannot insert news", async () => {
  await asRole("anon");
  await assert.rejects(db.query("insert into public.news_posts(title,summary,body) values ('Attack','An injected summary.','An article that should never be accepted.')"), /permission denied/);
});
test("signed-in non-admins do not gain access to drafts or publishing", async () => {
  await asRole("authenticated", other);
  assert.equal((await db.query("select public.news_admin_access() as allowed")).rows[0].allowed, false);
  assert.deepEqual((await db.query("select id from public.news_posts")).rows, [{ id: published }]);
  const updated = await db.query("update public.news_posts set status='published' where id=$1 returning id", [draft]);
  assert.equal(updated.rows.length, 0);
});
test("non-admins cannot create a news post", async () => {
  await asRole("authenticated", other);
  await assert.rejects(db.query("insert into public.news_posts(title,summary,body) values ('Attack','An injected summary.','An article that should never be accepted.')"), /row-level security/);
});
test("confirmed allowlisted admin can read drafts, create, and publish", async () => {
  await asRole("authenticated", admin);
  assert.equal((await db.query("select public.news_admin_access() as allowed")).rows[0].allowed, true);
  assert.equal((await db.query("select id from public.news_posts")).rows.length, 2);
  const created = await db.query("insert into public.news_posts(title,summary,body,status) values ('A new story','An approved company summary.','An approved and complete company news article.','published') returning created_by,updated_by,published_at");
  assert.equal(created.rows[0].created_by, admin);
  assert.equal(created.rows[0].updated_by, admin);
  assert.ok(created.rows[0].published_at);
  const imageOnly = await db.query("insert into public.news_posts(cover_path,status) values ('11111111-1111-4111-8111-111111111111.jpg','published') returning title,summary,body,published_at");
  assert.equal(imageOnly.rows[0].title, '');
  assert.equal(imageOnly.rows[0].summary, '');
  assert.equal(imageOnly.rows[0].body, '');
  assert.ok(imageOnly.rows[0].published_at);
});
test("an unconfirmed allowlisted email cannot become admin", async () => {
  await db.query("update auth.users set email_confirmed_at=null where id=$1", [admin]);
  await asRole("authenticated", admin);
  assert.equal((await db.query("select public.news_admin_access() as allowed")).rows[0].allowed, false);
});
test("browser users cannot edit their own admin allowlist", async () => {
  await asRole("authenticated", other);
  await assert.rejects(db.query("insert into private.news_admins(email) values ('visitor@example.test')"), /permission denied/);
});
test("even admins cannot hard-delete news through the browser API", async () => {
  await asRole("authenticated", admin);
  await assert.rejects(db.query("delete from public.news_posts where id=$1", [published]), /permission denied/);
});
test("archiving removes a story from public reads", async () => {
  await asRole("authenticated", admin);
  await db.query("update public.news_posts set status='archived' where id=$1", [published]);
  await asRole("anon");
  assert.equal((await db.query("select id from public.news_posts")).rows.length, 0);
});
test("public image access excludes draft covers", async () => {
  await asRole("anon");
  assert.deepEqual((await db.query("select name from storage.objects")).rows, [{ name: publicCover }]);
});
test("non-admins cannot upload images", async () => {
  await asRole("authenticated", other);
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('news-images','attack.png')"), /row-level security/);
});
test("admins can read draft images and upload new covers", async () => {
  await asRole("authenticated", admin);
  assert.equal((await db.query("select name from storage.objects")).rows.length, 2);
  assert.equal((await db.query("insert into storage.objects(bucket_id,name) values ('news-images','another.png') returning name")).rows.length, 1);
});
test("image bucket is private and restricts size and content types", async () => {
  const bucket = (await db.query("select * from storage.buckets where id='news-images'")).rows[0];
  assert.equal(bucket.public, false);
  assert.equal(Number(bucket.file_size_limit), 5242880);
  assert.deepEqual(bucket.allowed_mime_types, ["image/jpeg", "image/png", "image/webp"]);
});
test("immutable timestamps and authors cannot be forged by an editor", async () => {
  const original = (await db.query("select created_at,created_by from public.news_posts where id=$1", [draft])).rows[0];
  await asRole("authenticated", admin);
  const result = (await db.query("update public.news_posts set created_at='2000-01-01',created_by=$1,published_at='2099-01-01',status='published' where id=$2 returning created_at,created_by,updated_by,published_at", [other, draft])).rows[0];
  assert.equal(String(result.created_at), String(original.created_at));
  assert.equal(result.created_by, original.created_by);
  assert.equal(result.updated_by, admin);
  assert.ok(new Date(result.published_at).getFullYear() < 2099);
});

test("the four existing website stories are imported once with their original content", () => {
  assert.deepEqual(importedStories.map(post => post.title), ['GCC expansion footprint', 'ERP and StorePilot milestones', 'Track growth milestones', 'Retail change in action']);
  assert.ok(importedStories.every(post => post.status === 'published' && post.body === post.summary && post.legacy_key));
});

test("new articles start first and order changes are atomic and persistent", async () => {
  await asRole('authenticated', admin);
  const created = (await db.query("insert into public.news_posts(title,summary,body) values ('Newest story','A new article summary.','A complete new article that starts at the top.') returning id")).rows[0].id;
  assert.equal((await db.query('select id from public.news_posts order by display_order,id')).rows[0].id, created);
  await db.query("select public.move_news_post($1,'down','all')", [created]);
  assert.equal((await db.query('select id from public.news_posts order by display_order,id')).rows[1].id, created);
  await db.query("select public.move_news_post($1,'up','all')", [created]);
  assert.equal((await db.query('select id from public.news_posts order by display_order,id')).rows[0].id, created);
});

test("non-admins and public visitors cannot reorder news", async () => {
  await asRole('authenticated', other);
  await assert.rejects(db.query("select public.move_news_post($1,'down','all')", [published]), /administrator access required/);
});

test("anonymous callers cannot execute the order function", async () => {
  await asRole('anon');
  await assert.rejects(db.query("select public.move_news_post($1,'down','all')", [published]), /permission denied/);
});

test("published-only moves skip drafts and do not change article contents", async () => {
  await asRole('authenticated', admin);
  const added = (await db.query("insert into public.news_posts(title,summary,body,status) values ('Second public story','Another public summary.','Another approved company story for the newsroom.','published') returning id")).rows[0].id;
  const original = (await db.query('select title,body from public.news_posts where id=$1', [published])).rows[0];
  await db.query("select public.move_news_post($1,'down','published')", [added]);
  assert.deepEqual((await db.query("select id from public.news_posts where status='published' order by display_order,id")).rows.map(p => p.id), [published, added]);
  assert.deepEqual((await db.query('select title,body from public.news_posts where id=$1', [published])).rows[0], original);
});

test("deletion hides stories and covers from visitors and restoration stays private", async () => {
  await asRole('authenticated', admin);
  const removed = await db.query("update public.news_posts set status='deleted',deleted_at='2000-01-01' where id=$1 returning deleted_at", [published]);
  assert.ok(new Date(removed.rows[0].deleted_at).getFullYear() > 2020);
  await asRole('anon');
  assert.equal((await db.query('select id from public.news_posts')).rows.length, 0);
  assert.equal((await db.query('select name from storage.objects')).rows.length, 0);
  await asRole('authenticated', admin);
  await db.query("update public.news_posts set status='draft' where id=$1", [published]);
  assert.equal((await db.query('select deleted_at from public.news_posts where id=$1', [published])).rows[0].deleted_at, null);
  await asRole('anon');
  assert.equal((await db.query('select id from public.news_posts')).rows.length, 0);
});

test("a visitor cannot delete news or change width, crop, or canvas layout", async () => {
  await asRole('authenticated', other);
  assert.equal((await db.query("update public.news_posts set status='deleted',card_width='full',image_position='top',layout_x=0,layout_y=0,layout_width=6,layout_height=40 where id=$1 returning id", [published])).rows.length, 0);
});

test("admin layout settings persist and invalid widths are rejected", async () => {
  await asRole('authenticated', admin);
  assert.deepEqual((await db.query("update public.news_posts set card_width='wide',image_position='top',layout_x=2,layout_y=8,layout_width=6,layout_height=48 where id=$1 returning card_width,image_position,layout_x,layout_y,layout_width,layout_height", [published])).rows[0], { card_width: 'wide', image_position: 'top', layout_x:2, layout_y:8, layout_width:6, layout_height:48 });
  await assert.rejects(db.query("update public.news_posts set layout_x=10,layout_width=3,layout_y=0,layout_height=40 where id=$1", [published]), /check constraint/);
  await db.exec('rollback');
  await asRole('authenticated', admin);
  await assert.rejects(db.query("update public.news_posts set card_width='9000px' where id=$1", [published]), /check constraint/);
});

test("rerunning the import preserves custom order and deleted legacy stories", async () => {
  const migration = (await readFile(new URL('../supabase/migrations/202611050002_news_layout.sql', import.meta.url), 'utf8')).replace(/^begin;|commit;\s*$/g, '');
  await db.exec(migration);
  await asRole('authenticated', admin);
  await db.query("update public.news_posts set status='deleted' where legacy_key='gcc-expansion'");
  await db.query("select public.move_news_post($1,'down','all')", [draft]);
  const before = (await db.query('select id,display_order,status from public.news_posts order by id')).rows;
  await db.exec('reset role');
  await db.exec(migration);
  assert.deepEqual((await db.query('select id,display_order,status from public.news_posts order by id')).rows, before);
});
