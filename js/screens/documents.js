// screens/documents.js — the Documents list: every invoice, estimate, receipt, credit
// note, proforma, purchase order and delivery note, with type and status filters, search,
// sorting, outstanding totals, quick actions (duplicate, record payment, mark paid,
// reminders, credit notes, convert, delete), selecting several at once, and Undo.

import { esc, initials, debounce, downloadBlob } from "../dom.js";
import { icon } from "../icons.js";
import { t, tHtml, getLanguage } from "../i18n.js";
import {
  getState, subscribe, getDoc, docView, deleteDoc, restoreDoc, duplicateDoc, markSent, markPaid, markUnpaid,
  restorePaymentState, setDocFields, setEstimateStatus, convertToInvoice, createCreditNote, createDeliveryNote,
  bulkMarkSent, bulkMarkPaid, bulkDelete, sentStatus, QUOTE_TYPES
} from "../state.js";
import { outstandingOf } from "../calc.js";
import { formatMoney, formatShortDate, todayISO } from "../format.js";
import { toast } from "../toast.js";
import { openSheet, confirmSheet } from "../sheet.js";
import { addSampleData, removeSampleData, hasSampleData } from "../sample.js";
import { downloadBackup, backupDue, snoozeBackup } from "../backup.js";
import { autoBackupSupported, autoBackupActive, autoBackupNeedsPermission, resumeAutoBackup } from "../autoBackup.js";
import { openPaymentSheet } from "../payments.js";
import { openReminderSheet, canRemind, lastReminder } from "../reminders.js";
import { docsCsv } from "../reports.js";
import { toCSV } from "../importSheet.js";

const PAGE = 50;
// The first four are chips; the other types are reached from the "More" chip.
const TYPES = ["all", "invoice", "estimate", "receipt", "creditNote", "proforma", "purchaseOrder", "deliveryNote"];
const MORE_TYPES = ["creditNote", "proforma", "purchaseOrder", "deliveryNote"];
const STATUSES = ["any", "draft", "sent", "issued", "partial", "overdue", "paid", "credited", "accepted", "declined", "expired", "received", "delivered", "void"];
export const TYPE_ICON = { invoice: "file-text", estimate: "file-plus", receipt: "receipt", creditNote: "file-minus", proforma: "file-check", purchaseOrder: "shopping-cart", deliveryNote: "truck" };
const SORTS = ["newest", "oldest", "due", "amount", "client"];
const PREFS_KEY = "invogen.docs.view";

let root = null, unsub = null, limit = PAGE, dayTimer = 0, ac = null;
// Select mode: tick documents, then act on all of them at once.
let selecting = false, selected = new Set();
let view = loadView();

function loadView() {
  try {
    const v = JSON.parse(sessionStorage.getItem(PREFS_KEY) || "{}");
    return { type: TYPES.includes(v.type) ? v.type : "all", status: STATUSES.includes(v.status) ? v.status : "any", sort: SORTS.includes(v.sort) ? v.sort : "newest", q: "" };
  } catch { return { type: "all", status: "any", sort: "newest", q: "" }; }
}
function saveView() { try { sessionStorage.setItem(PREFS_KEY, JSON.stringify({ type: view.type, status: view.status, sort: view.sort })); } catch {} }

/* ---------------- formatting helpers ---------------- */
const fmtOpts = () => { const s = getState().settings; return { fmt: s.numberFormat, lang: getLanguage() }; };
const money = (n, cur) => formatMoney(n, cur, fmtOpts());
const date = iso => { const s = getState().settings; return formatShortDate(iso, s.dateFormat, getLanguage(), s.numberFormat); };
const typeName = type => t(`type.${type}`);
const statusName = st => t(`status.${st}`);

function norm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }

/* ---------------- data ---------------- */
function rows() {
  const today = todayISO();
  const all = getState().docs.map(d => docView(d, today));
  const q = norm(view.q).trim();
  let list = all.filter(v =>
    (view.type === "all" || v.doc.type === view.type) &&
    (view.status === "any" || v.status === view.status) &&
    (!q || matches(v, q)));
  const by = {
    newest: (a, b) => (b.doc.issued.localeCompare(a.doc.issued)) || (b.doc.createdAt - a.doc.createdAt),
    oldest: (a, b) => (a.doc.issued.localeCompare(b.doc.issued)) || (a.doc.createdAt - b.doc.createdAt),
    due: (a, b) => (a.doc.due || "9999").localeCompare(b.doc.due || "9999"),
    amount: (a, b) => b.totals.total - a.totals.total,
    client: (a, b) => (a.doc.client.name || "￿").localeCompare(b.doc.client.name || "￿", getLanguage(), { sensitivity: "base" })
  }[view.sort];
  list.sort(by);
  return { list, total: all.length };
}

