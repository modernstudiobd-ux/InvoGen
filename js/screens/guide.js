// screens/guide.js — the guided first invoice, shown to new people on their first visit
// (and from Settings → Help or the empty Documents page at any time).
// Five steps, as in the design: 1 Your business · 2 Your first client · 3 What you are
// billing · 4 Review (pick a look) · 5 Export (PDF, print, send or open in the editor).
// The rail and tab bar are hidden while it runs; "Skip guide" leaves at any point.

import { esc, uid } from "../dom.js";
import { icon } from "../icons.js";
import { t, LANGS, getLanguage, currencyName } from "../i18n.js";
import { changeLanguage } from "../layout.js";
import { getState, settings, setSettings, newDoc, saveDoc, saveClient, getDoc } from "../state.js";
import { CURRENCIES, COMMON_CURRENCIES } from "../currencies.js";
import { DOC_LANGS } from "../docLabels.js";
import { formatMoney, parseNumber, decimalsOf } from "../format.js";
import { totals, lineAmount } from "../calc.js";
import { TEMPLATES } from "../templates.js";
import { thumbHtml, fitThumbs } from "../tplThumbs.js";
import { printDocument } from "../print.js";
import { withPdfGuide } from "../pdfExport.js";

const STEPS = ["business", "client", "items", "review", "done"];
const LOOKS = ["modern", "classic", "dark", "corporate", "medical", "luxury"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Kept between mounts so changing the app language (which redraws the screen) keeps
// everything typed so far. Cleared when the guide finishes or is skipped.
let G = null;
let root = null, ac = null, stopFit = null;

function fresh() {
  const s = settings();
  return {
    step: 0,
    biz: { name: s.business.name, email: s.business.email, phone: s.business.phone },
    currency: s.currency, docLang: s.docLang,
    client: { name: "", email: "" },
    items: [{ id: uid(), desc: "", qty: 1, rate: "" }],
    template: s.template || "modern",
    docId: ""
  };
}

/* ---------------- mount ---------------- */
export function mount(el) {
  root = el;
  if (!G || (G.step === 4 && !getDoc(G.docId))) G = fresh();
  document.body.classList.add("is-guide");
  ac = new AbortController();
  const sig = { signal: ac.signal };
  root.addEventListener("submit", onSubmit, sig);
  root.addEventListener("click", onClick, sig);
  root.addEventListener("input", onInput, sig);
  root.addEventListener("change", onChange, sig);
  render();
  return { title: t("guide.title") };
}
export function unmount() {
  document.body.classList.remove("is-guide");
  if (stopFit) stopFit();
  if (ac) ac.abort();
  root = ac = stopFit = null;
}

/* ---------------- helpers ---------------- */
const money = n => formatMoney(n, G.currency, { fmt: settings().numberFormat, lang: getLanguage() });
const optHtml = (opts, cur) => opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(cur) ? " selected" : ""}>${esc(l)}</option>`).join("");
function currencyOptions(cur) {
  const label = ([c, sym, en]) => `${c} · ${sym} · ${currencyName(c, en)}`;
  const common = COMMON_CURRENCIES.map(c => CURRENCIES.find(r => r[0] === c)).filter(Boolean);
  const all = CURRENCIES.slice().sort((a, b) => a[0].localeCompare(b[0]));
  return `<optgroup label="${esc(t("ed.commonCurrencies"))}">${optHtml(common.map(r => [r[0], label(r)]), cur)}</optgroup>
    <optgroup label="${esc(t("ed.allCurrencies"))}">${optHtml(all.map(r => [r[0], label(r)]), common.some(r => r[0] === cur) ? "" : cur)}</optgroup>`;
}
const field = (id, label, value, o = {}) => `<div class="field${o.span ? " span2" : ""}"><label for="${id}">${esc(label)}</label>
  <input class="input" id="${id}" value="${esc(value)}" type="${o.type || "text"}" autocomplete="${o.ac || "off"}" dir="${o.type === "email" || o.type === "tel" ? "ltr" : "auto"}"${o.mode ? ` inputmode="${o.mode}"` : ""} maxlength="${o.max || 300}"${o.err ? ` aria-describedby="${id}-e"` : ""}>
  ${o.err ? `<p class="err" id="${id}-e" hidden></p>` : ""}</div>`;

// The document the guide makes, from what has been entered so far.
function draftDoc() {
  const s = settings();
  const items = G.items.filter(i => i.desc.trim() || Number(i.rate)).map(i => ({ id: i.id, desc: i.desc.trim(), qty: i.qty === "" ? 1 : Number(i.qty) || 0, rate: Number(i.rate) || 0, details: "", sku: "", unit: "" }));
  const base = G.docId && getDoc(G.docId);
  return {
    ...(base || newDoc("invoice")),
    currency: G.currency, lang: G.docLang, template: G.template, accent: "", font: "",
    business: { ...s.business },
    client: { ...(base ? base.client : {}), name: G.client.name.trim(), email: G.client.email.trim() },
    items: items.length ? items : [{ id: uid(), desc: "", qty: 1, rate: 0 }]
  };
}
const itemTotal = () => G.items.reduce((sum, i) => sum + lineAmount({ qty: i.qty === "" ? 1 : Number(i.qty) || 0, rate: Number(i.rate) || 0 }, decimalsOf(G.currency)), 0);

/* ---------------- render ---------------- */
function render() {
  if (!root) return;
  if (stopFit) { stopFit(); stopFit = null; }
  const n = G.step, key = STEPS[n];
  root.innerHTML = `
  <div class="guide">
    <header class="guide-top">
      <span class="guide-brand">InvoGen</span>
      <span class="guide-step" id="guideStep">${esc(t("guide.stepOf", { n: n + 1, total: 5 }))} · ${esc(t(`guide.s.${key}`))}</span>
      <button type="button" class="btn btn-ghost guide-skip" data-act="leave">${esc(t(n === 4 ? "guide.toDocs" : "guide.skipGuide"))}</button>
    </header>
    <div class="guide-bars" role="progressbar" aria-label="${esc(t("guide.progress"))}" aria-valuemin="1" aria-valuemax="5" aria-valuenow="${n + 1}" aria-valuetext="${esc(t("guide.stepOf", { n: n + 1, total: 5 }))}">
      ${STEPS.map((_, i) => `<span class="${i <= n ? "on" : ""}"></span>`).join("")}
    </div>
    <form class="card guide-card" id="guideForm" novalidate aria-labelledby="pageTitle">
      <h1 class="guide-h" id="pageTitle" tabindex="-1">${esc(t(`guide.h.${key}`))}</h1>
      <p class="guide-sub">${esc(t(`guide.sub.${key}`))}</p>
      ${body(key)}
      ${foot(n)}
    </form>
  </div>`;
  if (key === "review" || key === "done") stopFit = fitThumbs(root);
}

function body(key) {
  if (key === "business") {
    const cur = getLanguage();
    return `<div class="ed-grid">
      ${field("gBizName", t("guide.bizName"), G.biz.name, { span: true, ac: "organization", err: true })}
      ${field("gBizEmail", t("guide.optional", { label: t("ed.email") }), G.biz.email, { span: true, type: "email", ac: "email", mode: "email", err: true })}
      ${field("gBizPhone", t("guide.optional", { label: t("ed.phone") }), G.biz.phone, { span: true, type: "tel", ac: "tel", mode: "tel", max: 60 })}
      <div class="field"><label for="gCurrency">${esc(t("ed.currency"))}</label><select class="select" id="gCurrency">${currencyOptions(G.currency)}</select></div>
      <div class="field"><label for="gDocLang">${esc(t("ed.docLang"))}</label><select class="select" id="gDocLang">${optHtml(DOC_LANGS.map(([c, nm]) => [c, nm]), G.docLang)}</select></div>
      <div class="field span2"><label for="gAppLang">${esc(t("lang.title"))}</label>
        <select class="select" id="gAppLang">${LANGS.map(([c, nm, en]) => `<option value="${c}" lang="${c}"${c === cur ? " selected" : ""}>${esc(nm)}${c !== "en" ? ` — ${esc(en)}` : ""}</option>`).join("")}</select></div>
    </div>`;
  }
  if (key === "client") {
    const saved = getState().clients;
    return `<div class="ed-grid">
      ${field("gClientName", t("ed.clientName"), G.client.name, { span: true, ac: "organization", err: true })}
      ${field("gClientEmail", t("guide.optional", { label: t("send.to") }), G.client.email, { span: true, type: "email", ac: "email", mode: "email", err: true })}
    </div>
    ${saved.length ? `<div class="field"><label for="gPick">${esc(t("ed.chooseClient"))}</label><select class="select" id="gPick"><option value="">—</option>${optHtml(saved.map(c => [c.id, c.name]), "")}</select></div>` : ""}`;
  }
  if (key === "items") {
    return `<ol class="guide-items" id="gItems">${G.items.map((it, i) => itemRow(it, i)).join("")}</ol>
      <button type="button" class="btn btn-outline guide-add" data-act="add-item">${icon("plus", 18)}${esc(t("ed.addItem"))}</button>
      <p class="err" id="gItemsErr" role="alert" hidden></p>
      <div class="guide-total"><span>${esc(t("guide.total"))}</span><bdi class="ltr num" id="gTotal">${esc(money(itemTotal()))}</bdi></div>`;
  }
  if (key === "review") {
    const d = draftDoc(), tt = totals(d);
    const amt = n => `<bdi class="ltr num">${esc(money(n))}</bdi>`;
    const rows = [
      [t("guide.from"), `<bdi>${esc(G.biz.name.trim() || t("guide.notSet"))}</bdi>`],
      [t("guide.to"), `<bdi>${esc(G.client.name.trim() || t("guide.notSet"))}</bdi>`],
      [t("guide.itemsLabel"), `${esc(t("cl.itemCount", { n: d.items.filter(i => i.desc || i.rate).length }))} · ${amt(tt.subtotal)}`],
      [t("guide.total"), amt(tt.total)]
    ];
    return `<dl class="guide-review">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>
      <div class="field"><span class="label" id="gLookL">${esc(t("guide.look"))}</span>
        <div class="tpl-pick guide-looks" role="radiogroup" aria-labelledby="gLookL">${LOOKS.map(id => {
          const on = G.template === id;
          return `<button type="button" class="tpl-card${on ? " is-on" : ""}" role="radio" aria-checked="${on}" data-look="${id}">${thumbHtml({ ...d, template: id, watermark: { on: false, text: "" } })}<span class="tpl-meta"><span class="tpl-name">${esc(t(`tpl.name.${id}`))}</span></span></button>`;
        }).join("")}</div>
        <p class="hint">${esc(t("guide.lookHint"))}</p></div>`;
  }
  // done
  const d = getDoc(G.docId);
  return `${d ? `<div class="guide-final">${thumbHtml(d)}</div>` : ""}
    <div class="guide-actions">
      <button type="button" class="btn btn-outline" data-act="pdf">${icon("download", 18)}${esc(t("ed.downloadPdf"))}</button>
      <button type="button" class="btn btn-outline" data-act="print">${icon("file-text", 18)}${esc(t("ed.print"))}</button>
      <button type="button" class="btn btn-outline" data-act="send">${icon("send", 18)}${esc(t("ed.send"))}</button>
    </div>`;
}

function itemRow(it, i) {
  const n = i + 1;
  return `<li class="guide-item" data-i="${i}">
    <div class="field gi-desc"><label for="gDesc${i}">${esc(t("ed.itemDesc", { n }))}</label><input class="input" id="gDesc${i}" data-k="desc" value="${esc(it.desc)}" dir="auto" maxlength="2000" autocomplete="off" placeholder="${esc(t("ed.descPh"))}" enterkeyhint="next"></div>
    <div class="field gi-qty"><label for="gQty${i}">${esc(t("ed.qty"))}</label><input class="input num" id="gQty${i}" data-k="qty" value="${esc(it.qty)}" inputmode="decimal" autocomplete="off" dir="ltr"></div>
    <div class="field gi-rate"><label for="gRate${i}">${esc(t("ed.rate"))}</label><input class="input num" id="gRate${i}" data-k="rate" value="${esc(it.rate)}" inputmode="decimal" autocomplete="off" dir="ltr" placeholder="0"></div>
    <button type="button" class="icon-btn gi-del" data-act="del-item" aria-label="${esc(t("ed.removeItem", { n }))}"${G.items.length < 2 ? " disabled" : ""}>${icon("trash-2", 18)}</button>
  </li>`;
}

function foot(n) {
  const skip = n === 0 || n === 1 ? `<button type="button" class="btn btn-ghost" data-act="skip">${esc(t("guide.skipStep"))}</button>` : "";
  const back = n > 0 && n < 4 ? `<button type="button" class="btn btn-outline" data-act="back">${icon("arrow-left", 18)}${esc(t("guide.back"))}</button>` : "";
  const next = n === 4 ? t("guide.openEditor") : n === 3 ? t("guide.create") : t("guide.continue");
  return `<div class="guide-foot">${back}<span class="guide-gap"></span>${skip}<button type="submit" class="btn btn-primary">${esc(next)}</button></div>`;
}

/* ---------------- events ---------------- */
function readCurrent() {
  const v = id => { const el = root.querySelector("#" + id); return el ? el.value : null; };
  if (G.step === 0) {
    const nm = v("gBizName"); if (nm != null) G.biz.name = nm;
    const em = v("gBizEmail"); if (em != null) G.biz.email = em;
    const ph = v("gBizPhone"); if (ph != null) G.biz.phone = ph;
  } else if (G.step === 1) {
    const nm = v("gClientName"); if (nm != null) { if (G.client.id && nm.trim() !== G.client.name.trim()) delete G.client.id; G.client.name = nm; }
    const em = v("gClientEmail"); if (em != null) G.client.email = em;
  }
}

function onInput(e) {
  const el = e.target;
  const row = el.closest(".guide-item");
  if (row) {
    const it = G.items[+row.dataset.i];
    const k = el.dataset.k;
    if (k === "desc") it.desc = el.value;
    else { const raw = el.value.trim(), num = parseNumber(raw); it[k] = raw === "" ? "" : (Number.isFinite(num) ? num : it[k]); }
    const tot = root.querySelector("#gTotal"); if (tot) tot.textContent = money(itemTotal());
    return;
  }
  readCurrent();
  const err = root.querySelector(`#${el.id}-e`);
  if (err && !err.hidden) { err.hidden = true; el.removeAttribute("aria-invalid"); }
}

