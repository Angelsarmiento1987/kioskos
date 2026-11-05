import React, { useState } from "react";
import { Bell, BellOff, Volume2, VolumeX, X, ArrowRight } from "lucide-react";
import { Modal } from "./ui";
export function OrderAlertControl({ alerts }) {
  const [open, setOpen] = useState(false);
  const active = alerts.settings.enabled && alerts.ready;
  return <>
    <button type="button" className={`utility-button alarm-control ${active ? "is-on" : ""}`}
      onClick={() => setOpen(true)} title={active ? "Avisos de pedidos: sonido activo" : "Configurar avisos de pedidos"}
      aria-label={active ? "Avisos de pedidos: sonido activo" : "Configurar avisos de pedidos"}>
      {active ? <Bell size={17} /> : <BellOff size={17} />}<span>{active ? "Sonido activo" : "Activar sonido"}</span>
    </button>
    {open && <Modal title="Avisos de pedidos" onClose={() => setOpen(false)}>
      <p className="alert-help">Un aviso visual y una campanita al recibir pedidos nuevos. El sonido se repite hasta tres veces y podés detenerlo al atender el aviso.</p>
      <div className="sound-status">{active ? <Volume2 /> : <VolumeX />}<div><b>{active ? "Sonido habilitado" : "Sonido pendiente de activar"}</b><p>Conservá la app abierta y el volumen del dispositivo encendido.</p></div></div>
      <label className="volume-label">Volumen del aviso <strong>{Math.round(alerts.settings.volume * 100)}%</strong>
        <input type="range" min="0.1" max="1" step="0.05" value={alerts.settings.volume} onChange={(e) => alerts.volume(Number(e.target.value))} />
      </label>
      {alerts.error && <p role="alert" className="form-operation-error">{alerts.error}</p>}
      <div className="modal-actions">
        {alerts.settings.enabled && <button type="button" className="button secondary" onClick={alerts.mute}>Desactivar sonido</button>}
        <button type="button" className="button primary" onClick={alerts.test}><Volume2 size={17} />{active ? "Probar sonido" : "Activar y probar"}</button>
      </div>
      <p className="hint">Esta versión avisa mientras el panel está funcionando. Si cerrás la app o el teléfono la suspende, los pedidos quedan guardados, pero este aviso no reemplaza una notificación push.</p>
    </Modal>}
  </>;
}
export function NewOrdersNotice({ alerts, onOpen }) {
  if (!alerts.pending.length) return null;
  const latest = alerts.pending[0], count = alerts.pending.length;
  return <section className="new-order-notice" role="status" aria-live="polite">
    <span className="new-order-bell"><Bell size={24} /></span>
    <div><b>{count === 1 ? "¡Llegó un pedido nuevo!" : `¡Llegaron ${count} pedidos nuevos!`}</b>
      <p>{count === 1 ? `${latest.studentName || "Alumno"} · ${latest.code || "Pedido confirmado"}` : "Revisá los pedidos y organizá la próxima entrega."}</p>
      {(!alerts.settings.enabled || !alerts.ready) && <small>{alerts.settings.enabled ? "Tocá Activar sonido para habilitar la campanita." : "El aviso sonoro está desactivado."}</small>}
    </div>
    <button type="button" className="button primary" onClick={() => { alerts.acknowledge(); onOpen(); }}>Ver pedidos <ArrowRight size={16} /></button>
    <button type="button" className="icon-button" onClick={alerts.acknowledge} aria-label="Atender aviso y detener sonido"><X size={19} /></button>
  </section>;
}
