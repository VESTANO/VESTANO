const header = document.querySelector(".site-header");

// Count calendar years, months and days in India, independent of the visitor's timezone.
const milestoneCounter = document.querySelector(".milestone-counter");
if (milestoneCounter) {
  const indiaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
  });
  function updateMilestone() {
    const parts = Object.fromEntries(indiaDate.formatToParts(new Date()).map(part => [part.type, part.value]));
    const today = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
    const start = new Date(Date.UTC(2021, 3, 30));
    let months = Math.max(0, (today.getUTCFullYear() - 2021) * 12 + today.getUTCMonth() - 3);
    function anniversary(offset) {
      const month = new Date(Date.UTC(2021, 3 + offset, 1));
      const lastDay = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
      return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), Math.min(30, lastDay)));
    }
    if (months > 0 && anniversary(months) > today) months--;
    const values = {
      years: Math.floor(months / 12),
      months: months % 12,
      days: Math.max(0, Math.round((today - (months ? anniversary(months) : start)) / 86400000))
    };
    for (const [unit, value] of Object.entries(values)) {
      milestoneCounter.querySelector(`[data-milestone="${unit}"]`).textContent = String(value).padStart(2, "0");
    }
    milestoneCounter.hidden = false;
  }
  updateMilestone();
  setInterval(updateMilestone, 30000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) updateMilestone();
  });
}

const megaButtons = document.querySelectorAll(".nav-button[data-mega-target]");
const megaMenus = document.querySelectorAll(".mega-menu");
const menuToggle = document.querySelector(".menu-toggle");
const siteSearch = document.querySelector(".site-search");
const searchToggle = document.querySelector(".search-toggle");
const searchInput = document.querySelector("#site-search-input");
const searchResults = document.querySelector(".search-results");
const megaBackButtons = document.querySelectorAll(".mega-mobile-back");
let footerMenuReturn = false;
let footerMenuPosition = null;
let footerMenuLink = null;
let localMenuReturn = null;
let navigatingAway = false;

// Keep an explicit trail as embedded browsers may not expose a referrer or
// retain the same native history as a standalone browser.
const navigationStorageKey = "vestano-navigation-pending-v2";
const siteRootUrl = new URL(".", document.querySelector('script[src*="script.js"]').src);
const backSelector = ".history-back, .mega-mobile-back, .projects-back, .all-businesses-back, .all-businesses-bottom-back";
function readNavigationStorage() {
  try { return JSON.parse(sessionStorage.getItem(navigationStorageKey)); } catch { return null; }
}
function storeNavigation(destination, trail, position = null) {
  try {
    sessionStorage.setItem(navigationStorageKey, JSON.stringify({ destination, trail, position }));
  } catch { /* Native history remains available if storage is disabled. */ }
}
function siteUrl(value) {
  try {
    const url = new URL(value, siteRootUrl);
    return url.origin === location.origin ? url : null;
  } catch { return null; }
}
const pendingNavigation = readNavigationStorage();
let previousPages = window.history.state?.vestanoPreviousPages || [];
let returnPosition = null;
if (pendingNavigation?.destination === location.href) {
  previousPages = pendingNavigation.trail;
  returnPosition = pendingNavigation.position;
} else if (!previousPages.length && document.referrer && document.referrer !== location.href) {
  const referrer = siteUrl(document.referrer);
  if (referrer) previousPages = [{ url: referrer.href, x: 0, y: 0 }];
}
try { sessionStorage.removeItem(navigationStorageKey); } catch { /* Storage is optional. */ }
function savePreviousPages() {
  history.replaceState({ ...history.state, vestanoPreviousPages: previousPages }, "");
}
savePreviousPages();
function selectedPage() {
  const url = new URL(location.href);
  const openMenu = document.querySelector(".mega-menu.is-open");
  if (openMenu) url.searchParams.set("menu", openMenu.id.replace(/-menu$/, ""));
  url.searchParams.delete("returnTo");
  return { url: url.href, x: scrollX, y: scrollY };
}
function returnToPage(target, trail) {
  const destination = siteUrl(target.url);
  if (!destination) return false;
  storeNavigation(destination.href, trail, { x: target.x || 0, y: target.y || 0 });
  navigatingAway = true;
  // Navigate explicitly: embedded browser history can include hidden document
  // or frame entries, which are not the user's previous selected page.
  location.replace(destination.href);
  return true;
}
function goToPreviousPage(fallback) {
  const trail = previousPages.slice();
  let target = trail.pop();
  while (target && target.url === location.href) target = trail.pop();
  if (target) return returnToPage(target, trail);
  const destination = fallback && siteUrl(fallback);
  if (destination && destination.href !== location.href) {
    return returnToPage({ url: destination.href }, []);
  }
  return false;
}
document.addEventListener("click", (event) => {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const control = event.target.closest(backSelector);
  if (control && !control.matches(".mega-mobile-back")) {
    event.preventDefault();
    event.stopPropagation();
    goToPreviousPage(control.getAttribute("href"));
    return;
  }
  const link = event.target.closest("a[href]");
  if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
  const destination = siteUrl(link.href);
  if (!destination || destination.href === location.href) return;
  if (link.closest(".footer-links") && destination.searchParams.has("menu") && megaButtons.length) return;
  const source = selectedPage();
  history.replaceState(history.state, "", source.url);
  const localPages = [];
  for (let selection = localMenuReturn; selection; selection = selection.previous) {
    localPages.unshift({ url: selection.url, x: selection.x, y: selection.y });
  }
  storeNavigation(destination.href, [...previousPages, ...localPages, source].slice(-50));
  // Header handlers must not erase the selected menu before leaving it.
  if (destination.pathname !== location.pathname || destination.search !== location.search) navigatingAway = true;
}, true);
window.addEventListener("pageshow", () => {
  navigatingAway = false;
  const pending = readNavigationStorage();
  if (pending?.destination === location.href) {
    previousPages = pending.trail;
    returnPosition = pending.position;
    try { sessionStorage.removeItem(navigationStorageKey); } catch { /* Storage is optional. */ }
    savePreviousPages();
  }
  if (returnPosition) {
    const position = returnPosition;
    requestAnimationFrame(() => scrollTo({ left: position.x, top: position.y, behavior: "instant" }));
    returnPosition = null;
  }
});
window.addEventListener("hashchange", () => {
  const pending = readNavigationStorage();
  if (pending?.destination === location.href) {
    previousPages = pending.trail;
    savePreviousPages();
    try { sessionStorage.removeItem(navigationStorageKey); } catch { /* Storage is optional. */ }
  }
});

// Keep the departure position on each history entry, including footer links
// that navigate to another section of the same document.
function rememberPagePosition() {
  window.history.replaceState(
    { ...window.history.state, vestanoScroll: { x: window.scrollX, y: window.scrollY } },
    "",
  );
}

function restorePagePosition() {
  const position = window.history.state?.vestanoScroll;
  if (!position) return;
  requestAnimationFrame(() => {
    window.scrollTo({ left: position.x, top: position.y, behavior: "instant" });
  });
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href]");
  if (link && link.origin === window.location.origin && !event.defaultPrevented) {
    rememberPagePosition();
    const destination = new URL(link.href);
    const menuName = destination.searchParams.get("menu");
    const trigger = Array.from(megaButtons).find((button) => button.dataset.megaTarget === `${menuName}-menu`);
    if (link.closest(".footer-links") && trigger && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      const position = { x: window.scrollX, y: window.scrollY };
      toggleMegaMenu(trigger);
      footerMenuReturn = true;
      footerMenuPosition = position;
      footerMenuLink = link;
    }
  }
});
window.addEventListener("pagehide", rememberPagePosition);
window.addEventListener("pageshow", (event) => {
  if (event.persisted || performance.getEntriesByType("navigation")[0]?.type === "back_forward") {
    restorePagePosition();
  }
});
window.addEventListener("popstate", restorePagePosition);

