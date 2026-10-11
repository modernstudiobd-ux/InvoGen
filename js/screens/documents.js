// screens/documents.js — the Documents list: every invoice, estimate and receipt,
// with type and status filters, search, sorting, outstanding totals, quick actions
// (duplicate, record payment, mark paid, convert, delete) and Undo.

import { esc, initials, debounce } from "../dom.js";
import { icon } from "../icons.js";
import { t, tHtml, getLanguage } from "../i18n.js";
import {
  getState, subscribe, getDoc, docView, deleteDoc, restoreDoc, duplicateDoc, markSent, markPaid, markUnpaid,
  restorePaymentState, setDocFields, setEstimateStatus, convertToInvoice
} from "../state.js";
import { outstandingOf } from "../calc.js";
import { formatMoney, formatShortDate, todayISO } from "../format.js";
import { toast } from "../toast.js";
import { openSheet } from "../sheet.js";
import { addSampleData, removeSampleData, hasSampleData } from "../sample.js";
import { downloadBackup, backupDue, snoozeBackup } from "../backup.js";
import { openPaymentSheet } from "../payments.js";

const PAGE = 50;
const TYPES = ["all", "invoice", "estimate", "receipt"];
const STATUSES = ["any", "draft", "sent", "partial", "overdue", "paid", "accepted", "declined", "expired", "void"];
const SORTS = ["newest", "oldest", "due", "amount", "client"];
const PREFS_KEY = "invogen.docs.view";

let root = null, unsub = null, limit = PAGE, dayTimer = 0, ac = null;
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
  root = el;
  limit = PAGE;
  view.q = "";
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
  root = null;
}

// Statuses like "Overdue" depend on today's date, so refresh just after midnight.
function scheduleMidnight() {
  const now = new Date(), next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  clearTimeout(dayTimer);
  dayTimer = setTimeout(() => { if (root) { renderAll(); scheduleMidnight(); } }, next - now);
}

