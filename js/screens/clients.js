// screens/clients.js — Clients and saved items.
//   #/clients              list of clients (search, sort, outstanding per client)
//   #/clients?tab=items    saved products and services
//   #/clients/<id>         one client's dashboard: outstanding, paid, billed, details, history
// Add, edit and delete (with Undo), import from CSV / Excel / pasted Google Sheets rows,
// and export to CSV.

import { esc, initials, debounce, downloadBlob } from "../dom.js";
import { icon } from "../icons.js";
import { t, getLanguage } from "../i18n.js";
import {
  getState, subscribe, getClient, saveClient, deleteClient, restoreClient, setClients, importClients,
  clientsFromDocs, saveClientsFromDocs, updateClientDrafts, docView,
  saveProduct, deleteProduct, restoreProduct, saveProducts, setProducts
} from "../state.js";
import { outstandingOf } from "../calc.js";
import { formatMoney, formatNumber, formatShortDate, parseNumber, todayISO } from "../format.js";
import { toast } from "../toast.js";
import { openSheet } from "../sheet.js";
import { parseDelimited, readSheetFile, toClients, toItems, toCSV } from "../importSheet.js";
import { rowHtml as docRowHtml, openRowMenu as openDocMenu } from "./documents.js";

const PAGE = 50;
const SORTS = ["name", "owed", "recent"];
const PREFS_KEY = "invogen.clients.view";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let root = null, unsub = null, ac = null, dayTimer = 0;
let clientId = "", tab = "clients", q = "", limit = PAGE, histLimit = 20;
let sort = loadSort();

function loadSort() { try { const v = sessionStorage.getItem(PREFS_KEY); return SORTS.includes(v) ? v : "name"; } catch { return "name"; } }
function saveSort() { try { sessionStorage.setItem(PREFS_KEY, sort); } catch {} }

/* ---------------- formatting ---------------- */
const fmtOpts = () => ({ fmt: getState().settings.numberFormat, lang: getLanguage() });
const money = (n, cur) => formatMoney(n, cur, fmtOpts());
const date = iso => { const s = getState().settings; return formatShortDate(iso, s.dateFormat, getLanguage(), s.numberFormat); };
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const sameText = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
const amounts = map => Object.entries(map).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);

/* ---------------- data ---------------- */
// Which documents belong to which client: linked by id, otherwise by the client name.
function linkDocs() {
  const st = getState(), byId = new Map(), byName = new Map(), out = new Map();
  st.clients.forEach(c => { byId.set(c.id, c); out.set(c.id, []); const k = c.name.trim().toLowerCase(); if (k && !byName.has(k)) byName.set(k, c); });
  st.docs.forEach(d => {
    const c = (d.client.id && byId.get(d.client.id)) || byName.get(d.client.name.trim().toLowerCase());
    if (c) out.get(c.id).push(d);
  });
  return out;
}

// Money and counts for one client, per currency.
function statsFor(docs, today = todayISO()) {
  const owed = {}, paid = {}, billed = {};
  let overdue = 0, lastPay = "", lastActivity = "";
  docs.forEach(d => {
    const v = docView(d, today);
    if (d.issued > lastActivity) lastActivity = d.issued;
    const add = (m, n) => { if (n > 0) m[d.currency] = (m[d.currency] || 0) + n; };
    if (d.type === "invoice") {
      if (v.status === "draft" || v.status === "void") return;
      add(billed, v.totals.total);
      add(owed, outstandingOf(d, today));
      // Paid without payment records (e.g. older data): count the whole total.
      add(paid, v.status === "paid" && !v.totals.paid ? v.totals.total : v.totals.paid);
      if (v.status === "overdue") overdue++;
      (d.payments || []).forEach(p => { if (p.date > lastPay) lastPay = p.date; });
    } else if (d.type === "receipt" && !d.sourceId) {
      // Receipts made from an invoice are already counted with that invoice.
      add(billed, v.totals.total);
      add(paid, v.totals.total);
      if (d.issued > lastPay) lastPay = d.issued;
    }
  });
  return { owed, paid, billed, overdue, lastPay, lastActivity, count: docs.length };
}

function clientRows() {
  const st = getState(), links = linkDocs(), today = todayISO();
  const nq = norm(q).trim();
  let list = st.clients.map(c => ({ c, docs: links.get(c.id) || [] }));
  if (nq) list = list.filter(({ c }) => {
    const hay = norm([c.name, c.contact, c.email, c.phone, c.taxId, c.address].join(" "));
    return nq.split(/\s+/).every(w => hay.includes(w));
  });
  list.forEach(r => { r.s = statsFor(r.docs, today); });
  const main = getState().settings.currency;
  const owedSort = r => r.s.owed[main] || Object.values(r.s.owed).reduce((a, b) => a + b, 0);
  const byName = (a, b) => a.c.name.localeCompare(b.c.name, getLanguage(), { sensitivity: "base", numeric: true });
  list.sort({
    name: byName,
    owed: (a, b) => (owedSort(b) - owedSort(a)) || byName(a, b),
    recent: (a, b) => (b.s.lastActivity || "").localeCompare(a.s.lastActivity || "") || (b.c.updatedAt - a.c.updatedAt)
  }[sort]);
  return list;
}