function matches(v, q) {
  const d = v.doc;
  const hay = [d.client.name, d.client.email, d.no, d.reference, typeName(d.type), statusName(v.status),
    ...d.items.map(i => i.desc), String(v.totals.total), money(v.totals.total, d.currency)].map(norm).join(" \u0001 ");
  return q.split(/\s+/).every(w => hay.includes(w));
}

function summary() {
  const today = todayISO();
  const st = getState();
  const owed = {};
  let overdue = 0;
  st.docs.forEach(d => {
    const o = outstandingOf(d, today);
    if (o > 0) owed[d.currency] = (owed[d.currency] || 0) + o;
    if (d.type === "invoice" && docView(d, today).status === "overdue") overdue++;
  });
  const parts = Object.entries(owed).sort((a, b) => b[1] - a[1]).map(([c, n]) => money(n, c));
  if (!st.docs.length) return esc(t("docs.subEmpty"));
  if (!parts.length) return esc(t("docs.nothingOutstanding"));
  const shown = parts.slice(0, 3).map(p => `<span class="ltr num">${esc(p)}</span>`).join(" + ") + (parts.length > 3 ? " " + esc(t("docs.moreCurrencies", { n: parts.length - 3 })) : "");
  return `${tHtml("docs.outstanding", { amount: shown })}${overdue ? " · " + esc(t("docs.overdueCount", { n: overdue })) : ""}`;
}

/* ---------------- render ---------------- */
export function mount(el) {
  filtersShown = filtersSet();
  root = el;
  limit = PAGE;
  view.q = "";
  selecting = false; selected = new Set();
  root.innerHTML = shell();
  wire();
  renderAll();
  unsub = subscribe((s, reason) => { if (reason !== "storage") renderAll(); });
  scheduleMidnight();
  return { title: t("nav.documents"), focusSearch };
}
export function unmount() {
  if (unsub) unsub();
  if (ac) ac.abort();
  unsub = null; ac = null;
  clearTimeout(dayTimer);
  document.body.classList.remove("is-selecting");
  root = null;
}

// Statuses like "Overdue" depend on today's date, so refresh just after midnight.
function scheduleMidnight() {
  const now = new Date(), next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  clearTimeout(dayTimer);
  dayTimer = setTimeout(() => { if (root) { renderAll(); scheduleMidnight(); } }, next - now);
}

function chipsHtml() {
  const chip = ty => `<button type="button" class="chip" data-type="${ty}" aria-pressed="${view.type === ty}">${esc(t(`docs.filter.${ty}`))}</button>`;
  const moreOn = MORE_TYPES.includes(view.type);
  return TYPES.slice(0, 4).map(chip).join("") +
    `<button type="button" class="chip chip-more" data-act="more-types" aria-haspopup="dialog" aria-pressed="${moreOn}">${esc(moreOn ? t(`docs.filter.${view.type}`) : t("docs.filter.more"))}${icon("chevron-down", 16)}</button>`;
}

// Phones: status and sort sit behind a Filter button next to search, so the list starts higher.
// It opens by itself when a filter other than the default is already chosen.
let filtersShown = false;
const filtersSet = () => view.status !== "any" || view.sort !== SORTS[0];
const filtersOpen = () => filtersShown;
function syncFilterBtn() {
  const b = root && root.querySelector("#docsFilterBtn");
  if (!b) return;
  b.setAttribute("aria-expanded", String(filtersOpen()));
  b.querySelector(".filter-dot").hidden = !filtersSet();
  root.querySelector("#docsSel").classList.toggle("is-open", filtersOpen());
}

