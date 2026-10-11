// dom.js — tiny zero-dependency DOM/string helpers used throughout the app.

export const $ = id => document.getElementById(id);
export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function uid() {
  if (window.crypto && typeof crypto.randomUUID === "function") {
    try { return crypto.randomUUID(); } catch {}
  }
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

// Escapes text for safe use inside HTML text and attribute values. Every piece of
// user data that reaches innerHTML goes through this.
export function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

// Only embedded raster/SVG data URLs are accepted as a logo or signature image.
// Anything else (a remote URL or other scheme smuggled in via an imported file)
// is dropped, so opening a file can never make the app contact a server.
export function safeLogo(v) {
  return typeof v === "string" && v.length <= 6e6 &&
    /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(v) ? v : "";
}

// Up to two initials from a name; works for any script (uses grapheme clusters).
export function initials(name) {
  const words = String(name || "").trim().split(/[\s&·,.\-_/]+/u).filter(Boolean);
  const first = w => {
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      const it = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(w)[Symbol.iterator]().next();
      return it.value ? it.value.segment : "";
    }
    return Array.from(w)[0] || "";
  };
  if (!words.length) return "?";
  return (first(words[0]) + (words[1] ? first(words[1]) : "")).toLocaleUpperCase();
}

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}

// True when a key press is happening inside a text field, so single-key
// shortcuts (N, /) never fire while someone is typing.
export function isTyping(e) {
  const el = e.target;
  if (!el || !(el instanceof Element)) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

// Downloads a Blob as a file.
export function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