function itemRows() {
  const nq = norm(q).trim();
  const list = getState().products;
  return nq ? list.filter(p => { const hay = norm([p.desc, p.sku, p.unit].join(" ")); return nq.split(/\s+/).every(w => hay.includes(w)); }) : list;
}

/* ---------------- mount ---------------- */
export function mount(el, params = {}) {
  root = el;
  clientId = params.id || "";
  const qt = params.query && params.query.get("tab");
  tab = qt === "items" ? "items" : "clients";
  q = ""; limit = PAGE; histLimit = 20;
  ac = new AbortController();
  const sig = { signal: ac.signal };
  root.addEventListener("click", onClick, sig);
  root.addEventListener("change", onChange, sig);
  unsub = subscribe((s, reason) => { if (reason !== "storage" && reason !== "ui") refresh(); });
  scheduleMidnight();
  if (clientId) return renderClient();
  root.innerHTML = listShell();
  wireSearch();
  renderList();
  return { title: t("nav.clients"), focusSearch };
}
export function unmount() {
  if (unsub) unsub();
  if (ac) ac.abort();
  clearTimeout(dayTimer);
  unsub = null; ac = null; root = null;
}
function refresh() {
  if (!root) return;
  if (clientId) renderClient(); else { renderTabs(); renderList(); }
}
function scheduleMidnight() {
  const now = new Date(), next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  clearTimeout(dayTimer);
  dayTimer = setTimeout(() => { refresh(); scheduleMidnight(); }, next - now);
}
export function focusSearch() {
  const s = root && root.querySelector("#clSearch");
  if (s) { s.focus(); s.select(); } else location.hash = "#/clients";
}

/* ---------------- list ---------------- */
function listShell() {
  const sortOpt = s => `<option value="${s}"${sort === s ? " selected" : ""}>${esc(t(`cl.sort.${s}`))}</option>`;
  return `
  <div class="page clients">
    <header class="page-head">
      <div>
        <h1 class="h1" id="pageTitle" tabindex="-1">${esc(t("nav.clients"))}</h1>
        <p class="page-sub">${esc(t("cl.sub"))}</p>
      </div>
      <div class="head-actions" id="clHeadActions"></div>
    </header>
    <div id="clBanner"></div>
    <div class="cl-tools" role="search" aria-label="${esc(t("cl.searchLabel"))}">
      <div class="segmented" role="group" aria-label="${esc(t("cl.tabsLabel"))}" id="clTabs"></div>
      <label class="search">
        ${icon("search")}
        <span class="visually-hidden" id="clSearchLabel"></span>
        <input type="search" class="input" id="clSearch" autocomplete="off" enterkeyhint="search" aria-keyshortcuts="/" aria-labelledby="clSearchLabel">
      </label>
      <label class="visually-hidden" for="clSort">${esc(t("cl.sortLabel"))}</label>
      <select class="select pill-input" id="clSort">${SORTS.map(sortOpt).join("")}</select>
    </div>
    <p class="visually-hidden" id="clCount" aria-live="polite" aria-atomic="true"></p>
    <section class="card doc-card" id="clList" aria-labelledby="pageTitle"></section>
  </div>`;
}

function renderTabs() {
  if (!root || clientId) return;
  const st = getState();
  const chip = (id, label, n) => `<button type="button" class="chip" data-tab="${id}" aria-pressed="${tab === id}">${esc(label)} <span class="chip-count num">${esc(formatNumber(n, 0, st.settings.numberFormat, getLanguage()))}</span></button>`;
  root.querySelector("#clTabs").innerHTML = chip("clients", t("nav.clients"), st.clients.length) + chip("items", t("cl.tab.items"), st.products.length);
  const items = tab === "items";
  // Phones: Import and Export sit behind a "more" button so the list stays in view.
  root.querySelector("#clHeadActions").innerHTML = `
    <button type="button" class="btn btn-outline wide-only" data-act="import" aria-haspopup="dialog">${icon("upload", 18)}${esc(t("cl.import"))}</button>
    ${(items ? st.products : st.clients).length ? `<button type="button" class="btn btn-outline wide-only" data-act="export">${icon("download", 18)}${esc(t("cl.export"))}</button>` : ""}
    <button type="button" class="btn btn-primary" data-act="${items ? "add-item" : "add"}" aria-haspopup="dialog">${icon("plus", 18)}${esc(t(items ? "cl.addItem" : "cl.add"))}</button>
    <button type="button" class="icon-btn outline phone-only" data-act="list-more" aria-haspopup="dialog" aria-label="${esc(t("ed.moreActions"))}">${icon("ellipsis")}</button>`;
  const label = t(items ? "ed.searchItems" : "ed.searchClients");
  root.querySelector("#clSearchLabel").textContent = label;
  root.querySelector("#clSearch").placeholder = label;
  root.querySelector("#clSort").hidden = items;
  const unsaved = items ? [] : clientsFromDocs();
  root.querySelector("#clBanner").innerHTML = unsaved.length
    ? `<div class="card banner"><p>${esc(t("cl.unsavedBanner", { n: unsaved.length }))}</p><div class="actions"><button type="button" class="btn btn-outline" data-act="save-found">${icon("user-plus", 18)}${esc(t("cl.saveThem"))}</button></div></div>`
    : "";
}

