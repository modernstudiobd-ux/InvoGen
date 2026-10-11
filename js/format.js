// format.js — money, number and date formatting. Every amount and date shown in the
// app or printed on a document goes through here, so formats stay consistent.
// Amounts are plain JavaScript numbers (exact to the cent up to about 90 trillion),
// so totals over 1 billion format and add up correctly.

import { CURRENCY } from "./currencies.js";

export const DATE_FORMATS = [
  "D MMM YYYY", "DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "DD.MM.YYYY", "DD-MM-YYYY",
  "YYYY/MM/DD", "MMMM D, YYYY", "D MMMM YYYY", "DD MMM YY", "YYYY年M月D日"
];
export const DEFAULT_DATE_FORMAT = "D MMM YYYY";

// value → example shown in pickers
export const NUMBER_FORMATS = [
  ["auto", null], ["1,234.56", "1,234.56"], ["1.234,56", "1.234,56"], ["1 234,56", "1 234,56"],
  ["1'234.56", "1'234.56"], ["12,34,567.89", "12,34,567.89"], ["native", null]
];

const SEPS = {
  "1,234.56": [",", "."], "1.234,56": [".", ","], "1 234,56": [" ", ","],
  "1'234.56": ["'", "."], "12,34,567.89": [",", ".", true]
};
const NATIVE_DIGITS = { ar: "arab", bn: "beng", hi: "deva" };

export function decimalsOf(code) { return CURRENCY[code] ? CURRENCY[code].decimals : 2; }

export function round(n, d = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  const f = 10 ** d;
  return Math.round((x + Math.sign(x) * Number.EPSILON) * f) / f;
}

// Parses "1,234.50", "1.234,50", "1 234,5", "١٢٣" etc. into a number (0 when empty/invalid).
export function parseNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v ?? "").trim();
  if (!s) return 0;
  // native digits → latin
  s = s.replace(/[٠-٩]/g, c => c.charCodeAt(0) - 0x0660)
       .replace(/[۰-۹]/g, c => c.charCodeAt(0) - 0x06F0)
       .replace(/[০-৯]/g, c => c.charCodeAt(0) - 0x09E6)
       .replace(/[०-९]/g, c => c.charCodeAt(0) - 0x0966)
       .replace(/٫/g, ".").replace(/٬/g, ",");
  const neg = /^[-−(]/.test(s);
  s = s.replace(/[^\d.,]/g, "");
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  let dec = "";
  if (lastDot > -1 && lastComma > -1) dec = lastDot > lastComma ? "." : ",";
  else if (lastComma > -1) dec = /,\d{1,2}$/.test(s) && (s.match(/,/g) || []).length === 1 ? "," : "";
  else if (lastDot > -1) dec = /\.\d{3}$/.test(s) && (s.match(/\./g) || []).length > 1 ? "" : ".";
  if (dec) {
    const other = dec === "." ? "," : ".";
    s = s.split(other).join("");
    s = s.replace(dec, "#").split(dec).join("").replace("#", ".");
  } else s = s.replace(/[.,]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}

function group(intStr, sep, indian) {
  if (!indian) return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  const last3 = intStr.slice(-3), rest = intStr.slice(0, -3);
  return rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, sep) + sep + last3 : last3;
}

const nfCache = new Map();
function nf(locale, d) {
  const k = locale + "|" + d;
  if (!nfCache.has(k)) {
    let f;
    try { f = new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }); }
    catch { f = new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }
    nfCache.set(k, f);
  }
  return nfCache.get(k);
}

// Formats a plain number. `fmt` is a NUMBER_FORMATS key; `lang` is a language code (en, bn, ar…).
export function formatNumber(n, d = 2, fmt = "auto", lang = "en") {
  const x = round(n, d);
  const sep = SEPS[fmt];
  if (sep) {
    const [int, frac] = Math.abs(x).toFixed(d).split(".");
    return (x < 0 ? "−" : "") + group(int, sep[0], sep[2]) + (d ? sep[1] + frac : "");
  }
  const base = localeFor(lang);
  const loc = fmt === "native" && NATIVE_DIGITS[lang] ? `${base}-u-nu-${NATIVE_DIGITS[lang]}` : `${base}-u-nu-latn`;
  return nf(loc, d).format(x).replace(/^-/, "−");
}

