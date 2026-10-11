// screens/placeholder.js — temporary page for screens that are built in a later stage.

import { esc } from "../dom.js";
import { t } from "../i18n.js";

export function placeholder(root, titleKey, stage) {
  root.innerHTML = `<div class="page">
    <header class="page-head"><div><h1 class="h1" id="pageTitle" tabindex="-1">${esc(t(titleKey))}</h1></div></header>
    <section class="card placeholder"><p>${esc(t("common.comingStage", { n: stage }))}</p>
      <a class="btn btn-outline" href="#/documents">${esc(t("common.backToDocs"))}</a></section>
  </div>`;
  return { title: t(titleKey) };
}