function wireSearch() {
  const s = root.querySelector("#clSearch");
  const run = debounce(() => { q = s.value; limit = PAGE; renderList(); }, 120);
  s.addEventListener("input", run, { signal: ac.signal });
  s.addEventListener("keydown", e => { if (e.key === "Escape" && s.value) { e.stopPropagation(); s.value = ""; q = ""; renderList(); } }, { signal: ac.signal });
  renderTabs();
}

function renderList() {
  if (!root || clientId) return;
  const wrap = root.querySelector("#clList");
  const items = tab === "items";
  const all = items ? getState().products : getState().clients;
  const list = items ? itemRows() : clientRows();
  root.querySelector("#clCount").textContent = q.trim() ? t(items ? "cl.itemCount" : "cl.clientCount", { n: list.length }) : "";
  if (!all.length) {
    wrap.innerHTML = `<div class="empty">
      <h2 class="h2">${esc(t(items ? "cl.itemsEmptyTitle" : "cl.emptyTitle"))}</h2>
      <p>${esc(t(items ? "cl.itemsEmptyBody" : "cl.emptyBody"))}</p>
      <div class="actions">
        <button type="button" class="btn btn-outline" data-act="${items ? "add-item" : "add"}" aria-haspopup="dialog">${icon("plus", 18)}${esc(t(items ? "cl.addItem" : "cl.add"))}</button>
        <button type="button" class="btn btn-ghost" data-act="import" aria-haspopup="dialog">${icon("upload", 18)}${esc(t(items ? "cl.importItems" : "cl.importClients"))}</button>
      </div></div>`;
    return;
  }
  if (!list.length) {
    wrap.innerHTML = `<div class="empty"><p>${esc(t(items ? "cl.noMatchItems" : "cl.noMatch", { q: q.trim() }))}</p>
      <div class="actions"><button type="button" class="btn btn-outline" data-act="clear">${esc(t("cl.clearSearch"))}</button></div></div>`;
    return;
  }
  const shown = list.slice(0, limit);
  wrap.innerHTML = `<ul class="doc-list">${shown.map(items ? itemRowHtml : clientRowHtml).join("")}</ul>` +
    (list.length > limit ? `<div class="doc-more"><button type="button" class="btn btn-outline" data-act="more">${esc(t("docs.showMore", { n: Math.min(PAGE, list.length - limit) }))}</button></div>` : "");
}

function owedHtml(s) {
  const parts = amounts(s.owed);
  if (!parts.length) return "";
  const first = `<bdi class="ltr num">${esc(money(parts[0][1], parts[0][0]))}</bdi>`;
  return first + (parts.length > 1 ? `<span class="doc-sub">${esc(t("docs.moreCurrencies", { n: parts.length - 1 }))}</span>` : "");
}

function clientRowHtml({ c, s }) {
  const meta = [c.email || c.phone || c.contact, s.count ? t("cl.docCount", { n: s.count }) : t("cl.noDocs")].filter(Boolean).join(" · ");
  const owed = owedHtml(s);
  const hidden = [s.overdue ? t("cl.overdue", { n: s.overdue }) : "", amounts(s.owed).map(([cur, n]) => `${t("cl.stat.owed")} ${money(n, cur)}`).join(", ")].filter(Boolean).join(", ");
  return `<li class="doc-row" data-id="${esc(c.id)}">
    <span class="avatar" aria-hidden="true">${esc(initials(c.name) || "?")}</span>
    <a class="doc-main" href="#/clients/${encodeURIComponent(c.id)}">
      <span class="row-title" dir="auto">${esc(c.name)}</span>
      <span class="doc-meta" dir="auto">${esc(meta)}</span>
      ${hidden ? `<span class="visually-hidden">, ${esc(hidden)}</span>` : ""}
    </a>
    <span class="row-foot" aria-hidden="true">
      <span class="doc-status">${s.overdue ? `<span class="badge" data-tone="overdue">${esc(t("cl.overdue", { n: s.overdue }))}</span>` : ""}</span>
      <span class="doc-amount">${owed}</span>
    </span>
    <button type="button" class="icon-btn doc-menu" data-act="menu" aria-haspopup="dialog" aria-label="${esc(t("cl.actionsFor", { name: c.name }))}">${icon("ellipsis")}</button>
  </li>`;
}