// Formats an amount with its currency symbol (or code when display = "code").
export function formatMoney(n, code = "USD", { fmt = "auto", lang = "en", display = "symbol" } = {}) {
  const c = CURRENCY[code] || { symbol: code, decimals: 2, after: false };
  const x = round(n, c.decimals);
  const body = formatNumber(Math.abs(x), c.decimals, fmt, lang);
  // Arabic-script symbols (ر.س, د.إ …) get a left-to-right mark so the number never jumps to the wrong side.
  const sym = display === "code" ? code : (/[\u0590-\u08FF]/.test(c.symbol) ? c.symbol + "\u200E" : c.symbol);
  const spaced = display === "code" || c.after || /\p{L}\u200E?$/u.test(sym);
  const s = c.after || (display === "code" && c.after)
    ? body + " " + sym
    : sym + (spaced ? " " : "") + body;
  return (x < 0 ? "−" : "") + s;
}

/* ---------------- Dates ---------------- */

const LOCALES = { en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE", pt: "pt-BR", it: "it-IT", nl: "nl-NL", tr: "tr-TR", ru: "ru-RU", zh: "zh-CN", ja: "ja-JP", ko: "ko-KR", ar: "ar", hi: "hi-IN", id: "id-ID", bn: "bn-BD" };
export function localeFor(lang) { return LOCALES[lang] || lang || "en-GB"; }

const pad = n => String(n).padStart(2, "0");

export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
export function addDays(iso, n) {
  const d = parseISO(iso) || new Date();
  d.setDate(d.getDate() + Number(n || 0));
  return todayISO(d);
}
export function addMonths(iso, n) {
  const d = parseISO(iso) || new Date();
  const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + Number(n || 0));
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return todayISO(d);
}
export function daysBetween(aIso, bIso) {
  const a = parseISO(aIso), b = parseISO(bIso);
  if (!a || !b) return 0;
  return Math.round((b - a) / 864e5);
}

const monthCache = new Map();
function monthName(month, style, lang) {
  const k = lang + style + month;
  if (!monthCache.has(k)) {
    let s;
    try { s = new Intl.DateTimeFormat(localeFor(lang) + "-u-nu-latn", { month: style }).format(new Date(2020, month, 15)); }
    catch { s = new Intl.DateTimeFormat("en-GB", { month: style }).format(new Date(2020, month, 15)); }
    monthCache.set(k, s);
  }
  return monthCache.get(k);
}

// Formats "YYYY-MM-DD" with one of DATE_FORMATS. Digits follow the number format
// (Latin unless "native" is chosen).
export function formatDate(iso, fmt = DEFAULT_DATE_FORMAT, lang = "en", numFmt = "auto") {
  const d = parseISO(iso);
  if (!d) return "";
  const Y = d.getFullYear(), M = d.getMonth(), D = d.getDate();
  const out = fmt.replace(/YYYY|YY|MMMM|MMM|MM|M|DD|D/g, tok => ({
    YYYY: String(Y), YY: String(Y).slice(-2), MMMM: monthName(M, "long", lang), MMM: monthName(M, "short", lang),
    MM: pad(M + 1), M: String(M + 1), DD: pad(D), D: String(D)
  })[tok]);
  return numFmt === "native" ? nativeDigits(out, lang) : out;
}

// Short date for lists ("29 Sep"): drops the year when it is the current year
// and the format is a day-month-name one; otherwise the full format.
export function formatShortDate(iso, fmt = DEFAULT_DATE_FORMAT, lang = "en", numFmt = "auto") {
  const d = parseISO(iso);
  if (!d) return "";
  if (d.getFullYear() === new Date().getFullYear()) {
    if (fmt === "D MMM YYYY" || fmt === "DD MMM YY" || fmt === "D MMMM YYYY") return formatDate(iso, "D MMM", lang, numFmt);
    if (fmt === "MMMM D, YYYY") return formatDate(iso, "MMM D", lang, numFmt);
    if (fmt === "YYYY年M月D日") return formatDate(iso, "M月D日", lang, numFmt);
  }
  return formatDate(iso, fmt, lang, numFmt);
}

export function nativeDigits(s, lang) {
  const base = { ar: 0x0660, bn: 0x09E6, hi: 0x0966 }[lang];
  return base ? String(s).replace(/\d/g, c => String.fromCharCode(base + +c)) : String(s);
}
