// reminders.js — "Send reminder" for unpaid invoices, shared by the Documents list and
// the Editor. Picks a tone from how late the invoice is and how many reminders were
// already sent (before the due date · friendly · firm · final), fills in a polite email
// and records each reminder on the invoice so the next one can be a step firmer.

import { esc } from "./dom.js";
import { icon } from "./icons.js";
import { t, getLanguage } from "./i18n.js";
import { getState, getDoc, logReminder } from "./state.js";
import { totals } from "./calc.js";
import { formatMoney, formatDate, formatShortDate, daysBetween, todayISO } from "./format.js";
import { normalizeUrl } from "./preview.js";
import { pdfAttachment } from "./pdfExport.js";
import { openSheet } from "./sheet.js";
import { toast } from "./toast.js";

export const TONES = ["upcoming", "friendly", "firm", "final"];
const STEPS = ["friendly", "firm", "final"];

// Days past the due date (negative or 0 = not late yet).
export const daysLate = (doc, today = todayISO()) => (doc.due ? daysBetween(doc.due, today) : 0);

// Before the due date: "upcoming". After it: friendly → firm (14+ days) → final (30+ days),
// and every earlier overdue reminder moves the next one a step up.
export function suggestedTone(doc, today = todayISO()) {
  const late = daysLate(doc, today);
  if (late <= 0) return "upcoming";
  const byDays = late >= 30 ? 2 : late >= 14 ? 1 : 0;
  const sent = (doc.reminders || []).filter(r => r.tone !== "upcoming").length;
  return STEPS[Math.min(2, Math.max(byDays, sent))];
}

// Can this document get a payment reminder? (Invoices with money still owed.)
export function canRemind(doc, status) {
  return doc.type === "invoice" && ["sent", "partial", "overdue"].includes(status) && totals(doc).balance > 0;
}

// The last reminder, e.g. for "Reminder sent 3 Oct" in the Documents list.
export const lastReminder = doc => (doc.reminders || []).reduce((a, r) => (!a || r.at > a.at ? r : a), null);

export function reminderText(doc, tone, today = todayISO()) {
  const tt = totals(doc, today);
  const nf = { fmt: doc.numberFormat, lang: doc.lang };
  const amount = formatMoney(tt.balance, doc.currency, nf);
  const due = doc.due ? formatDate(doc.due, doc.dateFormat, doc.lang) : "";
  const late = Math.max(0, daysLate(doc, today));
  const p = {
    name: doc.client.contact || doc.client.name || "", doc: `${t(`type.${doc.type}`)} ${doc.no}`.trim(),
    amount, due, days: t("remind.days", { n: late }), biz: doc.business.name || ""
  };
  // Paragraphs: greeting · the ask · (late fee, pay link) · the rest.
  const paras = t(`remind.body.${tone}`, p).split(/\n{2,}/);
  const extra = [];
  if (tt.lateFee > 0 && tone !== "upcoming") extra.push(t("remind.lateFeeNote", { fee: formatMoney(tt.lateFee, doc.currency, nf) }));
  const link = normalizeUrl(doc.payLink);
  if (link) extra.push(t("remind.payLink", { link }));
  paras.splice(Math.min(2, paras.length), 0, ...extra);
  return { subject: t(`remind.subject.${tone}`, p), body: paras.join("\n\n").replace(/[ \t]+\n/g, "\n").trim() };
}

