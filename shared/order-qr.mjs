const identifier = /^[A-Za-z0-9_-]{1,128}$/;
export function orderQrValue(kioskId, orderId) {
  if (!identifier.test(kioskId || "") || !identifier.test(orderId || ""))
    throw new Error("El pedido no tiene una identificación válida.");
  return `recreo:order:${kioskId}:${orderId}`;
}
export function parseOrderLookup(value, kioskId) {
  const text = String(value || "").trim();
  if (!text || text.length > 300)
    throw new Error("Escaneá un pedido o ingresá su código.");
  if (text.startsWith("recreo:")) {
    const parts = text.split(":");
    if (parts[1] === "account")
      throw new Error(
        "Ese QR es de una cuenta para cargar saldo. Mostrá el QR de Mis pedidos.",
      );
    if (
      parts.length !== 4 ||
      parts[1] !== "order" ||
      !identifier.test(parts[2]) ||
      !identifier.test(parts[3])
    )
      throw new Error("El QR del pedido no es válido.");
    if (parts[2] !== kioskId)
      throw new Error("Este pedido corresponde a otro kiosko.");
    return { orderId: parts[3] };
  }
  const code = text.toUpperCase();
  if (!/^[A-Z0-9-]{3,32}$/.test(code))
    throw new Error(
      "Ingresá el código escrito del pedido, por ejemplo R-1042.",
    );
  return { code };
}
export function closedOrderNotice(status) {
  return (
    {
      delivered: "Este pedido ya fue entregado. No lo entregues nuevamente.",
      cancelled: "Este pedido está cancelado. No corresponde entregarlo.",
      uncollected:
        "Este pedido fue cerrado como no retirado. Revisá el historial antes de entregarlo.",
    }[status] || ""
  );
}
// A server lookup or a live update may arrive first. A terminal state must
// never regress to an older pending snapshot and re-enable delivery.
export function orderForView(live, opened) {
  if (closedOrderNotice(live?.status)) return live;
  if (closedOrderNotice(opened?.status)) return opened;
  return live || opened;
}