function itemRowHtml(p) {
  const cur = getState().settings.currency;
  const meta = [p.unit, p.sku].filter(Boolean).join(" · ");
  return `<li class="doc-row" data-id="${esc(p.id)}">
    <span class="avatar avatar-icon" aria-hidden="true">${icon("package", 18)}</span>
    <button type="button" class="doc-main" data-act="edit-item" aria-haspopup="dialog">
      <span class="row-title" dir="auto">${esc(p.desc || "—")}</span>
      ${meta ? `<span class="doc-meta" dir="auto">${esc(meta)}</span>` : ""}
      <span class="visually-hidden">, ${esc(money(p.rate, cur))}</span>
    </button>
    <span class="row-foot" aria-hidden="true"><span class="doc-status"></span><span class="doc-amount"><bdi class="ltr num">${esc(money(p.rate, cur))}</bdi></span></span>
    <button type="button" class="icon-btn doc-menu" data-act="item-menu" aria-haspopup="dialog" aria-label="${esc(t("cl.actionsFor", { name: p.desc }))}">${icon("ellipsis")}</button>
  </li>`;
}

/* ---------------- client dashboard ---------------- */
function renderClient() {
  const c = getClient(clientId);
  if (!c) {
    root.innerHTML = `<div class="page"><a class="back-link" href="#/clients">${icon("arrow-left", 18)}${esc(t("cl.allClients"))}</a>
      <header class="page-head"><div><h1 class="h1" id="pageTitle" tabindex="-1">${esc(t("cl.notFound"))}</h1></div></header>
      <section class="card placeholder"><p>${esc(t("cl.notFoundBody"))}</p></section></div>`;
    return { title: t("cl.notFound") };
  }
  const today = todayISO();
  const docs = (linkDocs().get(c.id) || []).slice().sort((a, b) => b.issued.localeCompare(a.issued) || b.createdAt - a.createdAt);
  const s = statsFor(docs, today);
  const main = getState().settings.currency;
  const statVal = m => {
    const parts = amounts(m);
    if (!parts.length) return `<bdi class="ltr num">${esc(money(0, docs[0] ? docs[0].currency : main))}</bdi>`;
    return parts.map(([cur, n], i) => `<bdi class="ltr num${i ? " stat-more" : ""}">${esc(money(n, cur))}</bdi>`).join("");
  };
  const stat = (label, val, note) => `<div class="card stat"><span class="stat-text"><span class="stat-label">${esc(label)}</span><span class="stat-note">${esc(note)}</span></span><span class="stat-value">${val}</span></div>`;

  const detail = (label, value, href) => value ? `<div><dt>${esc(label)}</dt><dd dir="auto">${href ? `<a href="${esc(href)}">${esc(value)}</a>` : esc(value)}</dd></div>` : "";
  const tel = c.phone.replace(/[^\d+]/g, "");
  const details = [
    detail(t("ed.contact"), c.contact),
    detail(t("ed.email"), c.email, EMAIL_RE.test(c.email) ? `mailto:${c.email}` : ""),
    detail(t("ed.phone"), c.phone, tel.length >= 3 ? `tel:${tel}` : ""),
    detail(t("ed.billingAddress"), c.address),
    detail(t("cl.taxId"), c.taxId),
    detail(t("cl.notes"), c.notes)
  ].join("");

  const shown = docs.slice(0, histLimit);
  const history = docs.length
    ? `<ul class="doc-list">${shown.map(d => docRowHtml(docView(d, today), { byDoc: true })).join("")}</ul>` +
      (docs.length > histLimit ? `<div class="doc-more"><button type="button" class="btn btn-outline" data-act="more-hist">${esc(t("docs.showMore", { n: Math.min(20, docs.length - histLimit) }))}</button></div>` : "")
    : `<div class="empty"><p>${esc(t("cl.historyEmpty"))}</p></div>`;

  const sub = [c.contact, c.email].filter(Boolean).join(" · ");
  const newHref = type => `#/create?type=${type}&client=${encodeURIComponent(c.id)}`;
  root.innerHTML = `
  <div class="page client-page" data-id="${esc(c.id)}">
    <a class="back-link" href="#/clients">${icon("arrow-left", 18)}${esc(t("cl.allClients"))}</a>
    <header class="page-head client-head">
      <div class="client-id">
        <span class="avatar avatar-lg" aria-hidden="true">${esc(initials(c.name) || "?")}</span>
        <div>
          <h1 class="h1${[...c.name].length > 28 ? " h1-long" : ""}" id="pageTitle" tabindex="-1" dir="auto">${esc(c.name)}</h1>
          ${sub ? `<p class="page-sub" dir="auto">${esc(sub)}</p>` : ""}
        </div>
      </div>
      <div class="head-actions">
        <a class="btn btn-primary" href="${newHref("invoice")}">${icon("plus", 18)}${esc(t("cl.act.newInvoice"))}</a>
        <a class="btn btn-outline" href="${newHref("estimate")}">${esc(t("cl.act.newEstimate"))}</a>
        <button type="button" class="btn btn-outline" data-act="edit" aria-haspopup="dialog">${icon("pencil", 18)}${esc(t("cl.act.edit"))}</button>
        <button type="button" class="icon-btn outline" data-act="client-more" aria-haspopup="dialog" aria-label="${esc(t("ed.moreActions"))}">${icon("ellipsis")}</button>
      </div>
    </header>
    <section class="stats" aria-label="${esc(t("cl.summary"))}">
      ${stat(t("cl.stat.owed"), statVal(s.owed), s.overdue ? t("cl.overdue", { n: s.overdue }) : t("cl.nothingOverdue"))}
      ${stat(t("cl.stat.paid"), statVal(s.paid), s.lastPay ? t("cl.lastPayment", { date: date(s.lastPay) }) : t("cl.noPayments"))}
      ${stat(t("cl.stat.billed"), statVal(s.billed), t("cl.across", { n: s.count }))}
    </section>
    <div class="client-grid">
      <section class="card card-pad client-details" aria-labelledby="clDetailsH">
        <div class="card-head-row"><h2 class="h3" id="clDetailsH">${esc(t("cl.details"))}</h2></div>
        ${details ? `<dl class="details">${details}</dl>` : `<p class="hint">${esc(t("cl.noDetails"))}</p>`}
      </section>
      <section class="card doc-card" aria-labelledby="clHistH">
        <div class="card-head"><h2 class="h3" id="clHistH">${esc(t("cl.history"))}</h2><span class="hint">${esc(t("cl.docCount", { n: docs.length }))}</span></div>
        ${history}
      </section>
    </div>
  </div>`;
  return { title: c.name };
}

