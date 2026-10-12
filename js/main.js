// main.js — starts the app: loads saved data and the interface language, draws the
// shell, routes between screens (#/documents, #/create, #/edit/<id>, #/clients,
// #/templates, #/settings, #/guide), keyboard shortcuts and the service worker.

import { $, isTyping } from "./dom.js";
import { initState, getState, subscribe, lastSaveFailed, runRecurring, setSettings } from "./state.js";
import { migrateLegacy } from "./migrate.js";
import { setLanguage, detectLanguage, t, onLanguageChange } from "./i18n.js";
import { renderShell, setActive, openLanguageSheet, setOfflineReady } from "./layout.js";
import { toast } from "./toast.js";
import "./install.js";

const SCREENS = {
  documents: () => import("./screens/documents.js"),
  create: () => import("./screens/editor.js"),
  edit: () => import("./screens/editor.js"),
  clients: () => import("./screens/clients.js"),
  templates: () => import("./screens/templates.js"),
  settings: () => import("./screens/settings.js"),
  guide: () => import("./screens/guide.js")
};

let current = { mod: null, api: null, route: "" };
let navCount = 0;

function parseHash() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  const [path, query = ""] = h.split("?");
  const [route, ...rest] = path.split("/").filter(Boolean);
  const r = SCREENS[route] ? route : "documents";
  return { route: r, params: { id: rest.join("/"), query: new URLSearchParams(query) } };
}

async function navigate() {
  const { route, params } = parseHash();
  const main = $("main");
  let mod;
  try { mod = await SCREENS[route](); }
  catch (e) { console.error(e); main.innerHTML = `<div class="page"><p>${t("common.loadError")}</p></div>`; return; }
  if (current.mod && current.mod.unmount) current.mod.unmount();
  window.scrollTo(0, 0);
  const api = mod.mount(main, params) || {};
  current = { mod, api, route, params };
  setActive(route);
  document.title = api.title ? `${api.title} · InvoGen` : "InvoGen";
  // Move focus to the new page heading so keyboard and screen-reader users land on it.
  if (navCount++ > 0) { const h = main.querySelector("#pageTitle"); if (h) h.focus({ preventScroll: true }); }
}

function remount() {
  if (!current.mod) return;
  if (current.mod.unmount) current.mod.unmount();
  current.api = current.mod.mount($("main"), current.params) || {};
  document.title = current.api.title ? `${current.api.title} · InvoGen` : "InvoGen";
}

function wireShortcuts() {
  document.addEventListener("keydown", e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e)) return;
    if (document.querySelector("dialog[open]")) return;
    if (e.key === "n" || e.key === "N") { e.preventDefault(); location.hash = "#/create"; }
    else if (e.key === "/") {
      e.preventDefault();
      if (current.api && current.api.focusSearch) current.api.focusSearch();
      else { location.hash = "#/documents"; setTimeout(() => current.api && current.api.focusSearch && current.api.focusSearch(), 50); }
    }
  });
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-action='lang']");
    if (b) openLanguageSheet();
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) location.reload();
  });
  navigator.serviceWorker.register("sw.js").then(reg => {
    const ready = () => setOfflineReady(!!(reg.active || navigator.serviceWorker.controller));
    ready();
    navigator.serviceWorker.ready.then(ready);
    const offerUpdate = worker => toast(t("pwa.updateReady"), {
      action: t("pwa.reload"), duration: 30000,
      onAction: () => { reloading = true; worker.postMessage({ type: "SKIP_WAITING" }); }
    });
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener("statechange", () => {
        if (w.state === "installed") { if (navigator.serviceWorker.controller) offerUpdate(w); else setOfflineReady(true); }
      });
    });
    // Look for a new version when the app comes back to the foreground.
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
  }).catch(() => setOfflineReady(false));
}

async function boot() {
  await initState({ migrate: migrateLegacy });
  const s = getState().settings;
  // First visit: follow the device language; afterwards, the language chosen in the app.
  const lang = s.langChosen || s.onboarded || getState().docs.length ? s.appLang || "en" : detectLanguage();
  await setLanguage(lang);
  if (!s.langChosen && !getState().docs.length && lang !== "en" && s.docLang === "en") setSettings({ appLang: lang, docLang: lang }, "ui");
  renderShell();
  onLanguageChange(() => { renderShell(); setActive(current.route); remount(); });
  subscribe((st, reason) => {
    if (reason === "storage" && lastSaveFailed()) toast(t("storage.saveFailed"), { duration: 10000 });
    if (reason === "replace") { setLanguage(st.settings.appLang || "en"); }
  });
  // First visit: start with the guided first invoice.
  const st0 = getState();
  if (!st0.settings.onboarded && !st0.docs.length && /^#?\/?(documents)?$/.test(location.hash)) history.replaceState(null, "", "#/guide");
  const made = runRecurring();
  window.addEventListener("hashchange", navigate);
  wireShortcuts();
  await navigate();
  document.body.classList.remove("booting");
  if (made) toast(t("recurring.created", { n: made }));
  registerServiceWorker();
}

boot().catch(err => {
  console.error(err);
  const m = $("main");
  if (m) m.innerHTML = `<div class="page"><p>Something went wrong while starting InvoGen. Please reload the page.</p></div>`;
});
