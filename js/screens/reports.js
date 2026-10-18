// screens/reports.js — Reports (#/reports): net sales, money received, what is owed and
// how late, tax collected, a month-by-month chart and the top clients, for a chosen
// period and currency. Every table can be downloaded as CSV for an accountant.

import { esc, downloadBlob } from "../dom.js";
import { icon } from "../icons.js";
import { t, getLanguage, currencyName } from "../i18n.js";
import { getState, subscribe } from "../state.js";
import { formatMoney, formatNumber, formatDate, todayISO } from "../format.js";
import { PERIODS, periodRange, currenciesUsed, buildReport, docsCsv, paymentsCsv, taxCsv, clientsCsv } from "../reports.js";
import { toCSV } from "../importSheet.js";
import { openSheet } from "../sheet.js";
import { toast } from "../toast.js";
import { CURRENCY } from "../currencies.js";

const PREFS_KEY = "invogen.reports.view";
let root = null, unsub = null, ac = null;
let view = loadView();

function loadView() {
  try {
    const v = JSON.parse(sessionStorage.getItem(PREFS_KEY) || "{}");
    return { period: PERIODS.includes(v.period) ? v.period : "thisYear", currency: v.currency || "", from: v.from || "", to: v.to || "" };
  } catch { return { period: "thisYear", currency: "", from: "", to: "" }; }
}
const saveView = () => { try { sessionStorage.setItem(PREFS_KEY, JSON.stringify(view)); } catch {} };

const S = () => getState().settings;
const money = (n, cur) => formatMoney(n, cur, { fmt: S().numberFormat, lang: getLanguage() });
const date = iso => formatDate(iso, S().dateFormat, getLanguage(), S().numberFormat);
const pct = v => formatNumber(v, Number.isInteger(Number(v)) ? 0 : 2, S().numberFormat, getLanguage()) + "%";

function currencies() {
  const docs = getState().docs;
  return currenciesUsed(docs, S().currency);
}
function currentCurrency() {
  const list = currencies();
  if (view.currency && list.includes(view.currency)) return view.currency;
  return list.includes(S().currency) ? S().currency : list[0];
}
function range() { return periodRange(view.period, todayISO(), { from: view.from, to: view.to }); }

/* ---------------- mount ---------------- */
export function mount(el) {
  root = el;
  ac = new AbortController();
  root.innerHTML = shell();
  render();
  root.addEventListener("change", onChange, { signal: ac.signal });
  root.addEventListener("click", onClick, { signal: ac.signal });
  wireTip(ac.signal);
  unsub = subscribe((s, reason) => { if (reason !== "storage" && reason !== "ui") render(); });
  return { title: t("nav.reports") };
}
export function unmount() {
  if (unsub) unsub();
  if (ac) ac.abort();
  root = unsub = ac = null;
}

function shell() {
  return `<div class="page reports">
    <header class="page-head">
      <div>
        <h1 class="h1" id="pageTitle" tabindex="-1">${esc(t("nav.reports"))}</h1>
        <p class="page-sub" id="repSub"></p>
      </div>
      <div class="page-actions"><button type="button" class="btn btn-primary" data-act="export" aria-haspopup="dialog">${icon("file-spreadsheet", 18)}${esc(t("rep.export"))}</button></div>
    </header>
    <div class="rep-tools" id="repTools"></div>
    <div id="repBody" class="rep-body"></div>
  </div>`;
}

function toolsHtml() {
  const curList = currencies(), cur = currentCurrency();
  const opt = (v, l, on) => `<option value="${esc(v)}"${on ? " selected" : ""}>${esc(l)}</option>`;
  const r = range();
  return `<div class="field"><label for="repPeriod">${esc(t("rep.period"))}</label>
      <select class="select" id="repPeriod">${PERIODS.map(p => opt(p, t(`rep.p.${p}`), p === view.period)).join("")}</select></div>
    ${view.period === "custom" ? `<div class="field"><label for="repFrom">${esc(t("rep.from"))}</label><input class="input" type="date" id="repFrom" value="${esc(r.from)}"></div>
      <div class="field"><label for="repTo">${esc(t("rep.to"))}</label><input class="input" type="date" id="repTo" value="${esc(r.to)}"></div>` : ""}
    ${curList.length > 1 ? `<div class="field"><label for="repCur">${esc(t("ed.currency"))}</label>
      <select class="select" id="repCur">${curList.map(c => opt(c, `${c} · ${currencyName(c, (CURRENCY[c] || {}).name || c)}`, c === cur)).join("")}</select></div>` : ""}`;
}