// Premium pointer treatment for fine-pointer devices. The DOM nodes are shared
// across pages and animation state stays outside the application render flow.
function initPremiumCursor() {
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!finePointer.matches || reducedMotion.matches) return;

  const cursor = document.createElement("div");
  cursor.className = "premium-cursor";
  cursor.setAttribute("aria-hidden", "true");
  cursor.innerHTML = '<span class="premium-cursor-dot"></span><span class="premium-cursor-ring"></span><span class="premium-cursor-ripple"></span>';
  document.body.append(cursor);

  const ring = cursor.querySelector(".premium-cursor-ring");
  const ripple = cursor.querySelector(".premium-cursor-ripple");
  const point = { x: -100, y: -100 };
  const ringPoint = { x: -100, y: -100 };
  let frame = 0;
  let visible = false;

  const interactiveSelector = [
    "a", "button", "summary", "input", "textarea", "select", "[role=button]",
    ".business-directory-card", ".trend-card", ".hardware-partner-card", ".project-card",
    ".mega-menu article", "[data-cursor-label]",
  ].join(",");
  const textControlSelector = "input, textarea, select, [contenteditable=true]";

  const render = () => {
    // The contact popup uses the native pointer; avoid cursor paints over its blur.
    if (document.body.classList.contains("contact-modal-open")) {
      frame = requestAnimationFrame(render);
      return;
    }
    ringPoint.x += (point.x - ringPoint.x) * 0.16;
    ringPoint.y += (point.y - ringPoint.y) * 0.16;
    cursor.style.setProperty("--cursor-x", `${point.x}px`);
    cursor.style.setProperty("--cursor-y", `${point.y}px`);
    cursor.style.setProperty("--ring-x", `${ringPoint.x}px`);
    cursor.style.setProperty("--ring-y", `${ringPoint.y}px`);
    frame = requestAnimationFrame(render);
  };

  const setVisible = (next) => {
    visible = next;
    cursor.classList.toggle("is-visible", next);
  };

  document.addEventListener("pointermove", (event) => {
    point.x = event.clientX;
    point.y = event.clientY;
    if (document.body.classList.contains("contact-modal-open")) {
      ringPoint.x = point.x;
      ringPoint.y = point.y;
      setVisible(false);
      return;
    }
    setVisible(true);
    const target = event.target instanceof Element ? event.target.closest(interactiveSelector) : null;
    const isTextControl = target?.matches(textControlSelector);
    const isCard = target?.matches(".business-directory-card, .trend-card, .hardware-partner-card, .project-card");
    cursor.classList.toggle("is-hovering", Boolean(target && !isTextControl));
    cursor.classList.toggle("is-image", Boolean(target?.matches("img, a img")));
    ring.dataset.label = isCard && target?.querySelector("a[href]") ? "View" : "";
  }, { passive: true });

  document.addEventListener("pointerleave", () => setVisible(false));
  window.addEventListener("blur", () => setVisible(false));
  window.addEventListener("focus", () => setVisible(false));
  document.addEventListener("mousedown", () => {
    if (!visible) return;
    ripple.classList.remove("is-rippling");
    void ripple.offsetWidth;
    ripple.classList.add("is-rippling");
  });
  finePointer.addEventListener?.("change", () => {
    if (!finePointer.matches) {
      cancelAnimationFrame(frame);
      cursor.remove();
    }
  });
  render();
}

initPremiumCursor();

const businessNavLink = Array.from(document.querySelectorAll(".nav-links > li > a")).find(
  (link) => link.textContent.trim().toUpperCase() === "OUR BUSINESS",
);
let businessNavTrigger = null;
let businessDropdown = null;

