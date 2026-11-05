// Notices are derived from the existing ledger/orders. No second financial write or backend.
export const noticeReadId = (kioskId, noticeId) => `${kioskId}--${noticeId}`;
const millis = (v) => typeof v === "number" ? v : v?.toMillis?.() || 0;
const money = (v) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format((v || 0) / 100);
export function studentNotices(uid, orders = [], movements = []) {
  if (!uid) return [];
  const rows = [], refunded = new Set();
  for (const m of movements) {
    if (m.userId !== uid) continue;
    if (m.type === "refund" && m.orderId) refunded.add(m.orderId);
    if (m.type === "cashout") rows.push({ id: `cashout-${m.id}`, title: "Devolución de dinero registrada", message: `El kiosco registró una devolución de ${money(Math.abs(m.amount))}${m.method === "transfer" ? " por transferencia" : m.method === "cash" ? " en efectivo" : ""}. Consultá el detalle en tus movimientos.`, at: millis(m.createdAt), target: "movements" });
    if (m.type === "refund" && !m.orderId) rows.push({ id: `refund-${m.id}`, title: "Crédito reintegrado", message: `Se reintegraron ${money(m.amount)} a tu saldo. Consultá el detalle en tus movimientos.`, at: millis(m.createdAt), target: "movements" });
  }
  for (const o of orders) {
    if (o.studentId !== uid || o.channel === "counter") continue;
    if (o.status === "cancelled") rows.push({ id: `cancelled-${o.id}`, title: "Pedido cancelado", message: `${o.cancelledBy === uid ? "Cancelaste" : "El kiosco canceló"} el pedido ${o.code || ""}.${refunded.has(o.id) ? ` Se reintegraron ${money(o.total)} a tu saldo.` : " Consultá el reintegro en tus movimientos."}${o.cancelReason ? ` Motivo: ${o.cancelReason}` : ""}`, at: millis(o.cancelledAt || o.updatedAt || o.createdAt), target: "orders" });
    if (o.status === "ready") rows.push({ id: `ready-${o.id}`, title: "¡Tu pedido está listo!", message: `El pedido ${o.code || ""} está listo para retirar en el kiosco.`, at: millis(o.updatedAt || o.createdAt), target: "orders" });
  }
  // A refund can arrive before the corresponding order snapshot, or outlive its order.
  for (const m of movements) if (m.userId === uid && m.type === "refund" && m.orderId && !rows.some(n => n.id === `cancelled-${m.orderId}`)) rows.push({ id: `cancelled-${m.orderId}`, title: "Crédito reintegrado", message: `Se reintegraron ${money(m.amount)} a tu saldo por un pedido cancelado. Consultá tus movimientos.`, at: millis(m.createdAt), target: "movements" });
  return rows.sort((a,b) => b.at - a.at || a.id.localeCompare(b.id));
}
