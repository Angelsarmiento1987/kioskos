import React, { useState, useRef } from "react";
import { Modal, Field, fmt } from "./ui";
import { newId } from "../id";
export default function Refund({ member, orders, action, onClose }) {
  const [busy, setBusy] = useState(false),
    request = useRef(newId()),
    pending = orders.some(
      (o) =>
        o.studentId === member.id &&
        !["cancelled", "delivered", "uncollected"].includes(o.status),
    );
  return (
    <Modal title="Devolver dinero al alumno" onClose={onClose}>
      <p>
        <b>{member.name}</b> · Saldo disponible: <b>{fmt(member.balance)}</b>
      </p>
      {pending ? (
        <p className="notice">
          Primero entregá o cancelá los pedidos pendientes de esta cuenta.
        </p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            const r = await action(
              "cashout",
              {
                userId: member.id,
                amount: Math.round(Number(f.get("amount")) * 100),
                method: f.get("method"),
                reason: f.get("reason"),
                close: f.get("close") === "on",
                requestId: request.current,
              },
              "Devolución registrada",
            );
            setBusy(false);
            if (r) onClose();
          }}
        >
          <Field
            label="Importe a devolver en pesos"
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            max={member.balance / 100}
            value={member.balance / 100}
            required
          />
          <label>
            Medio de devolución
            <select name="method">
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
            </select>
          </label>
          <label>
            Motivo
            <select name="reason">
              <option>Cierre del kiosko</option>
              <option>Cambio de escuela</option>
              <option>Carga errónea</option>
              <option>Otra devolución autorizada</option>
            </select>
          </label>
          <label className="checkbox">
            <input name="close" type="checkbox" />
            <span>
              Desactivar la cuenta en este kiosko después de devolver el saldo
              completo
            </span>
          </label>
          <label className="checkbox">
            <input type="checkbox" required />
            <span>
              Confirmo que ya entregué el dinero al alumno. reKreo registra la
              devolución y no realiza una transferencia.
            </span>
          </label>
          <button className="button danger-button full" disabled={busy}>
            {busy ? "Registrando…" : "Confirmar dinero devuelto"}
          </button>
        </form>
      )}
    </Modal>
  );
}
