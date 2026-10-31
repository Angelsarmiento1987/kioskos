import { DomainError, money, localDate } from "./domain.mjs";
export function quoteCounter(items, products, settings) {
  if (settings.closed) throw new DomainError("Este kiosko está cerrado.");
  if (!Array.isArray(items) || !items.length || items.length > 50)
    throw new DomainError("Agregá productos al cobro.");
  const seen = new Set();
  let total = 0;
  const lines = items.map(({ productId, qty }) => {
    const p = products.find((x) => x.id === productId);
    if (
      seen.has(productId) ||
      !p?.active ||
      !Number.isInteger(qty) ||
      qty < 1 ||
      qty > 99
    )
      throw new DomainError("Revisá los productos del cobro.");
    seen.add(productId);
    if (p.stock < qty) throw new DomainError(`Stock insuficiente: ${p.name}.`);
    money(p.price);
    total += p.price * qty;
    return {
      productId,
      name: p.name,
      qty,
      price: p.price,
      prepared: !!p.prepared,
      cancellable: false,
      emoji: p.emoji || "🥤",
    };
  });
  money(total);
  if (!total) throw new DomainError("El total debe ser mayor a cero.");
  return {
    items: lines,
    total,
    prepared: 0,
    units: lines.reduce((n, i) => n + i.qty, 0),
  };
}
export function assertRefund({ member, amount, orders }) {
  if (!member || member.role !== "student")
    throw new DomainError("Cuenta no encontrada.");
  money(amount);
  if (amount <= 0 || amount > member.balance)
    throw new DomainError("El importe supera el saldo disponible.");
  if (
    orders.some(
      (o) =>
        o.studentId === member.id &&
        !["cancelled", "delivered", "uncollected"].includes(o.status),
    )
  )
    throw new DomainError(
      "Entregá o cancelá los pedidos pendientes antes de devolver el saldo.",
    );
}
export function assertLimits({ products = 100, images = 100 }, counts) {
  if (
    !Number.isInteger(products) ||
    products < 1 ||
    products > 1000 ||
    !Number.isInteger(images) ||
    images < 0 ||
    images > 1000
  )
    throw new DomainError(
      "Los límites deben ser enteros entre 0 y 1.000 (productos: mínimo 1).",
    );
  if (counts.products > products || counts.images > images)
    throw new DomainError(
      `Antes de reducir el plan, dejá como máximo ${products} productos activos y ${images} fotos almacenadas.`,
    );
}
export const millis = (x) => (typeof x === "number" ? x : x?.toMillis?.() || 0);
export function summary(
  { orders = [], members = [], movements = [] },
  from = localDate(),
  to = from,
) {
  const inRange = (d) => d >= from && d <= to;
  const sales = orders.filter(
    (o) =>
      o.status !== "cancelled" &&
      inRange(localDate(new Date(millis(o.createdAt)))),
  );
  const movementsInRange = movements.filter((m) =>
    inRange(localDate(new Date(millis(m.createdAt)))),
  );
  const topups = movementsInRange.filter((m) => m.type === "topup");
  const returns = movementsInRange.filter((m) => m.type === "cashout");
  const students = members.filter((m) => m.role === "student");
  return {
    sales: sales.reduce((n, o) => n + o.total, 0),
    saleCount: sales.length,
    counter: sales
      .filter((o) => o.channel === "counter")
      .reduce((n, o) => n + o.total, 0),
    preorders: sales
      .filter((o) => o.channel !== "counter")
      .reduce((n, o) => n + o.total, 0),
    topups: topups.reduce((n, m) => n + m.amount, 0),
    cash: topups
      .filter((m) => m.method === "cash")
      .reduce((n, m) => n + m.amount, 0),
    transfer: topups
      .filter((m) => m.method === "transfer")
      .reduce((n, m) => n + m.amount, 0),
    cashouts: -returns.reduce((n, m) => n + m.amount, 0),
    cashNet:
      topups
        .filter((m) => m.method === "cash")
        .reduce((n, m) => n + m.amount, 0) +
      returns
        .filter((m) => m.method === "cash")
        .reduce((n, m) => n + m.amount, 0),
    transferNet:
      topups
        .filter((m) => m.method === "transfer")
        .reduce((n, m) => n + m.amount, 0) +
      returns
        .filter((m) => m.method === "transfer")
        .reduce((n, m) => n + m.amount, 0),
    balance: students.reduce((n, m) => n + m.balance, 0),
    students: students.length,
    withBalance: students.filter((m) => m.balance > 0).length,
    withoutBalance: students.filter((m) => !m.balance).length,
    active: students.filter((m) =>
      orders.some(
        (o) =>
          o.studentId === m.id &&
          o.status !== "cancelled" &&
          millis(o.createdAt) >= Date.now() - 30 * 86400000,
      ),
    ).length,
  };
}