/* ---------------- events ---------------- */
function onChange(e) {
  if (e.target.id === "clSort") { sort = e.target.value; saveSort(); renderList(); }
}

function onClick(e) {
  const tb = e.target.closest("[data-tab]");
  if (tb) {
    if (tab === tb.dataset.tab) return;
    tab = tb.dataset.tab; limit = PAGE;
    history.replaceState(null, "", tab === "items" ? "#/clients?tab=items" : "#/clients");
    renderTabs(); renderList();
    return;
  }
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const id = b.closest("[data-id]") && b.closest("[data-id]").dataset.id;
  switch (b.dataset.act) {
    case "add": return editClient(null);
    case "add-item": return editItem(null);
    case "edit": return editClient(clientId);
    case "menu": return b.closest(".client-page") ? openDocMenu(id) : clientMenu(id);
    case "client-more": return clientMoreMenu();
    case "list-more": return listMoreMenu();
    case "edit-item": return editItem(id);
    case "item-menu": return itemMenu(id);
    case "import": return tab === "items" ? importItemsSheet() : importClientsSheet();
    case "export": return exportCSV();
    case "save-found": return saveFound();
    case "more": limit += PAGE; return renderList();
    case "more-hist": histLimit += 20; return renderClient();
    case "clear": {
      const s = root.querySelector("#clSearch");
      s.value = ""; q = ""; renderList(); s.focus();
    }
  }
}

/* ---------------- client actions ---------------- */
function clientMenu(id) {
  const c = getClient(id);
  if (!c) return;
  const s = statsFor(linkDocs().get(c.id) || []);
  const owed = amounts(s.owed).map(([cur, n]) => `<bdi class="ltr">${esc(money(n, cur))}</bdi>`).join(" + ");
  const items = [["open", "users", t("cl.act.open")], ["invoice", "file-text", t("cl.act.newInvoice")], ["estimate", "file-plus", t("cl.act.newEstimate")], ["edit", "pencil", t("cl.act.edit")], ["delete", "trash-2", t("cl.act.delete")]];
  openSheet({
    title: c.name,
    body: `<div class="sheet-summary"><span dir="auto">${esc([c.email, c.phone].filter(Boolean).join(" · ") || t("cl.docCount", { n: s.count }))}</span>
      ${owed ? `<span class="num">${esc(t("cl.stat.owed"))}: ${owed}</span>` : ""}</div>
      <div class="menu">${items.map(([a, ic, label]) => `<button type="button" class="menu-item${a === "delete" ? " danger" : ""}" data-close="${a}">${icon(ic)}<span>${esc(label)}</span></button>`).join("")}</div>`,
    onClose: act => runClientAction(act, id)
  });
}
function clientMoreMenu() {
  const items = [["receipt", "receipt", t("cl.act.newReceipt")], ["delete", "trash-2", t("cl.act.delete")]];
  openSheet({
    title: t("ed.moreActions"),
    body: `<div class="menu">${items.map(([a, ic, label]) => `<button type="button" class="menu-item${a === "delete" ? " danger" : ""}" data-close="${a}">${icon(ic)}<span>${esc(label)}</span></button>`).join("")}</div>`,
    onClose: act => runClientAction(act, clientId)
  });
}
function listMoreMenu() {
  const has = (tab === "items" ? getState().products : getState().clients).length;
  const items = [["import", "upload", t(tab === "items" ? "cl.importItems" : "cl.importClients")]];
  if (has) items.push(["export", "download", t("cl.export")]);
  openSheet({
    title: t("ed.moreActions"),
    body: `<div class="menu">${items.map(([a, ic, label]) => `<button type="button" class="menu-item" data-close="${a}">${icon(ic)}<span>${esc(label)}</span></button>`).join("")}</div>`,
    onClose: act => { if (act === "import") (tab === "items" ? importItemsSheet : importClientsSheet)(); else if (act === "export") exportCSV(); }
  });
}
function runClientAction(act, id) {
  const c = getClient(id);
  if (!act || !c) return;
  const go = h => { location.hash = h; };
  if (act === "open") go(`#/clients/${encodeURIComponent(id)}`);
  else if (["invoice", "estimate", "receipt"].includes(act)) go(`#/create?type=${act}&client=${encodeURIComponent(id)}`);
  else if (act === "edit") editClient(id);
  else if (act === "delete") removeClient(id);
}
function removeClient(id) {
  const n = (linkDocs().get(id) || []).length;
  const r = deleteClient(id);
  if (!r) return;
  if (clientId === id) location.hash = "#/clients";
  toast(n ? t("cl.deletedKept", { name: r.client.name, n }) : t("cl.deleted", { name: r.client.name }), {
    action: t("common.undo"), onAction: () => restoreClient(r.client, r.index)
  });
}

