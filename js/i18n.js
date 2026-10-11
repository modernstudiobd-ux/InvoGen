// i18n.js — the app's interface language. Translations are bundled JSON files in
// /i18n (no network or AI calls). English is always loaded as the fallback, so a
// missing string shows in English instead of breaking.

import { esc } from "./dom.js";

// [code, native name, English name, text direction]
export const LANGS = [
  ["en", "English", "English", "ltr"],
  ["es", "Español", "Spanish", "ltr"],
  ["fr", "Français", "French", "ltr"],
  ["de", "Deutsch", "German", "ltr"],
  ["pt", "Português", "Portuguese", "ltr"],
  ["it", "Italiano", "Italian", "ltr"],
  ["nl", "Nederlands", "Dutch", "ltr"],
  ["tr", "Türkçe", "Turkish", "ltr"],
  ["ru", "Русский", "Russian", "ltr"],
  ["zh", "中文", "Chinese", "ltr"],
  ["ja", "日本語", "Japanese", "ltr"],
  ["ko", "한국어", "Korean", "ltr"],
  ["ar", "العربية", "Arabic", "rtl"],
  ["hi", "हिन्दी", "Hindi", "ltr"],
  ["id", "Bahasa Indonesia", "Indonesian", "ltr"],
  ["bn", "বাংলা", "Bangla", "ltr"]
];
export const LANG_CODES = LANGS.map(l => l[0]);

let current = "en";
let dict = {};
let fallback = {};
const listeners = new Set();
const cache = {};

async function fetchLang(code) {
  if (cache[code]) return cache[code];
  const res = await fetch(`i18n/${code}.json`);
  if (!res.ok) throw new Error("Missing translation file " + code);
  cache[code] = await res.json();
  return cache[code];
}

export function detectLanguage() {
  const prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"];
  for (const p of prefs) {
    const code = String(p).toLowerCase().split("-")[0];
    if (LANG_CODES.includes(code)) return code;
  }
  return "en";
}

export async function setLanguage(code) {
  if (!LANG_CODES.includes(code)) code = "en";
  try { fallback = await fetchLang("en"); } catch { fallback = {}; }
  try { dict = code === "en" ? fallback : await fetchLang(code); }
  catch { dict = fallback; code = "en"; }
  current = code;
  const info = langInfo(code);
  document.documentElement.lang = code;
  document.documentElement.dir = info.dir;
  listeners.forEach(fn => fn(code));
  return code;
}

export const getLanguage = () => current;
export const isRTL = () => langInfo(current).dir === "rtl";
export function langInfo(code) {
  const l = LANGS.find(x => x[0] === code) || LANGS[0];
  return { code: l[0], name: l[1], english: l[2], dir: l[3] };
}
export function onLanguageChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

let plural;
// t("docs.title") → "Documents". Params fill {name} placeholders.
// A value can be a plural object { one, other, few, many, two, zero } chosen by params.n.
export function t(key, params) {
  let v = dict[key] ?? fallback[key];
  if (v == null) return key;
  if (typeof v === "object") {
    const n = params && typeof params.n === "number" ? params.n : 0;
    if (!plural || plural.lang !== current) plural = { lang: current, rules: new Intl.PluralRules(current) };
    const cat = plural.rules.select(n);
    v = v[cat] ?? v.other ?? Object.values(v)[0];
  }
  if (params) v = String(v).replace(/\{(\w+)\}/g, (m, k) => (params[k] ?? m));
  return v;
}

// Like t(), but returns HTML: the translated text is escaped, and each param value is
// inserted as ready-made (already escaped) HTML — e.g. an amount wrapped in <bdi>.
export function tHtml(key, htmlParams = {}) {
  const marks = [], p = {};
  Object.keys(htmlParams).forEach(k => {
    if (k === "n") { p.n = htmlParams.n; return; }
    p[k] = `\u0001${marks.length}\u0001`; marks.push(htmlParams[k]);
  });
  return esc(t(key, p)).replace(/\u0001(\d+)\u0001/g, (m, i) => marks[+i]);
}

// Currency name in the current language (browser-provided), English fallback.
let dn;
export function currencyName(code, english) {
  try {
    if (!dn || dn.lang !== current) dn = { lang: current, f: new Intl.DisplayNames([current], { type: "currency" }) };
    const n = dn.f.of(code);
    return n && n !== code ? n : english || code;
  } catch { return english || code; }
}
