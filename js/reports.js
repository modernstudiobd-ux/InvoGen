// reports.js — the numbers behind the Reports screen, and the CSV exports for an
// accountant. Pure functions over the saved data: no DOM.
//
// What counts (per currency, never mixed):
//   Invoiced   invoices issued in the period (not drafts or cancelled) + receipts that
//              weren't made from an invoice
//   Credited   credit notes issued in the period
//   Net sales  invoiced − credited
//   Received   payments dated in the period + those stand-alone receipts
//   Outstanding / overdue / ageing   what is owed today (not limited to the period)
//   Tax        tax on the counted invoices and receipts, less tax on the credit notes

import { totals, statusOf, outstandingOf, lineAmount } from "./calc.js";
import { lineOptions } from "./columns.js";
import { round, decimalsOf, todayISO, addMonths, daysBetween, parseISO } from "./format.js";
import { t } from "./i18n.js";

export const PERIODS = ["thisMonth", "lastMonth", "thisQuarter", "lastQuarter", "thisYear", "lastYear", "last12", "all", "custom"];

const iso = d => todayISO(d);
const monthKey = s => String(s).slice(0, 7);

// { from, to } (inclusive "YYYY-MM-DD") for a period key.
export function periodRange(key, today = todayISO(), custom = {}) {
  const d = parseISO(today) || new Date();
  const y = d.getFullYear(), m = d.getMonth(), q = Math.floor(m / 3) * 3;
  const r = (a, b) => ({ from: iso(a), to: iso(b) });
  switch (key) {
    case "thisMonth": return r(new Date(y, m, 1), new Date(y, m + 1, 0));
    case "lastMonth": return r(new Date(y, m - 1, 1), new Date(y, m, 0));
    case "thisQuarter": return r(new Date(y, q, 1), new Date(y, q + 3, 0));
    case "lastQuarter": return r(new Date(y, q - 3, 1), new Date(y, q, 0));
    case "thisYear": return r(new Date(y, 0, 1), new Date(y, 11, 31));
    case "lastYear": return r(new Date(y - 1, 0, 1), new Date(y - 1, 11, 31));
    case "last12": return r(new Date(y, m - 11, 1), new Date(y, m + 1, 0));
    case "custom": {
      const from = /^\d{4}-\d{2}-\d{2}$/.test(custom.from || "") ? custom.from : iso(new Date(y, m, 1));
      const to = /^\d{4}-\d{2}-\d{2}$/.test(custom.to || "") ? custom.to : today;
      return from <= to ? { from, to } : { from: to, to: from };
    }
    default: return { from: "0000-01-01", to: "9999-12-31" };
  }
}

// Currencies in use, most used first.
export function currenciesUsed(docs, fallback = "USD") {
  const n = {};
  docs.forEach(d => { n[d.currency] = (n[d.currency] || 0) + 1; });
  const list = Object.keys(n).sort((a, b) => n[b] - n[a] || a.localeCompare(b));
  return list.length ? list : [fallback];
}

const inRange = (date, r) => !!date && date >= r.from && date <= r.to;
const clientKey = c => (c.id ? "id:" + c.id : "n:" + String(c.name || "").trim().toLowerCase());

// Tax lines of one document: [{ key, name, rate, taxable, tax }] (credit notes negative).
function taxLines(doc, sign = 1) {
  const tt = totals(doc), out = [];
  const add = (name, rate, taxable, tax) => { if (tax || rate) out.push({ key: `${name}|${rate}`, name, rate, taxable: sign * taxable, tax: sign * tax }); };
  const net = doc.tax.inclusive ? tt.taxable - tt.tax : tt.taxable;
  if (tt.tax || Number(doc.tax.rate)) add(doc.tax.name || t("rep.tax"), Number(doc.tax.rate) || 0, net, tt.tax);
  if (doc.tax2.on && (tt.tax2 || Number(doc.tax2.rate))) add(doc.tax2.name || t("rep.tax"), Number(doc.tax2.rate) || 0, net, tt.tax2);
  // Tax % on each line (the optional "Tax" column).
  const opt = lineOptions(doc.columns);
  if (opt.tax) {
    const dec = decimalsOf(doc.currency), by = {};
    doc.items.forEach(it => {
      const rate = Number(it.tax) || 0;
      if (!rate) return;
      const gross = lineAmount(it, dec, opt), plain = lineAmount(it, dec, { ...opt, tax: false });
      const k = by[rate] || (by[rate] = { taxable: 0, tax: 0 });
      k.taxable += plain; k.tax += gross - plain;
    });
    Object.entries(by).forEach(([rate, v]) => add(t("rep.itemTax"), Number(rate), round(v.taxable, dec), round(v.tax, dec)));
  }
  return out;
}

