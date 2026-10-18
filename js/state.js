// state.js — the single source of truth for the app's data (documents, clients,
// products, settings) and every action that changes it. Changes are saved to this
// device automatically (IndexedDB, localStorage fallback — see storage.js) and
// shared with other open InvoGen tabs.

import { uid } from "./dom.js";
import { loadData, saveData, clearData, requestPersistence } from "./storage.js";
import { todayISO, addDays, addMonths, DEFAULT_DATE_FORMAT } from "./format.js";
import { totals, statusOf } from "./calc.js";
import { CURRENCY } from "./currencies.js";
import { normalizeColumns } from "./columns.js";

export const SCHEMA = 1;
export const DOC_TYPES = ["invoice", "estimate", "receipt", "creditNote", "proforma", "purchaseOrder", "deliveryNote"];
// The statuses each document type can be set to (statusOf() in calc.js adds the derived
// ones: Partially paid, Overdue, Expired, Credited).
export const STATUS_BY_TYPE = {
  invoice: ["draft", "sent", "paid", "void"],
  estimate: ["draft", "sent", "accepted", "declined"],
  receipt: ["paid"],
  creditNote: ["draft", "issued", "void"],
  proforma: ["draft", "sent", "accepted", "declined"],
  purchaseOrder: ["draft", "sent", "received", "void"],
  deliveryNote: ["draft", "sent", "delivered"]
};
// The status a draft moves to when it is sent (a credit note is "issued").
export const sentStatus = type => (type === "creditNote" ? "issued" : "sent");
// Types with a "valid until" date, accepted or declined by the client, convertible to an invoice.
export const QUOTE_TYPES = ["estimate", "proforma"];
// Types without a due date.
export const NO_DUE_TYPES = ["receipt", "creditNote", "deliveryNote"];

export function defaultSettings() {
  return {
    appLang: "en",
    langChosen: false,
    business: { name: "", email: "", phone: "", address: "", website: "", taxId: "", logo: "" },
    country: "",
    currency: "USD",
    dateFormat: DEFAULT_DATE_FORMAT,
    numberFormat: "auto",
    docLang: "en",
    paper: "A4",
    taxName: "Tax",
    taxRate: 0,
    taxInclusive: false,
    termsDays: 30,
    estimateValidDays: 30,
    numbering: {
      invoice: { prefix: "INV", next: 1, pad: 4 },
      estimate: { prefix: "EST", next: 1, pad: 4 },
      receipt: { prefix: "R", next: 1, pad: 4 },
      creditNote: { prefix: "CN", next: 1, pad: 4 },
      proforma: { prefix: "PF", next: 1, pad: 4 },
      purchaseOrder: { prefix: "PO", next: 1, pad: 4 },
      deliveryNote: { prefix: "DN", next: 1, pad: 4 }
    },
    template: "modern",
    accent: "",
    columns: null,               // default line-item columns for new documents (null = standard)
    notes: "Thank you for your business.",
    paymentInstructions: "",
    editMode: false,
    onboarded: false,
    lastBackupAt: 0,
    backupSnoozeUntil: 0,
    changesSinceBackup: 0
  };
}

function freshState() {
  return { schema: SCHEMA, settings: defaultSettings(), docs: [], clients: [], products: [], looks: [], meta: { createdAt: Date.now() } };
}

/* ---------------- Normalising (protects against old or hand-edited data) ---------------- */
const str = (v, max = 5000) => (v == null ? "" : String(v)).slice(0, max);
const numv = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const isoOr = (v, d = "") => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : d);