if (businessNavLink) {
  const businessNavItem = businessNavLink.closest("li");
  const businessRootUrl = new URL(businessNavLink.getAttribute("href"), document.baseURI).href.replace(
    /the-market\.html(?:[?#].*)?$/,
    "",
  );
  const businessItems = [
    { title: "The Market", meta: "Supermarket venture", path: "the-market.html", image: "assets/images/navigation/the-market-logo-dark.webp" },
    { title: "StorePilot", meta: "Workforce operations", path: "services/storepilot-workforce.html", image: "assets/images/navigation/storepilot-logo.webp" },
    { title: "Edge Market ERP", meta: "Retail ERP platform", path: "services/edge-market-erp.html", image: "assets/images/navigation/edge-market-logo.webp" },
    { title: "Vestano Retail ERP", meta: "Retail ERP solutions", path: "business/vestano-retail-erp.html", image: "assets/images/vestano-logo-transparent.webp" },
    { title: "Vestano India LLP", meta: "Hardware", path: "business/digital-solutions.html", image: "assets/images/navigation/vestano-india-llp-logo-transparent.webp" },
    { title: "Vestano Projects & Property", meta: "Construction and development", path: "business/vestano-projects-property.html", image: "assets/images/navigation/vestano-india-llp-logo-transparent.webp" },
    { title: "Vestano Media", meta: "Digital marketing", path: "services/vestano-media.html", image: "assets/images/navigation/vestano-media-logo.webp" },
    { title: "Import & Export", meta: "Global sourcing", path: "industries/import-export-operations.html", image: "assets/images/navigation/import-export-port.webp" },
    { title: "The Sign", meta: "Premium villa communities", path: "industries/villa-projects.html", image: "assets/images/navigation/the-sign-logo.webp" },
    { title: "NEXIQ", meta: "MIS & Data Analytics", path: "business/nexiq.html", image: "assets/images/navigation/nexiq-logo.webp" },
    { title: "AUDITRA", meta: "Finance & Auditing", path: "business/auditra.html", image: "assets/images/navigation/auditra-logo.webp" },
    { title: "Tiffin Box", meta: "New project • Coming soon", path: "business/tiffin-box.html", image: "assets/images/navigation/tiffin-box-logo-v2.webp" },
    { title: "UVPRO", meta: "Restaurant ERP & POS", path: "business/up-pro.html", image: "assets/images/navigation/uvpro-logo.webp" },
    { title: "Fanzzy", meta: "Online jewellery", path: "business/fanzzy.html", image: "assets/images/navigation/fanzzy-logo.webp" },
  ];

  businessNavTrigger = document.createElement("button");
  businessNavTrigger.className = "nav-button business-nav-trigger";
  businessNavTrigger.type = "button";
  businessNavTrigger.setAttribute("aria-expanded", "false");
  businessNavTrigger.setAttribute("aria-controls", "business-dropdown");
  businessNavTrigger.innerHTML = '<span>OUR BUSINESS</span><span class="business-nav-chevron" aria-hidden="true"></span>';

  businessDropdown = document.createElement("ul");
  businessDropdown.className = "business-dropdown";
  businessDropdown.id = "business-dropdown";
  businessDropdown.hidden = true;

  businessItems.forEach((item) => {
    const listItem = document.createElement("li");
    const link = document.createElement("a");
    const image = document.createElement("img");
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    const meta = document.createElement("small");
    link.href = new URL(item.path, businessRootUrl).href;
    image.loading = "lazy";
    image.decoding = "async";
    image.src = new URL(item.image, businessRootUrl).href;
    image.alt = "";
    title.textContent = item.title;
    meta.textContent = item.meta;
    copy.append(title, meta);
    link.append(image, copy);
    listItem.append(link);
    businessDropdown.append(listItem);
  });

  businessNavItem.classList.add("business-nav-item");
  businessNavLink.replaceWith(businessNavTrigger);
  businessNavItem.append(businessDropdown);
}

const searchItems = [
  { title: "The Market", category: "Venture", url: "the-market.html" },
  { title: "NEXIQ Next-Generation Intelligence", category: "Business", url: "business/nexiq.html" },
  { title: "AUDITRA Finance & Auditing", category: "Business", url: "business/auditra.html" },
  { title: "Tiffin Box Coming Soon", category: "Business", url: "business/tiffin-box.html" },
  { title: "UVPRO Restaurant ERP & POS", category: "Business", url: "business/up-pro.html" },
  { title: "Fanzzy Jewellery", category: "Business", url: "business/fanzzy.html" },
  { title: "StorePilot", category: "Platform", url: "services/storepilot-workforce.html" },
  { title: "Edge Market ERP", category: "Platform", url: "services/edge-market-erp.html" },
  { title: "Vestano India LLP Hardware & Digital Solutions", category: "Business", url: "business/digital-solutions.html" },
  { title: "Vestano Projects & Property Construction and Development", category: "Business", url: "business/vestano-projects-property.html" },
  { title: "TSC Hardware & Label Printing", category: "Hardware", url: "business/tsc-hardware.html" },
  { title: "ESSAE POS Systems", category: "Hardware", url: "business/essae-pos.html" },
  { title: "BPOS Billing Hardware", category: "Hardware", url: "business/bpos-hardware.html" },
  { title: "Vestano Media", category: "Platform", url: "services/vestano-media.html" },
  { title: "360 Retail & Supermarket Consulting", category: "Services", url: "services/retail-supermarket-consulting.html" },
  { title: "Automated Auditing, Tax, & Compliance Solutions", category: "Services", url: "services/auditing-tax-compliance.html" },
  { title: "MIS & Business Diagnostic Analytics", category: "Services", url: "services/mis-analytics.html" },
  { title: "Supply Chain Sourcing & Vendor Management", category: "Services", url: "services/supply-chain-vendor-management.html" },
  { title: "HR Compliance & Management Training Programs", category: "Services", url: "services/hr-compliance-training.html" },
  { title: "GenAI, predictive analytics, and automated ERP trends", category: "Insights", url: "insights/genai-erp.html" },
  { title: "Retail management internships and training insights", category: "Insights", url: "insights/retail-internships.html" },
  { title: "Risk services, compliance, and shrinkage control", category: "Insights", url: "insights/risk-compliance.html" },
  { title: "Sustainable retail operations and supply chain efficiency", category: "Insights", url: "insights/sustainable-retail.html" },
  { title: "Technology consulting services: Cloud ERP and POS solutions", category: "Insights", url: "insights/cloud-pos.html" },
  { title: "Hypermarkets, Supermarkets & Grocery Retail", category: "Industries", url: "industries/hypermarkets-supermarkets-grocery.html" },
  { title: "FMCG & Consumer Goods Distribution", category: "Industries", url: "industries/fmcg-consumer-goods.html" },
  { title: "Consumer Electronics & Appliance Outlets", category: "Industries", url: "industries/consumer-electronics-appliances.html" },
  { title: "The Sign Premium Villa Communities", category: "Industries", url: "industries/villa-projects.html" },
  { title: "Import & Export Operations", category: "Industries", url: "industries/import-export-operations.html#trade-readiness" },
  { title: "Contact info", category: "Contact", url: "#contact" },
  { title: "About Vestano Internship Programs", category: "Careers", url: "careers/internship-programs.html" },
  { title: "How to Join Us", category: "Careers", url: "careers/how-to-join.html" },
  { title: "Open Roles & Job Search", category: "Careers", url: "careers/job-search.html" },
  { title: "Life at Vestano", category: "Careers", url: "careers/life-at-vestano.html" },
  { title: "Career Paths", category: "Careers", url: "careers/career-paths.html" },
  { title: "Mission and Vision 2030", category: "About us", url: "#mission-vision" },
  { title: "About Vestano", category: "About us", url: "#about-details" },
  { title: "Leadership, directors, and founder", category: "About us", url: "leadership.html" },
  { title: "Alliances: The Vestano partner ecosystem", category: "About us", url: "about/alliances.html" },
  { title: "Alumni network and professional internship community", category: "About us", url: "about/alumni.html" },
  { title: "Newsroom: Brand transformations and press releases", category: "About us", url: "about/newsroom.html" },
  { title: "Our purpose: Driven by unmatching expertise since 2010", category: "About us", url: "#about-purpose" },
  { title: "Our people: A specialized department-driven collective", category: "About us", url: "#about-people" },
  { title: "Our values: Confidentiality, ethics, and operational order", category: "About us", url: "#about-values" },
];

const websiteKnowledgePageUrls = [
  "/index.html",
  "/the-market.html",
  "/business/nexiq.html",
  "/business/auditra.html",
  "/business/tiffin-box.html",
  "/business/up-pro.html",
  "/business/fanzzy.html",
  "/leadership.html",
  "/services/storepilot-workforce.html",
  "/services/edge-market-erp.html",
  "/business/digital-solutions.html",
  "/business/tsc-hardware.html",
  "/business/essae-pos.html",
  "/business/bpos-hardware.html",
  "/services/vestano-media.html",
  "/services/retail-supermarket-consulting.html",
  "/services/auditing-tax-compliance.html",
  "/services/mis-analytics.html",
  "/services/supply-chain-vendor-management.html",
  "/services/hr-compliance-training.html",
  "/insights/genai-erp.html",
  "/insights/retail-internships.html",
  "/insights/risk-compliance.html",
  "/insights/sustainable-retail.html",
  "/insights/cloud-pos.html",
  "/insights/transformation-realized.html",
  "/industries/hypermarkets-supermarkets-grocery.html",
  "/industries/fmcg-consumer-goods.html",
  "/industries/consumer-electronics-appliances.html",
  "/industries/engineering-real-estate-infrastructure.html",
  "/industries/villa-projects.html",
  "/industries/import-export-operations.html",
  "/industries/technology-software-saas.html",
  "/industries/auditing-risk-compliance.html",
  "/careers/internship-programs.html",
  "/careers/how-to-join.html",
  "/careers/job-search.html",
  "/careers/life-at-vestano.html",
  "/careers/career-paths.html",
  "/about/alliances.html",
  "/about/alumni.html",
  "/about/newsroom.html",
  "/about/purpose.html",
  "/about/people.html",
  "/about/values.html",
];

const websiteKnowledge = [];
let websiteKnowledgeLoaded = false;
let websiteKnowledgePromise = null;

function updateHeaderScrollState() {
  header?.classList.toggle("is-scrolled", window.scrollY > 12);
}

updateHeaderScrollState();
window.addEventListener("scroll", updateHeaderScrollState, { passive: true });

function setMobileMenuOpen(isOpen) {
  header?.classList.toggle("nav-open", isOpen);
  menuToggle?.setAttribute("aria-expanded", String(isOpen));
  menuToggle?.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
  if (header) header.scrollTop = 0;
}

function closeMegaMenus() {
  const hadOpenMenu = Array.from(megaMenus).some((menu) => menu.classList.contains("is-open"));
  megaMenus.forEach((menu) => menu.classList.remove("is-open"));
  megaButtons.forEach((button) => button.setAttribute("aria-expanded", "false"));
  if (hadOpenMenu && !navigatingAway) {
    const url = new URL(window.location.href);
    if (url.searchParams.has("menu")) {
      url.searchParams.delete("menu");
      url.searchParams.delete("returnTo");
      window.history.replaceState(window.history.state, "", url);
    }
  }
}

function closeSearch() {
  siteSearch?.classList.remove("is-open");
  searchToggle?.setAttribute("aria-expanded", "false");
}

function closeBusinessDropdown() {
  if (!businessDropdown || !businessNavTrigger) return;
  businessDropdown.hidden = true;
  businessNavTrigger.setAttribute("aria-expanded", "false");
}

function toggleBusinessDropdown() {
  if (!businessDropdown || !businessNavTrigger) return;
  const shouldOpen = businessDropdown.hidden;
  closeMegaMenus();
  closeSearch();
  businessDropdown.hidden = !shouldOpen;
  businessNavTrigger.setAttribute("aria-expanded", String(shouldOpen));
}

businessNavTrigger?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleBusinessDropdown();
});

businessDropdown?.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    closeBusinessDropdown();
    setMobileMenuOpen(false);
  }
});

function renderSearchResults(query = "") {
  if (!searchResults) return;

  const normalizedQuery = query.trim().toLowerCase();
  const matches = normalizedQuery
    ? searchItems.filter((item) => `${item.title} ${item.category}`.toLowerCase().includes(normalizedQuery)).slice(0, 8)
    : searchItems.slice(0, 6);

  searchResults.innerHTML = matches.length
    ? matches
        .map(
          (item) => `
            <a href="${item.url}" role="option">
              <span>${item.category}</span>
              <strong>${item.title}</strong>
            </a>
          `,
        )
        .join("")
    : '<p class="search-empty">No matching pages found</p>';
}

