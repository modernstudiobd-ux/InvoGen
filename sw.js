// InvoGen service worker — makes the whole app work offline.
//
// RELEASING A NEW VERSION: change VERSION below (e.g. "v4.0.1"). Returning visitors
// then download the new files once, and the app offers a "Reload" button.
const VERSION = "v4.0.1";
const CACHE = `invogen-${VERSION}`;

// Every file the app needs, downloaded on install so it runs with no connection.
// (This list is updated with each stage; you only need to change VERSION.)
const ASSETS = [
  /* ASSETS:START */
  "./",
  "./favicon.ico",
  "./index.html",
  "./manifest.webmanifest",
  "./css/base.css",
  "./css/components.css",
  "./css/fonts.css",
  "./css/invoice.css",
  "./css/layout.css",
  "./css/phone.css",
  "./css/print.css",
  "./css/screens.css",
  "./css/tokens.css",
  "./fonts/Caveat-latin-ext.woff2",
  "./fonts/Caveat-latin.woff2",
  "./fonts/DancingScript-latin-ext.woff2",
  "./fonts/DancingScript-latin.woff2",
  "./fonts/GreatVibes-latin-ext.woff2",
  "./fonts/GreatVibes-latin.woff2",
  "./fonts/HomemadeApple-latin.woff2",
  "./fonts/Inter-cyrillic-ext.woff2",
  "./fonts/Inter-cyrillic.woff2",
  "./fonts/Inter-greek.woff2",
  "./fonts/Inter-latin-ext.woff2",
  "./fonts/Inter-latin.woff2",
  "./fonts/Inter-vietnamese.woff2",
  "./fonts/Kristi-latin.woff2",
  "./fonts/NotoSansArabic.woff2",
  "./fonts/NotoSansBengali.woff2",
  "./fonts/NotoSansDevanagari.woff2",
  "./fonts/SpaceGrotesk-latin-ext.woff2",
  "./fonts/SpaceGrotesk-latin.woff2",
  "./fonts/currency-bengali.woff2",
  "./fonts/currency-latinext.woff2",
  "./fonts/currency-symbols.woff2",
  "./fonts/currency-thai.woff2",
  "./i18n/ar.json",
  "./i18n/bn.json",
  "./i18n/de.json",
  "./i18n/en.json",
  "./i18n/es.json",
  "./i18n/fr.json",
  "./i18n/hi.json",
  "./i18n/id.json",
  "./i18n/it.json",
  "./i18n/ja.json",
  "./i18n/ko.json",
  "./i18n/nl.json",
  "./i18n/pt.json",
  "./i18n/ru.json",
  "./i18n/tr.json",
  "./i18n/zh.json",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-16.png",
  "./icons/favicon-32.png",
  "./icons/favicon.svg",
  "./icons/icon-128.png",
  "./icons/icon-144.png",
  "./icons/icon-152.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-384.png",
  "./icons/icon-48.png",
  "./icons/icon-512.png",
  "./icons/icon-72.png",
  "./icons/icon-96.png",
  "./icons/icon-maskable-512.png",
  "./icons/icon.svg",
  "./js/backup.js",
  "./js/calc.js",
  "./js/currencies.js",
  "./js/docLabels.js",
  "./js/dom.js",
  "./js/format.js",
  "./js/i18n.js",
  "./js/icons.js",
  "./js/images.js",
  "./js/importSheet.js",
  "./js/install.js",
  "./js/layout.js",
  "./js/main.js",
  "./js/migrate.js",
  "./js/payments.js",
  "./js/pdfExport.js",
  "./js/pos.js",
  "./js/preview.js",
  "./js/print.js",
  "./js/sample.js",
  "./js/sheet.js",
  "./js/state.js",
  "./js/storage.js",
  "./js/toast.js",
  "./js/version.js",
  "./js/words.js",
  "./js/screens/clients.js",
  "./js/screens/documents.js",
  "./js/screens/editor.js",
  "./js/screens/guide.js",
  "./js/screens/placeholder.js",
  "./js/screens/settings.js",
  "./js/screens/templates.js",
  "./js/vendor/qrcode.js",
  "./js/vendor/xlsx.full.min.js",
  /* ASSETS:END */
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS.map(u => new Request(u, { cache: "reload" }))))
  );
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Remove older InvoGen caches, including the ones left by v3.x ("invoice-studio-…").
    await Promise.all(keys.filter(k => (k.startsWith("invogen-") || k.startsWith("invoice-studio-")) && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// The page asks for this when the person taps "Reload" on the update message.
self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

// Cache first: answer from the cache, fall back to the network (and keep a copy
// of anything new from this site). Page loads fall back to the cached app shell.
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match("./index.html");
      if (hit) return hit;
      try { return await fetch(req); } catch { return new Response("Offline", { status: 503 }); }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === "basic") cache.put(req, res.clone());
      return res;
    } catch {
      return new Response("", { status: 504, statusText: "Offline" });
    }
  })());
});
