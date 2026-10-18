// calc.js — document math (line items, discount, taxes, shipping, deposit, late fees,
// payments) and status rules (Draft, Sent, Partially paid, Paid, Overdue …).
// Pure functions: no DOM, no storage — easy to test.

import { round, decimalsOf, todayISO, daysBetween } from "./format.js";
import { lineOptions } from "./columns.js";

const n = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

// One line: quantity × price, less the line discount %, plus the line tax % (when those
// columns are switched on). Without a Quantity column every line counts once.
export function lineAmount(item, d = 2, opt = { qty: true, disc: false, tax: false }) {
  const qty = !opt.qty || item.qty === "" || item.qty == null ? 1 : n(item.qty);
  let a = qty * n(item.rate);
  if (opt.disc) a *= 1 - Math.min(100, Math.max(0, n(item.disc))) / 100;
  if (opt.tax) a *= 1 + Math.max(0, n(item.tax)) / 100;
  return round(a, d);
}

// Every total a document needs. `today` is injectable for tests.
export function totals(doc, today = todayISO()) {
  const d = decimalsOf(doc.currency);
  const items = Array.isArray(doc.items) ? doc.items : [];
  const opt = lineOptions(doc.columns);
  const subtotal = round(items.reduce((s, it) => s + lineAmount(it, d, opt), 0), d);

  const disc = doc.discount || {};
  const discount = round(Math.min(subtotal, disc.type === "amount" ? Math.max(0, n(disc.value)) : subtotal * Math.max(0, Math.min(100, n(disc.value))) / 100), d);
  const taxable = round(subtotal - discount, d);

  const tx = doc.tax || {};
  const rate = Math.max(0, n(tx.rate)) / 100;
  const tax = round(tx.inclusive ? taxable - taxable / (1 + rate) : taxable * rate, d);
  const tx2 = doc.tax2 || {};
  const tax2 = round(tx2.on ? taxable * Math.max(0, n(tx2.rate)) / 100 : 0, d);
  const shipping = round(Math.max(0, n(doc.shipping)), d);
  const total = round((tx.inclusive ? taxable : taxable + tax) + tax2 + shipping, d);

  const payments = Array.isArray(doc.payments) ? doc.payments : [];
  const paid = round(payments.reduce((s, p) => s + Math.max(0, n(p.amount)), 0), d);

  const dep = doc.deposit || {};
  const deposit = dep.on ? round(Math.min(total, dep.type === "amount" ? Math.max(0, n(dep.value)) : total * Math.max(0, Math.min(100, n(dep.value))) / 100), d) : 0;

  // Issued credit notes for this invoice (see syncCredits in state.js).
  const credited = doc.type === "invoice" && Array.isArray(doc.credits) ? round(doc.credits.reduce((s, c) => s + Math.max(0, n(c.amount)), 0), d) : 0;

  const lateFee = lateFeeFor(doc, total, paid + credited, today, d);
  const balance = round(Math.max(0, total + lateFee - paid - credited), d);
  // More paid and credited than owed: the difference goes back to the client.
  const refundDue = round(Math.max(0, paid + credited - total - lateFee), d);
  const depositDue = round(Math.max(0, deposit - paid), d);
  return { subtotal, discount, taxable, tax, tax2, shipping, total, paid, credited, refundDue, deposit, depositDue, lateFee, balance, decimals: d };
}

// Late fee: a percentage of the unpaid amount or a fixed amount, charged once or
// every 30 days, starting after the grace period past the due date.
export function lateFeeFor(doc, total, paid, today, d) {
  const lf = doc.lateFee || {};
  if (!lf.on || doc.type !== "invoice" || !doc.due || doc.status === "draft" || doc.status === "void") return 0;
  const unpaid = total - paid;
  if (unpaid <= 0) return 0;
  const late = daysBetween(doc.due, today) - Math.max(0, n(lf.graceDays));
  if (late <= 0) return 0;
  const periods = lf.repeat === "monthly" ? Math.ceil(late / 30) : 1;
  const one = lf.type === "amount" ? Math.max(0, n(lf.value)) : unpaid * Math.max(0, n(lf.value)) / 100;
  return round(one * periods, d);
}

/* ---------------- Status ---------------- */
// Invoice:           draft · sent · partial · paid · overdue · credited · void
// Estimate/proforma: draft · sent · accepted · declined · expired
// Receipt:           paid
// Credit note:       draft · issued · void
// Purchase order:    draft · sent · received · void
// Delivery note:     draft · sent · delivered
export function statusOf(doc, today = todayISO()) {
  if (doc.type === "receipt") return "paid";
  if (doc.status === "void") return "void";
  if (doc.type === "estimate" || doc.type === "proforma") {
    if (doc.status === "accepted" || doc.status === "declined") return doc.status;
    if (doc.status === "sent" && doc.due && doc.due < today) return "expired";
    return doc.status === "sent" ? "sent" : "draft";
  }
  if (doc.type === "creditNote") return doc.status === "issued" ? "issued" : "draft";
  if (doc.type === "purchaseOrder") return ["sent", "received"].includes(doc.status) ? doc.status : "draft";
  if (doc.type === "deliveryNote") return ["sent", "delivered"].includes(doc.status) ? doc.status : "draft";
  const t = totals(doc, today);
  if (doc.status === "paid" && t.paid === 0 && !(doc.payments || []).length && !t.credited) return "paid"; // marked paid without a payment record (imported data)
  if (t.total > 0 && t.balance <= 0) return t.credited >= t.total ? "credited" : "paid";
  if (t.total === 0 && doc.status === "paid") return "paid";
  if (doc.status === "draft" && t.paid === 0) return "draft";
  if (doc.due && doc.due < today && t.balance > 0) return "overdue";
  if (t.paid > 0) return "partial";
  return doc.status === "draft" ? "draft" : "sent";
}

// Amount still owed (0 for drafts, other document types, void, paid and credited invoices).
export function outstandingOf(doc, today = todayISO()) {
  if (doc.type !== "invoice") return 0;
  const st = statusOf(doc, today);
  if (st === "draft" || st === "void" || st === "paid" || st === "credited") return 0;
  return totals(doc, today).balance;
}
