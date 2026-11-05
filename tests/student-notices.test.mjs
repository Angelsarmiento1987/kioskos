import test from "node:test";
import assert from "node:assert/strict";
import { studentNotices, noticeReadId } from "../shared/student-notices.mjs";
const o = { id: "o1", studentId: "u", channel: "preorder", code: "R-20", status: "cancelled", cancelledBy: "owner", cancelReason: "Sin stock", total: 100000, cancelledAt: 20 };
const m = { id: "refund-o1", userId: "u", type: "refund", orderId: "o1", amount: 100000, createdAt: 20 };
test("Cancelación y reintegro del mismo pedido producen un único aviso al reabrir", () => {
  const rows = studentNotices("u", [o], [m]);
  assert.equal(rows.length, 1); assert.equal(rows[0].id, "cancelled-o1");
  assert.match(rows[0].message, /Sin stock/); assert.match(rows[0].message, /Se reintegraron/);
  assert.deepEqual(studentNotices("u", [o], [m]), rows);
});
test("Una cancelación no afirma crédito reintegrado si aún no recibió el movimiento", () => {
  assert.doesNotMatch(studentNotices("u", [o])[0].message, /Se reintegraron/);
  assert.equal(studentNotices("u", [], [m])[0].id, "cancelled-o1");
});
test("Avisos solo del alumno autenticado y las compras de mostrador quedan fuera", () => {
  assert.deepEqual(studentNotices("other", [o], [m]), []);
  assert.deepEqual(studentNotices(null, [o], [m]), []);
  assert.deepEqual(studentNotices("u", [{ ...o, channel: "counter" }]), []);
});
test("Pedido listo se avisa mientras se puede retirar; al entregar no queda un aviso obsoleto", () => {
  assert.equal(studentNotices("u", [{ ...o, status: "ready" }])[0].id, "ready-o1");
  assert.deepEqual(studentNotices("u", [{ ...o, status: "delivered" }]), []);
});
test("Devolución externa y crédito se distinguen sin afirmar una transferencia automática", () => {
  const rows = studentNotices("u", [], [{ ...m, id: "cash1", orderId: "u", type: "cashout", amount: -25000, method: "transfer" }]);
  assert.equal(rows.length, 1); assert.match(rows[0].message, /registró.*transferencia/);
  assert.equal(rows[0].target, "movements");
});
test("El marcador distingue kioskos y estados de un mismo pedido", () => {
  assert.notEqual(noticeReadId("k1", "ready-o1"), noticeReadId("k2", "ready-o1"));
  assert.notEqual(noticeReadId("k1", "ready-o1"), noticeReadId("k1", "cancelled-o1"));
});