function editClient(id) {
  const c = id ? getClient(id) : null;
  if (id && !c) return;
  const v = c || { name: "", contact: "", email: "", phone: "", address: "", taxId: "", notes: "" };
  const f = (label, key, o = {}) => {
    const fid = `cf-${key}`;
    const hint = o.hint ? `<p class="hint" id="${fid}-h">${esc(o.hint)}</p>` : "";
    const err = o.err ? `<p class="err" id="${fid}-e" hidden></p>` : "";
    const desc = [o.hint ? `${fid}-h` : "", o.err ? `${fid}-e` : ""].filter(Boolean).join(" ");
    const attrs = `id="${fid}" name="${key}"${desc ? ` aria-describedby="${desc}"` : ""}${o.req ? " required aria-required=\"true\"" : ""}`;
    const ctl = o.area
      ? `<textarea class="input textarea" rows="${o.rows || 3}" ${attrs} dir="auto" maxlength="${o.max || 2000}">${esc(v[key])}</textarea>`
      : `<input class="input" type="${o.type || "text"}" ${attrs} value="${esc(v[key])}" autocomplete="${o.ac || "off"}" dir="${o.type === "tel" || o.type === "email" ? "ltr" : "auto"}"${o.mode ? ` inputmode="${o.mode}"` : ""} maxlength="${o.max || 300}">`;
    return `<div class="field${o.span ? " span2" : ""}"><label for="${fid}">${esc(label)}</label>${ctl}${err}${hint}</div>`;
  };
  const drafts = c ? (linkDocs().get(c.id) || []).filter(d => d.status === "draft" && d.type !== "receipt").length : 0;
  const dlg = openSheet({
    title: t(c ? "cl.editTitle" : "cl.addTitle"),
    body: `<form id="clientForm" class="ed-grid" novalidate>
        ${f(t("ed.clientName"), "name", { span: true, req: true, err: true, ac: "organization" })}
        ${f(t("ed.contact"), "contact", { ac: "name" })}
        ${f(t("ed.phone"), "phone", { type: "tel", ac: "tel", mode: "tel", max: 60 })}
        ${f(t("ed.email"), "email", { type: "email", span: true, err: true, ac: "email", mode: "email" })}
        ${f(t("ed.billingAddress"), "address", { area: true, span: true, ac: "street-address" })}
        ${f(t("cl.taxId"), "taxId", { span: true, max: 100 })}
        ${f(t("cl.notes"), "notes", { area: true, span: true, rows: 2, hint: t("cl.notesHint"), max: 4000 })}
        ${drafts ? `<p class="hint span2">${esc(t("cl.draftsHint"))}</p>` : ""}
      </form>`,
    foot: `<button type="button" class="btn btn-outline" data-close="">${esc(t("common.cancel"))}</button>
           <button type="submit" form="clientForm" class="btn btn-primary">${esc(t("cl.save"))}</button>`
  });
  const form = dlg.querySelector("#clientForm");
  if (!c) setTimeout(() => form.elements.name.focus(), 0);
  const showErr = (key, msg) => {
    const el = form.querySelector(`#cf-${key}-e`), input = form.elements[key];
    el.hidden = !msg; el.textContent = msg || "";
    input.setAttribute("aria-invalid", msg ? "true" : "false");
  };
  form.addEventListener("submit", e => {
    e.preventDefault();
    const data = Object.fromEntries([...new FormData(form)].map(([k, val]) => [k, String(val).trim()]));
    const dup = getState().clients.find(x => x.id !== (c && c.id) && sameText(x.name, data.name));
    const nameErr = !data.name ? t("cl.errName") : dup ? t("cl.errDup", { name: dup.name }) : "";
    const emailErr = data.email && !EMAIL_RE.test(data.email) ? t("cl.errEmail") : "";
    showErr("name", nameErr); showErr("email", emailErr);
    if (nameErr || emailErr) { form.elements[nameErr ? "name" : "email"].focus(); return; }
    const prevName = c ? c.name : "";
    const saved = saveClient({ ...(c || {}), ...data });
    dlg.close();
    if (c) {
      const n = updateClientDrafts(saved, prevName);
      toast(n ? t("cl.updatedDrafts", { name: saved.name, n }) : t("cl.updated", { name: saved.name }));
    } else {
      toast(t("cl.added", { name: saved.name }), { action: t("cl.act.newInvoice"), onAction: () => { location.hash = `#/create?client=${encodeURIComponent(saved.id)}`; } });
    }
  });
}