export function openReminderSheet(id, { onDone } = {}) {
  const doc = getDoc(id);
  if (!doc) return;
  const s = getState().settings;
  let tone = suggestedTone(doc);
  const late = daysLate(doc);
  const last = lastReminder(doc);
  const lastDate = last ? formatShortDate(new Date(last.at).toISOString().slice(0, 10), s.dateFormat, getLanguage(), s.numberFormat) : "";
  const history = last ? t("remind.history", { n: doc.reminders.length, date: lastDate }) : t("remind.none");
  const canShare = !!navigator.share;
  const att = pdfAttachment(doc);
  const first = reminderText(doc, tone);
  const status = late > 0 ? t("remind.lateBy", { days: t("remind.days", { n: late }) }) : doc.due ? t("remind.dueIn", { days: t("remind.days", { n: Math.abs(late) }) }) : "";
  openSheet({
    title: t("remind.title"),
    wide: true,
    body: `<div class="sheet-summary"><strong>${esc(`${t(`type.${doc.type}`)} ${doc.no}`)} · ${esc(doc.client.name || t("docs.noClient"))}</strong>
        <span><span class="num">${esc(t("pay.owed"))}: <bdi class="ltr">${esc(formatMoney(totals(doc).balance, doc.currency, { fmt: s.numberFormat, lang: getLanguage() }))}</bdi></span>${status ? ` · ${esc(status)}` : ""}</span>
        <span class="hint">${esc(history)}</span></div>
      <div class="field"><span class="label" id="remToneL">${esc(t("remind.tone"))}</span>
        <div class="segmented seg-full seg-wrap" role="radiogroup" aria-labelledby="remToneL">${TONES.map(k => `<button type="button" class="chip" role="radio" aria-checked="${k === tone}" data-tone="${k}">${esc(t(`remind.tone.${k}`))}</button>`).join("")}</div></div>
      <div class="field"><label for="remTo">${esc(t("send.to"))}</label><input class="input" type="email" id="remTo" value="${esc(doc.client.email)}" autocomplete="email" dir="ltr"></div>
      <div class="field"><label for="remSubj">${esc(t("send.subject"))}</label><input class="input" id="remSubj" value="${esc(first.subject)}" dir="auto"></div>
      <div class="field"><label for="remMsg">${esc(t("send.message"))}</label><textarea class="input textarea" id="remMsg" rows="9" dir="auto">${esc(first.body)}</textarea></div>
      ${att.html}
      <div class="send-grid">
        <button type="button" class="btn btn-outline" data-rem="pdf">${icon("download", 18)}${esc(t("send.pdfFirst"))}</button>
        <button type="button" class="btn btn-outline" data-rem="copy">${icon("copy", 18)}${esc(t("remind.copy"))}</button>
        ${canShare ? `<button type="button" class="btn btn-outline" data-rem="share">${icon("share-2", 18)}${esc(t("send.share"))}</button>` : ""}
        <button type="button" class="btn btn-primary" data-rem="email">${icon("mail", 18)}${esc(t("send.email"))}</button>
      </div>`,
    onOpen: dlg => {
      const subj = dlg.querySelector("#remSubj"), msg = dlg.querySelector("#remMsg");
      const pdf = att.attach(dlg);
      const done = (how, note) => {
        logReminder(id, tone);
        toast(note || t("remind.logged", { doc: `${t(`type.${doc.type}`)} ${doc.no}` }));
        if (onDone) onDone(how);
      };
      dlg.addEventListener("keydown", e => {
        const b = e.target.closest("[data-tone]");
        if (!b || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
        const g = [...b.parentElement.children];
        const dir = (e.key === "ArrowRight") !== (document.dir === "rtl") ? 1 : -1;
        const nx = g[(g.indexOf(b) + dir + g.length) % g.length];
        nx.focus(); nx.click(); e.preventDefault();
      });
      dlg.addEventListener("click", async e => {
        const tb = e.target.closest("[data-tone]");
        if (tb) {
          tone = tb.dataset.tone;
          dlg.querySelectorAll("[data-tone]").forEach(x => x.setAttribute("aria-checked", String(x === tb)));
          // Changing the tone writes the matching subject and message.
          const r = reminderText(doc, tone);
          subj.value = r.subject; msg.value = r.body;
          return;
        }
        const b = e.target.closest("[data-rem]");
        if (!b) return;
        const to = dlg.querySelector("#remTo").value.trim();
        if (b.dataset.rem === "pdf") { pdf.download(); return; }
        if (b.dataset.rem === "copy") {
          try { await navigator.clipboard.writeText(`${subj.value}\n\n${msg.value}`); dlg.close(); done("copy", t("remind.copied")); }
          catch { msg.focus(); msg.select(); }
          return;
        }
        if (b.dataset.rem === "share") {
          if (await pdf.share({ title: subj.value, text: msg.value })) { dlg.close(); done("share"); }
          return;
        }
        const href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subj.value)}&body=${encodeURIComponent(msg.value)}`;
        dlg.close();
        pdf.email(href);
        done("email");
      });
    }
  });
}
