import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Plus,
  Minus,
  QrCode,
  CheckCircle2,
  Clock,
  Trash2,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { fmt, Modal, Placeholder } from "../components/ui";
import { newId } from "../id";
export default function Counter({ data, action }) {
  const [cart, setCart] = useState({}),
    [search, setSearch] = useState(""),
    [cartError, setCartError] = useState(""),
    [sale, setSale] = useState(null),
    [tick, setTick] = useState(Date.now());
  const request = useRef(newId());
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const items = Object.entries(cart)
      .map(([id, qty]) => ({ ...data.products.find((p) => p.id === id), qty }))
      .filter((p) => p.id),
    total = items.reduce((n, p) => n + p.price * p.qty, 0);
  const current =
      (data.counterSales || []).find((c) => c.id === sale?.id) || sale,
    paid = current?.status === "paid",
    expired = current?.expiresAt < tick;
  function add(p, d) {
    if (d > 0 && !cart[p.id] && Object.keys(cart).length >= 5) {
      setCartError("Hasta 5 productos distintos por cobro.");
      return;
    }
    setCartError("");
    setCart((c) => {
      const next = { ...c },
        qty = (c[p.id] || 0) + d;
      if (qty <= 0) delete next[p.id];
      else if (qty <= p.stock) next[p.id] = qty;
      return next;
    });
  }
  return (
    <div className="pos-layout">
      <section>
        {cartError && (
          <div className="form-operation-error" role="alert">
            {cartError}
          </div>
        )}
        <div className="search">
          <Search size={17} />
          <input
            placeholder="Buscar producto para cobrar…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar producto para cobrar"
          />
        </div>
        <div className="pos-products">
          {data.products
            .filter(
              (p) =>
                p.active && p.name.toLowerCase().includes(search.toLowerCase()),
            )
            .map((p) => (
              <button
                key={p.id}
                className="panel pos-product"
                disabled={!p.stock || data.kiosk?.closed}
                onClick={() => add(p, 1)}
              >
                <span className="pos-food">
                  {p.imageUrl ? <img src={p.imageUrl} alt="" /> : p.emoji}
                </span>
                <b>{p.name}</b>
                <span>{fmt(p.price)}</span>
                <small>{p.stock} disponibles</small>
                <span className="pos-add">
                  <Plus size={16} />
                </span>
              </button>
            ))}
        </div>
      </section>
      <section className="panel pos-cart">
        <span className="eyebrow">COMPRA EN EL MOMENTO</span>
        <h2>Cobro en mostrador</h2>
        <p>
          Elegí los productos. El alumno escanea y confirma el pago con su
          crédito.
        </p>
        {items.length ? (
          items.map((p) => (
            <div className="cart-item" key={p.id}>
              <div>
                <b>{p.name}</b>
                <small>{fmt(p.price)} c/u</small>
              </div>
              <div className="quantity">
                <button
                  aria-label={"Quitar " + p.name}
                  onClick={() => add(p, -1)}
                >
                  <Minus size={14} />
                </button>
                <b>{p.qty}</b>
                <button
                  aria-label={"Sumar " + p.name}
                  onClick={() => add(p, 1)}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          ))
        ) : (
          <Placeholder title="Todavía no hay productos">
            Tocá el catálogo para agregarlos.
          </Placeholder>
        )}
        <div className="receipt-total">
          <span>Total</span>
          <b>{fmt(total)}</b>
        </div>
        <button
          className="button primary full"
          disabled={!items.length || data.kiosk?.closed}
          onClick={async () => {
            const r = await action("createCounterSale", {
              requestId: request.current,
              items: items.map((p) => ({ productId: p.id, qty: p.qty })),
            });
            if (r) setSale(r);
          }}
        >
          <QrCode size={18} />
          Generar QR de cobro
        </button>
        <p className="hint">
          El stock y el saldo se confirman al pagar. Esta venta no vuelve a
          ingresar dinero a caja.
        </p>
      </section>
      {current && (
        <Modal
          title={paid ? "¡Compra cobrada!" : "Esperando el pago del alumno"}
          onClose={() => setSale(null)}
        >
          <div className="qr-wrap">
            {paid ? (
              <>
                <CheckCircle2 size={64} color="#177252" />
                <h2>{fmt(current.total)}</h2>
                <p>
                  {current.studentName || "El alumno"} pagó con su crédito. La
                  venta quedó registrada y entregada.
                </p>
                <button
                  className="button primary full"
                  onClick={() => {
                    setSale(null);
                    setCart({});
                    request.current = newId();
                  }}
                >
                  Nueva venta
                </button>
              </>
            ) : (
              <>
                <h2>{fmt(current.total)}</h2>
                {!expired && current.status === "pending" ? (
                  <QRCodeSVG
                    size={205}
                    value={`rekreo:pay:${data.kiosk.id}:${current.id}`}
                  />
                ) : (
                  <p className="error">
                    QR vencido o cancelado. Generá un nuevo cobro.
                  </p>
                )}
                <p>
                  Vence en{" "}
                  {Math.max(0, Math.ceil((current.expiresAt - tick) / 1000))}{" "}
                  segundos.
                </p>
                <details>
                  <summary>Código manual de prueba</summary>
                  <textarea
                    readOnly
                    value={`rekreo:pay:${data.kiosk.id}:${current.id}`}
                  />
                  <p className="hint">
                    Podés copiarlo, cambiar a vista alumno e ingresarlo en
                    “Pagar en mostrador”.
                  </p>
                </details>
                <button
                  className="text-button danger"
                  onClick={async () => {
                    if (current.status === "pending")
                      await action("cancelCounterSale", { saleId: current.id });
                    setSale(null);
                    request.current = newId();
                  }}
                >
                  Cancelar cobro
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
export function StudentPayment({ data, session, action, notify, onClose }) {
  const [code, setCode] = useState(""),
    [sale, setSale] = useState(null),
    [paid, setPaid] = useState(false),
    [loading, setLoading] = useState(false);
  async function find(e) {
    e.preventDefault();
    const parts = code.trim().split(":");
    if (
      parts.length !== 4 ||
      parts[0] !== "rekreo" ||
      parts[1] !== "pay" ||
      parts[2] !== session.kioskId
    ) {
      notify("El QR no pertenece a este kiosko.", true);
      return;
    }
    setLoading(true);
    let r;
    if (session.mode === "demo")
      r = (data.counterSales || []).find((c) => c.id === parts[3]);
    else r = await action("getCounterSale", { saleId: parts[3] });
    setLoading(false);
    if (!r) {
      notify("Cobro no encontrado.", true);
      return;
    }
    if (r.status !== "pending" || r.expiresAt < Date.now()) {
      notify("Este cobro ya fue pagado, cancelado o venció.", true);
      return;
    }
    setSale(r);
  }
  return (
    <Modal
      title={paid ? "Pago confirmado" : "Pagar en mostrador"}
      onClose={onClose}
    >
      {paid ? (
        <div className="qr-wrap">
          <CheckCircle2 size={55} />
          <h2>¡Listo!</h2>
          <p>
            Tu compra se descontó del saldo y quedó registrada. Ya podés retirar
            tus productos.
          </p>
          <button className="button primary full" onClick={onClose}>
            Volver a mi kiosko
          </button>
        </div>
      ) : sale ? (
        <>
          <p>
            <b>{data.kiosk?.name}</b>
          </p>
          {sale.items.map((i) => (
            <div key={i.productId} className="receipt-line">
              <span>
                {i.qty} × {i.name}
              </span>
              <b>{fmt(i.qty * i.price)}</b>
            </div>
          ))}
          <div className="receipt-total">
            <span>Total a pagar</span>
            <b>{fmt(sale.total)}</b>
          </div>
          <p className="hint">
            Saldo disponible:{" "}
            {fmt(data.members.find((m) => m.id === session.uid)?.balance || 0)}
          </p>
          <button
            className="button primary full"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              const r = await action(
                "payCounterSale",
                { saleId: sale.id },
                "Compra confirmada",
              );
              setLoading(false);
              if (r) setPaid(true);
            }}
          >
            Confirmar y pagar {fmt(sale.total)}
          </button>
        </>
      ) : (
        <>
          <p>
            Escaneá el QR que te muestra el kioskero o ingresá su contenido para
            revisar la compra antes de pagar.
          </p>
          <form onSubmit={find}>
            <label>
              QR o código de cobro
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="rekreo:pay:…"
                required
              />
            </label>
            <button className="button primary full" disabled={loading}>
              Ver detalle del cobro
            </button>
          </form>
          <CameraCapture onValue={setCode} />
        </>
      )}
    </Modal>
  );
}
function CameraCapture({ onValue }) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let scanner,
      cancelled = false;
    async function start() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        scanner = new Html5Qrcode("payment-reader");
        await scanner.start(
          { facingMode: "environment" },
          { fps: 8, qrbox: 200 },
          (value) => {
            if (!cancelled) {
              onValue(value);
              setOpen(false);
            }
          },
          () => {},
        );
        if (cancelled && scanner.isScanning) await scanner.stop();
      } catch {
        setError("Permití la cámara o usá el código manual.");
      }
    }
    start();
    return () => {
      cancelled = true;
      if (scanner?.isScanning) scanner.stop().catch(() => {});
    };
  }, [open]);
  return (
    <>
      <button
        type="button"
        className="button secondary full"
        style={{ marginTop: 12 }}
        onClick={() => setOpen(!open)}
      >
        <QrCode size={16} />
        {open ? "Cerrar cámara" : "Escanear QR"}
      </button>
      {open && <div id="payment-reader" />}
      {error && <p className="hint">{error}</p>}
    </>
  );
}