export function normalizeDoc(d = {}) {
  const type = DOC_TYPES.includes(d.type) ? d.type : "invoice";
  const okStatus = STATUS_BY_TYPE[type];
  return {
    id: str(d.id, 100) || uid(),
    type,
    no: str(d.no, 60),
    status: okStatus.includes(d.status) ? d.status : okStatus[0],
    issued: isoOr(d.issued, todayISO()),
    due: isoOr(d.due),
    termsDays: d.termsDays === "" || d.termsDays == null ? "" : numv(d.termsDays),
    reference: str(d.reference, 200),
    currency: CURRENCY[d.currency] ? d.currency : "USD",
    lang: str(d.lang, 8) || "en",
    dateFormat: str(d.dateFormat, 20) || DEFAULT_DATE_FORMAT,
    numberFormat: str(d.numberFormat, 20) || "auto",
    business: { name: "", email: "", phone: "", address: "", website: "", taxId: "", logo: "", ...(d.business || {}) },
    client: { id: "", name: "", contact: "", email: "", phone: "", address: "", taxId: "", ...(d.client || {}) },
    items: (Array.isArray(d.items) ? d.items : []).map(it => ({
      id: str(it.id, 100) || uid(), desc: str(it.desc, 2000), details: str(it.details, 4000), sku: str(it.sku, 100),
      qty: it.qty === "" ? "" : numv(it.qty ?? 1), unit: str(it.unit, 30), rate: numv(it.rate),
      disc: it.disc === "" || it.disc == null ? "" : Math.min(100, Math.max(0, numv(it.disc))),
      tax: it.tax === "" || it.tax == null ? "" : Math.max(0, numv(it.tax)),
      cells: it.cells && typeof it.cells === "object" ? Object.fromEntries(Object.entries(it.cells).slice(0, 20).map(([k, v]) => [str(k, 40), str(v, 500)])) : {}
    })),
    discount: { type: d.discount?.type === "amount" ? "amount" : "percent", value: numv(d.discount?.value) },
    tax: { name: str(d.tax?.name, 40) || "Tax", rate: numv(d.tax?.rate), inclusive: !!d.tax?.inclusive },
    tax2: { on: !!d.tax2?.on, name: str(d.tax2?.name, 40), rate: numv(d.tax2?.rate) },
    shipping: numv(d.shipping),
    deposit: { on: !!d.deposit?.on, type: d.deposit?.type === "amount" ? "amount" : "percent", value: numv(d.deposit?.value) },
    lateFee: { on: !!d.lateFee?.on, type: d.lateFee?.type === "amount" ? "amount" : "percent", value: numv(d.lateFee?.value), graceDays: numv(d.lateFee?.graceDays), repeat: d.lateFee?.repeat === "monthly" ? "monthly" : "once" },
    payLink: str(d.payLink, 2000),
    payProvider: str(d.payProvider, 40),
    payMethod: str(d.payMethod, 40),
    columns: normalizeColumns(d.columns, d.cols),
    show: { qr: d.show?.qr !== false, words: !!d.show?.words, billTo: d.show?.billTo !== false, dueDate: d.show?.dueDate !== false },
    logoSize: Math.max(24, Math.min(140, numv(d.logoSize) || 56)),
    font: str(d.font, 60),
    notes: str(d.notes, 8000),
    terms: str(d.terms, 8000),
    footer: str(d.footer, 1000),
    signature: { mode: ["type", "draw", "image"].includes(d.signature?.mode) ? d.signature.mode : "type", text: str(d.signature?.text, 120), font: str(d.signature?.font, 60) || "Caveat", img: str(d.signature?.img, 6e6), on: !!d.signature?.on },
    watermark: { on: !!d.watermark?.on, text: str(d.watermark?.text, 40) },
    template: str(d.template, 40) || "modern",
    accent: str(d.accent, 20),
    paper: str(d.paper, 30) || "A4",
    recurring: { on: !!d.recurring?.on, every: Math.max(1, numv(d.recurring?.every) || 1), unit: ["week", "month", "year"].includes(d.recurring?.unit) ? d.recurring.unit : "month", next: isoOr(d.recurring?.next), end: isoOr(d.recurring?.end) },
    recurringFrom: str(d.recurringFrom, 100),
    sourceId: str(d.sourceId, 100),
    payments: (Array.isArray(d.payments) ? d.payments : []).map(p => ({ id: str(p.id, 100) || uid(), date: isoOr(p.date, todayISO()), amount: Math.max(0, numv(p.amount)), method: str(p.method, 40), note: str(p.note, 500) })),
    // Issued credit notes for this invoice (kept in step by syncCredits(); never edited by hand).
    credits: type === "invoice" && Array.isArray(d.credits) ? d.credits.slice(0, 200).map(c => ({ id: str(c.id, 100), no: str(c.no, 60), date: isoOr(c.date, ""), amount: Math.max(0, numv(c.amount)) })) : [],
    // Payment reminders sent for this invoice: { at: time sent, tone }.
    reminders: (Array.isArray(d.reminders) ? d.reminders : []).slice(-50).map(r => ({ at: numv(r.at), tone: ["upcoming", "friendly", "firm", "final"].includes(r.tone) ? r.tone : "friendly" })),
    sentAt: numv(d.sentAt), createdAt: numv(d.createdAt) || Date.now(), updatedAt: numv(d.updatedAt) || Date.now(),
    sample: !!d.sample
  };
}

