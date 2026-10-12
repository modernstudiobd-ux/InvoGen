// columns.js — the line-item columns of a document: which show, their names, order and
// width (from the approved design's column settings).
//   Built in: desc (always first) · qty · rate · amount (always last)
//   Optional: sku · unit · disc (discount % off the line) · tax (tax % added to the line)
//   Custom:   any number of extra Text or Number columns (values stored per item in item.cells)
// A column is { id, role, label, on, w }. label "" = the standard name in the document's
// language; w 0 = automatic width, otherwise a relative width (0.3–8).

import { uid } from "./dom.js";

export const ROLES = ["text", "qty", "rate", "amount", "number", "disc", "tax"];
const BUILTIN = { desc: "text", qty: "qty", rate: "rate", amount: "amount", sku: "text", unit: "text", disc: "disc", tax: "tax" };
export const OPTIONAL = ["sku", "unit", "disc", "tax"];           // can be added and removed
const DEFAULT_W = { desc: 4, qty: 0.8, rate: 1.4, amount: 1.6, sku: 1, unit: 0.8, disc: 0.9, tax: 0.9, text: 1.4, number: 1 };

export const defaultColumns = () => [
  { id: "desc", role: "text", label: "", on: true, w: 0 },
  { id: "qty", role: "qty", label: "", on: true, w: 0 },
  { id: "rate", role: "rate", label: "", on: true, w: 0 },
  { id: "amount", role: "amount", label: "", on: true, w: 0 }
];

const str = (v, max) => String(v ?? "").slice(0, max);
const clampW = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(8, Math.max(0.3, Math.round(n * 10) / 10)) : 0; };

// Cleans a saved column list (or builds one from the older { qty, rate, unit, sku } switches).
export function normalizeColumns(cols, legacy) {
  let list;
  if (Array.isArray(cols) && cols.length) {
    const seen = new Set();
    list = cols.filter(c => c && typeof c === "object").map(c => {
      let id = str(c.id, 40) || "c_" + uid().slice(0, 8);
      const builtin = BUILTIN[id];
      const role = builtin || (["text", "number"].includes(c.role) ? c.role : "text");
      if (!builtin && !id.startsWith("c_")) id = "c_" + id;
      return { id, role, label: str(c.label, 40), on: c.on !== false, w: clampW(c.w) };
    }).filter(c => !seen.has(c.id) && seen.add(c.id));
  } else {
    const l = legacy || {};
    list = defaultColumns();
    list[2].on = l.rate !== false;
    if (l.sku) list.splice(1, 0, { id: "sku", role: "text", label: "", on: true, w: 0 });
    if (l.unit) list.splice(list.findIndex(c => c.id === "qty") + 1, 0, { id: "unit", role: "text", label: "", on: true, w: 0 });
    // Older documents always multiplied by the quantity, even when it was hidden.
    list.find(c => c.id === "qty").on = true;
  }
  // Description first and Amount last, always present and shown; Quantity and Price always exist.
  const take = id => { const i = list.findIndex(c => c.id === id); return i >= 0 ? list.splice(i, 1)[0] : null; };
  const desc = take("desc") || defaultColumns()[0], amount = take("amount") || defaultColumns()[3];
  if (!list.some(c => c.id === "qty")) list.unshift({ id: "qty", role: "qty", label: "", on: false, w: 0 });
  if (!list.some(c => c.id === "rate")) list.push({ id: "rate", role: "rate", label: "", on: true, w: 0 });
  desc.on = true; amount.on = true;
  return [desc, ...list.slice(0, 20), amount];
}

export const colOn = (cols, id) => !!(cols || []).find(c => c.id === id && c.on);

// What the line amount depends on.
export const lineOptions = cols => Array.isArray(cols) && cols.length
  ? { qty: colOn(cols, "qty"), disc: colOn(cols, "disc"), tax: colOn(cols, "tax") }
  : { qty: true, disc: false, tax: false };

export const defaultWeight = c => DEFAULT_W[c.id] || DEFAULT_W[c.role] || 1;
export const isNumeric = c => ["qty", "rate", "amount", "number", "disc", "tax"].includes(c.role);

// Reads a column's value from an item (built-ins are item fields; custom ones live in item.cells).
export function cellValue(item, c) {
  if (c.id === "desc") return item.desc;
  if (["qty", "rate", "sku", "unit", "disc", "tax"].includes(c.id)) return item[c.id];
  return (item.cells || {})[c.id] ?? "";
}
