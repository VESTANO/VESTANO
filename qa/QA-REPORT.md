# Website QA report

Date: 2026-10-24

## Scope and coverage

- 47 static HTML routes discovered and loaded directly through the local server.
- 533 internal and external link references inspected; all local file targets resolved.
- 177 images inspected; all had valid local files and alt text.
- 105 buttons and 0 forms inventoried. There is no backend, authentication, checkout, or admin surface in this project.
- All requested viewport widths were checked: 320, 375, 390, 430, 768, 1024, 1280, 1440, and 1920px.
- 11 portfolio project-detail routes were checked at all nine widths, including gallery thumbnail changes.

## Results

PASS — Static route and asset audit. No missing files, duplicate IDs, missing anchors, broken images, or missing image alt attributes.

PASS — Responsive layout audit. 423 page/viewport combinations passed without horizontal overflow, broken images, or missing H1 headings.

PASS — Desktop and mobile navigation menus, business dropdown, search matching, empty search state, carousel boundaries, carousel keyboard controls, article navigation, browser Forward/Back, footer position restoration, and refresh state.

PASS — Contact dialog sizing at all nine widths, Escape close, focus return, and Tab/Shift+Tab focus trapping.

PASS — Assistant empty input, long input, loading completion, and literal text rendering. User input is now inserted as text instead of interpreted HTML.

FIXED — Article headings could overflow at 320px. Added safe word wrapping to `.article-wrap h1`.

FIXED — Article-page header links for Insights, Services, Industries, Careers, and About us returned to the homepage without opening the selected menu. They now preserve the corresponding `?menu=` destination.

FIXED — The assistant loaded the complete website knowledge set on every page visit. Loading now begins when the assistant is opened.

FIXED — “Your ESSAE hardware supply partner” now uses the requested “Partner” capitalization.

BLOCKED — The homepage “Choose region” button has no configured region list or destination mapping, so its intended behavior cannot be verified or implemented without the required regions and URLs.

NOT TESTED — Authenticated/admin flows, payments, server/API failures, production logs, and real-device browser differences. This repository contains no backend or credentials for those surfaces.

## Evidence files

- `qa/static-results.json` — route, link, asset, anchor, and HTTP checks.
- `qa/browser-results.json` — responsive measurements for all 47 routes and nine widths.
- `qa/project-results.json` — project-detail route and gallery checks.
- `qa/interaction-results.json` — navigation, refresh, dialog, assistant, and carousel checks.
- `tests/qa_static.py` — repeatable standard-library static audit.
