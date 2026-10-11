// screens/settings.js — built in full in stage 5. For now it already offers the
// app language (so RTL and translations can be reviewed) and shows the version.

import { esc } from "../dom.js";
import { t, LANGS, getLanguage } from "../i18n.js";
import { changeLanguage } from "../layout.js";
import { settings, setSettings } from "../state.js";
import { APP_VERSION } from "../version.js";

let root = null;
export function mount(el) {
  root = el;
  const cur = getLanguage();
  root.innerHTML = `<div class="page">
    <header class="page-head"><div><h1 class="h1" id="pageTitle" tabindex="-1">${esc(t("nav.settings"))}</h1></div></header>
    <section class="card card-pad" aria-labelledby="setLangH">
      <div class="field">
        <h2 class="eyebrow" id="setLangH"><label for="setLang">${esc(t("lang.title"))}</label></h2>
        <select class="select" id="setLang">${LANGS.map(([c, n, en]) => `<option value="${c}" lang="${c}"${c === cur ? " selected" : ""}>${esc(n)}${c !== "en" ? ` — ${esc(en)}` : ""}</option>`).join("")}</select>
      </div>
    </section>
    <section class="card card-pad" aria-labelledby="setEdH">
      <h2 class="eyebrow" id="setEdH">${esc(t("set.editor"))}</h2>
      <label class="switch-row" for="setEditMode"><span class="switch-text"><span>${esc(t("set.editMode"))}</span><span class="hint">${esc(t("set.editModeHint"))}</span></span>
        <input type="checkbox" class="switch" role="switch" id="setEditMode"${settings().editMode ? " checked" : ""}></label>
    </section>
    <section class="card placeholder"><p>${esc(t("common.comingStage", { n: 5 }))}</p><p class="muted">InvoGen ${esc(APP_VERSION)}</p></section>
  </div>`;
  root.querySelector("#setLang").addEventListener("change", e => changeLanguage(e.target.value));
  root.querySelector("#setEditMode").addEventListener("change", e => setSettings({ editMode: e.target.checked }, "ui"));
  return { title: t("nav.settings") };
}
export function unmount() { root = null; }