function toggleMegaMenu(button, { initial = false } = {}) {
  const previousSelection = selectedPage();
  megaBackButtons.forEach((backButton) => backButton.setAttribute("aria-label", "Back to main menu"));
  footerMenuReturn = false;
  footerMenuPosition = null;
  footerMenuLink = null;
  const target = document.getElementById(button.dataset.megaTarget);
  const shouldOpen = target && !target.classList.contains("is-open");

  closeMegaMenus();
  closeBusinessDropdown();
  closeSearch();

  if (target && shouldOpen) {
    localMenuReturn = initial ? null : { ...previousSelection, previous: localMenuReturn };
    target.classList.add("is-open");
    button.setAttribute("aria-expanded", "true");
    if (window.matchMedia("(max-width: 1040px)").matches) setMobileMenuOpen(true);
  } else {
    localMenuReturn = null;
  }
}

megaButtons.forEach((button) => {
  button.addEventListener("click", () => {
    toggleMegaMenu(button);
  });
});

if (menuToggle) {
  menuToggle.addEventListener("click", () => {
    const isOpen = !header.classList.contains("nav-open");
    localMenuReturn = null;
    closeMegaMenus();
    closeSearch();
    closeBusinessDropdown();
    setMobileMenuOpen(isOpen);
  });
}

megaBackButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const menu = button.closest(".mega-menu");
    if (!localMenuReturn && !footerMenuReturn && goToPreviousPage()) {
      return;
    }
    const trigger = Array.from(megaButtons).find((item) => item.dataset.megaTarget === menu?.id);
    closeMegaMenus();
    if (header) header.scrollTop = 0;
    if (footerMenuReturn) {
      localMenuReturn = null;
      setMobileMenuOpen(false);
      footerMenuReturn = false;
      footerMenuLink?.focus({ preventScroll: true });
      const position = footerMenuPosition;
      requestAnimationFrame(() => {
        if (position) window.scrollTo({ left: position.x, top: position.y, behavior: "instant" });
      });
    } else {
      if (localMenuReturn) {
        const position = localMenuReturn;
        localMenuReturn = null;
        setMobileMenuOpen(false);
        requestAnimationFrame(() => scrollTo({ left: position.x, top: position.y, behavior: "instant" }));
      }
      trigger?.focus({ preventScroll: true });
    }
  });
});

if (searchToggle && siteSearch && searchInput) {
  searchToggle.addEventListener("click", () => {
    const isOpen = !siteSearch.classList.contains("is-open");
    closeMegaMenus();
    closeBusinessDropdown();
    siteSearch.classList.toggle("is-open", isOpen);
    searchToggle.setAttribute("aria-expanded", String(isOpen));

    if (isOpen) {
      renderSearchResults(searchInput.value);
      searchInput.focus();
    }
  });

  searchInput.addEventListener("input", () => {
    renderSearchResults(searchInput.value);
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const firstResult = searchResults?.querySelector("a");
      if (firstResult) {
        window.location.href = firstResult.href;
      }
    }
  });

  searchResults?.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      closeSearch();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    localMenuReturn = null;
    closeMegaMenus();
    closeSearch();
    closeBusinessDropdown();
    setMobileMenuOpen(false);
  }
});

document.addEventListener("click", (event) => {
  if (businessDropdown && !event.target.closest(".business-nav-item")) {
    closeBusinessDropdown();
  }

  if (header && !header.contains(event.target) && !event.defaultPrevented) {
    localMenuReturn = null;
    closeMegaMenus();
    closeSearch();
  }
});

header?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    if (navigatingAway) return;
    closeMegaMenus();
    closeSearch();
    closeBusinessDropdown();
    setMobileMenuOpen(false);
  });
});

const mobileMenuMedia = window.matchMedia("(max-width: 1040px)");
mobileMenuMedia.addEventListener("change", ({ matches }) => {
  setMobileMenuOpen(matches && Boolean(header?.querySelector(".mega-menu.is-open")));
});

const initialMenu = new URLSearchParams(window.location.search).get("menu");

if (initialMenu) {
  const initialButton = Array.from(megaButtons).find((button) => button.dataset.megaTarget === `${initialMenu}-menu`);

  if (initialButton) {
    toggleMegaMenu(initialButton, { initial: true });
    const returnTo = siteUrl(new URLSearchParams(location.search).get("returnTo") || "");
    if (!previousPages.length && returnTo && returnTo.href !== location.href && returnTo.href !== siteRootUrl.href) {
      previousPages = [{ url: returnTo.href, x: 0, y: 0 }];
      savePreviousPages();
    }
  }
}

