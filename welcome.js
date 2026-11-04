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
  const shouldOpenWelcome = !welcomeSeen || navigation?.type === 'reload';

  function showWelcome(dialog, openImmediately) {
    if (!dialog || typeof dialog.showModal !== 'function') return;
    const reopenButton = document.createElement('button');
    reopenButton.type = 'button';
    reopenButton.className = 'welcome-reopen';
    reopenButton.setAttribute('aria-label', 'Open welcome message');
    reopenButton.title = 'Open welcome message';
    reopenButton.textContent = 'V';
    reopenButton.hidden = true;
    document.body.append(reopenButton);

    function openWelcome() {
      if (!dialog.open) {
        dialog.classList.add('is-expanding');
        dialog.showModal();
      }
      reopenButton.hidden = true;
      reopenButton.classList.remove('is-revealing');
      document.body.classList.add('welcome-is-open');
    }
    function collapseWelcome() {
      if (!dialog.open || dialog.classList.contains('is-collapsing')) return;
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      reopenButton.hidden = false;
      reopenButton.classList.add('is-revealing');
      dialog.classList.remove('is-expanding');
      dialog.classList.add('is-collapsing');
      window.setTimeout(() => dialog.close(), reducedMotion ? 0 : 280);
    }

    dialog.querySelector('.welcome-close').addEventListener('click', collapseWelcome);
    reopenButton.addEventListener('click', openWelcome);
    dialog.addEventListener('cancel', event => { event.preventDefault(); collapseWelcome(); });
    dialog.addEventListener('close', () => {
      dialog.classList.remove('is-collapsing', 'is-expanding');
      document.body.classList.remove('welcome-is-open');
      reopenButton.hidden = false;
      reopenButton.focus({ preventScroll: true });
    });
    dialog.addEventListener('click', event => {
      if (event.target.closest('[data-welcome-warning]')) {
        dialog.querySelector('.welcome-warning').scrollIntoView({ block: 'start', behavior: 'smooth' });
        dialog.querySelector('#welcome-safety-title').focus({ preventScroll: true });
        return;
      }
      if (event.target.closest('a[href]')) collapseWelcome();
    });
    // Native dialog makes the underlying page inert; explicitly cycle focus within it.
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const items = Array.from(dialog.querySelectorAll('button, a[href]'));
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    if (openImmediately) {
      openWelcome();
      try { sessionStorage.setItem(welcomeSeenKey, '1'); } catch {}
    } else {
      reopenButton.hidden = false;
    }
  }
  const existingDialog = document.querySelector('.vestano-welcome');
  if (existingDialog) {
    showWelcome(existingDialog, shouldOpenWelcome);
    return;
  }
  // Reuse the homepage notice on every page, keeping one source for its content.
  const homeURL = new URL('index.html', document.currentScript.src);
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('welcome.css?v=16', homeURL).href;
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
    showWelcome(dialog, shouldOpenWelcome);
  }).catch(() => { /* The page remains usable if the notice cannot load. */ });
})();
