export class DomainError extends Error {}
export const money = (n) => {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new DomainError("El importe no es válido.");
  return n;
};
export function localDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function slotDeadline(date, slot) {
  return (
    Date.parse(`${date}T${slot.time}:00-03:00`) -
    Number(slot.cutoffMinutes || 0) * 60000
  );
}
export function quoteOrder({
  items,
  products,
  wallet,
  settings,
  slotId,
  date,
  existing = [],
  now = Date.now(),
  delivery = "pickup",
}) {
  if (settings.paused)
    throw new DomainError(
      "El kiosco pausó los pedidos. Volvé a intentar más tarde.",
    );
  const dateStamp = Date.parse(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(dateStamp) ||
    new Date(dateStamp).toISOString().slice(0, 10) !== date ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    date < localDate(new Date(now)) ||
    date > localDate(new Date(now + 7 * 86400000))
  )
    throw new DomainError(
      "Elegí una fecha entre hoy y los próximos siete días.",
    );
  if (
    delivery !== "pickup" &&
    !(delivery === "classroom" && settings.deliveryEnabled)
  )
    throw new DomainError("La entrega al aula no está habilitada.");
  const slot = settings.slots.find((s) => s.id === slotId);
  if (!slot || now >= slotDeadline(date, slot))
    throw new DomainError("Cerró el horario para este recreo. Elegí otro.");
  if (!Array.isArray(items) || !items.length || items.length > 50)
    throw new DomainError("El carrito está vacío o supera el límite.");
  const seen = new Set();
  let total = 0,
    units = 0,
    prepared = 0;
  const lines = items.map(({ productId, qty }) => {
    if (seen.has(productId)) throw new DomainError("Producto duplicado.");
    seen.add(productId);
    const p = products.find((p) => p.id === productId);
    if (!p || !p.active)
      throw new DomainError("Un producto ya no está disponible.");
    if (!Number.isInteger(qty) || qty < 1 || qty > 99)
      throw new DomainError("Cantidad inválida.");
    if (p.stock < qty)
      throw new DomainError(`No queda stock suficiente de ${p.name}.`);
    money(p.price);
    total += p.price * qty;
    units += qty;
    if (p.prepared) prepared += qty;
    return {
      productId: p.id,
      name: p.name,
      price: p.price,
      qty,
      prepared: !!p.prepared,
      cancellable: !!p.cancellable,
      emoji: p.emoji || "🥪",
    };
  });
  money(total);
  money(wallet.balance);
  if (total === 0)
    throw new DomainError("El pedido debe tener un importe mayor a cero.");
  if (units > settings.maxUnits)
    throw new DomainError(
      `El máximo es ${settings.maxUnits} unidades por pedido.`,
    );
  if (wallet.balance < total)
    throw new DomainError("No tenés saldo suficiente. Recargá en el kiosco.");
  const orders = existing.filter(
    (o) => o.date === date && o.slotId === slotId && o.status !== "cancelled",
  );
  if (orders.length >= slot.maxOrders)
    throw new DomainError("Este recreo ya alcanzó su cupo de pedidos.");
  const already = orders.reduce(
    (n, o) => n + o.items.reduce((m, i) => m + (i.prepared ? i.qty : 0), 0),
    0,
  );
  if (already + prepared > slot.maxPrepared)
    throw new DomainError("Se agotó el cupo de preparación de este recreo.");
  return {
    items: lines,
    total,
    units,
    prepared,
    slotId,
    date,
    delivery,
    slotLabel: slot.label,
    slotTime: slot.time,
  };
}
export function mayCancel(order, isStaff, now = Date.now(), settings) {
  if (["cancelled", "delivered", "uncollected"].includes(order.status))
    throw new DomainError("Este pedido ya está cerrado.");
  if (!isStaff) {
    if (order.status !== "received" || !order.items.every((i) => i.cancellable))
      throw new DomainError("Este pedido no permite cancelación del alumno.");
    const slot = settings.slots.find((s) => s.id === order.slotId);
    if (!slot || now >= slotDeadline(order.date, slot))
      throw new DomainError("Terminó el plazo de cancelación.");
  }
  return true;
}
export function validateProduct(p) {
  if (!p.name?.trim() || p.name.length > 100)
    throw new DomainError("Ingresá un nombre de hasta 100 caracteres.");
  money(p.price);
  if (p.price < 1) throw new DomainError("El precio debe ser mayor a cero.");
  if (!Number.isInteger(p.stock) || p.stock < 0 || p.stock > 100000)
    throw new DomainError("Stock inválido.");
  if (p.imageUrl && !/^https:\/\//.test(p.imageUrl))
    throw new DomainError("La imagen debe usar HTTPS.");
  return {
    name: p.name.trim(),
    description: String(p.description || "").slice(0, 300),
    category: String(p.category || "Otros").slice(0, 50),
    price: p.price,
    stock: p.stock,
    prepared: !!p.prepared,
    cancellable: !!p.cancellable,
    active: !!p.active,
    emoji: String(p.emoji || "🥪").slice(0, 8),
    imageUrl: p.imageUrl || "",
    imageId: p.imageId || "",
  };
}
export function validateSettings(s) {
  if (
    !s.name?.trim() ||
    !Array.isArray(s.slots) ||
    !s.slots.length ||
    s.slots.length > 10
  )
    throw new DomainError("Completá nombre y recreos.");
  if (!Number.isInteger(s.maxUnits) || s.maxUnits < 1 || s.maxUnits > 99)
    throw new DomainError("Límite por pedido inválido.");
  const ids = new Set();
  for (const x of s.slots) {
    if (
      !x.id ||
      ids.has(x.id) ||
      !x.label ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(x.time) ||
      ![x.maxOrders, x.maxPrepared, x.cutoffMinutes].every(Number.isInteger) ||
      x.maxOrders < 1 ||
      x.maxOrders > 500 ||
      x.maxPrepared < 0 ||
      x.maxPrepared > 1000 ||
      x.cutoffMinutes < 0 ||
      x.cutoffMinutes > 180
    )
      throw new DomainError("Revisá horarios y cupos de los recreos.");
    ids.add(x.id);
  }
  return {
    name: s.name.trim().slice(0, 100),
    school: String(s.school || "").slice(0, 120),
    code: String(s.code || "")
      .trim()
      .toUpperCase()
      .slice(0, 20),
    maxUnits: s.maxUnits,
    paused: !!s.paused,
    deliveryEnabled: !!s.deliveryEnabled,
    preparationEnabled: !!s.preparationEnabled,
    slots: s.slots.map((x) => ({ ...x })),
    notice: String(s.notice || "").slice(0, 300),
  };
}
