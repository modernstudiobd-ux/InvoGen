// images.js — reads a picked image (logo, signature) into a small data URL so it can be
// stored on the device and printed. Large photos are scaled down; SVG is rasterised so
// no script inside an SVG can ever run.

export function readImage(file, { maxW = 800, maxH = 400, type = "image/png", quality = 0.92 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error("not-image")); return; }
    if (file.size > 15e6) { reject(new Error("too-large")); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
      const w = Math.max(1, Math.round(img.naturalWidth * r)), h = Math.max(1, Math.round(img.naturalHeight * r));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      // PNG keeps transparency; fall back to JPEG if the PNG would be very large.
      let out = c.toDataURL(type, quality);
      if (out.length > 1.5e6) out = c.toDataURL("image/jpeg", 0.85);
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
    img.src = url;
  });
}

// Simple signature pad: draw with mouse, finger or pen. Returns { clear, toDataURL, isEmpty, destroy }.
export function signaturePad(canvas, onChange) {
  const ctx = canvas.getContext("2d");
  let drawing = false, empty = true, last = null;
  const fit = () => {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const prev = empty ? null : canvas.toDataURL();
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0c0a09";
    if (prev) { const i = new Image(); i.onload = () => ctx.drawImage(i, 0, 0, r.width, r.height); i.src = prev; }
  };
  const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = e => { drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId); e.preventDefault(); };
  const move = e => {
    if (!drawing) return;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
    last = p; empty = false;
  };
  const up = () => { if (drawing) { drawing = false; if (onChange) onChange(); } };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  fit();
  return {
    clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); empty = true; },
    isEmpty: () => empty,
    // Trimmed PNG of just the ink
    toDataURL() {
      if (empty) return "";
      const { width: w, height: h } = canvas, data = ctx.getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = 0, y1 = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 <= x0 || y1 <= y0) return "";
      const pad = 6, c = document.createElement("canvas");
      c.width = x1 - x0 + pad * 2; c.height = y1 - y0 + pad * 2;
      c.getContext("2d").drawImage(canvas, x0 - pad, y0 - pad, c.width, c.height, 0, 0, c.width, c.height);
      return c.toDataURL("image/png");
    },
    destroy() {
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up);
    }
  };
}