const assistantTopics = [
  {
    id: "services",
    keys: [
      "vestano services",
      "what services",
      "services",
      "service",
      "consulting services",
      "what do you offer",
      "offer",
      "solutions",
    ],
    reply:
      "Vestano services include:\n1. 360-degree Retail and Supermarket Consulting: incorporation, licensing, CapEx budgeting, floor layout engineering, merchandising, market study, business structure, and store launch support.\n2. IT Solutions and Edge Market ERP Integration: POS sync, ERP workflows, multi-branch inventory, secure databases, retail devices, custom tools, and continuous support.\n3. StorePilot Workforce Operations: task allocation, attendance, shifts, leave, SOP verification, performance monitoring, and reports.\n4. Automated Auditing, Tax, and Compliance: invoice verification, purchase reconciliation, ITC tracking, GST readiness, error reduction, and business safety.\n5. MIS and Business Diagnostic Analytics: margin review, dump value tracking, daily sales-versus-purchase, stock analysis, reports, and corrective action.\n6. Supply Chain Sourcing and Vendor Management: modern trade planning, vendor negotiation, cold chain, predictive ordering, category sourcing, and reliable supply flow.\n7. HR Compliance and Management Training: staffing alignment, labor compliance, and a 3-month management internship program.",
    actions: [
      { label: "View services", url: "/index.html?menu=services" },
      { label: "StorePilot", url: "/services/storepilot-workforce.html" },
    ],
  },
  {
    id: "retail-consulting",
    keys: ["360", "retail consulting", "supermarket consulting", "store planning", "floor layout", "layout", "merchandising", "planogram"],
    reply:
      "360-degree Retail and Supermarket Consulting covers business incorporation, statutory licensing, CapEx budgeting, optimized floor plan layout engineering, category-wise stock allocation, planogram design, market study, competition analysis, POS readiness, HR consultation, merchandising, department planning, and opening-stage operational follow-up.",
    actions: [{ label: "Open service", url: "/services/retail-supermarket-consulting.html" }],
  },
  {
    id: "storepilot",
    keys: ["storepilot", "store pilot", "employee", "employees", "attendance", "shift", "task", "leave", "sop", "workforce", "report"],
    reply:
      "StorePilot is Vestano's employee management platform. It supports attendance tracking, shift management, task assignment, leave management, performance monitoring, report generation, automated task dashboards, live operational timers, location-verified attendance, real-time photo verification, structured file uploads, and SOP sign-off from one dashboard.",
    actions: [{ label: "Open StorePilot", url: "/services/storepilot-workforce.html" }],
  },
  {
    id: "edge-market",
    keys: ["edge market", "erp", "pos", "software", "inventory", "billing", "checkout", "database"],
    reply:
      "Edge Market ERP gives retail teams a unified backbone for POS, inventory, finance, purchasing, supplier control, and multi-branch reporting. Vestano supports checkout counter sync, pricing accuracy, inventory logistics, secure central databases, barcode systems, POS devices, custom web tools, dashboards, and continuous IT care.",
    actions: [{ label: "Explore ERP", url: "/services/edge-market-erp.html" }],
  },
  {
    id: "vestano-media",
    keys: ["media", "digital marketing", "marketing", "meta ads", "facebook marketing", "instagram marketing", "social media", "content creation", "graphic design", "lead generation", "brand promotion"],
    reply:
      "Vestano Media provides digital marketing solutions for brand presence, customer engagement, and business growth. Services include social media management, Meta ads and campaign management, content creation, graphic designing, AI video creation, brand promotion, lead generation, audience targeting, creative campaign planning, and Instagram and Facebook marketing. The focus is retail-friendly campaigns, stronger online visibility, quality leads, and consistent digital identity.",
    actions: [{ label: "View media", url: "/services/vestano-media.html" }],
  },
  {
    id: "audit-compliance",
    keys: ["audit", "auditing", "tax", "compliance", "gst", "itc", "invoice", "risk", "shrinkage"],
    reply:
      "Automated Auditing, Tax, and Compliance Solutions protect the business from leakage and compliance risk. The service covers supplier tax invoice verification, physical inventory cross-checking, purchase reconciliation, Input Tax Credit tracking, GST adherence, manual error reduction, stock variance review, finance report discipline, and audit-ready controls.",
    actions: [{ label: "Open audit service", url: "/services/auditing-tax-compliance.html" }],
  },
  {
    id: "auditra",
    keys: ["auditra", "finance company", "auditing company", "full audit", "p&l", "profit and loss", "audit reports", "financial audit"],
    reply:
      "AUDITRA is Vestano's finance and auditing company. It provides full financial and operational audits, P&L review, ledger and voucher verification, bank and cash reconciliation, supplier and customer balance checks, purchase and sales review, inventory and tax checks, internal-control assessment, compliance observations, management audit reports, risk findings, and corrective-action follow-up.",
    actions: [{ label: "Open AUDITRA", url: "/business/auditra.html" }],
  },
  {
    id: "tiffin-box",
    keys: ["tiffin box", "tiffin", "new project", "coming soon", "meal service", "food project"],
    reply:
      "Tiffin Box is a new Vestano food and meal-service project currently in development. The concept, operating model, customer experience, and launch plan are being prepared. More project and availability details will be announced soon.",
    actions: [{ label: "View Tiffin Box", url: "/business/tiffin-box.html" }],
  },
  {
    id: "nexiq",
    keys: ["nexiq", "next-generation intelligence", "next generation intelligence", "mis department", "data analytics team", "management presentation", "next required action"],
    reply:
      "NEXIQ stands for Next-Generation Intelligence. It is Vestano's MIS and data analytics department. The team receives reports from every business function, validates and studies the data, identifies trends, gaps, risks, and opportunities, prepares clear management presentations and structured MIS reports, and concludes each review with the next required action, priority, responsible owner, and follow-up point.",
    actions: [{ label: "Open NEXIQ", url: "/business/nexiq.html" }],
  },
  {
    id: "mis-analytics",
    keys: ["mis", "analytics", "diagnostic", "diagnostics", "margin", "dump value", "sales purchase", "stock analysis", "business reports"],
    reply:
      "MIS and Business Diagnostic Analytics turns transaction and stock data into management clarity. It covers gross margin analysis, category health, dump values, low-performing categories, daily sales-versus-purchase metrics, stock ageing, reorder levels, sales, purchase, finance, and operational reports, plus corrective action for early problem solving.",
    actions: [{ label: "Open MIS service", url: "/services/mis-analytics.html" }],
  },
  {
    id: "supply-chain",
    keys: ["supply chain", "sourcing", "vendor", "vendors", "logistics", "cold chain", "stockout", "supplier", "modern trade"],
    reply:
      "Supply Chain Sourcing and Vendor Management helps retailers move from unorganized general trade to Modern Trade and National Trade models. It includes domestic and international sourcing, supplier negotiation, cold chain planning, predictive stock ordering, category-wise supplier mapping, margin planning, vendor terms, delivery discipline, and stock flow control.",
    actions: [{ label: "Open supply chain", url: "/services/supply-chain-vendor-management.html" }],
  },
  {
    id: "hr-training",
    keys: ["hr", "training", "internship", "internships", "management training", "staffing", "labor", "floor leads"],
    reply:
      "HR Compliance and Management Training covers staffing alignment, labor compliance, organizational development, and process-driven workforce building. The 3-month management internship prepares Store Managers, Floor Leads, and Inventory Specialists through structured retail and operational training.",
    actions: [{ label: "Open HR service", url: "/services/hr-compliance-training.html" }],
  },
  {
    id: "insights",
    keys: ["insight", "insights", "retail insights", "latest insights", "articles", "thinking"],
    reply:
      "Vestano insights cover:\n1. GenAI, predictive analytics, and automated ERP trends: demand planning, seasonality, store sales movement, low-stock alerts, slow movers, margin pressure, supplier delays, and faster decisions.\n2. Retail management internships and training: store exposure, merchandising, billing, inventory, customer service, SOP coaching, and retention.\n3. Risk services, compliance, and shrinkage control: stock loss patterns, audit readiness, policies, documentation, approvals, billing risk, supplier risk, and cash movement visibility.\n4. Sustainable retail operations and supply chain efficiency: waste control, expiry reduction, overstock control, supplier coordination, warehouse flow, delivery planning, energy, space, and labor efficiency.\n5. Technology consulting services for Cloud ERP and POS: unified purchasing, finance, stock, store operations, checkout, returns, promotions, billing accuracy, and dashboards.\n6. Transformation Realized series: Managing Director-led execution, expansion readiness, governance, clear reviews, dashboards, and accountability.",
    actions: [{ label: "View insights", url: "/index.html?menu=insights" }],
  },
  {
    id: "industries",
    keys: ["industry", "industries", "intreeies", "sectors", "fmcg", "grocery", "hypermarket", "supermarket", "villa", "villas", "residential", "import", "export", "construction", "electronics", "saas"],
    reply:
      "Vestano works across these industries:\n1. Hypermarkets, Supermarkets, and Grocery Retail: layout, fixtures, perishable assets, Edge Market ERP, POS speed, modern trade, basket value, and profitability.\n2. FMCG and Consumer Goods Distribution: supplier credit matrices, vendor accounts, warehouse utilization, holding cost reduction, predictive purchasing, and margin protection.\n3. Consumer Electronics and Appliance Outlets: serial-number tracking, warranty logs, seasonal pricing, stock visibility, and high-value inventory security.\n4. Engineering, Real Estate, and Infrastructure Construction: civil floor plans, spatial zoning, MEP layouts, utility loads, footfall readiness, and hypermarket equipment load planning.\n5. The Sign: secure gated villa communities, landscaped roads, premium villas, community facilities, and long-term residential investment value.\n6. International Trade Import and Export: global sourcing, buying agreements, freight logistics, customs compliance, currency risk, and cross-border scaling.\n7. Technology, Software, and Enterprise SaaS Providers: Python and Flask web integrations, MySQL databases, enterprise tools, StorePilot workflows, role approvals, and location-verified operations.\n8. Corporate Auditing, Risk Management, and Compliance: invoice extraction, tax credit protection, dump-value validation, risk controls, GST readiness, and accounting compliance.",
    actions: [{ label: "View industries", url: "/index.html?menu=industries" }],
  },
  {
    id: "careers",
    keys: ["career", "careers", "job", "jobs", "join", "work", "opening", "role", "roles", "life at vestano"],
    reply:
      "Vestano careers include internship programs, how to join, open roles, life at Vestano, and career paths. The internship is a 3-month intensive with department rotation and mentor guidance. Joining includes initial screening, strategic interview, and onboarding into departments like Finance, Legal, Branding, Logistics, consulting, or technology. Open roles include Operations Manager, Retail Strategy Consultant, MIS Data Analyst, and Digital Branding Specialist. Career paths include Specialist, Strategist, and Entrepreneur.",
    actions: [{ label: "View careers", url: "/index.html?menu=careers" }],
  },
  {
    id: "about",
    keys: ["what is vestano", "about vestano", "vestano", "company", "who are you", "purpose", "people", "values"],
    exact: ["vestano", "what is vestano", "about vestano"],
    reply:
      "Vestano International Pvt Ltd is a retail consulting, technology, ERP, auditing, compliance, workforce operations, and business transformation company. Since 2010, Vestano has helped retail chains, developers, and corporate ecosystems build efficient, profitable, and scalable operations. The company focuses on purpose-led transformation, specialized in-house departments, confidentiality, ethics, and operational order.",
    actions: [
      { label: "About Vestano", url: "/index.html#about-details" },
      { label: "View services", url: "/index.html?menu=services" },
    ],
  },
  {
    id: "mission-vision",
    keys: ["mission", "vision", "strategic pillars", "2030", "client value", "leadership excellence", "digital transformation", "operational excellence", "sustainable impact"],
    reply:
      "Vestano's vision is to become a globally respected and trusted business transformation organization, setting new standards of excellence across industries by 2030. The mission is to deliver innovative solutions, build exceptional talent, leverage technology, and create operational excellence that generates sustainable value for clients, employees, and communities. The strategic pillars are Client Value and Growth, People and Leadership Excellence, Innovation and Digital Transformation, Operational Excellence, and Trust and Sustainable Impact.",
    actions: [{ label: "Mission & Vision", url: "/index.html#mission-vision" }],
  },
  {
    id: "clients",
    keys: ["client", "clients", "customers", "brands", "trusted"],
    reply:
      "Vestano client logos shown on the website include Sunny Group, Manapuram, Kunnil, Quixa Hypermart, Happy Days Hypermarket, Hyper City, Tick Mart, Jamjoom Hypermarket, Hymart, At Now Hypermart, Budget Super Market, 4P Mart, Wagonmart, Easy Mart, Danuve Hyper Market, Galaxy Hypermarket, Atlas, Daymart, Carrefresh, Al Dahbia, Yesmart, Shalimar Stores, Vismaya, Dayfresh, Fresh Day, Nice Supermarket, Apple Mart, and more retail brands.",
    actions: [{ label: "View clients", url: "/index.html#clients" }],
  },
  {
    id: "leadership",
    keys: ["leader", "leadership", "director", "ceo", "sudheesh", "sudeesh", "managing director", "developers", "finance", "auditing"],
    reply:
      "Vestano leadership includes Sudheesh NIT, CEO and Managing Director, and Finance & Auditing leadership: strong finance builds the business, smart auditing protects it.",
    actions: [{ label: "View leadership", url: "/leadership.html" }],
  },
  {
    id: "contact",
    keys: ["contact", "phone", "call", "number", "whatsapp", "email", "mail", "location", "address", "toll free"],
    reply:
      "Contact Vestano International Pvt Ltd through Sudheesh NIT. Phone: 7306178755. Toll free: 1800 890 7988. Email: info@vestanoretail.com. Address: 7th Floor, Tower 2, HiLITE Business Park, Kozhikode. Working hours are Monday to Saturday, 9 AM to 6 PM.",
    actions: [
      { label: "Call now", url: "tel:+917306178755" },
      { label: "WhatsApp", url: "https://wa.me/917306178755" },
      { label: "Contact section", url: "/index.html#contact" },
    ],
  },
];

