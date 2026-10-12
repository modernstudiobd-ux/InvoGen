// screens/settings.js — everything that sets up new documents and the app:
// business details and logo, country presets and tax, languages and currency, date,
// number and paper formats, numbering, default wording, preferences, installing the
// app, backups, sample data, help (guides and keyboard shortcuts) and resets.
// Changes save as you type; nothing here changes documents that already exist.

import { esc } from "../dom.js";
import { icon } from "../icons.js";
import { t, LANGS, getLanguage, currencyName } from "../i18n.js";
import { changeLanguage } from "../layout.js";
import {
  getState, settings, setSettings, subscribe, nextNumber, defaultSettings, replaceAll, eraseEverything,
  update, exportSnapshot
} from "../state.js";
import { CURRENCIES, COMMON_CURRENCIES } from "../currencies.js";
import { DATE_FORMATS, NUMBER_FORMATS, formatDate, formatNumber, formatShortDate, todayISO } from "../format.js";
import { DOC_LANGS } from "../docLabels.js";
import { PAPERS, paperOf } from "../preview.js";
import { templateOf } from "../templates.js";
import { COUNTRIES, countryOf, countryDefaults } from "../countries.js";
import { readImage } from "../images.js";
import { toast } from "../toast.js";
import { openSheet, confirmSheet } from "../sheet.js";
import { downloadBackup, readBackup, applyBackup } from "../backup.js";
import { addSampleData, removeSampleData, hasSampleData } from "../sample.js";
import { installState, promptInstall, onInstallChange } from "../install.js";
import { resetPdfGuide } from "../pdfExport.js";
import { storageMode } from "../storage.js";
import { APP_VERSION } from "../version.js";

