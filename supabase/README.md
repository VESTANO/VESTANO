# Vestano news administration

This integration keeps the website on GitHub Pages. Supabase provides Auth, Postgres, and private image storage.

## Configured project

The local website connects to project `jopirexpinzmbgkampcb` in the marketing account's Supabase organization. The migration below has been applied. Public sign-ups are disabled, the minimum password length is 12, and the site and redirect URLs below are configured. The confirmed `info@vestanoretail.com` administrator account has successfully signed in to the local news dashboard. Its password is chosen privately and is never stored in this repository.

The website changes have not been deployed. The news layout upgrade in `202611050002_news_layout.sql` was applied to the connected project on 5 November 2026 with explicit approval to update Supabase while keeping the website local. It imports the four stories already on the website into the shared news table, and adds saved card widths, image crop positions, ordering, and reversible deletion. Email delivery and password resets still require verification of the project's email/SMTP setup. Real image uploads and signed URLs also need a final integration check before deployment.

## Connect a dedicated project

1. Create a dedicated Supabase project for the Vestano website, separate from CRM data.
2. Run `migrations/202611050001_news_admin.sql`, then `migrations/202611050002_news_layout.sql` in its SQL editor. The migrations create the news tables, policies, and private `news-images` bucket, import the existing website stories once, and add layout controls. They allow only the confirmed email `info@vestanoretail.com` to manage news.
3. In Supabase Auth, disable public sign-ups and set the minimum password length to 12. Create the administrator with `info@vestanoretail.com`, using an invite or a password chosen privately by the account owner. Do not put a password in source code or send one in chat. Email delivery, invites, and password resets require working Supabase email/SMTP settings.
4. Set the Auth site URL to `https://vestanoretail.com`. Allow these redirect URLs:
   - `http://127.0.0.1:8766/admin/`
   - `http://localhost:8766/admin/`
   - `https://vestanoretail.com/admin/`
   - `https://www.vestanoretail.com/admin/`
5. Fill `news-config.js` with the project URL and its **public publishable key** (or legacy anon key). These values are intentionally browser-visible. Never use a secret key, service_role key, or database password.
6. Open `/admin/`, set a password through the invite/recovery flow if needed, and sign in. Create a draft, preview it, and publish when approved.

Until the project is configured, sign-in is disabled. Newsroom and admin read the same database records. The four original website stories are imported as published stories; their original paragraphs are preserved as article content. No invented sample stories are published. The admin link is in the Newsroom footer; it does not grant access by itself.

## Editing and arranging the newsroom

- Edit stories manages the title, category, summary, article text, image/description, card width (standard, wide, full row), and card image crop position.
- The sidebar shows stories in saved display order. Arrow buttons save a move atomically; status filters move within that status. New articles start at the top. Other visitors see only published records in that same order.
- Page preview embeds the real public newsroom or article page and uses the same rendering code and CSS. Choose desktop, tablet, or mobile. Include selected story and unsaved edits shows a proposed draft alongside existing published stories; switching it off shows the saved published records. Previewing never saves or publishes content. Preview messages stay within the same origin and contain no session credentials.
- In the Newsroom preview, enable **Arrange cards in the preview**. Drag a card's **Move** grip over another card to place it before or after that card. Drag the blue right edge to snap its width to the responsive grid. The width menu and arrow keys on the Move/Resize controls provide keyboard alternatives. On mobile, use the width menu; cards still fit a single column.
- Click **Save layout** to persist only order and card widths. Story text, images, and publication status are not published by this action. **Discard layout** restores saved geometry without discarding story text. Save a new story as a draft before saving its position. Turn Arrange cards off to see the clean visitor page without handles.
- Layout saves compare each story's revision to avoid overwriting another editor's changes. If a request fails after part of a save, the remaining proposed layout is retained for retry and the message reports the partial save.
- Delete story moves the record to Trash and immediately hides it and its cover from new public reads. Trash retains the article and image for restoration. Restore as draft keeps it private until explicitly published again. Browser hard deletion is intentionally unavailable.
- The legacy keys preserve the original GCC expansion and milestone incoming links. Rerunning the import does not duplicate or restore stories in Trash and preserves custom ordering.

## Access rules

- Public visitors and signed-in non-admins can read published stories and their cover images only.
- A confirmed, allowlisted email can create and edit stories, publish/unpublish, archive, and restore drafts.
- The allowlist lives in the private schema and cannot be changed from the browser.
- Admin sessions use tab-scoped storage. Sign out on shared devices.
- Story text is rendered as plain text, never executable HTML.
- Cover images accept JPEG, PNG, and WebP up to 5 MB. Private image URLs are signed for one hour. Previously issued signed URLs remain valid until expiry after a story is unpublished.
- Browser clients cannot hard-delete stories. Archiving is reversible.

## Local preview and tests

The existing static preview server continues to work:

```powershell
python -m http.server 8766 --bind 127.0.0.1
```

Run `npm install` followed by `npm run test:news` for local PostgreSQL policy tests and validation tests. PGlite runs the actual migration and policies against local Postgres with test Auth/Storage schemas; it never connects to production. Final Supabase-specific checks (Auth emails, sessions, Storage uploads, and signed URLs) still require the connected project.

The layout upgrade passes 41 local tests. Browser checks in a disposable PGlite database also covered the four imported stories, saved reordering, unsaved title and width previews, cover replacement, article preview, deletion, restoration as a private draft, and creation of a new article at the top. Desktop, tablet, and mobile previews and the mobile admin layout were checked without horizontal overflow. The ignored `.news-qa/admin-layout.html` is a clearly labelled local test copy using an ephemeral database; it does not authenticate against or modify Supabase.

After the approved Supabase upgrade, the regular signed-in admin and anonymous local visitor page both loaded all four original stories. A connected reorder was saved and then reversed to preserve the original order. The connected newsroom preview, public article text, and mobile navigation were also verified. No QA stories were added to Supabase.

Do not deploy until the database migration, administrator account, redirect URLs, and public configuration are in place and the connected-project checks pass.

Direct preview editing was also checked with real mouse drags and resize-edge drags in the disposable local database. Saved order and width survived a preview refresh, Discard restored saved geometry, and clean preview removed all editing handles. This enhancement uses the existing database fields and requires no new migration. The live news section remains temporarily removed.