export function normalizeClient(c = {}) {
  return {
    id: str(c.id, 100) || uid(), name: str(c.name, 300), contact: str(c.contact, 200), email: str(c.email, 300), phone: str(c.phone, 60),
    address: str(c.address, 2000), taxId: str(c.taxId, 100), notes: str(c.notes, 4000),
    createdAt: numv(c.createdAt) || Date.now(), updatedAt: numv(c.updatedAt) || Date.now(), sample: !!c.sample
  };
}
export function normalizeProduct(p = {}) {
  return { id: str(p.id, 100) || uid(), desc: str(p.desc, 2000), sku: str(p.sku, 100), unit: str(p.unit, 30), rate: numv(p.rate), taxRate: p.taxRate === "" || p.taxRate == null ? "" : numv(p.taxRate), sample: !!p.sample };
}

function normalizeState(raw) {
  const s = freshState();
  if (!raw || typeof raw !== "object") return s;
  const def = defaultSettings();
  const rs = raw.settings || {};
  s.settings = { ...def, ...rs, business: { ...def.business, ...(rs.business || {}) }, numbering: { ...def.numbering } };
  DOC_TYPES.forEach(t => { s.settings.numbering[t] = { ...def.numbering[t], ...((rs.numbering || {})[t] || {}) }; });
  s.docs = (Array.isArray(raw.docs) ? raw.docs : []).map(normalizeDoc);
  s.clients = (Array.isArray(raw.clients) ? raw.clients : []).map(normalizeClient);
  s.products = (Array.isArray(raw.products) ? raw.products : []).map(normalizeProduct);
  s.looks = Array.isArray(raw.looks) ? raw.looks : [];
  s.meta = { ...s.meta, ...(raw.meta || {}) };
  syncCredits(s);
  return s;
}

// Every issued credit note reduces the balance of the invoice it was made for (same
// currency only). The list lives on the invoice so totals() stays a pure function; it is
// rebuilt after every change, so an editor's older copy of an invoice can never undo it.
export function syncCredits(s) {
  const by = new Map(), invoices = new Map();
  s.docs.forEach(d => { if (d.type === "invoice") invoices.set(d.id, d); });
  s.docs.forEach(d => {
    if (d.type !== "creditNote" || d.status !== "issued" || !d.sourceId) return;
    const inv = invoices.get(d.sourceId);
    if (!inv || inv.currency !== d.currency) return;
    const list = by.get(d.sourceId) || [];
    list.push({ id: d.id, no: d.no, date: d.issued, amount: totals(d).total });
    by.set(d.sourceId, list);
  });
  invoices.forEach((inv, id) => {
    const next = by.get(id) || [];
    if (JSON.stringify(next) !== JSON.stringify(inv.credits || [])) inv.credits = next;
  });
}

