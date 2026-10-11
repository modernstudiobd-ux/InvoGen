// install.js — "Install app". Chrome, Edge and Android offer a real install prompt
// (beforeinstallprompt); iPhone/iPad Safari has no prompt, so we show how to use
// Share → Add to Home Screen instead.

let deferred = null;
const listeners = new Set();
const emit = () => listeners.forEach(fn => fn(installState()));

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferred = e;
  emit();
});
window.addEventListener("appinstalled", () => { deferred = null; emit(); });

export function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    navigator.standalone === true;
}
export function isIOS() {
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

// "installed" | "prompt" (we can show the browser's install dialog) | "ios" (show steps) | "manual"
export function installState() {
  if (isStandalone()) return "installed";
  if (deferred) return "prompt";
  if (isIOS()) return "ios";
  return "manual";
}
export function onInstallChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Resolves to "accepted", "dismissed" or "unavailable".
export async function promptInstall() {
  if (!deferred) return "unavailable";
  const e = deferred;
  deferred = null;
  e.prompt();
  let outcome = "dismissed";
  try { outcome = (await e.userChoice).outcome; } catch {}
  emit();
  return outcome;
}