const websiteVoiceCorrections = [
  { pattern: /\b(western|westin|weston|westano|west no|west now|west know|west n o|vestino|vesteno|veston|vistano|visteno|vish tano|christano|cristano|christiano|cristiano|chestano|justano)\b/g, replacement: "vestano" },
  { pattern: /\b(store pilot|store pilots|store private|store pile it|store pellet|stop pilot)\b/g, replacement: "storepilot" },
  { pattern: /\b(edge market|edgemarket|age market|edge mart|h market)\b/g, replacement: "edge market" },
  { pattern: /\b(intreeies|industrials|industrial|industri|industris)\b/g, replacement: "industries" },
  { pattern: /\b(carrier|carriers)\b/g, replacement: "careers" },
  { pattern: /\b(m i s|miss analytics)\b/g, replacement: "mis" },
];

function normalizeAssistantText(message) {
  let text = message
    .toLowerCase()
    .replace(/\b(vesty mole|vesty mol|vesty mall|vesti mol)\b/g, "vesty");

  websiteVoiceCorrections.forEach((correction) => {
    text = text.replace(correction.pattern, correction.replacement);
  });

  return text;
}

function cleanSpeechTranscript(message) {
  const normalized = normalizeAssistantText(message);
  return normalized
    .replace(/\bvestano\b/g, "Vestano")
    .replace(/\bstorepilot\b/g, "StorePilot")
    .replace(/\bedge market\b/g, "Edge Market")
    .replace(/\bmis\b/g, "MIS")
    .replace(/\berp\b/g, "ERP")
    .replace(/\bpos\b/g, "POS")
    .replace(/\bgst\b/g, "GST")
    .replace(/\bitc\b/g, "ITC")
    .replace(/\bi\b/g, "I")
    .trim();
}