/* ---------------- Store ---------------- */
let state = freshState();
const subs = new Set();
let saveTimer = 0, saving = Promise.resolve(true), lastSaveOk = true;
const channel = "BroadcastChannel" in window ? new BroadcastChannel("invogen") : null;
const TAB_ID = uid();

export const getState = () => state;
export const settings = () => state.settings;
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
function emit(reason) { subs.forEach(fn => { try { fn(state, reason); } catch (e) { console.error(e); } }); }

export async function initState({ migrate } = {}) {
  const raw = await loadData();
  if (raw) state = normalizeState(raw);
  else {
    state = freshState();
    if (migrate) {
      const legacy = migrate();
      if (legacy) {
        state = normalizeState({ ...state, ...legacy, settings: { ...state.settings, ...(legacy.settings || {}) } });
        await saveData(state);
      }
    }
  }
  requestPersistence();
  if (channel) channel.onmessage = async e => {
    if (!e.data || e.data.from === TAB_ID) return;
    const fresh = await loadData();
    if (fresh) { state = normalizeState(fresh); emit("sync"); }
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  return state;
}

function schedule() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}
export function flush() {
  clearTimeout(saveTimer);
  const snapshot = state;
  saving = saving.then(() => saveData(snapshot)).then(ok => {
    if (ok !== lastSaveOk) { lastSaveOk = ok; emit("storage"); }
    if (ok && channel) channel.postMessage({ from: TAB_ID, at: Date.now() });
    return ok;
  });
  return saving;
}
export const lastSaveFailed = () => !lastSaveOk;

// Every change goes through update(): it runs the change, saves and re-renders.
export function update(mutator, reason = "change", { countsForBackup = true } = {}) {
  const r = mutator(state);
  if (reason !== "ui") syncCredits(state);
  if (countsForBackup) state.settings.changesSinceBackup = (state.settings.changesSinceBackup || 0) + 1;
  schedule();
  emit(reason);
  return r;
}

/* ---------------- Numbering ---------------- */
export function formatDocNo(type, n) {
  const c = state.settings.numbering[type] || { prefix: "", pad: 4 };
  const body = String(n).padStart(Math.max(1, Math.min(8, Number(c.pad) || 1)), "0");
  return c.prefix ? `${c.prefix}-${body}` : body;
}
export function nextNumber(type) {
  const used = new Set(state.docs.filter(d => d.type === type).map(d => d.no));
  let n = Math.max(1, Number(state.settings.numbering[type]?.next) || 1);
  while (used.has(formatDocNo(type, n))) n++;
  return { no: formatDocNo(type, n), n };
}
function consumeNumber(s, type, n) {
  s.settings.numbering[type].next = Math.max(Number(s.settings.numbering[type].next) || 1, n + 1);
}

/* ---------------- Documents ---------------- */
export const getDoc = id => state.docs.find(d => d.id === id) || null;

// Builds (does not save) a new document with the business defaults filled in.
export function newDoc(type = "invoice", over = {}) {
  const s = state.settings, today = todayISO();
  const { no } = nextNumber(type);
  const due = NO_DUE_TYPES.includes(type) ? "" : addDays(today, QUOTE_TYPES.includes(type) ? s.estimateValidDays : s.termsDays);
  return normalizeDoc({
    type, no, status: type === "receipt" ? "paid" : "draft", issued: today, due,
    termsDays: type === "invoice" ? s.termsDays : "",
    currency: s.currency, lang: s.docLang, dateFormat: s.dateFormat, numberFormat: s.numberFormat,
    business: { ...s.business },
    items: [{ desc: "", qty: 1, rate: 0 }],
    tax: { name: s.taxName, rate: s.taxRate, inclusive: s.taxInclusive },
    notes: s.notes, terms: s.paymentInstructions, template: s.template, accent: s.accent, paper: s.paper,
    columns: Array.isArray(s.columns) ? structuredClone(s.columns) : undefined,
    ...over
  });
}

