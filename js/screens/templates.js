// screens/templates.js — the template gallery. Every card is a live preview drawn with
// the real template and your own business name, currency and document language.
// Choosing one makes it the look for new documents; open documents change theirs
// in the editor's Design panel.

import { esc } from "../dom.js";
import { t } from "../i18n.js";
import { getState, subscribe, setSettings } from "../state.js";
import { TEMPLATES, templateOf } from "../templates.js";
import { toast } from "../toast.js";
import { sampleDoc, thumbHtml, fitThumbs } from "../tplThumbs.js";

const GROUPS = ["all", "general", "industry"];
let root = null, unsub = null, stopFit = null, ac = null, group = "all";

export function mount(el) {
  root = el;
  ac = new AbortController();
  root.innerHTML = `
  <div class="page templates">
    <header class="page-head"><div>
      <h1 class="h1" id="pageTitle" tabindex="-1">${esc(t("nav.templates"))}</h1>
      <p class="page-sub">${esc(t("tpl.sub"))}</p>
    </div></header>
    <div class="segmented" role="group" aria-label="${esc(t("tpl.groupLabel"))}">${GROUPS.map(g => `<button type="button" class="chip" data-group="${g}" aria-pressed="${group === g}">${esc(t(`tpl.group.${g}`))}</button>`).join("")}</div>
    <ul class="tpl-grid" id="tplGrid" aria-label="${esc(t("nav.templates"))}"></ul>
  </div>`;
  root.addEventListener("click", onClick, { signal: ac.signal });
  render();
  // Redraw when anything that appears on the previews changes (business name, currency…).
  unsub = subscribe((s, reason) => { if (reason === "settings" || reason === "replace" || reason === "ui") render(); });
  return { title: t("nav.templates") };
}
export function unmount() {
  if (unsub) unsub();
  if (stopFit) stopFit();
  if (ac) ac.abort();
  unsub = stopFit = ac = root = null;
}

function render() {
  if (!root) return;
  const cur = getState().settings.template;
  const list = TEMPLATES.filter(tp => group === "all" || tp.group === group);
  if (stopFit) stopFit();
  root.querySelector("#tplGrid").innerHTML = list.map(tp => {
    const on = tp.id === cur;
    return `<li><button type="button" class="tpl-card${on ? " is-on" : ""}" data-tpl="${tp.id}" aria-pressed="${on}">
      ${thumbHtml(sampleDoc(tp.id))}
      <span class="tpl-meta">
        <span class="tpl-name">${esc(t(`tpl.name.${tp.id}`))}</span>
        <span class="tpl-state">${esc(t(on ? "tpl.inUse" : "tpl.use"))}</span>
        <span class="tpl-purpose">${esc(t(`tpl.purpose.${tp.id}`))}</span>
      </span>
    </button></li>`;
  }).join("");
  stopFit = fitThumbs(root);
}

function onClick(e) {
  const g = e.target.closest("[data-group]");
  if (g) {
    group = g.dataset.group;
    root.querySelectorAll("[data-group]").forEach(b => b.setAttribute("aria-pressed", String(b === g)));
    render();
    return;
  }
  const c = e.target.closest("[data-tpl]");
  if (!c) return;
  const id = c.dataset.tpl, s = getState().settings;
  if (id === s.template) return;
  const prev = { template: s.template, accent: s.accent };
  setSettings({ template: id, accent: "" });
  const again = root && root.querySelector(`[data-tpl="${id}"]`);
  if (again) again.focus();
  toast(t("tpl.chosen", { name: t(`tpl.name.${templateOf(id).id}`) }), {
    action: t("common.undo"),
    onAction: () => setSettings(prev)
  });
}
