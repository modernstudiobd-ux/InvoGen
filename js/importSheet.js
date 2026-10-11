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

// Clients from a spreadsheet. Recognises common column names in several languages;
// address parts (street, city, postcode, country) are joined into one address.
const C_ALIASES = {
  name: ["name", "client", "client name", "customer", "customer name", "company", "company name", "business", "business name", "organisation", "organization", "account", "display name", "cliente", "nombre", "empresa", "kunde", "firma", "nom", "societe", "klant", "bedrijf", "musteri", "клиент", "компания", "客户", "顧客", "고객", "العميل", "الاسم", "ग्राहक", "pelanggan", "nama", "ক্লায়েন্ট", "নাম"],
  contact: ["contact", "contact person", "contact name", "attention", "attn", "first name", "full name", "contacto", "ansprechpartner", "contato", "referente", "contactpersoon", "yetkili", "контакт"],
  email: ["email", "e mail", "email address", "mail", "correo", "courriel", "почта", "邮箱", "メール", "이메일", "البريد", "ইমেইল"],
  phone: ["phone", "phone number", "telephone", "tel", "mobile", "cell", "whatsapp", "telefono", "telefon", "telephone number", "téléphone", "telefone", "телефон", "电话", "電話", "전화", "الهاتف", "फ़ोन", "telepon", "ফোন"],
  address: ["address", "billing address", "street", "address 1", "address line 1", "street address", "direccion", "adresse", "endereco", "indirizzo", "adres", "адрес", "地址", "住所", "주소", "العنوان", "पता", "alamat", "ঠিকানা"],
  address2: ["address 2", "address line 2", "suite", "apt"],
  city: ["city", "town", "ciudad", "stadt", "ville", "cidade", "citta", "stad", "sehir", "город", "城市", "市区町村", "도시", "المدينة", "शहर", "kota", "শহর"],
  region: ["state", "province", "region", "county", "estado", "provincia", "bundesland"],
  postcode: ["zip", "zip code", "postcode", "postal code", "post code", "pin", "pin code", "codigo postal", "plz", "code postal", "cep", "cap"],
  country: ["country", "pais", "land", "pays", "paese", "ulke", "страна", "国家", "国", "국가", "الدولة", "देश", "negara", "দেশ"],
  taxId: ["tax id", "tax number", "vat", "vat number", "vat id", "gst", "gstin", "tin", "ein", "abn", "trn", "bin", "nif", "cif", "rfc", "cnpj", "cpf", "ust id", "steuernummer", "siret", "piva", "partita iva", "btw", "vergi no", "инн", "税号"],
  notes: ["notes", "note", "comments", "remarks", "notas", "notizen", "remarques"]
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function toClients(rows) {
  if (!rows.length) return [];
  const all = Object.values(C_ALIASES);
  let best = -1, score = 0;
  rows.slice(0, 20).forEach((r, i) => {
    const s = r.reduce((n, x) => n + (all.some(a => a.includes(norm(x))) ? 1 : 0), 0);
    if (s > score) { score = s; best = i; }
  });
  const map = {};
  let data = rows;
  if (best >= 0) {
    const h = rows[best].map(norm);
    Object.entries(C_ALIASES).forEach(([k, a]) => { const i = h.findIndex((x, j) => a.includes(x) && !Object.values(map).includes(j)); if (i >= 0) map[k] = i; });
    data = rows.slice(best + 1);
    if (map.name == null && map.contact != null) { map.name = map.contact; delete map.contact; }
  } else {
    // No header: first text column is the name; emails and phone numbers are recognised.
    const r0 = rows[0].map(x => String(x).trim());
    map.name = r0.findIndex(x => x && !EMAIL_RE.test(x));
    const e = r0.findIndex(x => EMAIL_RE.test(x)); if (e >= 0) map.email = e;
    const p = r0.findIndex((x, i) => i !== map.name && /^[+(]?[\d\s().-]{6,}$/.test(x)); if (p >= 0) map.phone = p;
    const a = r0.findIndex((x, i) => x && ![map.name, map.email, map.phone].includes(i)); if (a >= 0) map.address = a;
  }
  if (map.name == null || map.name < 0) return [];
  const seen = new Set();
  return data.map(r => {
    const get = k => (map[k] != null && map[k] >= 0 ? String(r[map[k]] ?? "").trim().replace(/^'(?=[=+\-@])/, "") : "");
    const name = get("name");
    if (!name) return null;
    const cityLine = [get("postcode"), get("city"), get("region")].filter(Boolean).join(" ");
    const address = [get("address"), get("address2"), cityLine, get("country")].filter(Boolean).join("\n");
    const email = get("email");
    const key = (email || name).toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    return { name, contact: get("contact"), email: EMAIL_RE.test(email) ? email : "", phone: get("phone"), address, taxId: get("taxId"), notes: get("notes") };
  }).filter(Boolean).slice(0, 5000);
}

// Rows → CSV text (quoted where needed; starts with a BOM so Excel reads UTF-8).
export function toCSV(rows) {
  // Cells that a spreadsheet could run as a formula get a leading apostrophe.
  const risky = s => /^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && /[^\d\s().,+-]/.test(s));
  const q = v => { let s = String(v ?? ""); if (risky(s)) s = "'" + s; return /[",\n\r']/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "\ufeff" + rows.map(r => r.map(q).join(",")).join("\r\n");
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