export function saveDoc(doc) {
  return update(s => {
    const d = normalizeDoc({ ...doc, updatedAt: Date.now() });
    const i = s.docs.findIndex(x => x.id === d.id);
    if (i >= 0) s.docs[i] = d; else s.docs.unshift(d);
    const m = /(\d+)\s*$/.exec(d.no);
    if (m && d.no === formatDocNo(d.type, +m[1])) consumeNumber(s, d.type, +m[1]);
    return d;
  }, "docs");
}

export function deleteDoc(id) {
  return update(s => {
    const index = s.docs.findIndex(d => d.id === id);
    if (index < 0) return null;
    const [doc] = s.docs.splice(index, 1);
    return { doc, index };
  }, "docs");
}
export function restoreDoc(doc, index) {
  update(s => {
    if (s.docs.some(d => d.id === doc.id)) return;
    s.docs.splice(Math.min(Math.max(0, index), s.docs.length), 0, doc);
  }, "docs");
}

export function duplicateDoc(id, asType) {
  const src = getDoc(id);
  if (!src) return null;
  const type = asType || src.type;
  const { no, n } = nextNumber(type);
  const today = todayISO();
  const span = src.due && src.issued ? Math.max(0, Math.round((new Date(src.due) - new Date(src.issued)) / 864e5)) : (QUOTE_TYPES.includes(type) ? state.settings.estimateValidDays : state.settings.termsDays);
  const changesType = type !== src.type;
  return update(s => {
    const copy = normalizeDoc({
      ...structuredClone(src), id: uid(), type, no, status: type === "receipt" ? "paid" : "draft",
      issued: today, due: NO_DUE_TYPES.includes(type) ? "" : addDays(today, span), payments: [], sentAt: 0,
      createdAt: Date.now(), updatedAt: Date.now(), sample: false, recurringFrom: "",
      sourceId: changesType ? src.id : "", credits: [], reminders: [],
      termsDays: type === "invoice" ? src.termsDays : "",
      // Options that only make sense on the original type are switched off.
      ...(type !== "invoice" ? { lateFee: { ...src.lateFee, on: false }, recurring: { ...src.recurring, on: false } } : {}),
      ...(["creditNote", "purchaseOrder", "deliveryNote", "receipt"].includes(type) && changesType ? { deposit: { ...src.deposit, on: false } } : {}),
      ...(changesType && ["creditNote", "deliveryNote"].includes(type) ? { reference: src.no } : {}),
      items: src.items.map(it => ({ ...it, id: uid() }))
    });
    s.docs.unshift(copy);
    consumeNumber(s, type, n);
    return copy;
  }, "docs");
}

export function setDocFields(id, patch) {
  return update(s => {
    const d = s.docs.find(x => x.id === id);
    if (!d) return null;
    Object.assign(d, patch, { updatedAt: Date.now() });
    return d;
  }, "docs");
}

export function markSent(id) { const d = getDoc(id); return setDocFields(id, { status: sentStatus(d ? d.type : "invoice"), sentAt: Date.now() }); }

// Records that a payment reminder was sent for an invoice.
export function logReminder(id, tone) {
  return update(s => {
    const d = s.docs.find(x => x.id === id);
    if (!d) return null;
    d.reminders = [...(d.reminders || []), { at: Date.now(), tone }].slice(-50);
    if (d.status === "draft") { d.status = "sent"; d.sentAt = d.sentAt || Date.now(); }
    return d;
  }, "docs");
}

export function recordPayment(id, { amount, date, method = "", note = "" }) {
  return update(s => {
    const d = s.docs.find(x => x.id === id);
    if (!d) return null;
    const p = { id: uid(), date: date || todayISO(), amount: Math.max(0, Number(amount) || 0), method, note };
    d.payments = [...(d.payments || []), p];
    if (d.status === "draft") d.status = "sent";
    if (totals(d).balance <= 0) d.status = "paid";
    d.updatedAt = Date.now();
    return p;
  }, "docs");
}