function cleanKnowledgeText(text = "") {
  return text
    .replace(/\s+/g, " ")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function getKnowledgeKeywords(text = "") {
  return normalizeAssistantText(text)
    .replace(/[^a-z0-9& ]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !["the", "and", "for", "with", "from", "that", "this", "are", "our", "your", "into", "all"].includes(word));
}

function scoreKnowledgeEntry(entry, query) {
  const words = getKnowledgeKeywords(query);
  if (!words.length) return 0;

  const haystack = normalizeAssistantText(`${entry.title} ${entry.category} ${entry.text}`);
  return words.reduce((score, word) => {
    if (!haystack.includes(word)) return score;
    const titleBoost = normalizeAssistantText(entry.title).includes(word) ? 10 : 0;
    return score + 4 + titleBoost;
  }, 0);
}

function summarizeKnowledgeEntry(entry) {
  const source = cleanKnowledgeText(entry.text);
  const sentences = source.match(/[^.!?]+[.!?]/g) || [source];
  const summary = sentences.slice(0, 3).join(" ").trim();
  return summary.length > 430 ? `${summary.slice(0, 427).trim()}...` : summary;
}

function findWebsiteKnowledgeReply(message) {
  const best = websiteKnowledge
    .map((entry) => ({ entry, score: scoreKnowledgeEntry(entry, message) }))
    .filter((match) => match.score >= 8)
    .sort((a, b) => b.score - a.score)[0]?.entry;

  if (!best) return null;

  return {
    reply: summarizeKnowledgeEntry(best),
    actions: [{ label: best.category || "Open page", url: best.url }],
  };
}

async function loadWebsiteKnowledge() {
  if (websiteKnowledgePromise) return websiteKnowledgePromise;
  if (websiteKnowledgeLoaded || !window.fetch || !window.DOMParser) return Promise.resolve();
  websiteKnowledgeLoaded = true;

  websiteKnowledgePromise = (async () => {
    const parser = new DOMParser();
    const pages = await Promise.allSettled(
    websiteKnowledgePageUrls.map(async (url) => {
      const response = await fetch(url, { cache: "force-cache" });
      if (!response.ok) throw new Error(`Unable to load ${url}`);
      const html = await response.text();
      const doc = parser.parseFromString(html, "text/html");
      doc.querySelectorAll("script, style, svg, nav, header, footer, .site-header, .assistant-panel").forEach((node) => node.remove());

      const pageTitle = cleanKnowledgeText(doc.querySelector("h1, title")?.textContent || url);
      const sections = Array.from(doc.querySelectorAll("main section, main article, .article-page, .detail-list article, .cards article"));
      const entries = sections.length ? sections : [doc.querySelector("main") || doc.body];

      return entries
        .map((section, index) => {
          const heading = cleanKnowledgeText(section.querySelector("h1, h2, h3")?.textContent || pageTitle);
          const text = cleanKnowledgeText(section.textContent || "");
          return text.length > 80
            ? {
                title: heading,
                category: pageTitle,
                text,
                url: index === 0 ? url : `${url}#${section.id || ""}`.replace(/#$/, ""),
              }
            : null;
        })
        .filter(Boolean);
    }),
    );

    pages.forEach((result) => {
      if (result.status === "fulfilled") {
        websiteKnowledge.push(...result.value);
      }
    });
  })();

  return websiteKnowledgePromise;
}

function scoreAssistantTopic(topic, text) {
  let score = 0;

  topic.keys.forEach((key) => {
    if (text.includes(key)) {
      score += key.includes(" ") ? 12 : 7;
      score += Math.min(key.length, 18) / 3;
    }
  });

  if (topic.exact?.includes(text.trim())) {
    score += 30;
  }

  return score;
}

function getTranscriptScore(message) {
  const normalized = normalizeAssistantText(message);
  return Math.max(0, ...assistantTopics.map((topic) => scoreAssistantTopic(topic, normalized)));
}

function getBestSpeechTranscript(event) {
  const results = Array.from(event.results || []);
  const primary = results
    .map((result) => result[0]?.transcript || "")
    .join(" ")
    .trim();
  const alternatives = results.flatMap((result) =>
    Array.from(result)
      .map((alternative) => alternative.transcript || "")
      .filter(Boolean),
  );
  const candidates = [primary, ...alternatives].filter(Boolean);
  const best = candidates.reduce(
    (selected, candidate) =>
      getTranscriptScore(candidate) > getTranscriptScore(selected) ? candidate : selected,
    candidates[0] || "",
  );

  return cleanSpeechTranscript(best || primary);
}

function makeSiteUrl(url) {
  if (url.startsWith("http") || url.startsWith("tel:") || url.startsWith("mailto:")) return url;
  return new URL(url, window.location.origin).href;
}

function getAssistantReply(message) {
  const text = normalizeAssistantText(message);
  const topic = assistantTopics
    .map((item) => ({ item, score: scoreAssistantTopic(item, text) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.item;

  if (topic) return topic;

  const websiteReply = findWebsiteKnowledgeReply(message);
  if (websiteReply) return websiteReply;

  return {
    reply:
      "Ask me about Vestano services, insights, industries, StorePilot, Edge Market ERP, careers, clients, leadership, or contact details. I will match your words with the website content and give the correct answer.",
    actions: [
      { label: "Services", url: "/index.html?menu=services" },
      { label: "Insights", url: "/index.html?menu=insights" },
      { label: "Industries", url: "/index.html?menu=industries" },
      { label: "Contact", url: "/index.html#contact" },
    ],
  };
}

function makeShortAssistantReply(reply) {
  const normalized = reply.replace(/\s+/g, " ").trim();
  const sentences = normalized.match(/[^.!?]+[.!?]/g) || [normalized];
  const shortText = sentences.slice(0, 2).join(" ").trim();

  if (shortText.length <= 260) return shortText;
  return `${shortText.slice(0, 257).trim()}...`;
}

function buildAssistant() {
  if (document.querySelector(".vestano-assistant")) return;

  let selectedAssistantVoice = null;

  function getPreferredAssistantVoice() {
    if (!("speechSynthesis" in window)) return null;

    const voices = window.speechSynthesis.getVoices();
    const femaleVoiceNames = [
      "female",
      "zira",
      "samantha",
      "susan",
      "karen",
      "serena",
      "aria",
      "jenny",
      "natasha",
      "ava",
      "emma",
      "sonia",
      "libby",
      "heera",
      "veena",
      "neerja",
      "google uk english female",
      "google us english",
      "microsoft zira",
      "microsoft heera",
      "microsoft neerja",
      "microsoft natasha",
    ];
    const maleVoiceNames = ["male", "david", "mark", "ravi", "george", "daniel", "alex"];
    const femaleVoice = voices.find((voice) => {
      const name = voice.name.toLowerCase();
      return femaleVoiceNames.some((femaleName) => name.includes(femaleName)) && !maleVoiceNames.some((maleName) => name.includes(maleName));
    });

    return (
      femaleVoice ||
      voices.find((voice) => voice.lang.toLowerCase().startsWith("en-in") && !maleVoiceNames.some((maleName) => voice.name.toLowerCase().includes(maleName))) ||
      voices.find((voice) => voice.lang.toLowerCase().startsWith("en") && !maleVoiceNames.some((maleName) => voice.name.toLowerCase().includes(maleName))) ||
      null
    );
  }

  function refreshAssistantVoice() {
    selectedAssistantVoice = getPreferredAssistantVoice();
  }

  refreshAssistantVoice();
  if ("speechSynthesis" in window) {
    window.speechSynthesis.addEventListener("voiceschanged", refreshAssistantVoice);
  }

  const assistant = document.createElement("section");
  assistant.className = "vestano-assistant";
  assistant.innerHTML = `
    <button class="assistant-toggle" type="button" aria-label="Open Vestano assistant" aria-expanded="false">
      <span class="assistant-orb" aria-hidden="true"></span>
      <span class="assistant-label">Ask Vesty</span>
    </button>
    <div class="assistant-panel" aria-label="Vestano auto reply assistant">
      <div class="assistant-head">
        <div>
          <span>Vesty</span>
          <strong>Auto reply support</strong>
        </div>
        <div class="assistant-head-actions">
          <button class="assistant-close" type="button" aria-label="Minimize auto reply support">X</button>
        </div>
      </div>
      <div class="assistant-messages" aria-live="polite"></div>
      <div class="assistant-quick">
        <button type="button" data-question="What are Vestano services?">Services</button>
        <button type="button" data-question="What insights are on the website?">Insights</button>
        <button type="button" data-question="What industries does Vestano serve?">Industries</button>
        <button type="button" data-question="Tell me about StorePilot">StorePilot</button>
        <button type="button" data-question="How can I contact Vestano?">Contact</button>
      </div>
      <form class="assistant-form">
        <input type="text" placeholder="Ask in English..." aria-label="Ask Vesty assistant" autocomplete="off" />
        <button class="assistant-mic" type="button" aria-label="Speak to Vestano assistant" title="Speak">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3a3.5 3.5 0 0 1 3.5 3.5v5a3.5 3.5 0 1 1-7 0v-5A3.5 3.5 0 0 1 12 3Zm0 13.5a5 5 0 0 0 5-5h2a7 7 0 0 1-6 6.9V21h-2v-2.6a7 7 0 0 1-6-6.9h2a5 5 0 0 0 5 5Z" />
          </svg>
        </button>
        <button type="submit">Send</button>
      </form>
    </div>
  `;

  document.body.appendChild(assistant);

  const toggle = assistant.querySelector(".assistant-toggle");
  const close = assistant.querySelector(".assistant-close");
  const messages = assistant.querySelector(".assistant-messages");
  const form = assistant.querySelector(".assistant-form");
  const input = assistant.querySelector(".assistant-form input");
  const micButton = assistant.querySelector(".assistant-mic");
  const quickButtons = assistant.querySelectorAll(".assistant-quick button");
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canSpeak = "speechSynthesis" in window;
  let recognition = null;
  let isListening = false;
  let hasIntroducedVesty = false;

  function addMessage(text, sender = "bot", actions = []) {
    const message = document.createElement("div");
    message.className = `assistant-message is-${sender}`;
    const actionMarkup = actions.length
      ? `<div class="assistant-actions">${actions
          .map((action) => `<a href="${makeSiteUrl(action.url)}">${action.label}</a>`)
          .join("")}</div>`
      : "";
    message.innerHTML = actionMarkup;
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    message.prepend(paragraph);
    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;
  }

  function speakReply(text) {
    if (!canSpeak) return;

    window.speechSynthesis.cancel();
    assistant.classList.add("is-speaking");
    micButton.setAttribute("aria-label", "Stop assistant talking");
    micButton.setAttribute("title", "Stop talking");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    const voice = selectedAssistantVoice || getPreferredAssistantVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = 1.06;
    utterance.pitch = 1.46;
    utterance.volume = 1;
    utterance.addEventListener("end", () => {
      assistant.classList.remove("is-speaking");
      micButton.setAttribute("aria-label", "Speak to Vestano assistant");
      micButton.setAttribute("title", "Speak");
    });
    utterance.addEventListener("error", () => {
      assistant.classList.remove("is-speaking");
      micButton.setAttribute("aria-label", "Speak to Vestano assistant");
      micButton.setAttribute("title", "Speak");
    });
    window.speechSynthesis.speak(utterance);
  }

  function isAssistantSpeaking() {
    return Boolean(
      canSpeak &&
        (assistant.classList.contains("is-speaking") || window.speechSynthesis.speaking || window.speechSynthesis.pending),
    );
  }

  function stopAssistantVoice() {
    if (!canSpeak) return;
    window.speechSynthesis.cancel();
    assistant.classList.remove("is-speaking");
    micButton.setAttribute("aria-label", "Speak to Vestano assistant");
    micButton.setAttribute("title", "Speak");
  }

  function openAssistant() {
    loadWebsiteKnowledge();
    assistant.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
    if (!hasIntroducedVesty && !messages.children.length) {
      addMessage("Hi, I am Vesty. Ask me in English about services, careers, StorePilot, Edge Market ERP, or contact details.");
      hasIntroducedVesty = true;
    }
    setTimeout(() => input.focus(), 80);
  }

  function closeAssistant() {
    stopAssistantVoice();
    assistant.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  }

  function answerQuestion(question) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion) return;

    addMessage(cleanQuestion, "user");
    input.value = "";

    const typing = document.createElement("div");
    typing.className = "assistant-message is-bot is-typing";
    typing.innerHTML = "<p>Thinking...</p>";
    messages.appendChild(typing);
    messages.scrollTop = messages.scrollHeight;

    window.setTimeout(async () => {
      await Promise.race([loadWebsiteKnowledge(), new Promise((resolve) => window.setTimeout(resolve, 650))]);
      const answer = getAssistantReply(cleanQuestion);
      const shortReply = makeShortAssistantReply(answer.reply);
      typing.remove();
      addMessage(shortReply, "bot", answer.actions);
      speakReply(shortReply);
    }, 420);
  }

  function stopListening() {
    if (!recognition || !isListening) return;
    recognition.stop();
  }

  function startListening() {
    openAssistant();

    if (!SpeechRecognition) {
      addMessage("Voice input is not supported in this browser. You can type your question in English and I will reply.");
      return;
    }

    if (!recognition) {
      recognition = new SpeechRecognition();
      recognition.lang = "en-IN";
      recognition.interimResults = false;
      recognition.maxAlternatives = 5;

      recognition.addEventListener("start", () => {
        isListening = true;
        assistant.classList.add("is-listening");
        micButton.setAttribute("aria-label", "Stop listening");
        input.placeholder = "Listening...";
      });

      recognition.addEventListener("result", (event) => {
        const transcript = getBestSpeechTranscript(event);

        if (transcript) {
          input.value = transcript;
          answerQuestion(transcript);
        }
      });

      recognition.addEventListener("error", () => {
        addMessage("I could not hear clearly. Please try the mic again or type your question in English.");
      });

      recognition.addEventListener("end", () => {
        isListening = false;
        assistant.classList.remove("is-listening");
        micButton.setAttribute("aria-label", isAssistantSpeaking() ? "Stop assistant talking" : "Speak to Vestano assistant");
        micButton.setAttribute("title", isAssistantSpeaking() ? "Stop talking" : "Speak");
        input.placeholder = "Ask in English...";
      });
    }

    recognition.start();
  }

  toggle.addEventListener("click", () => {
    if (assistant.classList.contains("is-open")) {
      closeAssistant();
      return;
    }

    openAssistant();
  });

  close.addEventListener("click", closeAssistant);

  micButton.addEventListener("click", () => {
    if (isAssistantSpeaking()) {
      stopAssistantVoice();
      return;
    }

    if (isListening) {
      stopListening();
      return;
    }

    startListening();
  });

  quickButtons.forEach((button) => {
    button.addEventListener("click", () => {
      openAssistant();
      answerQuestion(button.dataset.question);
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    answerQuestion(input.value);
  });
}

buildAssistant();

function setupTrendingCarousel() {
  const slider = document.querySelector("[data-trending-slider]");
  if (!slider) return;

  const track = slider.querySelector("[data-trending-track]");
  const viewport = slider.querySelector(".trending-viewport");
  const previousButton = slider.querySelector("[data-trending-prev]");
  const nextButton = slider.querySelector("[data-trending-next]");
  const countLabel = document.querySelector("[data-trending-count]");
  const progress = document.querySelector("[data-trending-progress]");
  const cards = Array.from(track?.querySelectorAll(":scope > .trend-card") ?? []);
  if (!track || !viewport || !previousButton || !nextButton || cards.length === 0) return;

  let firstVisible = 0;

  function visibleCardCount() {
    const configured = Number.parseInt(window.getComputedStyle(slider).getPropertyValue("--trending-visible"), 10);
    return Number.isFinite(configured) && configured > 0 ? Math.min(configured, cards.length) : 3;
  }

  function updateCarousel() {
    const visible = visibleCardCount();
    const maxFirst = Math.max(0, cards.length - visible);
    firstVisible = Math.min(firstVisible, maxFirst);
    const lastVisible = Math.min(firstVisible + visible, cards.length);
    const offset = cards[firstVisible].offsetLeft - cards[0].offsetLeft;

    track.style.transform = `translate3d(${-offset}px, 0, 0)`;
    previousButton.disabled = firstVisible === 0;
    nextButton.disabled = firstVisible === maxFirst;

    cards.forEach((card, index) => {
      const isVisible = index >= firstVisible && index < lastVisible;
      card.setAttribute("aria-hidden", String(!isVisible));
      card.inert = !isVisible;
    });

    if (countLabel) countLabel.textContent = `${firstVisible + 1}–${lastVisible} of ${cards.length}`;
    if (progress) progress.style.width = `${(lastVisible / cards.length) * 100}%`;
  }

  function moveBy(amount) {
    const maxFirst = Math.max(0, cards.length - visibleCardCount());
    firstVisible = Math.max(0, Math.min(maxFirst, firstVisible + amount));
    updateCarousel();
  }

  previousButton.addEventListener("click", () => moveBy(-1));
  nextButton.addEventListener("click", () => moveBy(1));
  viewport.addEventListener("keydown", (event) => {
    if (event.target !== viewport) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveBy(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveBy(1);
    }
  });
  window.addEventListener("resize", () => window.requestAnimationFrame(updateCarousel), { passive: true });

  slider.classList.add("is-ready");
  updateCarousel();
}

setupTrendingCarousel();

function setupScrollReveal() {
  const elements = Array.from(document.querySelectorAll(".digital-solutions-page .reveal"));
  if (elements.length === 0) return;

  elements.forEach((element) => element.classList.add("scroll-reveal"));
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
    elements.forEach((element) => element.classList.add("is-inview"));
    return;
  }

  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-inview");
      currentObserver.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });

  elements.forEach((element) => observer.observe(element));
}

setupScrollReveal();

function setupSiteAnimations() {
  const groups = [
    [".about-details .section-heading", ".about-grid article"],
    [".clients-band .section-heading", ".client-logo"],
    [".trending-band .trending-heading-row", ".trend-card"],
    [".mission-vision-copy", ".mission-vision-visual", ".mission-vision-cards article", ".pillar-grid article"],
    [".content-band .section-heading", ".insight-card"],
    [".home-leadership .section-heading", ".home-leader-card", ".home-director-space"],
    [".contact-band .contact-intro", ".contact-card"],
    [".article-page .article-actions", ".article-page .article-hero", ".article-page .article-grid > *", ".article-page .article-result-panel"],
    [".all-businesses-page > *", ".business-directory-card"],
    [".market-page > section", ".market-service-card", ".market-leader-card"],
    [".project-detail-layout > *", ".project-detail-actions"],
  ];
  const elements = groups.flatMap((selectors) => selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))));
  elements.forEach((element, index) => {
    element.classList.add("site-reveal");
    element.style.setProperty("--home-reveal-delay", `${Math.min(index % 5, 4) * 70}ms`);
  });
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
    elements.forEach((element) => element.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      currentObserver.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -10% 0px", threshold: 0.08 });
  elements.forEach((element) => observer.observe(element));
}

