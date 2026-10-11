// migrate.js — one-time import of data saved by Invoice Studio / InvoGen v3.x in this
// browser (localStorage keys "invoiceStudio.*"). Runs only when the new app has no
// data yet. The old keys are left untouched, so nothing is lost if you roll back.

import { uid, safeLogo } from "./dom.js";
import { currencyFrom } from "./currencies.js";
import { parseNumber, todayISO } from "./format.js";
import { LANG_CODES } from "./i18n.js";

const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const iso = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? v : "");

const TYPE = { invoice: "invoice", estimate: "estimate", receipt: "receipt" };

function itemsFrom(snap) {
  const cols = Array.isArray(snap.columns) ? snap.columns : [];
  const byRole = r => cols.find(c => c.role === r);
  const qk = (byRole("quantity") || { key: "quantity" }).key;
  const rk = (byRole("rate") || { key: "rate" }).key;
  const dk = (cols.find(c => c.key === "description") || cols.find(c => c.type === "text" && c.key !== "sku") || { key: "description" }).key;
  return (Array.isArray(snap.items) ? snap.items : []).map(it => ({
    id: uid(), desc: String(it[dk] ?? ""), sku: String(it.sku ?? ""),
    qty: it[qk] === "" || it[qk] == null ? 1 : parseNumber(it[qk]), rate: parseNumber(it[rk])
  })).filter(it => it.desc || it.rate);
}

function docFrom(entry, snap) {
  const f = (snap && snap.fields) || {};
  const type = TYPE[snap?.docType || entry?.docType] || "invoice";
  const st = String(f.status || entry?.status || "").toLowerCase();
  const total = Number(entry?.total) || 0;
  const paidAmt = parseNumber(f.amountPaid) || Number(entry?.paid) || 0;
  let status = "sent";
  if (type === "receipt") status = "paid";
  else if (type === "estimate") status = st.includes("draft") ? "draft" : "sent";
  else if (st.includes("draft")) status = "draft";
  else if (st.includes("cancel")) status = "void";
  else if (st === "paid") status = "paid";
  const issued = iso(f.invoiceDate) || iso(entry?.invoiceDate) || todayISO();
  const payments = [];
  if (paidAmt > 0) payments.push({ id: uid(), date: issued, amount: paidAmt, method: "", note: "" });
  else if (status === "paid" && total > 0 && type === "invoice") payments.push({ id: uid(), date: issued, amount: total, method: "", note: "" });
  const lang = LANG_CODES.includes(f.docLanguage) ? f.docLanguage : "en";
  return {
    id: entry?.id || uid(), type, status,
    no: String(f.invoiceNumber || entry?.invoiceNumber || ""),
    issued, due: iso(f.dueDate), termsDays: f.paymentTerms === "" || f.paymentTerms == null ? "" : Number(f.paymentTerms),
    reference: String(f.reference || ""),
    currency: currencyFrom(f.currency || entry?.currency),
    lang,
    business: {
      name: String(f.companyName || ""), email: String(f.companyEmail || ""), phone: String(f.companyPhone || ""),
      address: String(f.companyAddress || ""), website: String(f.companyWebsite || ""), taxId: String(f.companyVat || f.companyReg || ""),
      logo: safeLogo(snap?.logo)
    },
    client: { name: String(f.clientName || entry?.clientName || ""), email: String(f.clientEmail || ""), address: String(f.clientAddress || ""), taxId: String(f.clientTax || ""), phone: "" },
    items: itemsFrom(snap || {}),
    discount: { type: "percent", value: parseNumber(f.discount) },
    tax: { name: String(f.labelTax || "Tax"), rate: parseNumber(f.tax) },
    tax2: { on: parseNumber(f.tax2) > 0, name: String(f.labelTax2 || "Tax 2"), rate: parseNumber(f.tax2) },
    shipping: parseNumber(f.shipping),
    payLink: String(f.payLink || ""),
    notes: String(f.notes || ""), terms: String(f.paymentDetails || f.terms || ""), footer: String(f.footerText || ""),
    signature: { mode: snap?.signature ? "image" : "type", text: String(f.signName || ""), img: safeLogo(snap?.signature), on: !!(snap?.signature || f.signName) },
    watermark: { on: !!(f.watermark && f.watermark !== "none" && f.watermark !== ""), text: f.watermark === "custom" ? String(f.watermarkText || "") : String(f.watermark || "") },
    template: String(f.template || "modern"),
    accent: /^#[0-9a-f]{6}$/i.test(f.accentHex || "") ? f.accentHex : "",
    paper: String(f.paperSize || "A4"),
    payments,
    createdAt: Number(entry?.updatedAt) || Date.now(), updatedAt: Number(entry?.updatedAt) || Date.now()
  };
}