// Records a payment for whatever is still owed and marks the invoice paid.
export function markPaid(id) {
  const d = getDoc(id);
  if (!d) return null;
  const prev = { status: d.status, payments: structuredClone(d.payments) };
  const owed = totals(d).balance;
  update(s => {
    const x = s.docs.find(y => y.id === id);
    if (owed > 0) x.payments = [...x.payments, { id: uid(), date: todayISO(), amount: owed, method: "", note: "" }];
    x.status = "paid";
    x.updatedAt = Date.now();
  }, "docs");
  return prev;
}
export function markUnpaid(id) {
  const d = getDoc(id);
  if (!d) return null;
  const prev = { status: d.status, payments: structuredClone(d.payments) };
  setDocFields(id, { status: "sent", payments: [] });
  return prev;
}
export function restorePaymentState(id, prev) { setDocFields(id, { status: prev.status, payments: prev.payments }); }

export function setEstimateStatus(id, status) { return setDocFields(id, { status }); }

// A credit note for an invoice: a draft copy of its lines (edit them for a part credit).
// Once issued, its total is taken off the invoice's balance.
export function createCreditNote(invoiceId) {
  const inv = getDoc(invoiceId);
  if (!inv || inv.type !== "invoice") return null;
  return duplicateDoc(invoiceId, "creditNote");
}
// A delivery note (no prices) listing the lines of an invoice, proforma or order.
export function createDeliveryNote(id) {
  const src = getDoc(id);
  if (!src) return null;
  return duplicateDoc(id, "deliveryNote");
}

// Turns an estimate or proforma into a new draft invoice (the original is kept and marked accepted).
export function convertToInvoice(id) {
  const est = getDoc(id);
  if (!est) return null;
  const inv = duplicateDoc(id, "invoice");
  if (inv) setDocFields(inv.id, { due: addDays(todayISO(), state.settings.termsDays), termsDays: state.settings.termsDays, reference: est.no });
  if (est.status !== "accepted") setEstimateStatus(id, "accepted");
  return inv;
}

/* ---------------- Bulk actions (Documents list) ---------------- */
// Each returns { count, undo }; undo puts the documents back exactly as they were.
function withUndo(fn) {
  const before = structuredClone(state.docs);
  const count = update(fn, "docs");
  return { count, undo: () => update(s => { s.docs = before; }, "docs") };
}
export function bulkMarkSent(ids) {
  const set = new Set(ids);
  return withUndo(s => {
    let n = 0;
    s.docs.forEach(d => {
      if (!set.has(d.id) || d.type === "receipt" || d.status !== "draft") return;
      d.status = sentStatus(d.type); d.sentAt = Date.now(); d.updatedAt = Date.now(); n++;
    });
    return n;
  });
}
export function bulkMarkPaid(ids, today = todayISO()) {
  const set = new Set(ids);
  return withUndo(s => {
    let n = 0;
    s.docs.forEach(d => {
      if (!set.has(d.id) || d.type !== "invoice") return;
      const st = statusOf(d, today);
      if (!["draft", "sent", "partial", "overdue"].includes(st)) return;
      const owed = totals(d, today).balance;
      if (owed > 0) d.payments = [...d.payments, { id: uid(), date: today, amount: owed, method: "", note: "" }];
      d.status = "paid"; d.updatedAt = Date.now(); n++;
    });
    return n;
  });
}
export function bulkDelete(ids) {
  const set = new Set(ids);
  return withUndo(s => { const n = s.docs.length; s.docs = s.docs.filter(d => !set.has(d.id)); return n - s.docs.length; });
}

