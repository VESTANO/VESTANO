begin;

-- Desktop newsroom canvas positions. Values use a 12-column by 10px-row grid
-- so the browser may safely render a saved layout without accepting arbitrary CSS.
alter table public.news_posts add column if not exists layout_x smallint;
alter table public.news_posts add column if not exists layout_y integer;
alter table public.news_posts add column if not exists layout_width smallint;
alter table public.news_posts add column if not exists layout_height smallint;

alter table public.news_posts drop constraint if exists news_posts_freeform_layout_check;
alter table public.news_posts add constraint news_posts_freeform_layout_check check (
  (layout_x is null and layout_y is null and layout_width is null and layout_height is null)
  or (
    layout_x between 0 and 11
    and layout_y between 0 and 800
    and layout_width between 1 and 12
    and layout_height between 24 and 120
    and layout_x + layout_width <= 12
  )
);

-- The existing admin-only update policy covers these fields. Public readers
-- receive the values only for published stories and the client constrains them
-- to the ranges above before applying presentation styles.
commit;