function shell() {
  const statusOpt = s => `<option value="${s}"${view.status === s ? " selected" : ""}>${esc(s === "any" ? t("docs.anyStatus") : statusName(s))}</option>`;
  const sortOpt = s => `<option value="${s}"${view.sort === s ? " selected" : ""}>${esc(t(`docs.sort.${s}`))}</option>`;
  return `
  <div class="page docs">
    <header class="page-head">
      <div>
        <h1 class="h1" id="pageTitle" tabindex="-1">${esc(t("nav.documents"))}</h1>
        <p class="page-sub" id="docsSummary"></p>
      </div>
      <div class="page-actions" id="docsActions">
        <a class="btn btn-outline tool-btn" href="#/reports">${icon("chart-column", 18)}<span class="tool-label">${esc(t("nav.reports"))}</span></a>
        <button type="button" class="btn btn-outline tool-btn" data-act="select" id="docsSelectBtn" aria-pressed="false">${icon("square-check", 18)}<span class="tool-label">${esc(t("docs.select"))}</span></button>
      </div>
    </header>
    <div id="docsBanner"></div>
    <div class="docs-tools" role="search" aria-label="${esc(t("docs.searchLabel"))}">
      <div class="segmented" role="group" aria-label="${esc(t("docs.typeLabel"))}" id="docsChips">${chipsHtml()}</div>
      <div class="docs-find">
        <label class="search">
          ${icon("search")}
          <span class="visually-hidden">${esc(t("docs.searchLabel"))}</span>
          <input type="search" class="input" id="docsSearch" autocomplete="off" enterkeyhint="search" placeholder="${esc(t("docs.searchPlaceholder"))}" aria-keyshortcuts="/">
        </label>
        <button type="button" class="icon-btn outline docs-filter-btn" id="docsFilterBtn" aria-expanded="${filtersOpen()}" aria-controls="docsSel" aria-label="${esc(t("docs.filters"))}">${icon("list-filter")}<span class="filter-dot" aria-hidden="true"${filtersSet() ? "" : " hidden"}></span></button>
        <div class="docs-sel${filtersOpen() ? " is-open" : ""}" id="docsSel">
          <label class="visually-hidden" for="docsStatus">${esc(t("docs.statusLabel"))}</label>
          <select class="select pill-input" id="docsStatus">${STATUSES.map(statusOpt).join("")}</select>
          <label class="visually-hidden" for="docsSort">${esc(t("docs.sortLabel"))}</label>
          <select class="select pill-input" id="docsSort">${SORTS.map(sortOpt).join("")}</select>
        </div>
      </div>
    </div>
    <p class="visually-hidden" id="docsCount" aria-live="polite" aria-atomic="true"></p>
    <section class="card doc-card" id="docsListWrap" aria-labelledby="pageTitle"></section>
    <div class="bulk-bar" id="bulkBar" role="region" aria-label="${esc(t("docs.bulk.label"))}" hidden>
      <div class="bulk-top">
        <p class="bulk-count" id="bulkCount" aria-live="polite"></p>
        <button type="button" class="btn btn-primary bulk-done" data-act="select-done">${esc(t("docs.bulk.done"))}</button>
      </div>
      <div class="bulk-actions">
        <button type="button" class="btn btn-ghost" data-act="sel-all" id="bulkAll"></button>
        <button type="button" class="btn btn-outline" data-bulk="sent">${icon("send", 18)}<span class="bulk-label">${esc(t("docs.act.markSent"))}</span></button>
        <button type="button" class="btn btn-outline" data-bulk="paid">${icon("circle-check", 18)}<span class="bulk-label">${esc(t("docs.act.markPaid"))}</span></button>
        <button type="button" class="btn btn-outline" data-bulk="csv">${icon("file-spreadsheet", 18)}<span class="bulk-label">${esc(t("docs.bulk.csv"))}</span></button>
        <button type="button" class="btn btn-outline danger-text" data-bulk="delete">${icon("trash-2", 18)}<span class="bulk-label">${esc(t("docs.act.delete"))}</span></button>
      </div>
    </div>
  </div>`;
}

function renderAll() {
  if (!root) return;
  root.querySelector("#docsSummary").innerHTML = summary();
  renderBanner();
  renderList();
}

