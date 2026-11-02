import { App } from "@capacitor/app";
const requestKey = "rekreo-camera-request", resultKey = "rekreo-camera-result";
export function rememberCamera(context) {
  try { localStorage.setItem(requestKey, JSON.stringify({ context })); } catch {}
}
export function finishCamera() {
  try { localStorage.removeItem(requestKey); } catch {}
}
export function readRecoveredPhoto(context) {
  try {
    const result = JSON.parse(localStorage.getItem(resultKey) || "null");
    return result?.context === context ? result.photo : null;
  } catch { return null; }
}
export function clearRecoveredPhoto() {
  try { localStorage.removeItem(resultKey); } catch {}
}
export function listenForRecoveredCamera() {
  return App.addListener("appRestoredResult", (result) => {
    if (result.pluginId !== "Camera" || result.methodName !== "takePhoto") return;
    try {
      const pending = JSON.parse(localStorage.getItem(requestKey) || "null");
      if (result.success && result.data?.webPath && pending?.context) {
        localStorage.setItem(resultKey, JSON.stringify({ context: pending.context, photo: result.data }));
        window.dispatchEvent(new Event("rekreo:photo-recovered"));
      }
    } catch {} finally { finishCamera(); }
  });
}
