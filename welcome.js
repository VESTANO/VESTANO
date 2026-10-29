(() => {
  const dialog = document.querySelector('.vestano-welcome');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  // Welcome visitors once per tab, and show again whenever they refresh home.
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
})();
