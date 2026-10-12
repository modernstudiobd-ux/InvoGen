// payments.js — "Record a payment" sheet, shared by the Documents list and the Editor.
// Supports partial payments; the status (Partially paid / Paid) follows automatically.

import { esc } from "./dom.js";
import { t, getLanguage } from "./i18n.js";
import { getState, getDoc, recordPayment, setDocFields } from "./state.js";
import { totals } from "./calc.js";
import { formatMoney, formatNumber, parseNumber, todayISO, decimalsOf } from "./format.js";
import { toast } from "./toast.js";
import { openSheet } from "./sheet.js";

// International methods; anything local (bKash, UPI, M-Pesa…) is typed in as a custom method.
export const METHODS = ["bank", "card", "cash", "cheque", "online"];

export function openPaymentSheet(id, { onDone } = {}) {
  const d = getDoc(id);
  if (!d) return;
  const s = getState().settings;
  const money = n => formatMoney(n, d.currency, { fmt: s.numberFormat, lang: getLanguage() });
  const dec = decimalsOf(d.currency);
  const owed = totals(d).balance;
  const label = `${t(`type.${d.type}`)} ${d.no}`;
  openSheet({
    title: t("pay.title"),
    body: `<form id="payForm" class="pay-form" novalidate>
      <div class="sheet-summary"><strong>${esc(label)} · ${esc(d.client.name || t("docs.noClient"))}</strong>
        <span>${esc(t("pay.owed"))}: <bdi class="ltr num">${esc(money(owed))}</bdi></span></div>
      <div class="field">
        <label for="payAmount">${esc(t("pay.amount"))} (${esc(d.currency)})</label>
        <input class="input num" id="payAmount" name="amount" inputmode="decimal" autocomplete="off" required
          value="${esc(formatNumber(owed, dec, s.numberFormat === "native" ? "auto" : s.numberFormat, getLanguage()))}" aria-describedby="payAmountErr">
        <p class="err" id="payAmountErr" hidden></p>
      </div>
      <div class="row2">
        <div class="field"><label for="payDate">${esc(t("pay.date"))}</label><input class="input" type="date" id="payDate" name="date" value="${todayISO()}" required></div>
        <div class="field"><label for="payMethod">${esc(t("pay.method"))}</label>
          <select class="select" id="payMethod" name="method">${METHODS.map(m => `<option value="${m}">${esc(t(`pay.m.${m}`))}</option>`).join("")}<option value="__custom">${esc(t("pay.customOpt"))}</option></select></div>
      </div>
      <div class="field" id="payCustomF" hidden>
        <label for="payCustom">${esc(t("pay.customMethod"))}</label>
        <input class="input" id="payCustom" name="custom" maxlength="40" autocomplete="off" dir="auto" placeholder="${esc(t("pay.customMethodPh"))}" aria-describedby="payCustomErr">
        <p class="err" id="payCustomErr" hidden></p>
      </div>
      <div class="field"><label for="payNote">${esc(t("pay.note"))}</label><input class="input" id="payNote" name="note" maxlength="200" autocomplete="off"></div>
    </form>`,
    foot: `<button type="button" class="btn btn-outline" data-close="">${esc(t("common.cancel"))}</button>
           <button type="submit" form="payForm" class="btn btn-primary">${esc(t("pay.save"))}</button>`,
    onOpen: dlg => {
      const amt = dlg.querySelector("#payAmount");
      amt.focus(); amt.select();
      const sel = dlg.querySelector("#payMethod"), cf = dlg.querySelector("#payCustomF"), cin = dlg.querySelector("#payCustom");
      sel.addEventListener("change", () => { cf.hidden = sel.value !== "__custom"; if (!cf.hidden) cin.focus(); });
      dlg.querySelector("#payForm").addEventListener("submit", e => {
        e.preventDefault();
        const err = dlg.querySelector("#payAmountErr");
        const value = Math.round(parseNumber(amt.value) * 10 ** dec) / 10 ** dec;
        let msg = "";
        if (!(value > 0)) msg = t("pay.errPositive");
        else if (value > owed + 1e-9) msg = t("pay.errTooMuch", { amount: money(owed) });
        if (msg) { err.textContent = msg; err.hidden = false; amt.setAttribute("aria-invalid", "true"); amt.focus(); return; }
        err.hidden = true; amt.removeAttribute("aria-invalid");
        const custom = sel.value === "__custom", cname = cin.value.trim();
        const cerr = dlg.querySelector("#payCustomErr");
        if (custom && !cname) { cerr.textContent = t("pay.errCustom"); cerr.hidden = false; cin.setAttribute("aria-invalid", "true"); cin.focus(); return; }
        const prevStatus = d.status;
        const method = custom ? cname.slice(0, 40) : t(`pay.m.${sel.value}`);
        const p = recordPayment(id, { amount: value, date: dlg.querySelector("#payDate").value || todayISO(), method, note: dlg.querySelector("#payNote").value.trim() });
        dlg.close();
        if (onDone) onDone();
        if (p) toast(t("pay.recorded", { amount: money(value) }), {
          action: t("common.undo"),
          onAction: () => { const x = getDoc(id); if (x) setDocFields(id, { payments: x.payments.filter(q => q.id !== p.id), status: prevStatus }); if (onDone) onDone(); }
        });
      });
    }
  });
}