function saveFound() {
  const r = saveClientsFromDocs();
  if (r) toast(t("cl.savedFromDocs", { n: r.count }), { action: t("common.undo"), onAction: r.undo });
}

/* ---------------- item actions ---------------- */
function itemMenu(id) {
  const p = getState().products.find(x => x.id === id);
  if (!p) return;
  openSheet({
    title: p.desc || t("cl.tab.items"),
    body: `<div class="menu">
      <button type="button" class="menu-item" data-close="edit">${icon("pencil")}<span>${esc(t("cl.act.editItem"))}</span></button>
      <button type="button" class="menu-item danger" data-close="delete">${icon("trash-2")}<span>${esc(t("cl.act.deleteItem"))}</span></button></div>`,
    onClose: act => {
      if (act === "edit") editItem(id);
      else if (act === "delete") {
        const r = deleteProduct(id);
        if (r) toast(t("cl.itemDeleted", { item: r.product.desc }), { action: t("common.undo"), onAction: () => restoreProduct(r.product, r.index) });
      }
    }
  });
}

function editItem(id) {
  const p = id ? getState().products.find(x => x.id === id) : null;
  if (id && !p) return;
  const st = getState().settings;
  const priceStr = p ? String(p.rate) : "";
  const dlg = openSheet({
    title: t(p ? "cl.itemEditTitle" : "cl.itemAddTitle"),
    body: `<form id="itemForm" class="ed-grid" novalidate>
        <div class="field span2"><label for="if-desc">${esc(t("ed.descShort"))}</label>
          <textarea class="input textarea" rows="2" id="if-desc" name="desc" dir="auto" maxlength="2000" required aria-required="true" aria-describedby="if-desc-e">${esc(p ? p.desc : "")}</textarea>
          <p class="err" id="if-desc-e" hidden></p></div>
        <div class="field"><label for="if-rate">${esc(t("cl.price"))} (${esc(st.currency)})</label>
          <input class="input num" id="if-rate" name="rate" inputmode="decimal" autocomplete="off" value="${esc(priceStr)}" aria-describedby="if-rate-e">
          <p class="err" id="if-rate-e" hidden></p></div>
        <div class="field"><label for="if-unit">${esc(t("ed.unit"))}</label><input class="input" id="if-unit" name="unit" maxlength="30" autocomplete="off" dir="auto" value="${esc(p ? p.unit : "")}"></div>
        <div class="field span2"><label for="if-sku">${esc(t("ed.sku"))}</label><input class="input" id="if-sku" name="sku" maxlength="100" autocomplete="off" dir="auto" value="${esc(p ? p.sku : "")}"></div>
      </form>`,
    foot: `<button type="button" class="btn btn-outline" data-close="">${esc(t("common.cancel"))}</button>
           <button type="submit" form="itemForm" class="btn btn-primary">${esc(t("cl.save"))}</button>`
  });
  const form = dlg.querySelector("#itemForm");
  if (!p) setTimeout(() => form.elements.desc.focus(), 0);
  form.addEventListener("submit", e => {
    e.preventDefault();
    const desc = form.elements.desc.value.trim();
    const rs = form.elements.rate.value.trim();
    const rate = rs === "" ? 0 : parseNumber(rs);
    const errs = { desc: !desc ? t("cl.errDesc") : "", rate: !Number.isFinite(rate) || rate < 0 ? t("cl.errPrice") : "" };
    Object.entries(errs).forEach(([k, m]) => {
      const el = form.querySelector(`#if-${k}-e`); el.hidden = !m; el.textContent = m;
      form.elements[k].setAttribute("aria-invalid", m ? "true" : "false");
    });
    if (errs.desc || errs.rate) { form.elements[errs.desc ? "desc" : "rate"].focus(); return; }
    saveProduct({ ...(p || {}), desc, rate, unit: form.elements.unit.value.trim(), sku: form.elements.sku.value.trim() });
    dlg.close();
    toast(t("cl.itemSaved", { item: desc }));
  });
}

