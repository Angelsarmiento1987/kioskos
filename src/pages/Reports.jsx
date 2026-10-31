import React, { useState } from "react";
import {
  Wallet,
  ShoppingBag,
  Users,
  Download,
  ArrowUpRight,
  Banknote,
  Landmark,
  Image,
} from "lucide-react";
import { summary } from "../../shared/business.mjs";
import { localDate } from "../../shared/domain.mjs";
import { Metric, fmt, exportCSV, stamp } from "../components/ui";
export default function Reports({
  data,
  compact = false,
  onStudents,
  onGallery,
}) {
  const [from, setFrom] = useState(localDate()),
    [to, setTo] = useState(localDate()),
    s = summary(data, from, to);
  const students = data.members.filter((m) => m.role === "student");
  return (
    <>
      {!compact && (
        <div className="report-toolbar">
          <div>
            <label>
              Desde
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          <button
            className="button secondary"
            onClick={() =>
              exportCSV(`reKreo-cierre-${from}-${to}.csv`, [
                ["Desde", "Hasta", from, to],
                ["Concepto", "Importe ARS"],
                ["Cargas efectivo", s.cash / 100],
                ["Cargas transferencia", s.transfer / 100],
                ["Devoluciones de dinero", s.cashouts / 100],
                ["Efectivo neto de cargas/devoluciones", s.cashNet / 100],
                ["Transferencias netas", s.transferNet / 100],
                ["Ventas con crédito", s.sales / 100],
                ["Saldo pendiente de consumir", s.balance / 100],
              ])
            }
          >
            <Download size={16} />
            Descargar cierre
          </button>
        </div>
      )}
      <div className="stats-grid">
        <Metric
          label="Ventas con crédito"
          value={fmt(s.sales)}
          detail={`${s.saleCount} operaciones · ${compact ? "hoy" : "período seleccionado"}`}
          icon={ShoppingBag}
        />
        <Metric
          label="Dinero recibido"
          value={fmt(s.topups)}
          detail="Cargas recibidas · no se suma otra vez al vender"
          icon={Wallet}
          tone="orange"
        />
        <Metric
          label="Saldo por consumir"
          value={fmt(s.balance)}
          detail="Saldo actual de todas las cuentas"
          icon={Users}
          tone="purple"
        />
        <Metric
          label="Alumnos con saldo"
          value={`${s.withBalance} / ${s.students}`}
          detail={`${s.withoutBalance} sin saldo · ${s.active} compraron en 30 días`}
          icon={Users}
          tone="blue"
        />
      </div>
      {!compact && (
        <div className="report-grid">
          <section className="panel report-card">
            <span className="eyebrow">INGRESOS DE DINERO</span>
            <h2>Caja y transferencias</h2>
            <div className="report-line">
              <span>
                <Banknote size={17} />
                Cargas en efectivo
              </span>
              <b>{fmt(s.cash)}</b>
            </div>
            <div className="report-line">
              <span>
                <Landmark size={17} />
                Cargas por transferencia
              </span>
              <b>{fmt(s.transfer)}</b>
            </div>
            <div className="report-line">
              <span>Dinero devuelto</span>
              <b>{fmt(s.cashouts)}</b>
            </div>
            <div className="report-line emphasized">
              <span>Efectivo neto</span>
              <b>{fmt(s.cashNet)}</b>
            </div>
            <div className="report-line">
              <span>Transferencias netas</span>
              <b>{fmt(s.transferNet)}</b>
            </div>
            <p className="hint">
              Resumen de movimientos de reKreo. No incluye gastos ni ventas
              externas a la plataforma.
            </p>
          </section>
          <section className="panel report-card">
            <span className="eyebrow">CONSUMO DE CRÉDITO</span>
            <h2>Cómo te compraron</h2>
            <div className="report-line">
              <span>Pedidos anticipados</span>
              <b>{fmt(s.preorders)}</b>
            </div>
            <div className="report-line">
              <span>Compras en mostrador</span>
              <b>{fmt(s.counter)}</b>
            </div>
            <div className="report-line emphasized">
              <span>Total de ventas</span>
              <b>{fmt(s.sales)}</b>
            </div>
            <p className="hint">
              Las ventas consumen crédito ya cobrado. Este importe no vuelve a
              ingresar a caja. No representa ganancia neta.
            </p>
          </section>
          <section className="panel report-card">
            <span className="eyebrow">TU COMUNIDAD</span>
            <h2>Cuentas del kiosko</h2>
            {[
              ["Registradas", s.students],
              ["Con saldo", s.withBalance],
              ["Sin saldo", s.withoutBalance],
              ["Compraron en los últimos 30 días", s.active],
              [
                "Cuentas desactivadas",
                students.filter((m) => m.disabled).length,
              ],
            ].map(([label, n]) => (
              <div className="report-line" key={label}>
                <span>{label}</span>
                <b>{n}</b>
              </div>
            ))}
          </section>
          <section className="panel report-card">
            <span className="eyebrow">TU SUSCRIPCIÓN</span>
            <h2>Plan {data.kiosk?.plan || "Inicial"}</h2>
            <div className="plan-price">
              {fmt(data.kiosk?.monthlyFee || 0)}
              <small> / mes</small>
            </div>
            <div className="report-line">
              <span>Productos activos</span>
              <b>
                {data.products.filter((p) => p.active).length} /{" "}
                {data.kiosk?.limits?.products ?? 100}
              </b>
            </div>
            <div className="report-line">
              <span>Fotos almacenadas</span>
              <b>
                {data.images?.length || 0} / {data.kiosk?.limits?.images ?? 100}
              </b>
            </div>
            <p className="hint">
              Las ampliaciones y bajas de plan se coordinan con el administrador
              de reKreo.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
