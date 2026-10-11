// sample.js — realistic example data so you can try every feature. Everything it
// adds is tagged `sample`, so "Remove sample data" deletes only these records.

import { uid } from "./dom.js";
import { update, normalizeDoc, normalizeClient, normalizeProduct, formatDocNo, settings } from "./state.js";
import { todayISO, addDays } from "./format.js";

export function addSampleData() {
  const t = todayISO(), s = settings();
  const cur = s.currency || "USD";
  const c = [
    { name: "Northfield Studio", contact: "Maya Patel", email: "accounts@northfield.example", address: "14 Harbour Road\nBristol BS1 5TY\nUnited Kingdom" },
    { name: "Alder & Finch", contact: "Tom Alder", email: "ap@alderfinch.example", address: "220 King Street\nToronto ON M5H 1K4\nCanada" },
    { name: "Hollis Ceramics", contact: "Ana Hollis", email: "studio@hollis.example", address: "8 Rua das Flores\n1200-195 Lisboa\nPortugal" },
    { name: "Kestrel Outdoor", contact: "Sam Okafor", email: "orders@kestrel.example", address: "41 Marina Avenue\nLagos 101241\nNigeria" }
  ].map(x => normalizeClient({ ...x, id: uid(), sample: true }));
  const client = i => ({ id: c[i].id, name: c[i].name, email: c[i].email, address: c[i].address, phone: "", taxId: "" });
  const biz = { ...s.business, name: s.business.name || "Your Business" };
  const base = { currency: cur, lang: s.docLang, dateFormat: s.dateFormat, numberFormat: s.numberFormat, business: biz, template: s.template, sample: true, tax: { name: s.taxName || "Tax", rate: 0 } };

  update(st => {
    if (!st.meta.preSampleNumbering) st.meta.preSampleNumbering = structuredClone(st.settings.numbering);
    const take = type => { const n = Math.max(1, Number(st.settings.numbering[type].next) || 1); st.settings.numbering[type].next = n + 1; return formatDocNo(type, n); };
    const docs = [
      { type: "invoice", status: "sent", client: client(0), issued: addDays(t, -44), due: addDays(t, -14), items: [{ desc: "Brand identity system", qty: 1, rate: 3200 }, { desc: "Workshop (half day)", qty: 2, rate: 500 }], payments: [{ id: uid(), date: addDays(t, -20), amount: 1000, method: "Bank transfer" }] },
      { type: "invoice", status: "sent", client: client(1), issued: addDays(t, -9), due: addDays(t, 21), items: [{ desc: "Website design — phase 1", qty: 1, rate: 1850 }] },
      { type: "invoice", status: "paid", client: client(3), issued: addDays(t, -30), due: addDays(t, 0), items: [{ desc: "Product photography", qty: 12, rate: 85 }], payments: [{ id: uid(), date: addDays(t, -6), amount: 1020, method: "Card" }] },
      { type: "invoice", status: "draft", client: client(2), issued: t, due: addDays(t, 30), items: [{ desc: "Packaging design", qty: 3, rate: 640 }] },
      { type: "estimate", status: "sent", client: client(2), issued: addDays(t, -3), due: addDays(t, 11), items: [{ desc: "Retail display concept", qty: 1, rate: 6400 }] },
      { type: "receipt", status: "paid", client: client(3), issued: addDays(t, -8), due: "", items: [{ desc: "Rush delivery", qty: 1, rate: 312.5 }] }
    ].map((d, i) => normalizeDoc({ ...base, ...d, id: uid(), no: take(d.type), createdAt: Date.now() - i * 1000, updatedAt: Date.now() - i * 1000 }));
    st.docs = [...docs, ...st.docs];
    st.clients = [...c, ...st.clients];
    st.products = [
      normalizeProduct({ desc: "Brand identity system", unit: "project", rate: 3200, sample: true }),
      normalizeProduct({ desc: "Workshop (half day)", unit: "session", rate: 500, sample: true }),
      normalizeProduct({ desc: "Product photography", unit: "photo", rate: 85, sample: true }),
      ...st.products
    ];
  }, "sample", { countsForBackup: false });
}

export function removeSampleData() {
  let removed = 0;
  update(st => {
    const before = st.docs.length + st.clients.length + st.products.length;
    st.docs = st.docs.filter(d => !d.sample);
    st.clients = st.clients.filter(x => !x.sample);
    st.products = st.products.filter(x => !x.sample);
    removed = before - (st.docs.length + st.clients.length + st.products.length);
    // Give back the document numbers the samples used, unless real documents took later ones.
    const pre = st.meta.preSampleNumbering;
    if (pre) {
      ["invoice", "estimate", "receipt"].forEach(type => {
        let max = 0;
        st.docs.filter(d => d.type === type).forEach(d => { const m = /(\d+)\s*$/.exec(d.no); if (m) max = Math.max(max, +m[1]); });
        st.settings.numbering[type].next = Math.max(Number(pre[type]?.next) || 1, max + 1);
      });
      delete st.meta.preSampleNumbering;
    }
  }, "sample", { countsForBackup: false });
  return removed;
}

export const hasSampleData = st => st.docs.some(d => d.sample) || st.clients.some(c => c.sample);
