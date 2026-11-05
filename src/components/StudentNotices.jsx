import React, { useState } from "react";
import { Bell, Check, ArrowRight } from "lucide-react";
import { Modal } from "./ui";
export default function StudentNotices({ notices, onNavigate, open, onOpen, onClose }) {
  const [visible, setVisible] = useState(30);
  return <>
    <button type="button" className="utility-button" onClick={() => { onOpen(); setVisible(30); }} aria-label={`Mis avisos, ${notices.unread.length} sin leer`}><Bell size={17}/><span>Avisos</span>{notices.unread.length > 0 && <b className="notice-count">{notices.unread.length}</b>}</button>
    {open && <Modal title="Tus avisos" onClose={() => onClose()}>
      <p className="alert-help">Cancelaciones, reintegros y pedidos listos. Los avisos quedan disponibles al volver a entrar; no hace falta dejar la app abierta.</p>
      {notices.error && <p role="alert" className="form-operation-error">{notices.error}</p>}
      {!notices.loaded && <p role="status">Cargando avisos…</p>}
      {notices.unread.length > 0 && <button type="button" className="button secondary" disabled={notices.saving || !notices.loaded} onClick={() => notices.markRead(notices.unread.map(n => n.id))}>{notices.saving ? "Guardando…" : "Marcar todos como leídos"}</button>}
      <div className="student-notices-list">
        {notices.items.slice(0, visible).map(n => <article key={n.id} className={`student-notice ${n.read ? "is-read" : "is-unread"}`}>
          <div className="student-notice-heading"><b>{n.title}</b><small>{n.read ? "Leído" : "Sin leer"}</small></div>
          <p>{n.message}</p>{n.at > 0 && <time dateTime={new Date(n.at).toISOString()}>{new Date(n.at).toLocaleString("es-AR")}</time>}
          <div className="student-notice-actions"><button type="button" className="text-button" onClick={() => { onClose(); onNavigate(n.target); }}>Ver {n.target === "orders" ? "pedidos" : "movimientos"} <ArrowRight size={14}/></button>
            {!n.read && <button type="button" className="text-button" disabled={notices.saving || !notices.loaded} onClick={() => notices.markRead([n.id])}><Check size={14}/>Marcar leído</button>}
          </div>
        </article>)}
        {notices.loaded && !notices.items.length && <p>No tenés novedades por ahora.</p>}
        {notices.items.length > visible && <button type="button" className="button secondary" onClick={() => setVisible(v => v + 30)}>Ver más avisos</button>}
      </div>
    </Modal>}
  </>;
}
export function StudentNoticeBanner({ notices, onOpen }) {
  if (!notices.loaded || !notices.unread.length) return notices.error ? <p role="alert" className="form-operation-error">{notices.error}</p> : null;
  const latest = notices.unread[0];
  return <section className="new-order-notice" role="status"><Bell size={24}/><div><b>{latest.title}</b><p>{latest.message}</p><small>Tenés {notices.unread.length} {notices.unread.length === 1 ? "aviso sin leer" : "avisos sin leer"}. Abrí Avisos para revisarlos y marcarlos como leídos.</small></div><button type="button" className="button primary" onClick={onOpen}>Ver avisos <ArrowRight size={16}/></button></section>;
}
