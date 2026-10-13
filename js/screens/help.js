// screens/help.js — Help and support (#/help): the guided first invoice, searchable how-to
// guides and keyboard shortcuts. Opened from the left menu under Language, and from Settings.

import { esc } from "../dom.js";
import { icon } from "../icons.js";
import { t } from "../i18n.js";
import { APP_VERSION } from "../version.js";

const GUIDES = ["first", "pdf", "send", "payment", "overdue", "recurring", "import", "templates", "backup", "offline", "languages"];
let root = null, ac = null, q = "";

const fold = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function mount(el) {
  root = el;
  ac = new AbortController();
  render();
  root.addEventListener("input", e => { if (e.target.id === "helpQ") { q = e.target.value; renderList(); } }, { signal: ac.signal });
  return { title: t("nav.help"), focusSearch };
}
export function unmount() { if (ac) ac.abort(); root = ac = null; }
export function focusSearch() { const s = root && root.querySelector("#helpQ"); if (s) s.focus(); }

function render() {
  const keys = [["N", t("set.key.new")], ["/", t("set.key.search")], ["Ctrl / ⌘ + Z", t("set.key.undo")], ["Ctrl / ⌘ + Shift + Z", t("set.key.redo")], ["Ctrl / ⌘ + S", t("set.key.save")], ["Ctrl / ⌘ + P", t("set.key.print")], ["Esc", t("set.key.close")]];
  root.innerHTML = `
  <div class="page help-page">
    <header class="page-head"><div>
      <h1 class="h1" id="pageTitle" tabindex="-1">${esc(t("nav.help"))}</h1>
      <p class="page-sub">${esc(t("help.sub"))}</p>
    </div></header>
    <div class="set-main help-main">
      <section class="card set-sec" aria-labelledby="helpStartH">
        <h2 class="set-title" id="helpStartH">${esc(t("set.guideTitle"))}</h2>
        <div class="set-row"><span class="hint">${esc(t("set.guideHint"))}</span>
          <a class="btn btn-outline" href="#/guide">${icon("sparkles", 18)}${esc(t("set.startGuide"))}</a></div>
      </section>
      <section class="card set-sec" aria-labelledby="helpGuidesH">
        <h2 class="set-title" id="helpGuidesH">${esc(t("help.guides"))}</h2>
        <label class="search set-help-search">${icon("search")}<span class="visually-hidden">${esc(t("set.helpSearch"))}</span>
          <input type="search" class="input" id="helpQ" placeholder="${esc(t("set.helpSearch"))}" autocomplete="off" enterkeyhint="search" aria-keyshortcuts="/" value="${esc(q)}"></label>
        <div id="helpList" class="set-guides"></div>
        <p class="visually-hidden" id="helpCount" aria-live="polite"></p>
      </section>
      <section class="card set-sec" aria-labelledby="helpKeysH">
        <h2 class="set-title" id="helpKeysH">${esc(t("set.shortcuts"))}</h2>
        <dl class="set-keys">${keys.map(([k, d]) => `<div><dt><kbd dir="ltr">${esc(k)}</kbd></dt><dd>${esc(d)}</dd></div>`).join("")}</dl>
      </section>
      <p class="set-version">InvoGen ${esc(APP_VERSION)} · ${esc(t("help.offline"))}</p>
    </div>
  </div>`;
  renderList();
}

function renderList() {
  const list = root && root.querySelector("#helpList");
  if (!list) return;
  const f = fold(q.trim());
  const items = GUIDES.filter(g => !f || fold(t(`set.g.${g}.q`) + " " + t(`set.g.${g}.a`)).includes(f));
  list.innerHTML = items.length
    ? items.map(g => `<details class="set-guide"${f ? " open" : ""}><summary>${icon("chevron-right", 16)}<span>${esc(t(`set.g.${g}.q`))}</span></summary><p>${esc(t(`set.g.${g}.a`))}</p></details>`).join("")
    : `<p class="hint">${esc(t("set.helpNone"))}</p>`;
  root.querySelector("#helpCount").textContent = f ? t("set.helpCount", { n: items.length }) : "";
}