function renderBanner() {
  const st = getState(), el = root.querySelector("#docsBanner");
  if (hasSampleData(st)) {
    el.innerHTML = `<div class="card banner"><p>${esc(t("docs.sampleBanner"))}</p><div class="actions"><button type="button" class="btn btn-outline" data-act="remove-sample">${icon("trash-2")}${esc(t("docs.removeSample"))}</button></div></div>`;
  } else if (autoBackupNeedsPermission()) {
    el.innerHTML = `<div class="card banner"><p>${esc(t("ab.pausedBanner"))}</p><div class="actions"><button type="button" class="btn btn-outline" data-act="ab-resume">${icon("folder", 18)}${esc(t("ab.resume"))}</button></div></div>`;
  } else if (backupDue(st) && !autoBackupActive()) {
    const last = st.settings.lastBackupAt ? t("docs.backupLast", { date: date(new Date(st.settings.lastBackupAt).toISOString().slice(0, 10)) }) : t("docs.backupNever");
    el.innerHTML = `<div class="card banner"><p>${esc(t("docs.backupBanner"))} ${esc(last)}</p><div class="actions"><button type="button" class="btn btn-outline" data-act="backup">${icon("download")}${esc(t("docs.backupNow"))}</button>${autoBackupSupported() ? `<a class="btn btn-ghost" href="#/settings?section=data">${esc(t("ab.setUp"))}</a>` : ""}<button type="button" class="btn btn-ghost" data-act="snooze">${esc(t("common.later"))}</button></div></div>`;
  } else el.innerHTML = "";
}

function renderList() {
  const wrap = root.querySelector("#docsListWrap");
  const { list, total } = rows();
  const filtered = view.type !== "all" || view.status !== "any" || view.q.trim();
  root.querySelector("#docsCount").textContent = filtered ? t("docs.resultCount", { n: list.length }) : "";
  // Forget ticks on documents that were deleted elsewhere.
  if (selected.size) { const ids = new Set(getState().docs.map(d => d.id)); selected.forEach(id => { if (!ids.has(id)) selected.delete(id); }); }
  renderBulkBar(list);

  // With no documents at all, search, filters, Select and Reports have nothing to act on.
  root.querySelector(".docs-tools").hidden = !total;
  root.querySelector("#docsActions").hidden = !total;
  syncFilterBtn();
  if (!total) {
    wrap.innerHTML = `<div class="empty">
      <h2 class="h2">${esc(t("docs.emptyTitle"))}</h2>
      <p>${esc(t("docs.emptyBody"))}</p>
      <div class="actions">
        <a class="btn btn-outline" href="#/guide">${icon("sparkles")}${esc(t("docs.startGuide"))}</a>
        <button type="button" class="btn btn-ghost" data-act="sample">${icon("database")}${esc(t("docs.addSample"))}</button>
      </div></div>`;
    return;
  }
  if (!list.length) {
    wrap.innerHTML = `<div class="empty"><p>${esc(view.q.trim() ? t("docs.noMatchQuery", { q: view.q.trim() }) : t("docs.noMatch"))}</p>
      <div class="actions"><button type="button" class="btn btn-outline" data-act="clear">${esc(t("docs.clearFilters"))}</button></div></div>`;
    return;
  }
  const shown = list.slice(0, limit);
  const focusId = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.check : "";
  wrap.innerHTML = `<ul class="doc-list${selecting ? " is-selecting" : ""}">${shown.map(v => rowHtml(v, { select: selecting, checked: selected.has(v.doc.id) })).join("")}</ul>` +
    (list.length > limit ? `<div class="doc-more"><button type="button" class="btn btn-outline" data-act="more">${esc(t("docs.showMore", { n: Math.min(PAGE, list.length - limit) }))}</button></div>` : "");
  if (focusId) { const el = wrap.querySelector(`[data-check="${CSS.escape(focusId)}"]`); if (el) el.focus(); }
}

function renderBulkBar(list = rows().list) {
  const bar = root.querySelector("#bulkBar"), btn = root.querySelector("#docsSelectBtn");
  bar.hidden = !selecting;
  btn.setAttribute("aria-pressed", String(selecting));
  document.body.classList.toggle("is-selecting", selecting);
  if (!selecting) return;
  const n = selected.size;
  root.querySelector("#bulkCount").textContent = n ? t("docs.bulk.count", { n }) : t("docs.bulk.hint");
  const allOn = list.length > 0 && list.every(v => selected.has(v.doc.id));
  root.querySelector("#bulkAll").textContent = allOn ? t("docs.bulk.none") : t("docs.bulk.all", { n: list.length });
  bar.querySelectorAll("[data-bulk]").forEach(b => { b.disabled = !n; });
}

