import { newId } from "../id.js";
import React, { useEffect, useState, useRef } from "react";
import {
  Store,
  Users,
  Wallet,
  Image,
  Plus,
  ArrowRight,
  Search,
  Settings,
  QrCode,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { localDate } from "../../shared/domain.mjs";
import {
  Metric,
  Modal,
  Field,
  fmt,
  Brand,
  downloadFile,
} from "../components/ui";
import { QRCodeSVG } from "qrcode.react";
const clientFields = [
  ["Referencia interna del cliente", "internalName"],
  ["Nombre del responsable", "ownerName"],
  ["Apellido", "ownerSurname"],
  ["Email del responsable", "ownerEmail", "email"],
  ["DNI", "dni"],
  ["Teléfono", "phone", "tel"],
  ["Dirección del kiosko", "address"],
  ["CUIT / identificación fiscal", "taxId"],
  ["Condición fiscal", "taxStatus"],
  ["Alias de cobro", "paymentAlias"],
  ["CBU / CVU", "bankAccount"],
];
export function KioskForm({ kiosk, client = {}, onClose, onSave, busy }) {
  const requestId = useRef(newId());
  const edit = !!kiosk;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title={edit ? "Cliente y plan" : "Dar de alta un kiosko"}
      wide
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <form
        aria-busy={saving}
        onInvalidCapture={() =>
          setError(
            "Revisá los campos obligatorios y el formato del email antes de guardar.",
          )
        }
        onSubmit={async (e) => {
          e.preventDefault();
          if (saving) return;
          setError("");
          setSaving(true);
          try {
            const f = Object.fromEntries(new FormData(e.currentTarget));
            if (edit)
              await onSave({
                limits: {
                  products: Number(f.productLimit),
                  images: Number(f.imageLimit),
                },
                plan: f.plan,
                monthlyFee: Math.round(Number(f.monthlyFee) * 100),
                client: Object.fromEntries(
                  clientFields
                    .map(([, key]) => [key, f[key]])
                    .concat([["notes", f.notes]]),
                ),
              });
            else
              await onSave({
                ...f,
                requestId: requestId.current,
                monthlyFee: Math.round(Number(f.monthlyFee) * 100),
              });
          } catch (failure) {
            setError(
              failure.message || "No se pudo guardar. Intentá nuevamente.",
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="form-section-title">Identidad del kiosko</div>
        <div className="form-row">
          <Field
            label="Nombre público"
            name="name"
            value={kiosk?.name}
            required
            maxLength={100}
            disabled={edit}
          />
          <Field
            label="Escuela"
            name="school"
            value={kiosk?.school}
            required
            disabled={edit}
          />
        </div>
        {!edit && (
          <p className="hint">
            El código público se genera automáticamente. El dueño podrá editar
            su nombre público sin modificar tu referencia interna.
          </p>
        )}
        <div className="form-section-title">
          Ficha privada del cliente · solo superadministrador
        </div>
        <div className="form-row">
          {clientFields.map(([label, name, type]) => (
            <Field
              key={name}
              label={label}
              name={name}
              type={type || "text"}
              value={client[name]}
              required={[
                "internalName",
                "ownerName",
                "ownerSurname",
                "ownerEmail",
              ].includes(name)}
              maxLength={200}
            />
          ))}
        </div>
        <label>
          Notas internas
          <textarea
            name="notes"
            defaultValue={client.notes || ""}
            maxLength={1000}
          />
        </label>
        <div className="form-section-title">Plan y límites independientes</div>
        <div className="form-row">
          <Field
            label="Nombre del plan"
            name="plan"
            value={kiosk?.plan || "Inicial"}
            required
          />
          <Field
            label="Mensualidad en pesos"
            name="monthlyFee"
            value={(kiosk?.monthlyFee ?? 5000000) / 100}
            type="number"
            min="0"
            step="0.01"
            required
          />
        </div>
        <div className="form-row">
          <Field
            label="Productos activos permitidos"
            name="productLimit"
            value={kiosk?.limits?.products ?? 100}
            type="number"
            min="1"
            max="1000"
            required
          />
          <Field
            label="Fotos almacenadas permitidas"
            name="imageLimit"
            value={kiosk?.limits?.images ?? 100}
            type="number"
            min="0"
            max="1000"
            required
          />
        </div>
        <p className="hint">
          Para bajar un límite, primero debe eliminar las fotos o desactivar los
          productos excedentes. El sistema verifica el consumo antes de guardar.
        </p>
        {error && (
          <div className="form-operation-error" role="alert">
            {error}
          </div>
        )}
        {saving && (
          <p className="hint" role="status">
            Guardando en Firestore. Esperá la confirmación antes de cerrar.
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={saving}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="button primary" disabled={saving || busy}>
            {saving
              ? "Guardando…"
              : edit
                ? "Guardar cliente y plan"
                : "Crear kiosko y autorizar email"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function SchoolPoster({ kiosk, onClose }) {
  const url = new URL(process.env.REACT_APP_PUBLIC_APP_URL || location.origin);
  url.searchParams.set("escuela", kiosk.code);
  const print = () => {
    const node = document.querySelector(".school-poster");
    if (!node) return;
    downloadFile(
      `reKreo-cartel-${kiosk.code}.html`,
      `<!doctype html><html lang="es"><meta charset="utf-8"><title>reKreo · ${kiosk.code}</title><style>body{font-family:Arial;text-align:center;color:#123d32;max-width:600px;margin:50px auto}svg{width:230px;height:230px}.rekreo-brand{display:block;font-size:48px;font-weight:900}.kiosk-symbol{display:none}h2{font-size:34px}p{font-size:20px}strong{font-size:40px}button{display:none}</style>${node.outerHTML}<script>window.print()<\/script></html>`,
      "text/html;charset=utf-8",
    );
  };
  return (
    <Modal title="Cartel para tu kiosko" onClose={onClose}>
      <div className="school-poster">
        <Brand />
        <span className="poster-tag">MENOS FILAS. MÁS RECREO.</span>
        <h2>
          Pedí antes.
          <br />
          Disfrutá el recreo.
        </h2>
        <p>{kiosk.name}</p>
        <p>{kiosk.school}</p>
        <div className="poster-qr">
          <QRCodeSVG value={url.toString()} size={220} level="M" />
        </div>
        <p>Escaneá para ingresar a reKreo</p>
        <small>O ingresá el código de tu kiosko:</small>
        <strong>{kiosk.code}</strong>
      </div>
      <button className="button primary full" onClick={print}>
        Descargar cartel para imprimir
      </button>
      <p className="hint">
        Se descarga un HTML con el QR incluido. Abrilo para imprimir o guardar
        como PDF. La descarga Android se habilita cuando esté publicada.
      </p>
    </Modal>
  );
}
export default function Platform({ data, action, session, onOpen, notify }) {
  const [search, setSearch] = useState(""),
    [rows, setRows] = useState([]),
    [edit, setEdit] = useState(null),
    [poster, setPoster] = useState(null),
    [createdKiosk, setCreatedKiosk] = useState(null),
    [loading, setLoading] = useState(false),
    [from, setFrom] = useState(localDate().slice(0, 8) + "01"),
    [to, setTo] = useState(localDate());
  async function refresh() {
    setLoading(true);
    const r = await action("platformOverview", { from, to }, undefined, {
      background: true,
    });
    if (r) setRows(r.rows);
    setLoading(false);
  }
  useEffect(() => {
    refresh();
  }, [
    data.kiosks.map((k) => k.id + ":" + k.plan + ":" + k.imageCount).join("|"),
  ]);
  const kiosks = data.kiosks.filter((k) =>
    (
      k.name +
      " " +
      k.school +
      " " +
      k.code +
      " " +
      (rows.find((r) => r.id === k.id)?.client?.internalName || "")
    )
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="platform-hero">
        <div>
          <span className="eyebrow">CENTRO DE CONTROL</span>
          <h2>Tu negocio, en perspectiva.</h2>
          <p>
            Clientes, actividad y planes. Cada kiosko con su propio espacio.
          </p>
        </div>
        <div className="platform-hero-badge">
          <ShieldCheck size={32} />
          <span>
            Administración
            <br />
            <b>reKreo</b>
          </span>
        </div>
      </div>
      <div className="stats-grid">
        <Metric
          label="Kioskos registrados"
          value={data.kiosks.length}
          detail={`${data.kiosks.filter((k) => !k.closed).length} abiertos`}
          icon={Store}
        />
        <Metric
          label="Suscripciones mensuales"
          value={fmt(
            data.kiosks
              .filter((k) => !k.closed)
              .reduce((n, k) => n + (k.monthlyFee || 0), 0),
          )}
          detail="Importe pactado · no confirma pagos recibidos"
          icon={Wallet}
          tone="orange"
        />
        <Metric
          label="Alumnos registrados"
          value={rows.reduce((n, r) => n + r.students, 0)}
          detail="Suma de cuentas por kiosko"
          icon={Users}
          tone="blue"
        />
        <Metric
          label="Fotos almacenadas"
          value={rows.reduce((n, r) => n + r.imageCount, 0)}
          detail="Consumo conjunto de tus clientes"
          icon={Image}
          tone="purple"
        />
      </div>
      <div className="report-toolbar">
        <div>
          <label>
            Actividad desde
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
          <button
            className="button secondary"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw size={16} />
            {loading ? "Consultando…" : "Actualizar"}
          </button>
        </div>
        <button
          className="button primary"
          onClick={() => setEdit({ create: true })}
        >
          <Plus size={17} />
          Nuevo kiosko
        </button>
      </div>
      <div className="search platform-search">
        <Search size={17} />
        <input
          placeholder="Buscar cliente, escuela o código…"
          aria-label="Buscar kiosko"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="kiosk-grid">
        {kiosks.map((k) => {
          const row = rows.find((r) => r.id === k.id) || {},
            client = row.client || {};
          return (
            <article className="panel kiosk-card" key={k.id}>
              <div className="kiosk-card-top">
                <span className="feature-icon">
                  <Store />
                </span>
                <span className={"badge " + (k.closed ? "red" : "green")}>
                  {k.closed ? "Cerrado" : k.plan || "Inicial"}
                </span>
              </div>
              <small className="internal-reference">
                {client.internalName || "Sin referencia interna"}
              </small>
              <h2>{k.name}</h2>
              <p>{k.school}</p>
              <code>{k.code}</code>
              <div className="kiosk-numbers">
                <div>
                  <span>Ventas del período</span>
                  <b>{fmt(row.sales || 0)}</b>
                </div>
                <div>
                  <span>Saldo por consumir</span>
                  <b>{fmt(row.balance || 0)}</b>
                </div>
                <div>
                  <span>Fotos</span>
                  <b>
                    {row.imageCount ?? k.imageCount ?? 0} /{" "}
                    {k.limits?.images ?? 100}
                  </b>
                </div>
                <div>
                  <span>Cuentas con saldo</span>
                  <b>
                    {row.withBalance || 0} / {row.students || 0}
                  </b>
                </div>
              </div>
              <div className="kiosk-price">
                <span>Mensualidad</span>
                <b>{fmt(k.monthlyFee || 0)}</b>
              </div>
              <button className="button primary full" onClick={() => onOpen(k)}>
                Ver dashboard
                <ArrowRight size={16} />
              </button>
              <div className="kiosk-card-actions">
                <button
                  className="text-button"
                  onClick={() => setEdit({ kiosk: k, client })}
                >
                  <Settings size={15} />
                  Cliente y plan
                </button>
                <button className="text-button" onClick={() => setPoster(k)}>
                  <QrCode size={15} />
                  Cartel QR
                </button>
              </div>
              <p className="hint">
                Email autorizado: <b>{client.ownerEmail || "Sin cargar"}</b>
                <br />
                {k.ownerUid
                  ? "Cuenta vinculada al dueño"
                  : "Pendiente del primer ingreso con email verificado"}
              </p>
              <button
                className="text-button danger"
                onClick={async () => {
                  if (
                    !window.confirm(
                      k.closed
                        ? "¿Reabrir este kiosko?"
                        : "¿Cerrar el kiosko? Se bloquean compras y cargas; los saldos se conservan para devolución.",
                    )
                  )
                    return;
                  await action(
                    "closeKiosk",
                    { kioskId: k.id, closed: !k.closed },
                    k.closed ? "Kiosko reabierto" : "Kiosko cerrado",
                  );
                  refresh();
                }}
              >
                {k.closed ? "Reabrir kiosko" : "Cerrar kiosko"}
              </button>
            </article>
          );
        })}
      </div>
      {edit && (
        <KioskForm
          {...edit}
          onClose={() => setEdit(null)}
          onSave={async (payload) => {
            const r = await action(
              edit.create ? "createKiosk" : "updateKioskPlan",
              { ...payload, kioskId: edit.kiosk?.id || session.kioskId },
              edit.create ? "Kiosko creado" : "Cliente y plan actualizados",
              { throwOnError: true },
            );
            if (r) {
              setEdit(null);
              if (edit.create) setCreatedKiosk(r);
              refresh();
            }
          }}
        />
      )}{" "}
      {poster && (
        <SchoolPoster kiosk={poster} onClose={() => setPoster(null)} />
      )}{" "}
      {createdKiosk && (
        <Modal title="Kiosko creado" onClose={() => setCreatedKiosk(null)}>
          <p>
            Código público para alumnos: <b>{createdKiosk.code}</b>
          </p>
          <p>
            Dueño autorizado: <b>{createdKiosk.ownerEmail}</b>
          </p>
          <p>
            El kioskero ya puede registrarse o ingresar con este mismo email.
            Cuando lo verifique, se vincula automáticamente a su panel. No
            necesita un código privado.
          </p>
          <button
            className="button primary full"
            onClick={() => setCreatedKiosk(null)}
          >
            Entendido
          </button>
        </Modal>
      )}
    </>
  );
}