// `get(key)` returns the raw stored string; defaults to this browser's localStorage.
// backup.js passes a reader over an old v3 backup file instead.
export function migrateLegacy(get = lsGet) {
  const read = k => { try { const v = get(k); return v ? JSON.parse(v) : null; } catch { return null; } };
  const lib = read("invoiceStudio.library.v1");
  const clients = read("invoiceStudio.clients.v1");
  const products = read("invoiceStudio.products.v1");
  const current = read("invoiceStudioPro.v2");
  const hasAny = (Array.isArray(lib) && lib.length) || (Array.isArray(clients) && clients.length) || (Array.isArray(products) && products.length) || current;
  if (!hasAny) return null;

  const docs = [];
  (Array.isArray(lib) ? lib : []).forEach(e => { try { if (e && e.snapshot) docs.push(docFrom(e, e.snapshot)); } catch {} });
  // The invoice that was open in the old app, if it was never saved to its history.
  try {
    const cf = current && current.fields;
    if (cf && (cf.clientName || (current.items || []).length) && !docs.some(d => d.no && d.no === cf.invoiceNumber)) {
      docs.unshift(docFrom({ id: uid(), updatedAt: Date.now() }, current));
    }
  } catch {}

  const latest = (current && current.fields) || (lib && lib[0] && lib[0].snapshot && lib[0].snapshot.fields) || {};
  const df = get("invoiceStudio.dateFormat");
  const settings = {
    business: {
      name: String(latest.companyName || ""), email: String(latest.companyEmail || ""), phone: String(latest.companyPhone || ""),
      address: String(latest.companyAddress || ""), website: String(latest.companyWebsite || ""), taxId: String(latest.companyVat || latest.companyReg || ""),
      logo: safeLogo(current && current.logo)
    },
    currency: currencyFrom(latest.currency),
    onboarded: true
  };
  if (df === "mdy") settings.dateFormat = "MM/DD/YYYY";
  else if (df === "dmy") settings.dateFormat = "DD/MM/YYYY";
  if (latest.template) settings.template = String(latest.template);

  // Continue the numbering the old app was using (e.g. INV-1042 → next INV-1043).
  const numbering = {};
  ["invoice", "estimate", "receipt"].forEach(type => {
    let best = null;
    docs.filter(d => d.type === type).forEach(d => {
      const m = /^(.*?)(\d+)\s*$/.exec(d.no || "");
      if (m && (!best || +m[2] > best.n)) best = { prefix: m[1].replace(/[-\s#]+$/, ""), n: +m[2], pad: m[2].length };
    });
    if (best) numbering[type] = { prefix: best.prefix, next: best.n + 1, pad: best.pad };
  });
  if (Object.keys(numbering).length) settings.numbering = numbering;

  return {
    docs,
    clients: (Array.isArray(clients) ? clients : []).filter(c => c && c.name).map(c => ({ id: c.id || uid(), name: c.name, contact: c.contact || "", email: c.email || "", address: c.address || "", taxId: c.tax || "" })),
    products: (Array.isArray(products) ? products : []).filter(p => p && p.description).map(p => ({ id: p.id || uid(), desc: p.description, sku: p.sku || "", rate: parseNumber(p.rate), taxRate: p.taxRate === "" || p.taxRate == null ? "" : parseNumber(p.taxRate) })),
    settings,
    meta: { migratedFrom: "v3", migratedAt: Date.now() }
  };
}