function metaFor(v) {
  const d = v.doc;
  if (d.type === "receipt" || d.type === "deliveryNote") return date(d.issued);
  if (QUOTE_TYPES.includes(d.type)) return d.due ? t("docs.validUntil", { date: date(d.due) }) : date(d.issued);
  if (d.type === "creditNote") return d.reference ? t("docs.forInvoice", { no: d.reference }) : date(d.issued);
  if (d.type === "purchaseOrder") return d.due && v.status !== "received" ? t("docs.deliverBy", { date: date(d.due) }) : date(d.issued);
  if (v.status === "paid") {
    const last = (d.payments || []).map(p => p.date).sort().pop();
    return last ? t("docs.paidOn", { date: date(last) }) : date(d.issued);
  }
  if (v.status === "void" || v.status === "credited") return date(d.issued);
  const base = d.due ? t("docs.dueOn", { date: date(d.due) }) : date(d.issued);
  const r = ["sent", "partial", "overdue"].includes(v.status) && lastReminder(d);
  return r ? `${base} · ${t("docs.reminded", { date: date(new Date(r.at).toISOString().slice(0, 10)) })}` : base;
}

// Also used for a client's history (opts.byDoc: the document number is the title).
// opts.select draws a tick box instead of the link (select mode).
export function rowHtml(v, opts = {}) {
  const d = v.doc, tt = v.totals;
  const name = d.client.name.trim();
  const title = opts.byDoc ? `${typeName(d.type)} ${d.no}`.trim() : name;
  const unpaid = d.type === "invoice" && ["sent", "partial", "overdue"].includes(v.status);
  const main = unpaid ? tt.balance : tt.total;
  const sub = unpaid && (tt.paid > 0 || tt.credited > 0) ? tHtml("docs.ofTotal", { total: `<bdi class="ltr">${esc(money(tt.total, d.currency))}</bdi>` }) : "";
  const noMoney = d.type === "deliveryNote";
  const amountText = noMoney ? t("cl.itemCount", { n: d.items.filter(i => i.desc.trim()).length }) : money(main, d.currency);
  const extra = [typeName(d.type), statusName(v.status), amountText].join(", ");
  const id = esc(d.id);
  // Other document types show their type before the number, so they stand out in a mixed list.
  const typeTag = !opts.byDoc && !["invoice", "estimate", "receipt"].includes(d.type) ? `${esc(typeName(d.type))} ` : "";
  const avatar = opts.select
    ? `<span class="avatar sel-box"><input type="checkbox" class="row-check" id="chk-${id}" data-check="${id}"${opts.checked ? " checked" : ""} aria-labelledby="ttl-${id}"></span>`
    : `<span class="avatar${opts.byDoc ? " avatar-icon" : ""}" aria-hidden="true">${opts.byDoc ? icon(TYPE_ICON[d.type] || "file-text", 18) : esc(name ? initials(name) : "–")}</span>`;
  const inner = `<span class="row-title${title ? "" : " is-empty"}" dir="auto" id="ttl-${id}">${esc(title || t("docs.noClient"))}${opts.select ? `<span class="visually-hidden">, ${esc(`${typeName(d.type)} ${d.no}`)}</span>` : ""}</span>
      <span class="doc-meta">${opts.byDoc ? "" : `${typeTag}<bdi class="ltr">${esc(d.no || "—")}</bdi> · `}${esc(metaFor(v))}</span>
      <span class="visually-hidden">, ${esc(extra)}</span>`;
  return `<li class="doc-row${opts.select ? " is-selectable" : ""}${opts.checked ? " is-selected" : ""}" data-id="${id}">
    ${avatar}
    ${opts.select ? `<label class="doc-main" for="chk-${id}">${inner}</label>` : `<a class="doc-main" href="#/edit/${encodeURIComponent(d.id)}">${inner}</a>`}
    <span class="row-foot" aria-hidden="true">
      <span class="doc-status"><span class="badge" data-tone="${v.status}">${esc(statusName(v.status))}</span></span>
      <span class="doc-amount"><bdi class="ltr num">${esc(amountText)}</bdi>${sub && !noMoney ? `<span class="doc-sub num">${sub}</span>` : ""}</span>
    </span>
    ${opts.select ? `<span class="doc-menu" aria-hidden="true"></span>` : `<button type="button" class="icon-btn doc-menu" data-act="menu" aria-haspopup="dialog" aria-label="${esc(t("docs.actionsFor", { doc: `${d.no} ${name}`.trim() }))}">${icon("ellipsis")}</button>`}
  </li>`;
}