async function onChange(e) {
  const el = e.target;
  if (el.id === "gCurrency") { G.currency = el.value; return; }
  if (el.id === "gDocLang") { G.docLang = el.value; return; }
  if (el.id === "gAppLang") {
    readCurrent();
    const lang = el.value;
    await changeLanguage(lang);      // redraws this screen in the new language
    // Follow the app language for the documents too, when that language has document labels.
    if (DOC_LANGS.some(l => l[0] === lang)) G.docLang = lang;
    render();
    const sel = root && root.querySelector("#gAppLang"); if (sel) sel.focus();
    return;
  }
  if (el.id === "gPick") {
    const c = getState().clients.find(x => x.id === el.value);
    if (c) { G.client = { name: c.name, email: c.email || "", id: c.id }; render(); const n = root.querySelector("#gClientName"); if (n) n.focus(); }
  }
}

function showErr(id, msg) {
  const el = root.querySelector("#" + id), err = root.querySelector(`#${id}-e`);
  if (err) { err.hidden = false; err.textContent = msg; }
  if (el) { el.setAttribute("aria-invalid", "true"); el.focus(); }
}

function onSubmit(e) {
  e.preventDefault();
  readCurrent();
  const n = G.step;
  if (n === 0) {
    if (!G.biz.name.trim()) return showErr("gBizName", t("guide.errBiz"));
    if (G.biz.email.trim() && !EMAIL_RE.test(G.biz.email.trim())) return showErr("gBizEmail", t("cl.errEmail"));
    saveBusiness();
  } else if (n === 1) {
    if (!G.client.name.trim()) return showErr("gClientName", t("guide.errClient"));
    if (G.client.email.trim() && !EMAIL_RE.test(G.client.email.trim())) return showErr("gClientEmail", t("cl.errEmail"));
  } else if (n === 2) {
    if (!G.items.some(i => i.desc.trim() && Number(i.rate) > 0)) {
      const er = root.querySelector("#gItemsErr"); er.hidden = false; er.textContent = t("guide.errItems");
      const first = G.items.findIndex(i => !i.desc.trim() || !(Number(i.rate) > 0));
      const f = root.querySelector(`#${!G.items[Math.max(0, first)].desc.trim() ? "gDesc" : "gRate"}${Math.max(0, first)}`); if (f) f.focus();
      return;
    }
  } else if (n === 3) {
    return create();
  } else if (n === 4) {
    finish(); location.hash = `#/edit/${encodeURIComponent(G.docId)}`; G = null; return;
  }
  go(n + 1);
}