export function buildReport(state, { from, to, currency, today = todayISO() }) {
  const range = { from, to };
  const dec = decimalsOf(currency);
  const docs = state.docs.filter(d => d.currency === currency);
  const R = {
    currency, from, to, invoiced: 0, credited: 0, net: 0, received: 0, outstanding: 0, overdue: 0, overdueCount: 0,
    taxTotal: 0, invoiceCount: 0, creditCount: 0, paymentCount: 0,
    tax: [], months: [], clients: [], aging: { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 }
  };
  const months = new Map(), clients = new Map(), tax = new Map();
  const month = k => months.get(k) || (months.set(k, { key: k, invoiced: 0, received: 0 }), months.get(k));
  const client = c => {
    const k = clientKey(c);
    if (!clients.has(k)) clients.set(k, { name: c.name || "", invoiced: 0, received: 0, outstanding: 0 });
    return clients.get(k);
  };
  const addTax = lines => lines.forEach(l => {
    const x = tax.get(l.key) || (tax.set(l.key, { name: l.name, rate: l.rate, taxable: 0, tax: 0 }), tax.get(l.key));
    x.taxable += l.taxable; x.tax += l.tax;
  });

  docs.forEach(d => {
    const st = statusOf(d, today);
    if (st === "draft" || st === "void") return;
    const tt = totals(d, today);
    if (d.type === "invoice") {
      if (inRange(d.issued, range)) {
        R.invoiced += tt.total; R.invoiceCount++;
        month(monthKey(d.issued)).invoiced += tt.total;
        client(d.client).invoiced += tt.total;
        addTax(taxLines(d));
      }
      d.payments.forEach(p => {
        if (!inRange(p.date, range)) return;
        R.received += p.amount; R.paymentCount++;
        month(monthKey(p.date)).received += p.amount;
        client(d.client).received += p.amount;
      });
      const owed = outstandingOf(d, today);
      if (owed > 0) {
        R.outstanding += owed;
        client(d.client).outstanding += owed;
        const late = d.due ? daysBetween(d.due, today) : 0;
        if (st === "overdue") { R.overdue += owed; R.overdueCount++; }
        const b = late <= 0 ? "current" : late <= 30 ? "d30" : late <= 60 ? "d60" : late <= 90 ? "d90" : "d90p";
        R.aging[b] += owed;
      }
    } else if (d.type === "receipt" && !d.sourceId && inRange(d.issued, range)) {
      // A receipt not made from an invoice is a sale paid on the spot.
      R.invoiced += tt.total; R.received += tt.total; R.paymentCount++;
      const mo = month(monthKey(d.issued)); mo.invoiced += tt.total; mo.received += tt.total;
      const c = client(d.client); c.invoiced += tt.total; c.received += tt.total;
      addTax(taxLines(d));
    } else if (d.type === "creditNote" && st === "issued" && inRange(d.issued, range)) {
      R.credited += tt.total; R.creditCount++;
      month(monthKey(d.issued)).invoiced -= tt.total;
      client(d.client).invoiced -= tt.total;
      addTax(taxLines(d, -1));
    }
  });

  R.net = R.invoiced - R.credited;
  R.tax = [...tax.values()].map(x => ({ ...x, taxable: round(x.taxable, dec), tax: round(x.tax, dec) }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.rate - b.rate);
  R.taxTotal = round(R.tax.reduce((s, x) => s + x.tax, 0), dec);
  ["invoiced", "credited", "net", "received", "outstanding", "overdue"].forEach(k => { R[k] = round(R[k], dec); });
  Object.keys(R.aging).forEach(k => { R.aging[k] = round(R.aging[k], dec); });

  // One bar group per month of the period (up to the current month; at most 24).
  const keys = [...months.keys()].sort();
  let start = monthKey(from), end = monthKey(to < today ? to : today);
  if (from === "0000-01-01") start = keys[0] || monthKey(today);
  if (end < start) end = start;
  const list = [];
  for (let k = start, guard = 0; k <= end && guard < 600; k = monthKey(addMonths(k + "-01", 1)), guard++) list.push(k);
  R.months = list.slice(-24).map(k => { const m = months.get(k) || { key: k, invoiced: 0, received: 0 }; return { key: k, invoiced: round(m.invoiced, dec), received: round(m.received, dec) }; });

  R.clients = [...clients.values()].filter(c => c.invoiced || c.received || c.outstanding)
    .map(c => ({ ...c, invoiced: round(c.invoiced, dec), received: round(c.received, dec), outstanding: round(c.outstanding, dec) }))
    .sort((a, b) => b.invoiced - a.invoiced || b.outstanding - a.outstanding);
  return R;
}

/* ---------------- CSV (rows → toCSV in importSheet.js) ---------------- */
const num = (v, dec) => (Number.isFinite(v) ? Number(v).toFixed(dec) : "");

// Every document as one row, with its money in plain numbers (for spreadsheets).
export function docsCsv(docs, today = todayISO()) {
  const head = ["csv.type", "csv.number", "csv.status", "csv.client", "csv.email", "csv.clientTaxId", "csv.issued", "csv.due", "csv.reference",
    "csv.currency", "csv.subtotal", "csv.discount", "csv.tax", "csv.tax2", "csv.shipping", "csv.total", "csv.paid", "csv.credited", "csv.balance"].map(k => t(k));
  return [head, ...docs.map(d => {
    const tt = totals(d, today), dec = tt.decimals, st = statusOf(d, today);
    const money = d.type !== "deliveryNote";
    return [t(`type.${d.type}`), d.no, t(`status.${st}`), d.client.name, d.client.email, d.client.taxId, d.issued, d.due, d.reference, d.currency,
      money ? num(tt.subtotal, dec) : "", money ? num(tt.discount, dec) : "", money ? num(tt.tax, dec) : "", money ? num(tt.tax2, dec) : "",
      money ? num(tt.shipping, dec) : "", money ? num(tt.total, dec) : "",
      d.type === "invoice" ? num(tt.paid, dec) : "", d.type === "invoice" ? num(tt.credited, dec) : "", d.type === "invoice" ? num(tt.balance, dec) : ""];
  })];
}

// Payments received in a period (invoice payments + stand-alone receipts), all currencies.
export function paymentsCsv(state, { from, to }) {
  const rows = [];
  state.docs.forEach(d => {
    const dec = decimalsOf(d.currency);
    if (d.type === "invoice" && d.status !== "void") d.payments.forEach(p => {
      if (inRange(p.date, { from, to })) rows.push([p.date, `${t("type.invoice")} ${d.no}`, d.client.name, p.method, p.note, d.currency, num(p.amount, dec)]);
    });
    if (d.type === "receipt" && !d.sourceId && inRange(d.issued, { from, to })) rows.push([d.issued, `${t("type.receipt")} ${d.no}`, d.client.name, d.payMethod, "", d.currency, num(totals(d).total, dec)]);
  });
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  return [["csv.date", "csv.document", "csv.client", "csv.method", "csv.note", "csv.currency", "csv.amount"].map(k => t(k)), ...rows];
}

export function taxCsv(R) {
  const dec = decimalsOf(R.currency);
  return [["csv.taxName", "csv.rate", "csv.currency", "csv.taxable", "csv.tax"].map(k => t(k)),
    ...R.tax.map(x => [x.name, x.rate, R.currency, num(x.taxable, dec), num(x.tax, dec)]),
    [t("rep.total"), "", R.currency, num(R.tax.reduce((s, x) => s + x.taxable, 0), dec), num(R.taxTotal, dec)]];
}

export function clientsCsv(R) {
  const dec = decimalsOf(R.currency);
  return [["csv.client", "csv.currency", "csv.netSales", "csv.received", "csv.outstanding"].map(k => t(k)),
    ...R.clients.map(c => [c.name, R.currency, num(c.invoiced, dec), num(c.received, dec), num(c.outstanding, dec)])];
}