/* ---------------- events ---------------- */
function wire() {
  const search = root.querySelector("#docsSearch");
  const run = debounce(() => { view.q = search.value; limit = PAGE; renderList(); }, 120);
  search.addEventListener("input", run);
  search.addEventListener("keydown", e => { if (e.key === "Escape" && search.value) { e.stopPropagation(); search.value = ""; view.q = ""; renderList(); } });
  root.querySelector("#docsStatus").addEventListener("change", e => { view.status = e.target.value; limit = PAGE; saveView(); renderList(); });
  // (renderList keeps the Filter button's dot in step with the chosen status and sort.)
  root.querySelector("#docsSort").addEventListener("change", e => { view.sort = e.target.value; saveView(); renderList(); });
  ac = new AbortController();
  root.addEventListener("click", onClick, { signal: ac.signal });
  root.addEventListener("change", e => {
    const c = e.target.closest("[data-check]");
    if (!c) return;
    if (c.checked) selected.add(c.dataset.check); else selected.delete(c.dataset.check);
    const row = c.closest(".doc-row"); if (row) row.classList.toggle("is-selected", c.checked);
    renderBulkBar();
  }, { signal: ac.signal });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && selecting && !document.querySelector("dialog[open]")) { e.preventDefault(); setSelecting(false); }
  }, { signal: ac.signal });
}

function setSelecting(on) {
  selecting = on;
  if (!on) selected.clear();
  renderList();
  const target = on ? root.querySelector("[data-check]") : root.querySelector("#docsSelectBtn");
  if (target) target.focus();
}

function setType(ty) {
  view.type = ty; limit = PAGE; saveView();
  root.querySelector("#docsChips").innerHTML = chipsHtml();
  renderList();
}

function onClick(e) {
  const chip = e.target.closest("[data-type]");
  if (chip) { setType(chip.dataset.type); root.querySelector(`[data-type="${chip.dataset.type}"]`).focus(); return; }
  const bk = e.target.closest("[data-bulk]");
  if (bk) { runBulk(bk.dataset.bulk); return; }
  if (e.target.closest("#docsFilterBtn")) {
    filtersShown = !filtersShown;
    syncFilterBtn();
    if (filtersShown) root.querySelector("#docsStatus").focus();
    return;
  }
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "menu") openRowMenu(b.closest(".doc-row").dataset.id, b);
  else if (act === "more") { limit += PAGE; renderList(); }
  else if (act === "more-types") openMoreTypes();
  else if (act === "clear") clearFilters();
  else if (act === "select") setSelecting(!selecting);
  else if (act === "select-done") setSelecting(false);
  else if (act === "sel-all") {
    const list = rows().list;
    if (list.length && list.every(v => selected.has(v.doc.id))) selected.clear();
    else { list.forEach(v => selected.add(v.doc.id)); limit = Math.max(limit, Math.min(list.length, 500)); }
    renderList();
  }
  else if (act === "sample") { addSampleData(); toast(t("docs.sampleAdded")); }
  else if (act === "remove-sample") { const n = removeSampleData(); toast(t("docs.sampleRemoved", { n })); }
  else if (act === "backup") { downloadBackup(); toast(t("docs.backupDone")); }
  else if (act === "snooze") snoozeBackup();
  else if (act === "ab-resume") resumeAutoBackup().then(ok => { toast(t(ok ? "ab.resumed" : "ab.denied")); renderBanner(); });
}

function openMoreTypes() {
  openSheet({
    title: t("docs.typeLabel"),
    body: `<div class="menu" role="radiogroup" aria-label="${esc(t("docs.typeLabel"))}">${MORE_TYPES.map(ty =>
      `<button type="button" class="menu-item" role="radio" aria-checked="${view.type === ty}" data-close="${ty}">${icon(TYPE_ICON[ty])}<span>${esc(t(`docs.filter.${ty}`))}</span></button>`).join("")}</div>`,
    onOpen: dlg => { const sel = dlg.querySelector('[aria-checked="true"]') || dlg.querySelector(".menu-item"); if (sel) sel.focus(); },
    onClose: v => { if (v) setType(v); }
  });
}