setupSiteAnimations();

function setupContactModal() {
  const modal = document.querySelector("[data-contact-modal]");
  if (!modal) return;
  const openers = document.querySelectorAll("[data-open-contact-modal]");
  const closers = modal.querySelectorAll("[data-close-contact-modal]");
  let opener = null;
  const close = () => {
    modal.hidden = true;
    document.body.classList.remove("contact-modal-open");
    opener?.focus({ preventScroll: true });
  };
  openers.forEach((button) => button.addEventListener("click", () => {
    opener = button;
    modal.hidden = false;
    document.body.classList.add("contact-modal-open");
    modal.querySelector(".contact-modal-close")?.focus();
  }));
  closers.forEach((closer) => closer.addEventListener("click", close));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) close();
    if (event.key === "Tab" && !modal.hidden) {
      const focusable = Array.from(modal.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  });
}

setupContactModal();

// Provide the welcome notice on subpages as well as the homepage.
(() => {
  const sharedScript = document.currentScript;
  if (!sharedScript) return;
  function loadWelcome() {
    if (document.querySelector('.vestano-welcome')) return;
    const welcomeScript = document.createElement('script');
    welcomeScript.src = new URL('welcome.js?v=7', sharedScript.src).href;
    document.body.append(welcomeScript);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadWelcome, { once: true });
  } else {
    loadWelcome();
  }
})();
