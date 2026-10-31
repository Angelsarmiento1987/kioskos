import React from "react";
import { Users, ShieldCheck, UserPlus, Trash2 } from "lucide-react";
import { Field, Placeholder } from "../components/ui";
export default function Team({ data, action, session }) {
  return (
    <>
      <section className="panel report-card">
        <span className="eyebrow">ACCESOS DE TU EQUIPO</span>
        <h2>Cada persona, su propia cuenta.</h2>
        <p className="hint">
          Los empleados pueden cargar crédito, cobrar, gestionar pedidos,
          productos y galería. Las devoluciones de dinero, configuración y altas
          de empleados quedan para el dueño.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Persona</th>
                <th>Email</th>
                <th>Rol</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.members
                .filter((m) => ["owner", "staff"].includes(m.role))
                .map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td>{m.email || "—"}</td>
                    <td>
                      <span className="badge green">
                        {m.role === "owner" ? "Dueño" : "Empleado"}
                      </span>
                    </td>
                    <td>
                      {m.role === "staff" && (
                        <button
                          className="text-button danger"
                          onClick={() => {
                            if (
                              window.confirm(
                                "¿Quitar el acceso de este empleado? El historial se conserva.",
                              )
                            )
                              action(
                                "manageStaff",
                                { remove: true, userId: m.id },
                                "Acceso eliminado",
                              );
                          }}
                        >
                          <Trash2 size={15} />
                          Quitar acceso
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
      <section
        className="panel report-card"
        style={{ marginTop: 20, maxWidth: 550 }}
      >
        <h2>Autorizar empleado</h2>
        <p className="hint">
          Autorizá su email. Luego debe ingresar por “Soy kioskero” y verificar
          ese correo. Aparecerá en la lista al completar su primer ingreso.
          Debe usar una cuenta que no sea alumno de este kiosko.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              r = await action(
                "manageStaff",
                { email: new FormData(form).get("email") },
                "Empleado autorizado",
              );
            if (r) form.reset();
          }}
        >
          <Field
            label="Email verificado del empleado"
            name="email"
            type="email"
            required
          />
          <button className="button primary">
            <UserPlus size={17} />
            Autorizar cuenta
          </button>
        </form>
      </section>
    </>
  );
}
export function Audit({ data }) {
  const events = [...(data.audit || [])].sort(
    (a, b) =>
      (b.createdAt?.toMillis?.() || b.createdAt || 0) -
      (a.createdAt?.toMillis?.() || a.createdAt || 0),
  );
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Historial de acciones</h2>
          <p>
            Los movimientos de dinero incluyen su responsable en la sección
            Movimientos.
          </p>
        </div>
      </div>
      {events.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Acción</th>
                <th>Detalle</th>
                <th>Responsable</th>
              </tr>
            </thead>
            <tbody>
              {events.map((a) => (
                <tr key={a.id}>
                  <td>
                    {new Date(
                      a.createdAt?.toMillis?.() || a.createdAt,
                    ).toLocaleString("es-AR")}
                  </td>
                  <td>{a.type}</td>
                  <td>{a.detail}</td>
                  <td>
                    {a.actorName ||
                      data.members.find((m) => m.id === a.actor)?.name ||
                      a.actor}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Placeholder title="Todavía no hay acciones registradas">
          Las modificaciones aparecerán acá.
        </Placeholder>
      )}
    </section>
  );
}
