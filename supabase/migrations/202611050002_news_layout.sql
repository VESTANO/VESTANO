begin;

alter table public.news_posts add column if not exists card_width text not null default 'standard'
  check (card_width in ('standard', 'wide', 'full'));
alter table public.news_posts add column if not exists image_position text not null default 'center'
  check (image_position in ('top', 'center', 'bottom'));
alter table public.news_posts add column if not exists display_order bigint not null default 0;
alter table public.news_posts add column if not exists deleted_at timestamptz;
alter table public.news_posts add column if not exists legacy_key text unique;
alter table public.news_posts drop constraint if exists news_posts_status_check;
alter table public.news_posts add constraint news_posts_status_check
  check (status in ('draft', 'published', 'archived', 'deleted'));

-- Import the four stories already present on the website, without inventing
-- article content. The legacy keys also preserve existing incoming anchors.
-- Rerunning this migration never recreates a story moved to Trash.
insert into public.news_posts (id, legacy_key, title, category, summary, body, status) values
  ('a12ee5c0-ec33-4a90-80b1-000000000001', 'gcc-expansion', 'GCC expansion footprint', 'Press release',
   'Vestano International Pvt Ltd continues expanding its modern trade consultancy footprint across GCC markets with structured retail transformation support.',
   'Vestano International Pvt Ltd continues expanding its modern trade consultancy footprint across GCC markets with structured retail transformation support.', 'published'),
  ('a12ee5c0-ec33-4a90-80b1-000000000002', 'iso-milestone', 'ERP and StorePilot milestones', 'Press release',
   'Edge Market ERP and StorePilot continue to strengthen Vestano''s technology-led operational positioning through disciplined implementation and performance standards.',
   'Edge Market ERP and StorePilot continue to strengthen Vestano''s technology-led operational positioning through disciplined implementation and performance standards.', 'published'),
  ('a12ee5c0-ec33-4a90-80b1-000000000003', 'growth-milestones', 'Track growth milestones', 'Corporate updates',
   'Stay updated on company movements, strategic wins, and service expansions that shape Vestano''s evolving market presence.',
   'Stay updated on company movements, strategic wins, and service expansions that shape Vestano''s evolving market presence.', 'published'),
  ('a12ee5c0-ec33-4a90-80b1-000000000004', 'retail-change', 'Retail change in action', 'Transformation stories',
   'We share selected snapshots of operational upgrades, process transformations, and technology implementations across retail and infrastructure projects.',
   'We share selected snapshots of operational upgrades, process transformations, and technology implementations across retail and infrastructure projects.', 'published')
on conflict do nothing;

-- Keep any articles added through the admin before this upgrade first.
do $$ begin
if not exists (select 1 from pg_trigger where tgrelid = 'public.news_posts'::regclass and tgname = 'place_news_post') then
with positions as (
  select id, row_number() over (
    order by case when legacy_key is null then 0 else 1 end,
      case when legacy_key is not null then id end,
      published_at desc nulls last, created_at desc, id
  ) - 1 as position from public.news_posts
)
update public.news_posts p set display_order = positions.position
from positions where p.id = positions.id;
end if;
end $$;

create index if not exists news_posts_display_idx
  on public.news_posts (display_order, id) where status = 'published';

-- New stories start at the top. Serialize inserts and moves so concurrent
-- editors cannot leave a partial swap or give two new stories the same rank.
create or replace function private.place_news_post()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(786321094);
  select coalesce(min(display_order), 0) - 1 into new.display_order from public.news_posts;
  return new;
end;
$$;
drop trigger if exists place_news_post on public.news_posts;
create trigger place_news_post before insert on public.news_posts
for each row execute function private.place_news_post();

create or replace function private.stamp_news_deletion()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.deleted_at := case when new.status = 'deleted'
    then case when tg_op = 'UPDATE' then coalesce(old.deleted_at, now()) else now() end
    else null end;
  if tg_op = 'UPDATE' then new.legacy_key := old.legacy_key; end if;
  return new;
end;
$$;
drop trigger if exists stamp_news_deletion on public.news_posts;
create trigger stamp_news_deletion before insert or update on public.news_posts
for each row execute function private.stamp_news_deletion();

create or replace function public.move_news_post(p_post_id uuid, p_direction text, p_scope text default 'all')
returns void language plpgsql security invoker set search_path = '' as $$
declare
  target public.news_posts;
  neighbor public.news_posts;
begin
  if not private.is_news_admin() then raise exception 'News administrator access required' using errcode = '42501'; end if;
  if p_direction not in ('up', 'down') or p_direction is null then raise exception 'Choose up or down'; end if;
  if p_scope not in ('all', 'draft', 'published', 'archived') or p_scope is null then raise exception 'Choose a story list'; end if;
  perform pg_advisory_xact_lock(786321094);
  -- Normalize ranks, including any ties, before moving exactly one position.
  with positions as (
    select id, row_number() over (order by display_order, id) - 1 as position
    from public.news_posts where status <> 'deleted'
  ) update public.news_posts p set display_order = positions.position
    from positions where p.id = positions.id and p.display_order <> positions.position;
  select * into target from public.news_posts where id = p_post_id and status <> 'deleted' and (p_scope = 'all' or status = p_scope) for update;
  if not found then raise exception 'Story no longer exists in this list'; end if;
  if p_direction = 'up' then
    select * into neighbor from public.news_posts
      where status <> 'deleted' and (p_scope = 'all' or status = p_scope) and display_order < target.display_order
      order by display_order desc, id desc limit 1 for update;
  else
    select * into neighbor from public.news_posts
      where status <> 'deleted' and (p_scope = 'all' or status = p_scope) and display_order > target.display_order
      order by display_order, id limit 1 for update;
  end if;
  if found then
    update public.news_posts set display_order = case when id = target.id then neighbor.display_order else target.display_order end
    where id in (target.id, neighbor.id);
  end if;
end;
$$;
revoke all on function public.move_news_post(uuid, text, text) from public, anon;
grant execute on function public.move_news_post(uuid, text, text) to authenticated;

-- Existing RLS already restricts all content/layout/deletion updates to admins.
-- Delete is reversible: a deleted row and its private cover remain in Trash.
-- Neither public nor admin browser clients receive hard-delete privileges.
commit;