/* ---------------- Recurring invoices ---------------- */
// Creates a draft for every recurring invoice whose next date has arrived.
// Runs when the app opens (there is no server to do it on a schedule).
export function runRecurring(today = todayISO()) {
  let made = 0;
  const due = state.docs.filter(d => d.type === "invoice" && d.recurring.on && d.recurring.next && d.recurring.next <= today);
  if (!due.length) return 0;
  update(s => {
    due.forEach(src0 => {
      const src = s.docs.find(x => x.id === src0.id);
      let guard = 0;
      while (src.recurring.on && src.recurring.next && src.recurring.next <= today && guard++ < 24) {
        if (src.recurring.end && src.recurring.next > src.recurring.end) { src.recurring.on = false; break; }
        const issued = src.recurring.next;
        const span = src.due && src.issued ? Math.max(0, Math.round((new Date(src.due) - new Date(src.issued)) / 864e5)) : s.settings.termsDays;
        const { no, n } = nextNumber("invoice");
        const copy = normalizeDoc({ ...structuredClone(src), id: uid(), no, status: "draft", issued, due: addDays(issued, span), payments: [], sentAt: 0, recurring: { on: false }, recurringFrom: src.id, createdAt: Date.now(), updatedAt: Date.now(), items: src.items.map(it => ({ ...it, id: uid() })) });
        s.docs.unshift(copy);
        consumeNumber(s, "invoice", n);
        const r = src.recurring;
        r.next = r.unit === "week" ? addDays(r.next, 7 * r.every) : r.unit === "year" ? addMonths(r.next, 12 * r.every) : addMonths(r.next, r.every);
        made++;
      }
    });
  }, "docs");
  return made;
}

/* ---------------- Clients & products ---------------- */
export const getClient = id => state.clients.find(c => c.id === id) || null;
export function saveClient(c) {
  return update(s => {
    const x = normalizeClient({ ...c, updatedAt: Date.now() });
    const i = s.clients.findIndex(y => y.id === x.id);
    if (i >= 0) s.clients[i] = x; else s.clients.unshift(x);
    return x;
  }, "clients");
}

// Removes a client. Their documents keep the details they were made with.
export function deleteClient(id) {
  return update(s => {
    const index = s.clients.findIndex(c => c.id === id);
    if (index < 0) return null;
    const [client] = s.clients.splice(index, 1);
    return { client, index };
  }, "clients");
}
export function restoreClient(client, index) {
  update(s => {
    if (s.clients.some(c => c.id === client.id)) return;
    s.clients.splice(Math.min(Math.max(0, index), s.clients.length), 0, client);
  }, "clients");
}
// Replaces the whole client or item list (used by Undo after an import).
export function setClients(list) { update(s => { s.clients = list.map(normalizeClient); }, "clients"); }
export function setProducts(list) { update(s => { s.products = list.map(normalizeProduct); }, "products"); }

const sameText = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

// Adds clients from an import. A row with the same email (or, without an email, the
// same name) as a saved client updates that client instead of adding a duplicate.
export function importClients(rows) {
  return update(s => {
    let added = 0, updated = 0;
    rows.forEach(r => {
      const name = String(r.name || "").trim();
      if (!name) return;
      const m = s.clients.find(c => (r.email && c.email && sameText(c.email, r.email)) || (!(r.email && c.email) && sameText(c.name, name)));
      if (m) {
        Object.entries(r).forEach(([k, v]) => { if (v != null && String(v).trim() !== "" && k !== "id") m[k] = String(v).trim(); });
        Object.assign(m, normalizeClient({ ...m, updatedAt: Date.now() }));
        updated++;
      } else { s.clients.push(normalizeClient({ ...r, id: undefined, name })); added++; }
    });
    return { added, updated };
  }, "clients");
}

