// importSheet.js — line items from CSV, Excel (.xlsx/.xls) or data pasted from Google
// Sheets / Excel (tab-separated). Finds the header row and guesses which column is the
// description, quantity, price, amount, unit and SKU (carried over from v3.41, extended).
// The Excel reader (SheetJS) is bundled in js/vendor and only loaded when needed.

import { parseNumber } from "./format.js";

export function parseDelimited(text) {
  const t = String(text || "").replace(/^﻿/, "");
  const first = t.split(/\r?\n/)[0] || "";
  const delim = (first.match(/\t/g) || []).length >= Math.max(1, (first.match(/,/g) || []).length) ? "\t"
    : (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i], n = t[i + 1];
    if (c === '"' && q && n === '"') { cell += '"'; i++; }
    else if (c === '"' && (q || cell === "")) q = !q;
    else if (c === delim && !q) { row.push(cell); cell = ""; }
    else if ((c === "\n" || c === "\r") && !q) { if (c === "\r" && n === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim()));
}

const norm = s => String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const ALIASES = {
  desc: ["description", "item", "items", "name", "product", "service", "details", "item name", "product name", "descripcion", "descricao", "beschreibung", "designation", "article", "বিবরণ", "الوصف"],
  qty: ["qty", "quantity", "hours", "hrs", "units", "count", "cantidad", "quantidade", "menge", "quantite", "qte", "পরিমাণ", "الكمية"],
  rate: ["rate", "price", "unit price", "unit cost", "cost", "precio", "preco", "preis", "prix", "দর", "السعر"],
  amount: ["amount", "total", "line total", "subtotal", "importe", "valor", "betrag", "montant", "মূল্য", "المبلغ"],
  unit: ["unit", "uom", "unidad", "einheit", "unite", "একক"],
  sku: ["sku", "code", "item code", "product code", "ref", "reference", "part"]
};

export function toItems(rows) {
  if (!rows.length) return [];
  // Header = the row (within the first 20) that matches the most known column names.
  let best = -1, score = 0;
  rows.slice(0, 20).forEach((r, i) => {
    const s = r.reduce((n, x) => n + (Object.values(ALIASES).some(a => a.includes(norm(x))) ? 1 : 0), 0);
    if (s > score) { score = s; best = i; }
  });
  let map = {}, data = rows;
  if (best >= 0) {
    const h = rows[best].map(norm);
    Object.entries(ALIASES).forEach(([k, a]) => { const i = h.findIndex(x => a.includes(x)); if (i >= 0) map[k] = i; });
    data = rows.slice(best + 1);
  } else {
    // No header: first text column = description, then numbers = qty, rate.
    const sample = rows[0];
    const numeric = sample.map(x => /^[\s\d.,' -]+$/.test(String(x)) && String(x).trim() !== "");
    map.desc = numeric.findIndex(v => !v);
    const nums = numeric.map((v, i) => v ? i : -1).filter(i => i >= 0);
    if (nums.length >= 2) { map.qty = nums[0]; map.rate = nums[1]; } else if (nums.length === 1) map.rate = nums[0];
  }
  return data.map(r => {
    const get = k => (map[k] != null && map[k] >= 0 ? String(r[map[k]] ?? "").trim() : "");
    const desc = get("desc"), qtyS = get("qty"), rateS = get("rate"), amtS = get("amount");
    const qty = qtyS === "" ? 1 : parseNumber(qtyS);
    let rate = rateS === "" ? NaN : parseNumber(rateS);
    if (!Number.isFinite(rate) && amtS !== "") rate = parseNumber(amtS) / (qty || 1);
    if (!desc && !Number.isFinite(rate)) return null;
    return { desc, qty, rate: Number.isFinite(rate) ? Math.round(rate * 1e6) / 1e6 : 0, unit: get("unit"), sku: get("sku") };
  }).filter(Boolean).slice(0, 2000);
}

export async function ensureXLSX() {
  if (window.XLSX) return;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = new URL("./vendor/xlsx.full.min.js", import.meta.url).href;
    s.onload = res;
    s.onerror = () => rej(new Error("xlsx-load"));
    document.head.appendChild(s);
  });
}

// File (CSV/TSV/TXT/XLSX/XLS/ODS) → rows
export async function readSheetFile(file) {
  if (file.size > 20e6) throw new Error("too-large");
  if (/\.(xlsx|xlsm|xls|ods)$/i.test(file.name) || /spreadsheet|excel/.test(file.type)) {
    await ensureXLSX();
    const wb = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }).filter(r => r.some(x => String(x).trim()));
  }
  return parseDelimited(await file.text());
}