function render() {
  if (!root) return;
  const tools = root.querySelector("#repTools");
  // Don't redraw the controls while one of them is being used.
  if (!tools.contains(document.activeElement) || !tools.innerHTML) tools.innerHTML = toolsHtml();
  const st = getState(), cur = currentCurrency(), r = range();
  const body = root.querySelector("#repBody");
  const sub = root.querySelector("#repSub");
  if (!st.docs.some(d => d.status !== "draft")) {
    sub.textContent = t("rep.sub0");
    body.innerHTML = `<section class="card empty"><h2 class="h2">${esc(t("rep.emptyTitle"))}</h2><p>${esc(t("rep.emptyBody"))}</p>
      <div class="actions"><a class="btn btn-primary" href="#/create">${icon("plus", 18)}${esc(t("nav.create"))}</a></div></section>`;
    return;
  }
  const R = buildReport(st, { from: r.from, to: r.to, currency: cur });
  const periodText = view.period === "all" ? t("rep.p.all") : `${date(r.from)} – ${date(r.to)}`;
  sub.textContent = t("rep.sub", { period: periodText, currency: cur });
  const m = n => `<bdi class="ltr num">${esc(money(n, cur))}</bdi>`;
  const stat = (label, val, note) => `<div class="card stat"><span class="stat-text"><span class="stat-label">${esc(label)}</span><span class="stat-note">${note}</span></span><span class="stat-value">${val}</span></div>`;

  body.innerHTML = `
    <div class="stats rep-stats">
      ${stat(t("rep.net"), m(R.net), R.credited ? esc(t("rep.netNote", { invoiced: money(R.invoiced, cur), credited: money(R.credited, cur) })) : esc(t("rep.invoiceCount", { n: R.invoiceCount })))}
      ${stat(t("rep.received"), m(R.received), esc(t("rep.paymentCount", { n: R.paymentCount })))}
      ${stat(t("rep.outstanding"), m(R.outstanding), esc(R.overdueCount ? t("rep.overdueNote", { n: R.overdueCount, amount: money(R.overdue, cur) }) : t("rep.nothingOverdue")))}
      ${stat(t("rep.taxCollected"), m(R.taxTotal), esc(t("rep.taxNote")))}
    </div>
    <section class="card rep-card" aria-labelledby="repChartH">
      <div class="rep-card-head"><h2 class="h3" id="repChartH">${esc(t("rep.byMonth"))}</h2>
        <ul class="rep-legend"><li><span class="sw sw-a" aria-hidden="true"></span>${esc(t("rep.netShort"))}</li><li><span class="sw sw-b" aria-hidden="true"></span>${esc(t("rep.received"))}</li></ul></div>
      ${chartHtml(R, cur)}
      <details class="ed-more rep-table-toggle"><summary>${icon("chevron-right", 16)}<span>${esc(t("rep.showTable"))}</span></summary>
        <div class="rep-scroll"><table class="rep-table"><thead><tr><th scope="col">${esc(t("rep.month"))}</th><th scope="col" class="num">${esc(t("rep.netShort"))}</th><th scope="col" class="num">${esc(t("rep.received"))}</th></tr></thead>
        <tbody>${R.months.map(x => `<tr><th scope="row">${esc(monthLabel(x.key, true))}</th><td class="num">${m(x.invoiced)}</td><td class="num">${m(x.received)}</td></tr>`).join("")}</tbody></table></div></details>
    </section>
    <div class="rep-grid">
      <section class="card rep-card" aria-labelledby="repAgeH">
        <div class="rep-card-head"><h2 class="h3" id="repAgeH">${esc(t("rep.aging"))}</h2><span class="hint">${esc(t("rep.asOfToday"))}</span></div>
        ${agingHtml(R, cur)}
      </section>
      <section class="card rep-card" aria-labelledby="repCliH">
        <div class="rep-card-head"><h2 class="h3" id="repCliH">${esc(t("rep.topClients"))}</h2></div>
        ${R.clients.length ? `<div class="rep-scroll"><table class="rep-table"><thead><tr><th scope="col">${esc(t("csv.client"))}</th><th scope="col" class="num">${esc(t("rep.netShort"))}</th><th scope="col" class="num">${esc(t("rep.outstanding"))}</th></tr></thead>
          <tbody>${R.clients.slice(0, 10).map(c => `<tr><th scope="row" dir="auto">${esc(c.name || t("docs.noClient"))}</th><td class="num">${m(c.invoiced)}</td><td class="num">${m(c.outstanding)}</td></tr>`).join("")}</tbody></table></div>`
          : `<p class="hint">${esc(t("rep.noData"))}</p>`}
      </section>
    </div>
    <section class="card rep-card" aria-labelledby="repTaxH">
      <div class="rep-card-head"><h2 class="h3" id="repTaxH">${esc(t("rep.taxSummary"))}</h2></div>
      ${R.tax.length ? `<div class="rep-scroll"><table class="rep-table"><thead><tr><th scope="col">${esc(t("csv.taxName"))}</th><th scope="col" class="num">${esc(t("csv.rate"))}</th><th scope="col" class="num">${esc(t("csv.taxable"))}</th><th scope="col" class="num">${esc(t("csv.tax"))}</th></tr></thead>
        <tbody>${R.tax.map(x => `<tr><th scope="row" dir="auto">${esc(x.name)}</th><td class="num">${esc(pct(x.rate))}</td><td class="num">${m(x.taxable)}</td><td class="num">${m(x.tax)}</td></tr>`).join("")}</tbody>
        <tfoot><tr><th scope="row">${esc(t("rep.total"))}</th><td></td><td class="num">${m(R.tax.reduce((s, x) => s + x.taxable, 0))}</td><td class="num">${m(R.taxTotal)}</td></tr></tfoot></table></div>`
        : `<p class="hint">${esc(t("rep.noTax"))}</p>`}
      <p class="hint">${esc(t("rep.taxHint"))}</p>
    </section>`;
  showLatest();
}