// Saves clients that only exist inside documents (e.g. from v3, or typed in without
// pressing Save) and links those documents to them.
export function clientsFromDocs() {
  const known = state.clients;
  const found = new Map();
  [...state.docs].sort((a, b) => b.updatedAt - a.updatedAt).forEach(d => {
    const c = d.client, key = c.name.trim().toLowerCase();
    if (!key || (c.id && known.some(k => k.id === c.id)) || known.some(k => sameText(k.name, c.name)) || found.has(key)) return;
    found.set(key, c);
  });
  return [...found.values()];
}
export function saveClientsFromDocs() {
  const list = clientsFromDocs();
  if (!list.length) return null;
  const before = { clients: structuredClone(state.clients), links: state.docs.map(d => [d.id, d.client.id]) };
  update(s => {
    list.forEach(c => {
      const x = normalizeClient({ ...c, id: undefined });
      s.clients.push(x);
      s.docs.forEach(d => { if (sameText(d.client.name, x.name) && !s.clients.some(k => k.id === d.client.id && k !== x)) d.client.id = x.id; });
    });
  }, "clients");
  return { count: list.length, undo: () => update(s => {
    s.clients = before.clients;
    const m = new Map(before.links);
    s.docs.forEach(d => { if (m.has(d.id)) d.client.id = m.get(d.id); });
  }, "clients") };
}

// After a client's details change, drafts for that client follow. Documents that were
// already sent keep the details they were sent with.
export function updateClientDrafts(client, prevName) {
  let n = 0;
  update(s => {
    s.docs.forEach(d => {
      if (d.status !== "draft" || d.type === "receipt" || !isClientDoc(d, client, s.clients, prevName)) return;
      d.client = { ...d.client, id: client.id, name: client.name, contact: client.contact, email: client.email, phone: client.phone, address: client.address, taxId: client.taxId };
      d.updatedAt = Date.now();
      n++;
    });
  }, "docs");
  return n;
}

// Is this document for this client? Linked by id; documents without a (valid) link
// fall back to the client name.
export function isClientDoc(d, c, clients = state.clients, altName) {
  if (d.client.id && d.client.id === c.id) return true;
  if (d.client.id && clients.some(k => k.id === d.client.id)) return false;
  return !!d.client.name.trim() && (sameText(d.client.name, c.name) || (altName && sameText(d.client.name, altName)));
}
export const docsForClient = c => state.docs.filter(d => isClientDoc(d, c));

export function saveProduct(p) {
  return update(s => {
    const x = normalizeProduct(p);
    const i = s.products.findIndex(y => y.id === x.id);
    if (i >= 0) s.products[i] = x; else s.products.unshift(x);
    return x;
  }, "products");
}
export function deleteProduct(id) {
  return update(s => {
    const index = s.products.findIndex(p => p.id === id);
    if (index < 0) return null;
    const [product] = s.products.splice(index, 1);
    return { product, index };
  }, "products");
}
export function restoreProduct(product, index) {
  update(s => {
    if (s.products.some(p => p.id === product.id)) return;
    s.products.splice(Math.min(Math.max(0, index), s.products.length), 0, product);
  }, "products");
}

export function saveProducts(list) {
  return update(s => {
    list.forEach(p => {
      const x = normalizeProduct(p);
      const i = s.products.findIndex(y => y.desc.trim().toLowerCase() === x.desc.trim().toLowerCase());
      if (i >= 0) s.products[i] = { ...s.products[i], rate: x.rate, unit: x.unit || s.products[i].unit, sku: x.sku || s.products[i].sku };
      else s.products.unshift(x);
    });
  }, "products");
}

/* ---------------- Settings ---------------- */
export function setSettings(patch, reason = "settings") {
  return update(s => { Object.assign(s.settings, patch); }, reason, { countsForBackup: reason !== "ui" });
}

/* ---------------- Whole-data operations ---------------- */
export function replaceAll(raw) {
  state = normalizeState(raw);   // normalizeState also re-links credit notes
  schedule();
  emit("replace");
}

export async function eraseEverything() {
  const lang = state.settings.appLang;
  await clearData();
  state = freshState();
  state.settings.appLang = lang;
  await flush();
  emit("replace");
}

export function exportSnapshot() {
  return { app: "InvoGen", kind: "invogen-backup", schema: SCHEMA, exportedAt: new Date().toISOString(), data: structuredClone(state) };
}

/* ---------------- Derived helpers ---------------- */
export function docView(doc, today = todayISO()) {
  const t = totals(doc, today);
  return { doc, totals: t, status: statusOf(doc, today) };
}
