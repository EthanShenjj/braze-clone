// Called from client effects only; the design JSON helpers remain browser-independent.
export const unlayerEmbedUrl = "https://editor.unlayer.com/embed.js";
let pending: Promise<void> | undefined;
export const unlayerScriptLoaded = () => typeof window !== "undefined" && Boolean((window as Window & { unlayer?: unknown }).unlayer);
export function loadUnlayerScript(): Promise<void> {
  if (unlayerScriptLoaded()) return Promise.resolve();
  if (pending) return pending;
  pending = new Promise<void>((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src^="${unlayerEmbedUrl}"]`);
    const fresh = !script;
    if (!script) { script = document.createElement("script"); script.src = unlayerEmbedUrl; script.async = true; }
    const target = script;
    const cleanup = () => { target.removeEventListener("load", ready); target.removeEventListener("error", failed); };
    const ready = () => { cleanup(); if (unlayerScriptLoaded()) resolve(); else { target.remove(); reject(new Error("Unlayer SDK did not initialize.")); } };
    const failed = () => { cleanup(); target.remove(); reject(new Error("Unable to load Unlayer. Check your connection and try again.")); };
    target.addEventListener("load", ready); target.addEventListener("error", failed);
    if (fresh) document.head.appendChild(target);
  }).catch(error => { pending = undefined; throw error; });
  return pending;
}

export function resetUnlayerScript() {
  if (unlayerScriptLoaded()) return;
  pending = undefined;
  document.querySelectorAll<HTMLScriptElement>(`script[src^="${unlayerEmbedUrl}"]`).forEach(script => script.remove());
}