const TYPES = ["invoice", "estimate", "receipt"];
const SECTIONS = ["business", "country", "language", "formats", "numbering", "wording", "prefs", "install", "data", "help", "reset"];
const GUIDES = ["first", "pdf", "send", "payment", "overdue", "recurring", "import", "templates", "backup", "offline", "languages"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let root = null, ac = null, unsub = null, offInstall = null, helpQ = "";
const timers = new Map();

/* ---------------- mount ---------------- */
export function mount(el) {
  root = el;
  ac = new AbortController();
  const sig = { signal: ac.signal };
  render();
  root.addEventListener("input", onInput, sig);
  root.addEventListener("change", onChange, sig);
  root.addEventListener("click", onClick, sig);
  root.addEventListener("focusout", e => { if (e.target.matches && e.target.matches("[data-s]")) flushField(e.target); }, sig);
  // A restored backup or an erase replaces everything; redraw from the new data.
  unsub = subscribe((s, reason) => {
    if (reason === "replace") refreshLive(true);
    else if (reason === "docs" || reason === "clients" || reason === "products") refreshLive();
    else if (reason === "ui") syncQuiet();
  });
  offInstall = onInstallChange(() => renderInstall());
  return { title: t("nav.settings"), focusSearch };
}
export function unmount() {
  timers.forEach(tm => clearTimeout(tm)); timers.clear();
  if (unsub) unsub();
  if (offInstall) offInstall();
  if (ac) ac.abort();
  root = ac = unsub = offInstall = null;
}
export function focusSearch() {
  const q = root && root.querySelector("#helpQ");
  if (q) { q.scrollIntoView({ block: "center" }); q.focus(); }
}

/* ---------------- helpers ---------------- */
const S = () => settings();
const optHtml = (opts, cur) => opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(cur) ? " selected" : ""}>${esc(l)}</option>`).join("");
const regionName = (code) => { try { return new Intl.DisplayNames([getLanguage()], { type: "region" }).of(code) || code; } catch { return code; } };
const sec = (id, title, body, intro = "") => `<section class="card set-sec" id="set-${id}" aria-labelledby="set-${id}-h" tabindex="-1">
    <h2 class="set-title" id="set-${id}-h">${esc(title)}</h2>${intro ? `<p class="set-intro">${intro}</p>` : ""}${body}</section>`;

// A text/number/select field bound to a settings path such as "business.name".
function field(label, path, o = {}) {
  const id = "s-" + path.replace(/\./g, "-");
  const v = getPath(S(), path);
  const desc = [o.hint ? `${id}-h` : "", o.err ? `${id}-e` : ""].filter(Boolean).join(" ");
  const common = `id="${id}" data-s="${path}" data-k="${o.kind || "text"}"${desc ? ` aria-describedby="${desc}"` : ""}`;
  let ctl;
  if (o.options) ctl = `<select class="select" ${common}>${o.groups || optHtml(o.options, v)}</select>`;
  else if (o.area) ctl = `<textarea class="input textarea" rows="${o.rows || 3}" ${common} dir="auto" maxlength="${o.max || 2000}"${o.ph ? ` placeholder="${esc(o.ph)}"` : ""}>${esc(v)}</textarea>`;
  else {
    const num = o.kind === "num" || o.kind === "int";
    ctl = `<input class="input${num ? " num" : ""}" type="${o.type || "text"}" ${common} value="${esc(v ?? "")}" autocomplete="${o.ac || "off"}"${num ? ' inputmode="decimal"' : ""}${o.ph ? ` placeholder="${esc(o.ph)}"` : ""}${o.max ? ` maxlength="${o.max}"` : ""} dir="${o.type === "email" || o.type === "tel" || o.type === "url" || num ? "ltr" : "auto"}">`;
  }
  return `<div class="field${o.span ? " span2" : ""}"><label for="${id}">${esc(label)}</label>${ctl}${o.err ? `<p class="err" id="${id}-e" hidden></p>` : ""}${o.hint ? `<p class="hint" id="${id}-h">${o.hint}</p>` : ""}</div>`;
}
function toggle(label, path, hint) {
  const id = "s-" + path.replace(/\./g, "-");
  return `<label class="switch-row" for="${id}"><span class="switch-text"><span>${esc(label)}</span>${hint ? `<span class="hint">${esc(hint)}</span>` : ""}</span>
    <input type="checkbox" class="switch" role="switch" id="${id}" data-s="${path}" data-k="bool"${getPath(S(), path) ? " checked" : ""}></label>`;
}
function getPath(o, p) { return p.split(".").reduce((x, k) => (x == null ? x : x[k]), o); }

/* ---------------- render ---------------- */
function render() {
  const s = S();
  const nav = SECTIONS.map(id => `<li><a href="#set-${id}" data-jump="${id}">${esc(t(`set.sec.${id}`))}</a></li>`).join("");
  root.innerHTML = `
  <div class="page set-page">
    <header class="page-head"><div>
      <h1 class="h1" id="pageTitle" tabindex="-1">${esc(t("nav.settings"))}</h1>
      <p class="page-sub">${esc(t("set.sub"))}</p>
    </div></header>
    <nav class="set-chips" aria-label="${esc(t("set.navLabel"))}"><ul>${SECTIONS.map(id => `<li><a class="chip" href="#set-${id}" data-jump="${id}">${esc(t(`set.sec.${id}`))}</a></li>`).join("")}</ul></nav>
    <div class="set-layout">
      <nav class="set-nav" aria-label="${esc(t("set.navLabel"))}"><ul>${nav}</ul></nav>
      <div class="set-main">
        ${businessSec(s)}
        ${countrySec(s)}
        ${languageSec(s)}
        ${formatsSec(s)}
        ${numberingSec(s)}
        ${wordingSec(s)}
        ${prefsSec(s)}
        ${sec("install", t("set.sec.install"), `<div id="installBox"></div>`)}
        ${sec("data", t("set.sec.data"), `<div id="dataBox"></div>`)}
        ${helpSec()}
        ${resetSec()}
        <p class="set-version">InvoGen ${esc(APP_VERSION)}</p>
      </div>
    </div>
  </div>`;
  renderInstall();
  renderData();
  renderHelp();
  updateNumberPreviews();
}

function businessSec(s) {
  const logo = s.business.logo;
  const cty = countryOf(s.country);
  return sec("business", t("set.sec.business"), `
    <div class="ed-grid">
      ${field(t("ed.bizName"), "business.name", { span: true, ac: "organization", max: 300 })}
      ${field(t("ed.email"), "business.email", { type: "email", ac: "email", err: true, max: 300 })}
      ${field(t("ed.phone"), "business.phone", { type: "tel", ac: "tel", max: 60 })}
      ${field(t("ed.address"), "business.address", { area: true, span: true, ac: "street-address" })}
      ${field(t("ed.website"), "business.website", { type: "url", ac: "url", max: 300 })}
      ${field(t("ed.taxId"), "business.taxId", { max: 100, ph: cty ? cty[4] : "" })}
      <div class="field span2"><span class="label" id="setLogoL">${esc(t("ed.logo"))}</span>
        <div class="set-logo">
          ${logo ? `<img class="set-logo-img" src="${esc(logo)}" alt="${esc(t("set.logoAlt"))}">` : `<span class="set-logo-empty" aria-hidden="true">${icon("file-plus", 22)}</span>`}
          <div class="ed-actions-row">
            <label class="btn btn-outline file-btn">${icon("upload", 18)}<span>${esc(t(logo ? "ed.replaceLogo" : "ed.uploadLogo"))}</span><input type="file" id="setLogoFile" class="visually-hidden" accept="image/png,image/jpeg,image/webp,image/svg+xml" aria-describedby="setLogoL"></label>
            ${logo ? `<button type="button" class="btn btn-ghost" data-act="logo-remove">${icon("trash-2", 18)}${esc(t("ed.removeLogo"))}</button>` : ""}
          </div>
        </div>
      </div>
    </div>`, esc(t("set.businessIntro")));
}

function countrySec(s) {
  const lang = getLanguage();
  const opts = COUNTRIES.map(c => [c[0], regionName(c[0])]).sort((a, b) => a[1].localeCompare(b[1], lang));
  return sec("country", t("set.sec.country"), `
    <div class="ed-grid">
      <div class="field span2"><label for="setCountry">${esc(t("set.country"))}</label>
        <select class="select" id="setCountry" aria-describedby="setCountryH"><option value="">${esc(t("set.countryNone"))}</option>${optHtml(opts, s.country)}</select>
        <p class="hint" id="setCountryH">${esc(t("set.countryHint"))}</p></div>
      ${field(t("ed.taxName"), "taxName", { max: 40 })}
      ${field(t("set.taxRate"), "taxRate", { kind: "num", err: true })}
    </div>
    ${toggle(t("ed.taxInclusive"), "taxInclusive", t("ed.taxInclusiveHint"))}`);
}

function currencyGroups(cur) {
  const label = ([c, sym, en]) => `${c} · ${sym} · ${currencyName(c, en)}`;
  const common = COMMON_CURRENCIES.map(c => CURRENCIES.find(r => r[0] === c)).filter(Boolean);
  const all = CURRENCIES.slice().sort((a, b) => a[0].localeCompare(b[0]));
  return `<optgroup label="${esc(t("ed.commonCurrencies"))}">${optHtml(common.map(r => [r[0], label(r)]), cur)}</optgroup>
    <optgroup label="${esc(t("ed.allCurrencies"))}">${optHtml(all.map(r => [r[0], label(r)]), common.some(r => r[0] === cur) ? "" : cur)}</optgroup>`;
}

function languageSec(s) {
  const cur = getLanguage();
  return sec("language", t("set.sec.language"), `
    <div class="ed-grid">
      <div class="field span2"><label for="setLang">${esc(t("lang.title"))}</label>
        <select class="select" id="setLang">${LANGS.map(([c, n, en]) => `<option value="${c}" lang="${c}"${c === cur ? " selected" : ""}>${esc(n)}${c !== "en" ? ` — ${esc(en)}` : ""}</option>`).join("")}</select></div>
      ${field(t("set.currency"), "currency", { span: true, options: [], groups: currencyGroups(s.currency) })}
      ${field(t("ed.docLang"), "docLang", { span: true, options: DOC_LANGS.map(([c, n]) => [c, n]), hint: esc(t("set.docLangHint")) })}
    </div>`);
}

function formatsSec(s) {
  const today = todayISO(), dl = s.docLang || "en";
  const dateOpts = DATE_FORMATS.map(f => [f, `${f} · ${formatDate(today, f, dl, s.numberFormat)}`]);
  const numOpts = NUMBER_FORMATS.map(([v, ex]) => [v, v === "auto" ? `${t("ed.nf.auto")} · ${formatNumber(1234567.89, 2, "auto", dl)}` : v === "native" ? `${t("ed.nf.native")} · ${formatNumber(1234567.89, 2, "native", dl)}` : ex]);
  return sec("formats", t("set.sec.formats"), `
    <div class="ed-grid">
      ${field(t("ed.dateFormat"), "dateFormat", { options: dateOpts })}
      ${field(t("ed.numberFormat"), "numberFormat", { options: numOpts })}
      ${field(t("ed.paper"), "paper", { span: true, options: Object.keys(PAPERS).map(p => [p, `${p} · ${paperOf(p).join(" × ")} mm`]) })}
    </div>`);
}

function numberingSec(s) {
  const rows = TYPES.map(ty => `
    <fieldset class="set-num">
      <legend>${esc(t(`type.${ty}`))}</legend>
      <div class="set-num-grid">
        ${field(t("set.prefix"), `numbering.${ty}.prefix`, { max: 12 })}
        ${field(t("set.nextNo"), `numbering.${ty}.next`, { kind: "int", err: true })}
        ${field(t("set.digits"), `numbering.${ty}.pad`, { kind: "int", options: [1, 2, 3, 4, 5, 6, 7, 8].map(n => [n, String(n)]) })}
      </div>
      <p class="hint" id="numPrev-${ty}" aria-live="polite"></p>
    </fieldset>`).join("");
  return sec("numbering", t("set.sec.numbering"), rows, esc(t("set.numberingIntro")));
}

function wordingSec(s) {
  const terms = [0, 7, 14, 15, 30, 45, 60, 90].map(n => [n, n === 0 ? t("ed.termsReceipt") : t("ed.termsNet", { n })]);
  if (!terms.some(([n]) => n === Number(s.termsDays))) terms.push([s.termsDays, t("ed.termsNet", { n: s.termsDays })]);
  return sec("wording", t("set.sec.wording"), `
    <div class="ed-grid">
      ${field(t("set.termsDays"), "termsDays", { kind: "int", options: terms })}
      ${field(t("set.estimateDays"), "estimateValidDays", { kind: "int", err: true })}
      ${field(t("ed.notes"), "notes", { area: true, span: true, rows: 2 })}
      ${field(t("ed.payInstructions"), "paymentInstructions", { area: true, span: true, rows: 3, ph: t("ed.payInstructionsPh") })}
      <div class="field span2"><span class="label">${esc(t("ed.template"))}</span>
        <div class="set-row"><span>${esc(t(`tpl.name.${templateOf(s.template).id}`))}</span><a class="btn btn-outline" href="#/templates">${icon("layout-template", 18)}${esc(t("set.chooseTemplate"))}</a></div></div>
    </div>`, esc(t("set.wordingIntro")));
}

function prefsSec(s) {
  return sec("prefs", t("set.sec.prefs"), `
    ${toggle(t("set.editMode"), "editMode", t("set.editModeHint"))}
    <div class="set-row"><span class="switch-text"><span>${esc(t("set.pdfGuide"))}</span><span class="hint">${esc(t("set.pdfGuideHint"))}</span></span>
      <button type="button" class="btn btn-outline" data-act="pdf-guide">${esc(t("set.showAgain"))}</button></div>`);
}

function helpSec() {
  const keys = [["N", t("set.key.new")], ["/", t("set.key.search")], ["Ctrl / ⌘ + Z", t("set.key.undo")], ["Ctrl / ⌘ + Shift + Z", t("set.key.redo")], ["Ctrl / ⌘ + S", t("set.key.save")], ["Ctrl / ⌘ + P", t("set.key.print")], ["Esc", t("set.key.close")]];
  return sec("help", t("set.sec.help"), `
    <div class="set-row"><span class="switch-text"><span>${esc(t("set.guideTitle"))}</span><span class="hint">${esc(t("set.guideHint"))}</span></span>
      <a class="btn btn-outline" href="#/guide">${icon("sparkles", 18)}${esc(t("set.startGuide"))}</a></div>
    <label class="search set-help-search">${icon("search")}<span class="visually-hidden">${esc(t("set.helpSearch"))}</span>
      <input type="search" class="input" id="helpQ" placeholder="${esc(t("set.helpSearch"))}" autocomplete="off" value="${esc(helpQ)}"></label>
    <div id="helpList" class="set-guides"></div>
    <p class="visually-hidden" id="helpCount" aria-live="polite"></p>
    <h3 class="h3 set-sub">${esc(t("set.shortcuts"))}</h3>
    <dl class="set-keys">${keys.map(([k, d]) => `<div><dt><kbd dir="ltr">${esc(k)}</kbd></dt><dd>${esc(d)}</dd></div>`).join("")}</dl>`);
}

function resetSec() {
  return sec("reset", t("set.sec.reset"), `
    <div class="set-row"><span class="switch-text"><span>${esc(t("set.resetSettings"))}</span><span class="hint">${esc(t("set.resetSettingsHint"))}</span></span>
      <button type="button" class="btn btn-outline" data-act="reset-settings">${esc(t("set.reset"))}</button></div>
    <div class="set-row"><span class="switch-text"><span>${esc(t("set.deleteDocs"))}</span><span class="hint">${esc(t("set.deleteDocsHint"))}</span></span>
      <button type="button" class="btn btn-outline danger-text" data-act="delete-docs">${esc(t("set.delete"))}</button></div>
    <div class="set-row"><span class="switch-text"><span>${esc(t("set.erase"))}</span><span class="hint">${esc(t("set.eraseHint"))}</span></span>
      <button type="button" class="btn btn-danger" data-act="erase">${icon("trash-2", 18)}${esc(t("set.eraseBtn"))}</button></div>`);
}

/* ---------------- live parts ---------------- */
function renderInstall() {
  const box = root && root.querySelector("#installBox");
  if (!box) return;
  const st = installState();
  if (st === "installed") box.innerHTML = `<p class="set-ok">${icon("circle-check", 18)}<span>${esc(t("set.installed"))}</span></p>`;
  else if (st === "prompt") box.innerHTML = `<p class="set-intro">${esc(t("set.installIntro"))}</p><button type="button" class="btn btn-primary" data-act="install">${icon("download", 18)}${esc(t("set.installBtn"))}</button>`;
  else if (st === "ios") box.innerHTML = `<p class="set-intro">${esc(t("set.installIntro"))}</p><ol class="steps">${["set.ios1", "set.ios2", "set.ios3"].map((k, i) => `<li><span class="step-n">${i + 1}</span><span>${esc(t(k))}</span></li>`).join("")}</ol>`;
  else box.innerHTML = `<p class="set-intro">${esc(t("set.installIntro"))}</p><p class="hint">${esc(t("set.installManual"))}</p>`;
}

async function renderData() {
  const box = root && root.querySelector("#dataBox");
  if (!box) return;
  const st = getState(), s = st.settings;
  const last = s.lastBackupAt ? t("docs.backupLast", { date: formatShortDate(new Date(s.lastBackupAt).toISOString().slice(0, 10), s.dateFormat, getLanguage(), s.numberFormat) }) : t("docs.backupNever");
  const counts = countList(st.docs.length, st.clients.length, st.products.length);
  const sample = hasSampleData(st);
  box.innerHTML = `
    <p class="set-intro">${esc(t("set.dataIntro"))} ${esc(last)}</p>
    <p class="hint" id="dataCounts">${esc(counts)}<span id="dataUsage"></span></p>
    <div class="ed-actions-row">
      <button type="button" class="btn btn-primary" data-act="backup">${icon("download", 18)}${esc(t("set.exportBackup"))}</button>
      <label class="btn btn-outline file-btn">${icon("upload", 18)}<span>${esc(t("set.importBackup"))}</span><input type="file" id="setBackupFile" class="visually-hidden" accept=".json,application/json"></label>
    </div>
    <div class="set-row">
      <span class="switch-text"><span>${esc(t("set.sample"))}</span><span class="hint">${esc(t(sample ? "set.sampleOnHint" : "set.sampleHint"))}</span></span>
      ${sample ? `<button type="button" class="btn btn-outline" data-act="sample-remove">${icon("trash-2", 18)}${esc(t("docs.removeSample"))}</button>`
               : `<button type="button" class="btn btn-outline" data-act="sample-add">${icon("database", 18)}${esc(t("docs.addSample"))}</button>`}
    </div>`;
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage } = await navigator.storage.estimate();
      const el = root && root.querySelector("#dataUsage");
      if (el && usage) el.textContent = " · " + t("set.usage", { size: formatSize(usage) }) + (storageMode() === "local" ? " · " + t("set.limitedStorage") : "");
    }
  } catch {}
}
// "3 documents, 1 client, 0 saved items" with the right plural in every language.
const countList = (docs, clients, items) => [t("cl.docCount", { n: docs }), t("cl.clientCount", { n: clients }), t("cl.itemCount", { n: items })].join(", ");
const formatSize = b => (b < 1048576 ? `${formatNumber(Math.max(1, Math.round(b / 1024)), 0, S().numberFormat, getLanguage())} KB` : `${formatNumber(b / 1048576, 1, S().numberFormat, getLanguage())} MB`);

function renderHelp() {
  const list = root && root.querySelector("#helpList");
  if (!list) return;
  const q = helpQ.trim().toLowerCase();
  const items = GUIDES.filter(g => !q || (t(`set.g.${g}.q`) + " " + t(`set.g.${g}.a`)).toLowerCase().includes(q));
  list.innerHTML = items.length
    ? items.map(g => `<details class="set-guide"${q ? " open" : ""}><summary>${icon("chevron-right", 16)}<span>${esc(t(`set.g.${g}.q`))}</span></summary><p>${esc(t(`set.g.${g}.a`))}</p></details>`).join("")
    : `<p class="hint">${esc(t("set.helpNone"))}</p>`;
  const c = root.querySelector("#helpCount");
  if (c) c.textContent = q ? t("set.helpCount", { n: items.length }) : "";
}

function updateNumberPreviews() {
  TYPES.forEach(ty => {
    const el = root && root.querySelector(`#numPrev-${ty}`);
    if (el) el.textContent = t("set.nextPreview", { no: nextNumber(ty).no });
  });
}

