begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists private.news_admins (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table private.news_admins enable row level security;
revoke all on private.news_admins from public, anon, authenticated;
insert into private.news_admins (email) values ('info@vestanoretail.com') on conflict do nothing;

-- Authorization comes from a confirmed Auth identity and a server-owned list.
-- Browser users cannot read or modify that list, including their own entry.
create or replace function private.is_news_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    join private.news_admins a on a.email = lower(u.email)
    where u.id = (select auth.uid()) and u.email_confirmed_at is not null
  );
$$;
revoke all on function private.is_news_admin() from public, anon;
grant execute on function private.is_news_admin() to authenticated;

-- Safe Data API wrapper; the privileged function stays outside exposed schemas.
create or replace function public.news_admin_access()
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.is_news_admin();
$$;
revoke all on function public.news_admin_access() from public, anon;
grant execute on function public.news_admin_access() to authenticated;

create table if not exists public.news_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 3 and 160),
  category text not null default 'Company news' check (category in ('Company news', 'Press release', 'Corporate updates', 'Transformation stories', 'Team updates', 'Events')),
  summary text not null check (length(btrim(summary)) between 10 and 300),
  body text not null check (length(btrim(body)) between 20 and 20000),
  cover_path text check (cover_path is null or cover_path ~ '^[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'),
  image_alt text not null default '' check (length(image_alt) <= 180),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  check (cover_path is null or length(btrim(image_alt)) > 0),
  check (status <> 'published' or published_at is not null)
);
create index if not exists news_posts_published_idx on public.news_posts (published_at desc) where status = 'published';
alter table public.news_posts enable row level security;
revoke all on public.news_posts from anon, authenticated;
grant select on public.news_posts to anon, authenticated;
grant insert, update on public.news_posts to authenticated;

create or replace function private.stamp_news_post()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
    new.published_at := case when new.status = 'published' then now() else null end;
  else
    new.id := old.id;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.published_at := case
      when new.status = 'published' and old.status <> 'published' then now()
      else old.published_at end;
  end if;
  return new;
end;
$$;
drop trigger if exists stamp_news_post on public.news_posts;
create trigger stamp_news_post before insert or update on public.news_posts for each row execute function private.stamp_news_post();

drop policy if exists "Visitors read published news" on public.news_posts;
create policy "Visitors read published news" on public.news_posts for select to anon, authenticated
  using (status = 'published' and published_at <= now());
drop policy if exists "Admins read all news" on public.news_posts;
create policy "Admins read all news" on public.news_posts for select to authenticated
  using ((select private.is_news_admin()));
drop policy if exists "Admins create news" on public.news_posts;
create policy "Admins create news" on public.news_posts for insert to authenticated
  with check ((select private.is_news_admin()));
drop policy if exists "Admins update news" on public.news_posts;
create policy "Admins update news" on public.news_posts for update to authenticated
  using ((select private.is_news_admin())) with check ((select private.is_news_admin()));

-- Covers stay private until their article is published. No SVG or HTML uploads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('news-images', 'news-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Published news images" on storage.objects;
create policy "Published news images" on storage.objects for select to anon, authenticated
  using (bucket_id = 'news-images' and exists (
    select 1 from public.news_posts p where p.cover_path = name and p.status = 'published' and p.published_at <= now()
  ));
drop policy if exists "Admins read news images" on storage.objects;
create policy "Admins read news images" on storage.objects for select to authenticated
  using (bucket_id = 'news-images' and (select private.is_news_admin()));
drop policy if exists "Admins upload news images" on storage.objects;
create policy "Admins upload news images" on storage.objects for insert to authenticated
  with check (bucket_id = 'news-images' and (select private.is_news_admin()));

commit;