// On a narrow screen the chart scrolls sideways; start at the latest months.
function showLatest() {
  const cb = root && root.querySelector(".chart-bars");
  if (cb && cb.scrollWidth > cb.clientWidth) cb.scrollLeft = document.dir === "rtl" ? -cb.scrollWidth : cb.scrollWidth;
}

function monthLabel(key, withYear) {
  const lang = getLanguage();
  return formatDate(`${key}-01`, withYear ? "MMM YYYY" : "MMM", lang, S().numberFormat);
}

// Paired bars per month: net sales (dark) and received (grey). Each month is a stop
// for keyboard and touch with its own label; the same numbers are in the table below.
function chartHtml(R, cur) {
  const months = R.months;
  const max = Math.max(1, ...months.map(x => Math.max(x.invoiced, x.received)));
  const nice = niceMax(max);
  const h = v => Math.max(0, Math.min(100, (v / nice) * 100));
  const ticks = [1, 0.5].map(f => nice * f);
  let lastYear = "";
  const groups = months.map(x => {
    const y = x.key.slice(0, 4), showYear = y !== lastYear; lastYear = y;
    const label = `${monthLabel(x.key, true)}: ${t("rep.netShort")} ${money(x.invoiced, cur)}, ${t("rep.received")} ${money(x.received, cur)}`;
    return `<li class="bar-g" tabindex="0" aria-label="${esc(label)}">
      <span class="bars" aria-hidden="true"><span class="bar bar-a" style="height:${h(x.invoiced).toFixed(2)}%"></span><span class="bar bar-b" style="height:${h(x.received).toFixed(2)}%"></span></span>
      <span class="bar-x" aria-hidden="true">${esc(monthLabel(x.key))}${showYear ? `<span class="bar-y">${esc(y)}</span>` : ""}</span>
      <span class="bar-tip" role="presentation"><strong>${esc(monthLabel(x.key, true))}</strong><span>${esc(t("rep.netShort"))}: <bdi class="ltr">${esc(money(x.invoiced, cur))}</bdi></span><span>${esc(t("rep.received"))}: <bdi class="ltr">${esc(money(x.received, cur))}</bdi></span></span>
    </li>`;
  }).join("");
  return `<div class="chart" role="group" aria-label="${esc(t("rep.byMonth"))}">
    <div class="chart-grid" aria-hidden="true">${ticks.map(v => `<span class="gl" style="bottom:${h(v)}%"><span class="gl-v ltr">${esc(compact(v, cur))}</span></span>`).join("")}<span class="gl gl-0" style="bottom:0"></span></div>
    <ol class="chart-bars" style="--n:${months.length};--bw:${barWidth(months)}px">${groups}</ol>
  </div>`;
}
// Month label: one floating box on the chart itself, not inside the bars (which scroll
// sideways and would cut it off). It sits above the month's taller bar and is kept inside
// the chart's edges. Hover, keyboard focus or a tap shows it.
function showTip(g) {
  const chart = g.closest(".chart");
  if (!chart) return;
  let tip = chart.querySelector(".chart-tip");
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "chart-tip";
    tip.setAttribute("aria-hidden", "true");     // the month's own label already says this
    chart.appendChild(tip);
  }
  tip.innerHTML = g.querySelector(".bar-tip").innerHTML;
  tip.hidden = false;
  const c = chart.getBoundingClientRect(), r = g.getBoundingClientRect();
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const left = Math.max(0, Math.min(c.width - w, r.left + r.width / 2 - c.left - w / 2));
  const barTop = Math.min(...[...g.querySelectorAll(".bar")].map(b => b.getBoundingClientRect().top));
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(0, barTop - c.top - h - 8)}px`;
}
function hideTip() { if (root) root.querySelectorAll(".chart-tip").forEach(x => { x.hidden = true; }); }
function wireTip(signal) {
  const opt = { signal };
  root.addEventListener("mouseover", e => { const g = e.target.closest(".bar-g"); if (g) showTip(g); }, opt);
  root.addEventListener("mouseout", e => {
    const to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest(".bar-g") : null;
    if (to || !e.target.closest(".bar-g")) return;
    const f = document.activeElement && document.activeElement.closest ? document.activeElement.closest(".bar-g") : null;
    if (f && root.contains(f)) showTip(f); else hideTip();
  }, opt);
  root.addEventListener("focusin", e => { const g = e.target.closest(".bar-g"); if (g) showTip(g); }, opt);
  root.addEventListener("focusout", e => { if (e.target.closest(".bar-g")) hideTip(); }, opt);
  root.addEventListener("scroll", hideTip, { signal, capture: true });
  window.addEventListener("resize", hideTip, opt);
}

// Each month gets room for its own label, so long names (Arabic, Bangla …) never overlap;
// when that is wider than the card, the chart scrolls sideways.
function barWidth(months) {
  const longest = Math.max(3, ...months.map(x => [...monthLabel(x.key)].length));
  return Math.max(28, longest * 7 + 10);
}
function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v)), f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
function compact(v, cur) {
  try { return new Intl.NumberFormat(getLanguage() + "-u-nu-latn", { notation: "compact", maximumFractionDigits: 1 }).format(v); }
  catch { return String(Math.round(v)); }
}

function agingHtml(R, cur) {
  const keys = ["current", "d30", "d60", "d90", "d90p"];
  const total = keys.reduce((s, k) => s + R.aging[k], 0);
  if (!total) return `<p class="hint">${esc(t("rep.nothingOwed"))}</p>`;
  return `<ul class="aging">${keys.map(k => {
    const v = R.aging[k], w = total ? (v / total) * 100 : 0;
    return `<li class="aging-row" data-k="${k}"><span class="aging-label">${esc(t(`rep.age.${k}`))}</span>
      <span class="aging-bar" aria-hidden="true"><span style="width:${w.toFixed(2)}%"></span></span>
      <span class="aging-amt num"><bdi class="ltr">${esc(money(v, cur))}</bdi></span></li>`;
  }).join("")}</ul>`;
}

/* ---------------- events ---------------- */
function onChange(e) {
  const el = e.target;
  if (el.id === "repPeriod") {
    view.period = el.value;
    if (view.period === "custom" && !view.from) { const r = periodRange("thisMonth"); view.from = r.from; view.to = todayISO(); }
    saveView();
    root.querySelector("#repTools").innerHTML = toolsHtml();
    root.querySelector("#repPeriod").focus();
    render();
  } else if (el.id === "repFrom" || el.id === "repTo") {
    view[el.id === "repFrom" ? "from" : "to"] = el.value; saveView(); render();
  } else if (el.id === "repCur") { view.currency = el.value; saveView(); render(); }
}

function onClick(e) {
  const g = e.target.closest(".bar-g");
  if (g) { g.focus(); return; }            // a tap on a month shows its numbers
  const b = e.target.closest("[data-act]");
  if (!b) return;
  if (b.dataset.act === "export") openExport();
}

function openExport() {
  const items = [["docs", "files", t("rep.x.docs")], ["payments", "banknote", t("rep.x.payments")], ["tax", "file-spreadsheet", t("rep.x.tax")], ["clients", "users", t("rep.x.clients")]];
  openSheet({
    title: t("rep.export"),
    body: `<p class="hint">${esc(t("rep.exportHint"))}</p><div class="menu">${items.map(([a, ic, l]) => `<button type="button" class="menu-item" data-close="${a}">${icon(ic)}<span>${esc(l)}</span></button>`).join("")}</div>`,
    onClose: a => a && exportCsv(a)
  });
}

function exportCsv(kind) {
  const st = getState(), r = range(), cur = currentCurrency();
  // Plain ASCII file names (like the clients export), so every browser keeps them.
  const tag = view.period === "all" ? `all-${todayISO()}` : `${r.from}-to-${r.to}`;
  let rows, slug;
  if (kind === "docs") {
    const docs = st.docs.filter(d => d.issued >= r.from && d.issued <= r.to).sort((a, b) => a.issued.localeCompare(b.issued) || a.no.localeCompare(b.no));
    rows = docsCsv(docs); slug = "documents";
  } else if (kind === "payments") { rows = paymentsCsv(st, r); slug = "payments"; }
  else {
    const R = buildReport(st, { from: r.from, to: r.to, currency: cur });
    rows = kind === "tax" ? taxCsv(R) : clientsCsv(R);
    slug = `${kind === "tax" ? "tax-summary" : "sales-by-client"}-${cur}`;
  }
  const file = `invogen-${slug}-${tag}.csv`;
  downloadBlob(new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" }), file);
  toast(t("cl.exported", { file }));
}