// Redraw parts that depend on documents (counts, sample data, numbering) without
// touching fields the person may be typing in; a full restore redraws everything.
function refreshLive(full) {
  if (!root) return;
  if (full === true) { flushAll(); const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  renderData(); updateNumberPreviews();
}

// Some settings change quietly elsewhere (e.g. the document language follows a new
// app language before any document exists); keep those controls in step.
function syncQuiet() {
  if (!root) return;
  const s = S();
  const dl = root.querySelector("#s-docLang");
  if (dl && dl.value !== s.docLang && document.activeElement !== dl) { dl.value = s.docLang; refreshFormats(); }
  const em = root.querySelector("#s-editMode");
  if (em && em.checked !== !!s.editMode) em.checked = !!s.editMode;
  renderData();
}

/* ---------------- saving ---------------- */
function readValue(el) {
  const k = el.dataset.k;
  if (k === "bool") return { ok: true, v: el.checked };
  const raw = el.value;
  if (k === "int") { const n = Number(String(raw).trim()); return { ok: String(raw).trim() !== "" && Number.isInteger(n), v: n }; }
  if (k === "num") { const n = Number(String(raw).replace(",", ".").trim() || 0); return { ok: Number.isFinite(n), v: n }; }
  return { ok: true, v: raw };
}

function validate(path, v, el) {
  if (path.endsWith(".next") && !(v >= 1 && v <= 99999999)) return t("set.errNext");
  if (path === "taxRate" && !(v >= 0 && v <= 100)) return t("set.errRate");
  if (path === "estimateValidDays" && !(v >= 1 && v <= 3650)) return t("set.errDays");
  if (path === "business.email" && v.trim() && !EMAIL_RE.test(v.trim())) return t("cl.errEmail");
  return "";
}

function save(el) {
  const path = el.dataset.s;
  const { ok, v } = readValue(el);
  const errEl = root.querySelector(`#${el.id}-e`);
  const msg = ok ? validate(path, v, el) : (el.dataset.k === "int" && path.endsWith(".next") ? t("set.errNext") : el.dataset.k === "int" ? t("set.errDays") : t("set.errRate"));
  if (errEl) { errEl.hidden = !msg; errEl.textContent = msg; el.setAttribute("aria-invalid", msg ? "true" : "false"); }
  if (msg && path !== "business.email") return;
  const s = S(), parts = path.split(".");
  let patch;
  if (parts[0] === "business") patch = { business: { ...s.business, [parts[1]]: typeof v === "string" ? v.slice(0, 2000) : v } };
  else if (parts[0] === "numbering") {
    const [, ty, key] = parts;
    const val = key === "prefix" ? String(v).trim().replace(/\s+/g, "-").slice(0, 12) : v;
    patch = { numbering: { ...s.numbering, [ty]: { ...s.numbering[ty], [key]: val } } };
  } else patch = { [path]: v };
  setSettings(patch, path === "editMode" ? "ui" : "settings");
  if (parts[0] === "numbering") updateNumberPreviews();
  if (path === "docLang" || path === "numberFormat") refreshFormats();
}

// Saves anything still being typed, so a redraw never shows (or loses) an old value.
function flushAll() {
  timers.forEach((tm, id) => { clearTimeout(tm); const el = root && root.querySelector("#" + CSS.escape(id)); if (el) save(el); });
  timers.clear();
}

function flushField(el) {
  const tm = timers.get(el.id);
  if (tm) { clearTimeout(tm); timers.delete(el.id); save(el); }
}

// The date and number examples follow the document language and number format.
function refreshFormats() {
  const box = root.querySelector("#set-formats");
  if (!box) return;
  const tmp = document.createElement("div");
  tmp.innerHTML = formatsSec(S());
  box.replaceWith(tmp.firstElementChild);
}

function onInput(e) {
  const el = e.target;
  if (el.id === "helpQ") { helpQ = el.value; renderHelp(); return; }
  if (!el.matches("[data-s]") || el.tagName === "SELECT" || el.type === "checkbox") return;
  clearTimeout(timers.get(el.id));
  timers.set(el.id, setTimeout(() => { timers.delete(el.id); if (root) save(el); }, 350));
}

async function onChange(e) {
  const el = e.target;
  if (el.id === "setLang") return changeLanguage(el.value);
  if (el.id === "setCountry") return applyCountry(el.value);
  if (el.id === "setLogoFile") return onLogo(el);
  if (el.id === "setBackupFile") return onBackupFile(el);
  if (el.matches("[data-s]") && (el.tagName === "SELECT" || el.type === "checkbox")) save(el);
}

function applyCountry(code) {
  flushAll();
  const s = S();
  if (!code) { setSettings({ country: "" }); return; }
  const d = countryDefaults(code);
  const prev = Object.fromEntries(Object.keys(d).map(k => [k, s[k]]));
  setSettings(d);
  refreshLive(true);
  const sel = root.querySelector("#setCountry"); if (sel) sel.focus();
  toast(t("set.countryApplied", { country: regionName(code), tax: `${d.taxName} ${formatNumber(d.taxRate, Number.isInteger(d.taxRate) ? 0 : 1, d.numberFormat, getLanguage())}%`, currency: d.currency }), {
    action: t("common.undo"),
    onAction: () => { setSettings(prev); refreshLive(true); }
  });
}

async function onLogo(input) {
  const f = input.files[0]; input.value = "";
  if (!f) return;
  try {
    const url = await readImage(f, { maxW: 800, maxH: 400 });
    setSettings({ business: { ...S().business, logo: url } });
    refreshLive(true);
    toast(t("set.logoSaved"));
  } catch { toast(t("ed.imageFail")); }
}

async function onBackupFile(input) {
  const f = input.files[0]; input.value = "";
  if (!f) return;
  let b;
  try { b = await readBackup(f); }
  catch (err) { toast(t(err.message === "too-large" ? "set.backupTooLarge" : err.message === "not-backup" ? "set.backupNotOurs" : "set.backupUnreadable"), { duration: 8000 }); return; }
  const when = b.createdAt ? formatShortDate(String(b.createdAt).slice(0, 10), S().dateFormat, getLanguage(), S().numberFormat) : "";
  const ok = await confirmSheet({
    title: t("set.restoreTitle"),
    message: [t("set.backupHas", { list: countList(b.counts.docs, b.counts.clients, b.counts.products) }), when ? t("set.restoreFrom", { date: when }) : "", t("set.replaceWarn")].filter(Boolean).join(" "),
    confirm: t("set.restore"), danger: true
  });
  if (!ok) return;
  const before = structuredClone(exportSnapshot().data);
  applyBackup(b.data);
  refreshLive(true);
  toast(t("set.restored", { n: b.counts.docs }), { action: t("common.undo"), duration: 12000, onAction: () => { replaceAll(before); refreshLive(true); } });
}

/* ---------------- buttons ---------------- */
async function onClick(e) {
  const j = e.target.closest("[data-jump]");
  if (j) {
    e.preventDefault();
    const target = root.querySelector(`#set-${j.dataset.jump}`);
    if (target) { target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); target.focus({ preventScroll: true }); }
    return;
  }
  const b = e.target.closest("[data-act]");
  if (!b) return;
  switch (b.dataset.act) {
    case "logo-remove": {
      const prev = S().business.logo;
      setSettings({ business: { ...S().business, logo: "" } });
      refreshLive(true);
      toast(t("set.logoRemoved"), { action: t("common.undo"), onAction: () => { setSettings({ business: { ...S().business, logo: prev } }); refreshLive(true); } });
      break;
    }
    case "pdf-guide": resetPdfGuide(); toast(t("set.pdfGuideReset")); break;
    case "install": {
      const r = await promptInstall();
      if (r === "accepted") toast(t("set.installDone"));
      renderInstall();
      break;
    }
    case "backup": downloadBackup(); toast(t("docs.backupDone")); renderData(); break;
    case "sample-add": addSampleData(); toast(t("docs.sampleAdded"), { action: t("set.viewDocs"), onAction: () => { location.hash = "#/documents"; } }); renderData(); break;
    case "sample-remove": { const n = removeSampleData(); toast(t("docs.sampleRemoved", { n })); renderData(); break; }
    case "reset-settings": return resetSettings();
    case "delete-docs": return deleteAllDocs();
    case "erase": return erase();
  }
}