async function runBulk(act) {
  const ids = [...selected];
  if (!ids.length) return;
  if (act === "csv") {
    const docs = getState().docs.filter(d => selected.has(d.id));
    downloadBlob(new Blob([toCSV(docsCsv(docs))], { type: "text/csv;charset=utf-8" }), `invogen-documents-${todayISO()}.csv`);
    toast(t("docs.bulk.exported", { n: docs.length }));
    return;
  }
  if (act === "delete") {
    const ok = ids.length < 2 || await confirmSheet({ title: t("docs.bulk.deleteTitle", { n: ids.length }), message: t("docs.bulk.deleteMsg"), confirm: t("docs.bulk.deleteBtn", { n: ids.length }), danger: true });
    if (!ok) return;
    const r = bulkDelete(ids);
    setSelecting(false);
    toast(t("docs.bulk.deleted", { n: r.count }), { action: t("common.undo"), duration: 10000, onAction: r.undo });
    return;
  }
  const r = act === "sent" ? bulkMarkSent(ids) : bulkMarkPaid(ids);
  if (!r.count) { toast(t(act === "sent" ? "docs.bulk.noneSent" : "docs.bulk.nonePaid")); return; }
  toast(t(act === "sent" ? "docs.bulk.sent" : "docs.bulk.paid", { n: r.count }), { action: t("common.undo"), onAction: r.undo });
}

function clearFilters() {
  view = { ...view, type: "all", status: "any", q: "" };
  saveView();
  root.querySelector("#docsSearch").value = "";
  root.querySelector("#docsStatus").value = "any";
  root.querySelector("#docsChips").innerHTML = chipsHtml();
  renderList();
  root.querySelector("#docsSearch").focus();
}

export function focusSearch() {
  const s = root && root.querySelector("#docsSearch");
  if (s) { s.focus(); s.select(); }
}

/* ---------------- row actions ---------------- */
// The actions a document offers, shared by the Documents list and a client's history.
export function docActions(d, v) {
  const items = [["open", "file-text", t("docs.act.open")], ["duplicate", "copy", t("docs.act.duplicate")]];
  const st = v.status;
  if (d.type !== "receipt" && st === "draft") items.push(["sent", "send", t(d.type === "creditNote" ? "docs.act.issue" : "docs.act.markSent")]);
  if (d.type === "invoice") {
    if (canRemind(d, st)) items.push(["remind", "bell", t("docs.act.remind")]);
    if (["draft", "sent", "partial", "overdue"].includes(st)) {
      items.push(["payment", "banknote", t("docs.act.recordPayment")]);
      items.push(["paid", "circle-check", t("docs.act.markPaid")]);
    }
    if (st === "paid" || st === "partial" || (st === "overdue" && v.totals.paid > 0)) items.push(["unpaid", "undo-2", t("docs.act.markUnpaid")]);
    if (!["draft", "void", "credited"].includes(st)) items.push(["credit", "file-minus", t("docs.act.creditNote")]);
  }
  if (QUOTE_TYPES.includes(d.type)) {
    if (st !== "accepted") items.push(["accept", "circle-check", t("docs.act.markAccepted")]);
    if (st !== "declined") items.push(["decline", "circle-x", t("docs.act.markDeclined")]);
    items.push(["convert", "arrow-right-left", t("docs.act.convert")]);
  }
  if (d.type === "purchaseOrder" && st === "sent") items.push(["received", "circle-check", t("docs.act.markReceived")]);
  if (d.type === "deliveryNote" && st !== "delivered") items.push(["delivered", "circle-check", t("docs.act.markDelivered")]);
  if (["invoice", "proforma", "purchaseOrder"].includes(d.type) && st !== "void") items.push(["delivery", "truck", t("docs.act.deliveryNote")]);
  if (d.type === "creditNote" && d.sourceId && getDoc(d.sourceId)) items.push(["source", "file-text", t("docs.act.openInvoice", { no: getDoc(d.sourceId).no })]);
  items.push(["delete", "trash-2", t("docs.act.delete")]);
  return items;
}