/* ---------------- import & export ---------------- */
function importSheet({ title, intro, placeholder, parse, table, noneMsg, onImport }) {
  let found = [];
  openSheet({
    title, wide: true,
    body: `<p>${esc(intro)}</p>
      <div class="field"><label for="impPaste">${esc(t("ed.pasteLabel"))}</label><textarea class="input textarea mono" id="impPaste" rows="5" placeholder="${esc(placeholder)}"></textarea></div>
      <div class="ed-actions-row"><label class="btn btn-outline file-btn">${icon("upload", 18)}<span>${esc(t("ed.chooseFile"))}</span><input type="file" id="impFile" class="visually-hidden" accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"></label><span class="hint">CSV · Excel · Google Sheets</span></div>
      <p class="err" id="impErr" role="alert" hidden></p>
      <div id="impPreview" aria-live="polite"></div>`,
    foot: `<button type="button" class="btn btn-outline" data-close="">${esc(t("common.cancel"))}</button>
           <button type="button" class="btn btn-primary" data-close="import" id="impGo" disabled>${esc(t("cl.importDo"))}</button>`,
    onOpen: dlg => {
      const show = rows => {
        found = parse(rows);
        dlg.querySelector("#impPreview").innerHTML = found.length ? table(found) : "";
        const err = dlg.querySelector("#impErr");
        err.hidden = !!found.length || !rows.length;
        err.textContent = noneMsg;
        dlg.querySelector("#impGo").disabled = !found.length;
      };
      dlg.querySelector("#impPaste").addEventListener("input", debounce(e => show(parseDelimited(e.target.value)), 200));
      dlg.querySelector("#impFile").addEventListener("change", async e => {
        const file = e.target.files[0]; e.target.value = "";
        if (!file) return;
        try { show(await readSheetFile(file)); }
        catch (err) { const el = dlg.querySelector("#impErr"); el.hidden = false; el.textContent = t(err.message === "xlsx-load" ? "ed.importXlsxFail" : "ed.importFail"); }
      });
    },
    onClose: v => { if (v === "import" && found.length) onImport(found); }
  });
}

function importClientsSheet() {
  importSheet({
    title: t("cl.importClients"),
    intro: t("cl.importIntro"),
    placeholder: "Name\tEmail\tPhone\tAddress",
    parse: toClients,
    noneMsg: t("cl.importNone"),
    table: list => `<p class="hint">${esc(t("cl.importFound", { n: list.length }))}</p><div class="imp-table-wrap"><table class="imp-table"><thead><tr><th>${esc(t("cl.colName"))}</th><th>${esc(t("ed.email"))}</th><th>${esc(t("ed.phone"))}</th></tr></thead><tbody>${list.slice(0, 50).map(c => `<tr><td dir="auto">${esc(c.name)}</td><td dir="ltr">${esc(c.email)}</td><td dir="ltr">${esc(c.phone)}</td></tr>`).join("")}</tbody></table></div>`,
    onImport: list => {
      const prev = structuredClone(getState().clients);
      const r = importClients(list);
      toast(t("cl.imported", { added: r.added, updated: r.updated }), { action: t("common.undo"), onAction: () => setClients(prev) });
    }
  });
}

function importItemsSheet() {
  const cur = getState().settings.currency;
  importSheet({
    title: t("cl.importItems"),
    intro: t("cl.importItemsIntro"),
    placeholder: t("ed.pastePh"),
    parse: rows => toItems(rows).filter(i => i.desc),
    noneMsg: t("ed.importNone"),
    table: list => `<p class="hint">${esc(t("ed.importFound", { n: list.length }))}</p><div class="imp-table-wrap"><table class="imp-table"><thead><tr><th>${esc(t("ed.descShort"))}</th><th>${esc(t("ed.unit"))}</th><th>${esc(t("cl.price"))}</th></tr></thead><tbody>${list.slice(0, 50).map(i => `<tr><td dir="auto">${esc(i.desc)}</td><td dir="auto">${esc(i.unit)}</td><td class="num"><bdi class="ltr">${esc(money(i.rate, cur))}</bdi></td></tr>`).join("")}</tbody></table></div>`,
    onImport: list => {
      const prev = structuredClone(getState().products);
      saveProducts(list.map(i => ({ desc: i.desc, rate: i.rate, unit: i.unit, sku: i.sku })));
      toast(t("cl.itemsImported", { n: list.length }), { action: t("common.undo"), onAction: () => setProducts(prev) });
    }
  });
}

function exportCSV() {
  const st = getState(), day = todayISO();
  let rows, name;
  if (tab === "items") {
    rows = [["Description", "Unit", "SKU", "Price"], ...st.products.map(p => [p.desc, p.unit, p.sku, p.rate])];
    name = `invogen-items-${day}.csv`;
  } else {
    rows = [["Name", "Contact", "Email", "Phone", "Address", "Tax ID", "Notes"], ...st.clients.map(c => [c.name, c.contact, c.email, c.phone, c.address, c.taxId, c.notes])];
    name = `invogen-clients-${day}.csv`;
  }
  downloadBlob(new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" }), name);
  toast(t("cl.exported", { file: name }));
}