// Formats, tax, wording, template and preferences go back to the defaults. Business
// details, numbering, languages and the record of backups are kept.
async function resetSettings() {
  const ok = await confirmSheet({ title: t("set.resetSettings"), message: t("set.resetSettingsMsg"), confirm: t("set.reset") });
  if (!ok) return;
  const s = S(), d = defaultSettings();
  const keep = ["business", "numbering", "appLang", "langChosen", "docLang", "onboarded", "lastBackupAt", "backupSnoozeUntil", "changesSinceBackup"];
  const prev = structuredClone(s);
  const patch = {};
  Object.keys(d).forEach(k => { if (!keep.includes(k)) patch[k] = d[k]; });
  setSettings(patch);
  resetPdfGuide();
  refreshLive(true);
  toast(t("set.resetDone"), { action: t("common.undo"), onAction: () => { setSettings(prev); refreshLive(true); } });
}

async function deleteAllDocs() {
  const n = getState().docs.length;
  if (!n) { toast(t("set.noDocs")); return; }
  const ok = await confirmSheet({ title: t("set.deleteDocsTitle", { n }), message: t("set.deleteDocsMsg"), confirm: t("set.deleteDocsBtn", { n }), danger: true });
  if (!ok) return;
  const prev = getState().docs.slice();
  update(st => { st.docs = []; }, "docs");
  toast(t("set.docsDeleted", { n }), { action: t("common.undo"), duration: 12000, onAction: () => update(st => { st.docs = prev.concat(st.docs); }, "docs") });
}

