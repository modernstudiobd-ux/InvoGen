// layout.js — the app shell: left rail (tablet/desktop), bottom tab bar (phones),
// active-page highlighting and the language picker.

import { $, esc } from "./dom.js";
import { icon } from "./icons.js";
import { t, LANGS, getLanguage, setLanguage } from "./i18n.js";
import { setSettings, getState } from "./state.js";
import { DOC_LANGS } from "./docLabels.js";
const DOC_LANG_CODES = new Set(DOC_LANGS.map(l => l[0]));
import { openSheet } from "./sheet.js";
import { isLockSet, lock, onLockChange } from "./lock.js";

const NAV = [
  ["documents", "files", "nav.documents"],
  ["clients", "users", "nav.clients"],
  ["items", "package", "nav.items"],
  ["reports", "chart-column", "nav.reports"],
  ["templates", "layout-template", "nav.templates"],
  ["settings", "settings", "nav.settings"]
];
let offlineReady = false;

export function renderShell() {
  const lang = getLanguage();
  $("rail").innerHTML = `
    <a class="rail-brand" href="#/documents">InvoGen</a>
    <a class="btn btn-primary rail-create" href="#/create" data-nav="create" aria-keyshortcuts="N"><span class="plus">${icon("plus")}</span><span>${esc(t("nav.create"))}</span></a>
    <ul class="rail-list">
      ${NAV.map(([id, ic, key]) => `<li><a class="rail-link" href="#/${id}" data-nav="${id}">${icon(ic)}<span>${esc(t(key))}</span></a></li>`).join("")}
    </ul>
    <div class="rail-foot">
      <button type="button" class="rail-link" data-action="lang" aria-haspopup="dialog">${icon("globe")}<span><span class="lang-label">${esc(t("nav.language"))} · </span>${esc(lang.toUpperCase())}</span></button>
      <a class="rail-link" href="#/help" data-nav="help">${icon("circle-help")}<span>${esc(t("nav.help"))}</span></a>
      ${isLockSet() ? `<button type="button" class="rail-link" data-action="lock">${icon("lock")}<span>${esc(t("lock.lockNow"))}</span></button>` : ""}
      <p class="rail-status" id="offlineStatus"></p>
    </div>`;
  // Phone tab bar: Items takes the Templates slot; Templates opens from Settings and the editor's Design.
  const [d, c, tp, s] = ["documents", "clients", "items", "settings"].map(id => NAV.find(n => n[0] === id));
  const tab = ([id, ic, key]) => `<a class="tab" href="#/${id}" data-nav="${id}">${icon(ic, 22)}<span>${esc(t(key))}</span></a>`;
  $("tabbar").innerHTML = `${tab(d)}${tab(c)}
    <a class="tab tab-create" href="#/create" data-nav="create" aria-label="${esc(t("nav.create"))}"><span class="plus">${icon("plus")}</span><span>${esc(t("nav.create"))}</span></a>
    ${tab(tp)}${tab(s)}`;
  $("rail").setAttribute("aria-label", t("nav.main"));
  $("tabbar").setAttribute("aria-label", t("nav.main"));
  $("skipLink").textContent = t("nav.skip");
  renderOfflineStatus();
}

export function setActive(route) {
  const key = route === "edit" || route === "guide" ? "" : route;
  // The phone tab bar has no Templates or Help: those pages light up Settings there.
  const tabKey = { templates: "settings", help: "settings", reports: "documents" }[key] || key;
  document.querySelectorAll("[data-nav]").forEach(a => {
    const k = a.closest("#tabbar") ? tabKey : key;
    if (a.dataset.nav === k && k !== "create") a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

// The rail's "Lock" button appears once a PIN is set.
onLockChange(() => { if (document.getElementById("rail").innerHTML) { const cur = document.querySelector("#rail [aria-current]"); renderShell(); if (cur) setActive(cur.dataset.nav); } });
document.addEventListener("click", e => { if (e.target.closest("[data-action='lock']")) lock(); });

export function setOfflineReady(v) { offlineReady = v; renderOfflineStatus(); }
function renderOfflineStatus() {
  const el = $("offlineStatus");
  if (!el) return;
  const msg = offlineReady ? t("status.offlineReady") : t("status.offlinePreparing");
  el.innerHTML = `<span class="dot${offlineReady ? " on" : ""}" aria-hidden="true"></span><span class="label">${esc(msg)}</span>`;
  el.title = msg;
}

export function openLanguageSheet() {
  const cur = getLanguage();
  openSheet({
    title: t("lang.title"),
    body: `<div class="menu" role="radiogroup" aria-label="${esc(t("lang.title"))}">
      ${LANGS.map(([code, name, en]) => `<button type="button" class="menu-item" role="radio" aria-checked="${code === cur}" data-lang="${code}" lang="${code}">
        <span>${esc(name)}</span>${code !== "en" ? `<span class="end" lang="en">${esc(en)}</span>` : ""}</button>`).join("")}
    </div>`,
    onOpen: dlg => {
      const sel = dlg.querySelector('[aria-checked="true"]');
      if (sel) sel.focus();
      dlg.addEventListener("click", async e => {
        const b = e.target.closest("[data-lang]");
        if (!b) return;
        dlg.close();
        await changeLanguage(b.dataset.lang);
      });
    }
  });
}

export async function changeLanguage(code) {
  const applied = await setLanguage(code);
  const st = getState();
  // Before the first document exists, new documents follow the app language too
  // (each document can still use its own language).
  const patch = { appLang: applied, langChosen: true };
  if (!st.docs.some(d => !d.sample) && DOC_LANG_CODES.has(applied)) patch.docLang = applied;
  setSettings(patch, "ui");
}