export function openRowMenu(id) {
  const d = getDoc(id);
  if (!d) return;
  const v = docView(d);
  const items = docActions(d, v);
  const tt = v.totals;
  const money2 = d.type === "deliveryNote" ? "" : `<span class="num">${esc(t("docs.totalLabel"))}: <bdi class="ltr">${esc(money(tt.total, d.currency))}</bdi>${d.type === "invoice" && tt.paid > 0 ? ` · ${esc(t("docs.paidLabel"))}: <bdi class="ltr">${esc(money(tt.paid, d.currency))}</bdi>` : ""}</span>`;
  openSheet({
    title: `${typeName(d.type)} ${d.no}`.trim(),
    body: `<div class="sheet-summary"><strong>${esc(d.client.name || t("docs.noClient"))}</strong>
        <span><span class="badge" data-tone="${v.status}">${esc(statusName(v.status))}</span></span>
        ${money2}</div>
      <div class="menu">${items.map(([a, ic, label]) => a === "open"
        ? `<a class="menu-item" href="#/edit/${encodeURIComponent(d.id)}" data-close="">${icon(ic)}<span>${esc(label)}</span></a>`
        : `<button type="button" class="menu-item${a === "delete" ? " danger" : ""}" data-close="${a}">${icon(ic)}<span>${esc(label)}</span></button>`).join("")}</div>`,
    onClose: act => act && runAction(act, d.id)
  });
}

export function runAction(act, id) {
  const d = getDoc(id);
  if (!d) return;
  const label = `${typeName(d.type)} ${d.no}`.trim();
  const go = nd => { location.hash = `#/edit/${encodeURIComponent(nd.id)}`; };
  switch (act) {
    case "duplicate": {
      const copy = duplicateDoc(id);
      if (copy) toast(t("docs.toast.duplicated", { doc: label, copy: copy.no }), { action: t("common.undo"), onAction: () => { deleteDoc(copy.id); } });
      break;
    }
    case "sent": {
      const prev = d.status;
      markSent(id);
      toast(t(sentStatus(d.type) === "issued" ? "docs.toast.issued" : "docs.toast.markedSent", { doc: label }), { action: t("common.undo"), onAction: () => setDocFields(id, { status: prev, sentAt: 0 }) });
      break;
    }
    case "paid": {
      const prev = markPaid(id);
      toast(t("docs.toast.markedPaid", { doc: label }), { action: t("common.undo"), onAction: () => restorePaymentState(id, prev) });
      break;
    }
    case "unpaid": {
      const prev = markUnpaid(id);
      toast(t("docs.toast.markedUnpaid", { doc: label }), { action: t("common.undo"), onAction: () => restorePaymentState(id, prev) });
      break;
    }
    case "payment": openPaymentSheet(id); break;
    case "remind": openReminderSheet(id); break;
    case "accept": case "decline": {
      const prev = d.status;
      setEstimateStatus(id, act === "accept" ? "accepted" : "declined");
      toast(t(act === "accept" ? "docs.toast.accepted" : "docs.toast.declined", { doc: label }), { action: t("common.undo"), onAction: () => setDocFields(id, { status: prev }) });
      break;
    }
    case "received": case "delivered": {
      const prev = d.status;
      setDocFields(id, { status: act });
      toast(t(`docs.toast.${act}`, { doc: label }), { action: t("common.undo"), onAction: () => setDocFields(id, { status: prev }) });
      break;
    }
    case "convert": {
      const prev = d.status;
      const inv = convertToInvoice(id);
      if (inv) toast(t("docs.toast.converted", { doc: label, inv: inv.no }), { action: t("common.undo"), onAction: () => { deleteDoc(inv.id); setDocFields(id, { status: prev }); } });
      break;
    }
    case "credit": {
      const cn = createCreditNote(id);
      if (cn) { toast(t("docs.toast.creditMade", { no: cn.no, doc: label })); go(cn); }
      break;
    }
    case "delivery": {
      const dn = createDeliveryNote(id);
      if (dn) { toast(t("docs.toast.deliveryMade", { no: dn.no, doc: label })); go(dn); }
      break;
    }
    case "source": { const src = getDoc(d.sourceId); if (src) go(src); break; }
    case "delete": {
      const r = deleteDoc(id);
      if (r) toast(t("docs.toast.deleted", { doc: label }), { action: t("common.undo"), onAction: () => restoreDoc(r.doc, r.index) });
      break;
    }
  }
}
