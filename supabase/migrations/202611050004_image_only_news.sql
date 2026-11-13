begin;

-- A visual news card may consist solely of an uploaded cover image. Text stays
-- optional in that case; text-only stories retain the existing quality limits.
alter table public.news_posts alter column title drop not null;
alter table public.news_posts alter column title set default '';
alter table public.news_posts alter column summary drop not null;
alter table public.news_posts alter column summary set default '';
alter table public.news_posts alter column body drop not null;
alter table public.news_posts alter column body set default '';
alter table public.news_posts drop constraint if exists news_posts_title_check;
alter table public.news_posts drop constraint if exists news_posts_summary_check;
alter table public.news_posts drop constraint if exists news_posts_body_check;

-- The original anonymous table check required alt text for every uploaded
-- cover. Image-only cards intentionally permit an empty alt value.
alter table public.news_posts drop constraint if exists news_posts_check;
do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid = 'public.news_posts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%cover_path is null or length(btrim(image_alt)) > 0%'
  loop
    execute format('alter table public.news_posts drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table public.news_posts drop constraint if exists news_posts_content_or_image_check;
alter table public.news_posts add constraint news_posts_content_or_image_check check (
  cover_path is not null
  or (
    length(btrim(coalesce(title, ''))) between 3 and 160
    and length(btrim(coalesce(summary, ''))) between 10 and 300
    and length(btrim(coalesce(body, ''))) between 20 and 20000
  )
);

commit;
