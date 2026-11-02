import { rememberCamera, finishCamera, readRecoveredPhoto, clearRecoveredPhoto } from "../photo-recovery.js";
import React, { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { isAndroid } from "../native";
import { takeNativePhoto, photoCancelled, fileFromPhoto } from "../photo-capture.js";
import { Modal } from "./ui";

export default function PhotoInput({ disabled = false, onFile, onBusyChange, context }) {
  const [working, setWorking] = useState(false), [camera, setCamera] = useState(false), [error, setError] = useState("");
  const [recovered, setRecovered] = useState(() => readRecoveredPhoto(context));
  useEffect(() => {
    const refresh = () => setRecovered(readRecoveredPhoto(context));
    refresh(); window.addEventListener("rekreo:photo-recovered", refresh);
    return () => window.removeEventListener("rekreo:photo-recovered", refresh);
  }, [context]);
  const lock = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function process(getFile) {
    if (disabled || lock.current) return;
    lock.current = true; setWorking(true); setError(""); onBusyChange?.(true);
    try {
      const file = await getFile();
      if (file) await onFile(file);
    } catch (failure) {
      if (!photoCancelled(failure) && mounted.current)
        setError(failure.message || "No se pudo cargar la foto. Probá nuevamente.");
    } finally {
      lock.current = false;
      if (mounted.current) { setWorking(false); onBusyChange?.(false); }
    }
  }
  return <div className="photo-input">
    <div className="photo-input-actions">
      <button type="button" className="button secondary" disabled={disabled || working} onClick={() => {
        if (isAndroid) void process(async () => {
          rememberCamera(context);
          try { return await takeNativePhoto(); } finally { finishCamera(); }
        }); else { setError(""); setCamera(true); }
      }}><Camera size={17} /> Sacar foto</button>
      <label className={`button secondary upload-label ${disabled || working ? "is-disabled" : ""}`}>
        <ImagePlus size={17} /> Elegir archivo
        <input type="file" hidden accept="image/jpeg,image/png,image/webp" disabled={disabled || working}
          onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void process(() => file); }} />
      </label>
    </div>
    {recovered && <div className="hint">La cámara recuperó una foto después de reiniciar la app.
      <button type="button" className="text-button" disabled={disabled || working} onClick={() => void process(async () => {
        const file = await fileFromPhoto(recovered);
        clearRecoveredPhoto(); setRecovered(null); return file;
      })}>Usar foto recuperada</button>
      <button type="button" className="text-button" onClick={() => { clearRecoveredPhoto(); setRecovered(null); }}>Descartar</button>
    </div>}
    {working && <p role="status" className="hint">Procesando foto…</p>}
    {error && <p role="alert" className="form-operation-error">{error}</p>}
    {camera && <WebPhotoCamera onClose={() => setCamera(false)} onFile={(file) => { setCamera(false); void process(() => file); }} />}
  </div>;
}
function WebPhotoCamera({ onClose, onFile }) {
  const video = useRef(), [ready, setReady] = useState(false), [error, setError] = useState("");
  const [taking, setTaking] = useState(false);
  useEffect(() => {
    let stream, disposed = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Cámara no disponible. Usá HTTPS o elegí un archivo.");
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1600 } } });
        if (disposed) { stream.getTracks().forEach((track) => track.stop()); return; }
        video.current.srcObject = stream;
        await video.current.play();
        if (!disposed) setReady(true);
      } catch (failure) {
        if (!disposed) setError(failure.name === "NotAllowedError" ? "Permití el acceso a la cámara del navegador o usá Elegir archivo." : "No se pudo abrir la cámara. Revisá los permisos o usá Elegir archivo.");
      }
    })();
    return () => { disposed = true; stream?.getTracks().forEach((track) => track.stop()); };
  }, []);
  return <Modal title="Foto del producto" onClose={onClose}>
    <video className="photo-camera-video" ref={video} autoPlay playsInline muted />
    {error && <p role="alert" className="form-operation-error">{error}</p>}
    <div className="modal-actions">
      <button type="button" className="button secondary" onClick={onClose}>Cancelar</button>
      <button type="button" className="button primary" disabled={!ready || taking} onClick={async () => {
        setTaking(true);
        try {
          const el = video.current, ratio = Math.min(1, 1600 / Math.max(el.videoWidth, el.videoHeight));
          if (!el.videoWidth || !el.videoHeight) throw Error("Esperá a que aparezca la imagen de la cámara.");
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(el.videoWidth * ratio); canvas.height = Math.round(el.videoHeight * ratio);
          canvas.getContext("2d").drawImage(el, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
          if (!blob) throw Error("No se pudo capturar la foto.");
          onFile(new File([blob], `producto-${Date.now()}.jpg`, { type: "image/jpeg" }));
        } catch (failure) { setError(failure.message); setTaking(false); }
      }}>Usar esta foto</button>
    </div>
  </Modal>;
}
