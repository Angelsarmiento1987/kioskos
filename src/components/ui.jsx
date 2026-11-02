import { saveOrShare } from "../native";
import React, { useEffect, useRef } from "react";
import { X, Store, ShoppingBag } from "lucide-react";
export const fmt = (n) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: n % 100 ? 2 : 0,
  }).format((n || 0) / 100);
export const stamp = (x) => (typeof x === "number" ? x : x?.toMillis?.() || 0);
export function Brand({ compact = false }) {
  return (
    <span className="rekreo-brand">
      <span className="kiosk-symbol">
        <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <path
            d="M9 20v20h30V20M7 19l5-11h24l5 11"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path
            d="M7 19c0 6 8 6 8 0 0 6 9 6 9 0 0 6 9 6 9 0 0 6 8 6 8 0M20 29v11M29 28l-9 7 10 5"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </span>
      {!compact && (
        <span>
          re<span className="letter-k">K</span>reo
          <span className="brand-period">.</span>
        </span>
      )}
    </span>
  );
}
export function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    const before = document.activeElement,
      el = ref.current;
    el.showModal();
    return () => {
      el.close();
      before?.focus?.();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={"modal " + (wide ? "wide" : "")}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Cerrar">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Metric({
  label,
  value,
  detail,
  icon: Icon = ShoppingBag,
  tone = "mint",
}) {
  return (
    <section className="stat-card">
      <div>
        <span>{label}</span>
        <span className={"stat-icon " + tone}>
          <Icon size={19} />
        </span>
      </div>
      <h2>{value}</h2>
      <p>{detail}</p>
    </section>
  );
}
export function Field({ label, name, value, ...props }) {
  return (
    <label>
      {label}
      <input name={name} defaultValue={value ?? ""} {...props} />
    </label>
  );
}
export function Placeholder({ title, children }) {
  return (
    <div className="empty">
      <Store size={32} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function downloadFile(name, content, type) {
  // Existing callers are event handlers; consume rejection and surface it in the app.
  return saveOrShare(name, content, type).catch((error) => {
    if (/cancel/i.test(error.message || "")) return;
    window.dispatchEvent(new CustomEvent("rekreo:file-error", { detail: error.message || "No se pudo compartir el archivo." }));
  });
}
export function exportCSV(name, rows) {
  const quote = (v) =>
    '"' +
    String(v ?? "")
      .replaceAll('"', '""')
      .replace(/^[=+@-]/, "'$&") +
    '"';
  downloadFile(
    name,
    "\uFEFF" + rows.map((r) => r.map(quote).join(";")).join("\r\n"),
    "text/csv;charset=utf-8",
  );
}
