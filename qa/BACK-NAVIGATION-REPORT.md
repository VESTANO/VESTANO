# Previous-page navigation fix — 28 October 2026

Back controls now use one shared navigation trail. Internal link clicks record the selected page or menu and scroll position before leaving it. Returning consumes one step from that trail, preserving the remaining chain after refresh. The destination is explicit instead of depending on an embedded browser's native history or a homepage fallback.

The shared handler covers article Back buttons, all five section Back buttons, both business-directory Back links, and dynamically rendered project-gallery Back links. The directory now loads the shared script. Leadership, The Market, and the project overview also have a page Back control. Source pages request `script.js?v=navigation-v4` to load the updated implementation. Existing unrelated edits were preserved.

## Verification in the Codex in-app browser

204 completed checks passed, saved in `back-navigation-browser-results.json`:

- 82 distinct section/article return checks on mobile and desktop, covering every article linked from Insights, Services, Industries, Careers, and About, plus returning from each section to the prior homepage selection.
- 54 checks across widths 320, 375, 390, 430, 555, 768, 1024, 1440, and 1920px: each of the five sections returns to its source page, and The Sign's View all industries flow still returns to The Sign after refreshing the section. The 555px checks used the reported 668px viewport height.
- 30 checks for all 13 business destinations and both business-directory Back links on phone and desktop, with the directory loading the shared script.
- 24 hardware and gallery checks: all three hardware detail pages and all nine visible project galleries return to their actual source on phone and desktop.
- Six multi-step chain checks: business directory → The Sign → Industries → article, then Back to Industries, The Sign, and the directory, including a section refresh.
- Eight About-card and footer checks: the three About cards return to their source, and the footer section Back restores the footer position.

The original bare `index.html?menu=industries` route was explicitly exercised; the Sign fix no longer depends on a special `returnTo` query parameter.

JavaScript syntax and `git diff --check` passed. The refreshed static audit found no missing local files, anchors, duplicate IDs, or missing image alt attributes across 95 source/dist HTML files. Some browser automation clicks needed a fresh UI observation after scroll restoration; the completed navigation checks above exclude failed automation attempts and duplicate test records.

## Evidence and limits

- `back-navigation-browser-results.json`: completed in-app browser assertions.
- `sign-back-verified.jpg`: The Sign page displayed after using the section Back control.
- `static-results.json`: refreshed static link/file checks.

The original browser tab became stuck on a cached connection-error document after the local server stopped. The server was restored and verification continued in a fresh in-app browser tab; a working Sign page was opened for the user. These tests cover site Back controls, not the browser toolbar's Back button, and were not run on physical phones or other browser engines. With a directly opened page and no previous selection, there is no prior page to return to; the shared Back button does not invent a homepage destination.