function go(step) {
  G.step = step;
  render();
  const h = root.querySelector("#pageTitle"); if (h) h.focus();
  window.scrollTo(0, 0);
}

function saveBusiness() {
  const s = settings();
  setSettings({
    business: { ...s.business, name: G.biz.name.trim(), email: G.biz.email.trim(), phone: G.biz.phone.trim() },
    currency: G.currency, docLang: G.docLang
  });
}

function create() {
  // The first client is remembered for next time (unless already saved).
  const cn = G.client.name.trim();
  if (cn && !G.client.id) {
    const known = getState().clients.find(c => c.name.trim().toLowerCase() === cn.toLowerCase());
    G.client.id = known ? known.id : saveClient({ name: cn, email: G.client.email.trim() }).id;
  }
  const d = draftDoc();
  if (G.client.id) d.client.id = G.client.id;
  const saved = saveDoc(d);
  G.docId = saved.id;
  setSettings({ template: G.template, accent: "" });
  setSettings({ onboarded: true }, "ui");
  go(4);
}

function finish() { if (!settings().onboarded) setSettings({ onboarded: true }, "ui"); }

function onClick(e) {
  const look = e.target.closest("[data-look]");
  if (look) {
    G.template = look.dataset.look;
    root.querySelectorAll("[data-look]").forEach(b => { const on = b === look; b.setAttribute("aria-checked", String(on)); b.classList.toggle("is-on", on); });
    return;
  }
  const b = e.target.closest("[data-act]");
  if (!b) return;
  switch (b.dataset.act) {
    case "leave": readCurrent(); finish(); G = null; location.hash = "#/documents"; break;
    case "skip": readCurrent(); if (G.step === 0 && G.biz.name.trim()) saveBusiness(); go(G.step + 1); break;
    case "back": readCurrent(); go(Math.max(0, G.step - 1)); break;
    case "add-item": {
      G.items.push({ id: uid(), desc: "", qty: 1, rate: "" });
      const list = root.querySelector("#gItems");
      list.insertAdjacentHTML("beforeend", itemRow(G.items[G.items.length - 1], G.items.length - 1));
      list.querySelectorAll(".gi-del").forEach(x => { x.disabled = false; });
      root.querySelector(`#gDesc${G.items.length - 1}`).focus();
      break;
    }
    case "del-item": {
      const i = +b.closest(".guide-item").dataset.i;
      if (G.items.length < 2) return;
      G.items.splice(i, 1);
      render();
      const f = root.querySelector(`#gDesc${Math.max(0, i - 1)}`); if (f) f.focus();
      break;
    }
    case "pdf": { const d = getDoc(G.docId); if (d) withPdfGuide(d, () => printDocument(d)); break; }
    case "print": { const d = getDoc(G.docId); if (d) printDocument(d); break; }
    case "send": { const id = G.docId; finish(); G = null; location.hash = `#/edit/${encodeURIComponent(id)}?send=1`; break; }
  }
}

// Enter in an item's description moves on to its quantity; in the last price it adds a row.
document.addEventListener("keydown", e => {
  if (!root || !G || G.step !== 2 || e.key !== "Enter" || e.isComposing) return;
  const el = e.target;
  if (!el.closest || !el.closest(".guide-item")) return;
  if (el.dataset.k === "desc") { e.preventDefault(); const q = el.closest(".guide-item").querySelector("[data-k=qty]"); if (q) q.focus(); }
  else if (el.dataset.k === "rate" && +el.closest(".guide-item").dataset.i === G.items.length - 1 && el.value.trim()) { e.preventDefault(); root.querySelector("[data-act=add-item]").click(); }
});
