import React, { useEffect, useRef, useState } from "react";
import { Modal } from "./ui";

export default function OrderScanner({ onValue, onClose }) {
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const handler = useRef(onValue),
    inFlight = useRef(false),
    mounted = useRef(true);
  handler.current = onValue;
  const lookup = useRef();
  lookup.current = async (text) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      await handler.current(text);
    } catch (failure) {
      if (mounted.current)
        setError(failure.message || "No se pudo buscar el pedido.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  };
  useEffect(() => {
    let cancelled = false,
      scanner,
      lastValue;
    mounted.current = true;
    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        scanner = new Html5Qrcode("order-camera-reader");
        await scanner.start(
          { facingMode: "environment" },
          { fps: 8, qrbox: { width: 220, height: 220 } },
          (text) => {
            if (cancelled || inFlight.current || text === lastValue) return;
            lastValue = text;
            setValue(text);
            void lookup.current(text);
          },
          () => {},
        );
        if (cancelled && scanner.isScanning) await scanner.stop();
      } catch {
        if (!cancelled)
          setCameraError(
            "No pudimos abrir la cámara. Permití el acceso desde HTTPS o localhost, o ingresá el código abajo.",
          );
      }
    })();
    return () => {
      cancelled = true;
      mounted.current = false;
      if (scanner?.isScanning) scanner.stop().catch(() => {});
    };
  }, []);
  return (
    <Modal title="Escanear pedido" onClose={onClose}>
      <p>
        Apuntá al QR que muestra el alumno en Mis pedidos. Se abrirá el detalle;
        la entrega se confirma después.
      </p>
      <div id="order-camera-reader" />
      {cameraError && <p className="hint">{cameraError}</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void lookup.current(value);
        }}
        aria-busy={pending}
      >
        <label>
          Código del pedido o contenido del QR
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="R-1042"
            required
            maxLength={300}
            autoComplete="off"
          />
        </label>
        {error && (
          <div className="form-operation-error" role="alert">
            {error}
          </div>
        )}
        <button className="button primary full" disabled={pending}>
          {pending ? "Buscando pedido…" : "Buscar pedido"}
        </button>
      </form>
    </Modal>
  );
}
