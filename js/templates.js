// templates.js — the 17 document templates: name, group, default brand colour and
// heading font. The look of each lives in css/templates.css (.doc.tpl-<id>).
// Colour helpers keep every accent readable: text drawn in the brand colour is
// darkened or lightened until it reaches 4.5:1 contrast with what it sits on.

export const TEMPLATES = [
  { id: "modern",        group: "general",  accent: "#292524", font: "Plus Jakarta Sans" },
  { id: "classic",       group: "general",  accent: "#1f3a5f", font: "PT Serif" },
  { id: "compact",       group: "general",  accent: "#292524", font: "Inter" },
  { id: "apple",         group: "general",  accent: "#1d1d1f", font: "DM Sans" },
  { id: "freelancer",    group: "general",  accent: "#2f6f4f", font: "Plus Jakarta Sans" },
  { id: "dark",          group: "general",  accent: "#34d399", font: "Space Grotesk", bg: "#151517", dark: true },
  { id: "corporate",     group: "industry", accent: "#1e3a5f", font: "Manrope" },
  { id: "luxury",        group: "industry", accent: "#9a7b3c", font: "Playfair Display", bg: "#fffdf8" },
  { id: "agency",        group: "industry", accent: "#e4572e", font: "Sora" },
  { id: "construction",  group: "industry", accent: "#f2b705", font: "Montserrat" },
  { id: "medical",       group: "industry", accent: "#0f766e", font: "Outfit" },
  { id: "legal",         group: "industry", accent: "#1f2937", font: "Lora" },
  { id: "realestate",    group: "industry", accent: "#8b6b3d", font: "Lora", bg: "#fbf8f1" },
  { id: "restaurant",    group: "industry", accent: "#4b5320", font: "Lora", bg: "#fbf9f4" },
  { id: "retail",        group: "industry", accent: "#111111", font: "Montserrat" },
  { id: "technology",    group: "industry", accent: "#0b0e14", font: "IBM Plex Mono" },
  { id: "manufacturing", group: "industry", accent: "#384250", font: "Manrope" }
];
export const TEMPLATE_IDS = TEMPLATES.map(t => t.id);
export const templateOf = id => TEMPLATES.find(t => t.id === id) || TEMPLATES[0];

// Fonts you can pick in Design. "" means the template's own heading font.
export const DOC_FONTS = {
  "Inter": "'Inter'",
  "Space Grotesk": "'Space Grotesk'",
  "Plus Jakarta Sans": "'Plus Jakarta Sans'",
  "DM Sans": "'DM Sans'",
  "Manrope": "'Manrope'",
  "Outfit": "'Outfit'",
  "Sora": "'Sora'",
  "Montserrat": "'Montserrat'",
  "PT Serif": "'PT Serif',Georgia,serif",
  "Lora": "'Lora',Georgia,serif",
  "Playfair Display": "'Playfair Display',Georgia,serif",
  "IBM Plex Mono": "'IBM Plex Mono',ui-monospace,Menlo,monospace",
  "Georgia": "Georgia,'Times New Roman',serif",
  "System": "system-ui,-apple-system,'Segoe UI',Roboto"
};

/* ---------------- colour ---------------- */
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rgbHex = c => "#" + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const luminance = hex => { const [r, g, b] = hexRgb(hex); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
export const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mix = (a, b, t) => { const x = hexRgb(a), y = hexRgb(b); return rgbHex(x.map((v, i) => v + (y[i] - v) * t)); };

// The brand colour, nudged toward black or white just enough to be readable on `bg`.
export function readable(color, bg, min = 4.5) {
  if (contrast(color, bg) >= min) return color;
  const toward = luminance(bg) > 0.4 ? "#000000" : "#ffffff";
  for (let t = 0.05; t <= 1; t += 0.05) { const c = mix(color, toward, t); if (contrast(c, bg) >= min) return c; }
  return toward;
}
export const onColor = bg => (contrast("#ffffff", bg) >= contrast("#0c0a09", bg) ? "#ffffff" : "#0c0a09");
export const validHex = v => /^#[0-9a-f]{6}$/i.test(v || "");

// CSS variables for a document: the template's colours with the person's brand colour.
export function templateVars(id, accent) {
  const tp = templateOf(id);
  const A = validHex(accent) ? accent.toLowerCase() : tp.accent;
  const bg = tp.bg || "#ffffff";
  const darkPanel = id === "technology" ? "#0b0e14" : "#1f2430";
  return {
    "--accent": A,
    "--on-accent": onColor(A),
    "--accent-text": readable(A, bg),
    "--accent-on-dark": readable(A, darkPanel),
    "--accent-tint": mix(A, bg, 0.89),
    "--accent-tint-text": readable(A, mix(A, bg, 0.89)),
    "--doc-font": tp.font === "Inter" ? "'Inter'" : DOC_FONTS[tp.font] || "'Inter'"
  };
}

// What fills the rest of the printed page below the document (and behind the page
// margins), so tinted, dark, striped and grid templates cover every page completely.
export function printBackground(id, accent, rtl = false) {
  const tp = templateOf(id), bg = tp.bg || "#ffffff";
  const A = validHex(accent) ? accent : tp.accent;
  if (id === "agency") return `linear-gradient(to ${rtl ? "left" : "right"}, ${A} 0 9mm, ${bg} 9mm)`;
  if (id === "technology") return `linear-gradient(#f3f5f8 1px, transparent 1px) 0 0 / 22px 22px, linear-gradient(90deg, #f3f5f8 1px, transparent 1px) 0 0 / 22px 22px, ${bg}`;
  return tp.bg || "";
}
