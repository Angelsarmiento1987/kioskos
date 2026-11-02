import React, { useRef, useState } from "react";
import { scanNativeQr } from "../native";
export default function NativeQrButton({ onValue }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef(false);
  return <div>
    <button type="button" className="button secondary full" disabled={busy} onClick={async () => {
      if (pending.current) return;
      pending.current = true; setBusy(true); setError("");
      try { await onValue(await scanNativeQr()); }
      catch (failure) { if (failure.code !== "CANCELLED") setError(failure.message || "No se pudo abrir el lector. Usá el código manual."); }
      finally { pending.current = false; setBusy(false); }
    }}>{busy ? "Abriendo lector…" : "Escanear QR con la cámara"}</button>
    {error && <p role="alert" className="hint">{error}</p>}
  </div>;
}
