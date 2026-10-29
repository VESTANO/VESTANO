(() => {
  // Welcome visitors once per tab, and show again whenever they refresh any page.
  const navigation = performance.getEntriesByType('navigation')[0];
  const welcomeSeenKey = 'vestano-welcome-seen';
  let welcomeSeen = false;
  try {
    welcomeSeen = sessionStorage.getItem(welcomeSeenKey) === '1';
  } catch {
    // When storage is unavailable, avoid interrupting internal navigation.
    try { welcomeSeen = new URL(document.referrer).origin === location.origin; } catch {}
  }
  if (welcomeSeen && navigation?.type !== 'reload') return;

  function showWelcome(dialog) {
    if (!dialog || typeof dialog.showModal !== 'function') return;
    const previousFocus = document.activeElement;
    function dismiss() {
      dialog.close();
    }
    dialog.querySelector('.welcome-close').addEventListener('click', dismiss);
    dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
    dialog.addEventListener('close', () => {
      document.body.classList.remove('welcome-is-open');
      if (previousFocus instanceof HTMLElement && previousFocus !== document.body) previousFocus.focus({ preventScroll: true });
    });
    dialog.addEventListener('click', event => {
      if (event.target.closest('[data-welcome-warning]')) {
        dialog.querySelector('.welcome-warning').scrollIntoView({ block: 'start', behavior: 'smooth' });
        dialog.querySelector('#welcome-safety-title').focus({ preventScroll: true });
        return;
      }
      if (event.target.closest('a[href]')) dismiss();
    });
    // Native dialog makes the underlying page inert; explicitly cycle focus within it.
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const items = Array.from(dialog.querySelectorAll('button, a[href]'));
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    dialog.showModal();
    try { sessionStorage.setItem(welcomeSeenKey, '1'); } catch {}
    document.body.classList.add('welcome-is-open');
  }
  const existingDialog = document.querySelector('.vestano-welcome');
  if (existingDialog) {
    showWelcome(existingDialog);
    return;
  }
  // Reuse the homepage notice on every page, keeping one source for its content.
  const homeURL = new URL('index.html', document.currentScript.src);
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('welcome.css?v=9', homeURL).href;
  const stylesReady = new Promise((resolve, reject) => {
    stylesheet.onload = resolve;
    stylesheet.onerror = reject;
  });
  document.head.append(stylesheet);
  Promise.all([
    stylesReady,
    fetch(homeURL, { credentials: 'same-origin' }).then(response => {
      if (!response.ok) throw new Error('Welcome notice could not be loaded');
      return response.text();
    })
  ]).then(([, html]) => {
    if (document.querySelector('.vestano-welcome')) return;
    const homepage = new DOMParser().parseFromString(html, 'text/html');
    const notice = homepage.querySelector('.vestano-welcome');
    if (!notice) return;
    const dialog = document.importNode(notice, true);
    dialog.querySelectorAll('a[href]').forEach(link => {
      link.href = new URL(link.getAttribute('href'), homeURL).href;
    });
    document.body.append(dialog);
    showWelcome(dialog);
  }).catch(() => { /* The page remains usable if the notice cannot load. */ });
})();
