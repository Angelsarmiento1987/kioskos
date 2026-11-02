import { useEffect, useRef } from "react";
import { App as NativeApp } from "@capacitor/app";
import { isAndroid } from "./native.js";

export function useAndroidBack(onBack) {
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => {
    if (!isAndroid) return;
    let disposed = false, listener;
    NativeApp.addListener("backButton", async () => {
      if (!latest.current()) await NativeApp.minimizeApp();
    }).then((handle) => {
      if (disposed) handle.remove(); else listener = handle;
    });
    return () => { disposed = true; listener?.remove(); };
  }, []);
}