// Erase everything: asks first (with a last chance to download a backup). Undo is
// offered for a short time; after that the data is gone from this device.
function erase() {
  const word = t("set.eraseWord");
  const dlg = openSheet({
    title: t("set.eraseTitle"),
    body: `<p>${esc(t("set.eraseMsg"))}</p>
      <button type="button" class="btn btn-outline" data-act-in="backup">${icon("download", 18)}${esc(t("set.exportBackup"))}</button>
      <div class="field"><label for="eraseConfirm">${esc(t("set.eraseType", { word }))}</label>
        <input class="input" id="eraseConfirm" autocomplete="off" spellcheck="false" autocapitalize="characters"></div>`,
    foot: `<button type="button" class="btn btn-outline" data-close="">${esc(t("common.cancel"))}</button>
           <button type="button" class="btn btn-danger" id="eraseGo" disabled>${icon("trash-2", 18)}${esc(t("set.eraseBtn"))}</button>`
  });
  const input = dlg.querySelector("#eraseConfirm"), go = dlg.querySelector("#eraseGo");
  // Case and accents don't matter (e.g. "sil" matches "SİL"); the English word always works too.
  const same = (a, b) => a.localeCompare(b, getLanguage(), { sensitivity: "base" }) === 0;
  const matches = () => { const v = input.value.trim(); return !!v && (same(v, word) || same(v, "ERASE")); };
  input.addEventListener("input", () => { go.disabled = !matches(); });
  input.addEventListener("keydown", e => { if (e.key === "Enter" && matches()) { e.preventDefault(); go.click(); } });
  dlg.querySelector("[data-act-in=backup]").addEventListener("click", () => { downloadBackup(); toast(t("docs.backupDone")); });
  go.addEventListener("click", async () => {
    if (!matches()) return;
    const before = structuredClone(exportSnapshot().data);
    dlg.close();
    await eraseEverything();
    location.hash = "#/documents";
    toast(t("set.erased"), { action: t("common.undo"), duration: 15000, onAction: () => replaceAll(before) });
  });
}