function shell() {
  const chip = ty => `<button type="button" class="chip" data-type="${ty}" aria-pressed="${view.type === ty}">${esc(t(`docs.filter.${ty}`))}</button>`;
  const statusOpt = s => `<option value="${s}"${view.status === s ? " selected" : ""}>${esc(s === "any" ? t("docs.anyStatus") : statusName(s))}</option>`;
  const sortOpt = s => `<option value="${s}"${view.sort === s ? " selected" : ""}>${esc(t(`docs.sort.${s}`))}</option>`;
  return `
  <div class="page docs">
    <header class="page-head">
      <div>
        <h1 class="h1" id="pageTitle" tabindex="-1">${esc(t("nav.documents"))}</h1>
        <p class="page-sub" id="docsSummary"></p>
      </div>
    </header>
    <div id="docsBanner"></div>
    <div class="docs-tools" role="search" aria-label="${esc(t("docs.searchLabel"))}">
      <div class="segmented" role="group" aria-label="${esc(t("docs.typeLabel"))}">${TYPES.map(chip).join("")}</div>
      <div class="docs-find">
        <label class="search">
          ${icon("search")}
          <span class="visually-hidden">${esc(t("docs.searchLabel"))}</span>
          <input type="search" class="input" id="docsSearch" autocomplete="off" enterkeyhint="search" placeholder="${esc(t("docs.searchPlaceholder"))}" aria-keyshortcuts="/">
        </label>
        <label class="visually-hidden" for="docsStatus">${esc(t("docs.statusLabel"))}</label>
        <select class="select pill-input" id="docsStatus">${STATUSES.map(statusOpt).join("")}</select>
        <label class="visually-hidden" for="docsSort">${esc(t("docs.sortLabel"))}</label>
        <select class="select pill-input" id="docsSort">${SORTS.map(sortOpt).join("")}</select>
      </div>
    </div>
    <p class="visually-hidden" id="docsCount" aria-live="polite" aria-atomic="true"></p>
    <section class="card doc-card" id="docsListWrap" aria-labelledby="pageTitle"></section>
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
  } else if (backupDue(st)) {
    const last = st.settings.lastBackupAt ? t("docs.backupLast", { date: date(new Date(st.settings.lastBackupAt).toISOString().slice(0, 10)) }) : t("docs.backupNever");
    el.innerHTML = `<div class="card banner"><p>${esc(t("docs.backupBanner"))} ${esc(last)}</p><div class="actions"><button type="button" class="btn btn-outline" data-act="backup">${icon("download")}${esc(t("docs.backupNow"))}</button><button type="button" class="btn btn-ghost" data-act="snooze">${esc(t("common.later"))}</button></div></div>`;
  } else el.innerHTML = "";
}

function renderList() {
  const wrap = root.querySelector("#docsListWrap");
  const { list, total } = rows();
  const filtered = view.type !== "all" || view.status !== "any" || view.q.trim();
  root.querySelector("#docsCount").textContent = filtered ? t("docs.resultCount", { n: list.length }) : "";

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
  wrap.innerHTML = `<ul class="doc-list">${shown.map(rowHtml).join("")}</ul>` +
    (list.length > limit ? `<div class="doc-more"><button type="button" class="btn btn-outline" data-act="more">${esc(t("docs.showMore", { n: Math.min(PAGE, list.length - limit) }))}</button></div>` : "");
}

function metaFor(v) {
  const d = v.doc;
  if (d.type === "receipt") return date(d.issued);
  if (d.type === "estimate") return d.due ? t("docs.validUntil", { date: date(d.due) }) : date(d.issued);
  if (v.status === "paid") {
    const last = (d.payments || []).map(p => p.date).sort().pop();
    return last ? t("docs.paidOn", { date: date(last) }) : date(d.issued);
  }
  if (v.status === "void") return date(d.issued);
  return d.due ? t("docs.dueOn", { date: date(d.due) }) : date(d.issued);
}

// Also used for a client's history (opts.byDoc: the document number is the title).
export function rowHtml(v, opts = {}) {
  const d = v.doc, tt = v.totals;
  const name = d.client.name.trim();
  const title = opts.byDoc ? `${typeName(d.type)} ${d.no}`.trim() : name;
  const unpaid = d.type === "invoice" && ["sent", "partial", "overdue"].includes(v.status);
  const main = unpaid ? tt.balance : tt.total;
  const sub = unpaid && tt.paid > 0 ? tHtml("docs.ofTotal", { total: `<bdi class="ltr">${esc(money(tt.total, d.currency))}</bdi>` }) : "";
  const extra = [typeName(d.type), statusName(v.status), money(main, d.currency)].join(", ");
  return `<li class="doc-row" data-id="${esc(d.id)}">
    <span class="avatar${opts.byDoc ? " avatar-icon" : ""}" aria-hidden="true">${opts.byDoc ? icon(d.type === "receipt" ? "receipt" : d.type === "estimate" ? "file-plus" : "file-text", 18) : esc(name ? initials(name) : "–")}</span>
    <a class="doc-main" href="#/edit/${encodeURIComponent(d.id)}">
      <span class="row-title${title ? "" : " is-empty"}" dir="auto">${esc(title || t("docs.noClient"))}</span>
      <span class="doc-meta">${opts.byDoc ? "" : `<bdi class="ltr">${esc(d.no || "—")}</bdi> · `}${esc(metaFor(v))}</span>
      <span class="visually-hidden">, ${esc(extra)}</span>
    </a>
    <span class="row-foot" aria-hidden="true">
      <span class="doc-status"><span class="badge" data-tone="${v.status}">${esc(statusName(v.status))}</span></span>
      <span class="doc-amount"><bdi class="ltr num">${esc(money(main, d.currency))}</bdi>${sub ? `<span class="doc-sub num">${sub}</span>` : ""}</span>
    </span>
    <button type="button" class="icon-btn doc-menu" data-act="menu" aria-haspopup="dialog" aria-label="${esc(t("docs.actionsFor", { doc: `${d.no} ${name}`.trim() }))}">${icon("ellipsis")}</button>
  </li>`;
}

/* ---------------- events ---------------- */
function wire() {
  const search = root.querySelector("#docsSearch");
  const run = debounce(() => { view.q = search.value; limit = PAGE; renderList(); }, 120);
  search.addEventListener("input", run);
  search.addEventListener("keydown", e => { if (e.key === "Escape" && search.value) { e.stopPropagation(); search.value = ""; view.q = ""; renderList(); } });
  root.querySelector("#docsStatus").addEventListener("change", e => { view.status = e.target.value; limit = PAGE; saveView(); renderList(); });
  root.querySelector("#docsSort").addEventListener("change", e => { view.sort = e.target.value; saveView(); renderList(); });
  ac = new AbortController();
  root.addEventListener("click", onClick, { signal: ac.signal });
}

function onClick(e) {
  const chip = e.target.closest("[data-type]");
  if (chip) {
    view.type = chip.dataset.type; limit = PAGE; saveView();
    root.querySelectorAll("[data-type]").forEach(c => c.setAttribute("aria-pressed", String(c === chip)));
    renderList();
    return;
  }
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "menu") openRowMenu(b.closest(".doc-row").dataset.id, b);
  else if (act === "more") { limit += PAGE; renderList(); }
  else if (act === "clear") clearFilters();
  else if (act === "sample") { addSampleData(); toast(t("docs.sampleAdded")); }
  else if (act === "remove-sample") { const n = removeSampleData(); toast(t("docs.sampleRemoved", { n })); }
  else if (act === "backup") { downloadBackup(); toast(t("docs.backupDone")); }
  else if (act === "snooze") snoozeBackup();
}

function clearFilters() {
  view = { ...view, type: "all", status: "any", q: "" };
  saveView();
  root.querySelector("#docsSearch").value = "";
  root.querySelector("#docsStatus").value = "any";
  root.querySelectorAll("[data-type]").forEach(c => c.setAttribute("aria-pressed", String(c.dataset.type === "all")));
  renderList();
  root.querySelector("#docsSearch").focus();
}

export function focusSearch() {
  const s = root && root.querySelector("#docsSearch");
  if (s) { s.focus(); s.select(); }
}

/* ---------------- row actions ---------------- */
export function openRowMenu(id) {
  const d = getDoc(id);
  if (!d) return;
  const v = docView(d);
  const items = [["open", "file-text", t("docs.act.open")], ["duplicate", "copy", t("docs.act.duplicate")]];
  if (d.type !== "receipt" && v.status === "draft") items.push(["sent", "send", t("docs.act.markSent")]);
  if (d.type === "invoice") {
    if (["draft", "sent", "partial", "overdue"].includes(v.status)) {
      items.push(["payment", "banknote", t("docs.act.recordPayment")]);
      items.push(["paid", "circle-check", t("docs.act.markPaid")]);
    }
    if (v.status === "paid" || v.status === "partial" || (v.status === "overdue" && v.totals.paid > 0)) items.push(["unpaid", "undo-2", t("docs.act.markUnpaid")]);
  }
  if (d.type === "estimate") {
    if (v.status !== "accepted") items.push(["accept", "circle-check", t("docs.act.markAccepted")]);
    if (v.status !== "declined") items.push(["decline", "circle-x", t("docs.act.markDeclined")]);
    items.push(["convert", "arrow-right-left", t("docs.act.convert")]);
  }
  items.push(["delete", "trash-2", t("docs.act.delete")]);

  const tt = v.totals;
  openSheet({
    title: `${typeName(d.type)} ${d.no}`.trim(),
    body: `<div class="sheet-summary"><strong>${esc(d.client.name || t("docs.noClient"))}</strong>
        <span><span class="badge" data-tone="${v.status}">${esc(statusName(v.status))}</span></span>
        <span class="num">${esc(t("docs.totalLabel"))}: <bdi class="ltr">${esc(money(tt.total, d.currency))}</bdi>${d.type === "invoice" && tt.paid > 0 ? ` · ${esc(t("docs.paidLabel"))}: <bdi class="ltr">${esc(money(tt.paid, d.currency))}</bdi>` : ""}</span></div>
      <div class="menu">${items.map(([a, ic, label]) => a === "open"
        ? `<a class="menu-item" href="#/edit/${encodeURIComponent(d.id)}" data-close="">${icon(ic)}<span>${esc(label)}</span></a>`
        : `<button type="button" class="menu-item${a === "delete" ? " danger" : ""}" data-close="${a}">${icon(ic)}<span>${esc(label)}</span></button>`).join("")}</div>`,
    onClose: act => act && runAction(act, d.id)
  });
}

function runAction(act, id) {
  const d = getDoc(id);
  if (!d) return;
  const label = `${typeName(d.type)} ${d.no}`.trim();
  switch (act) {
    case "duplicate": {
      const copy = duplicateDoc(id);
      if (copy) toast(t("docs.toast.duplicated", { doc: label, copy: copy.no }), { action: t("common.undo"), onAction: () => { deleteDoc(copy.id); } });
      break;
    }
    case "sent": {
      const prev = d.status;
      markSent(id);
      toast(t("docs.toast.markedSent", { doc: label }), { action: t("common.undo"), onAction: () => setDocFields(id, { status: prev, sentAt: 0 }) });
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
    case "accept": case "decline": {
      const prev = d.status;
      setEstimateStatus(id, act === "accept" ? "accepted" : "declined");
      toast(t(act === "accept" ? "docs.toast.accepted" : "docs.toast.declined", { doc: label }), { action: t("common.undo"), onAction: () => setDocFields(id, { status: prev }) });
      break;
    }
    case "convert": {
      const prev = d.status;
      const inv = convertToInvoice(id);
      if (inv) toast(t("docs.toast.converted", { doc: label, inv: inv.no }), { action: t("common.undo"), onAction: () => { deleteDoc(inv.id); setDocFields(id, { status: prev }); } });
      break;
    }
    case "delete": {
      const r = deleteDoc(id);
      if (r) toast(t("docs.toast.deleted", { doc: label }), { action: t("common.undo"), onAction: () => restoreDoc(r.doc, r.index) });
      break;
    }
  }
}
