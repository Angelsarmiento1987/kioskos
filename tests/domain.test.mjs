import test from "node:test";
import assert from "node:assert/strict";
import {
  quoteOrder,
  mayCancel,
  validateProduct,
  validateSettings,
} from "../shared/domain.mjs";
const now = Date.parse("2026-10-28T09:00:00-03:00");
const settings = {
  name: "Prueba",
  school: "Escuela",
  code: "TEST",
  maxUnits: 5,
  paused: false,
  slots: [
    {
      id: "r1",
      label: "Recreo",
      time: "10:00",
      cutoffMinutes: 10,
      maxOrders: 2,
      maxPrepared: 2,
    },
  ],
};
const products = [
  {
    id: "burger",
    name: "Hamburguesa",
    price: 300000,
    stock: 2,
    active: true,
    prepared: true,
    cancellable: false,
  },
  {
    id: "water",
    name: "Agua",
    price: 100000,
    stock: 3,
    active: true,
    prepared: false,
    cancellable: true,
  },
];
const base = {
  settings,
  products,
  wallet: { balance: 1000000 },
  items: [{ productId: "burger", qty: 1 }],
  slotId: "r1",
  date: "2026-10-28",
  now,
};
test("El precio viene del catálogo y el total se calcula en centavos", () => {
  const q = quoteOrder({
    ...base,
    items: [{ productId: "burger", qty: 2, price: 1 }],
  });
  assert.equal(q.total, 600000);
  assert.equal(q.prepared, 2);
  assert.equal(q.items[0].cancellable, false);
});
test("No permite saldo insuficiente", () =>
  assert.throws(
    () => quoteOrder({ ...base, wallet: { balance: 299999 } }),
    /saldo/,
  ));
test("No permite pedir más stock del disponible", () =>
  assert.throws(
    () => quoteOrder({ ...base, items: [{ productId: "burger", qty: 3 }] }),
    /stock/,
  ));
test("El cupo de preparación cuenta unidades, no pedidos", () =>
  assert.throws(
    () =>
      quoteOrder({
        ...base,
        items: [{ productId: "burger", qty: 2 }],
        existing: [
          {
            date: base.date,
            slotId: "r1",
            status: "delivered",
            items: [{ prepared: true, qty: 1 }],
          },
        ],
      }),
    /preparación/,
  ));
test("Pedidos entregados ocupan su cupo; los cancelados lo liberan", () => {
  const order = {
    date: base.date,
    slotId: "r1",
    status: "delivered",
    items: [],
  };
  assert.throws(
    () => quoteOrder({ ...base, existing: [order, order] }),
    /cupo de pedidos/,
  );
  assert.equal(
    quoteOrder({
      ...base,
      existing: [{ ...order, status: "cancelled" }, order],
    }).total,
    300000,
  );
});
test("Rechaza pedidos después del cierre", () =>
  assert.throws(
    () => quoteOrder({ ...base, now: Date.parse("2026-10-28T09:50:00-03:00") }),
    /Cerró/,
  ));
test("Rechaza fechas pasadas o fuera de la semana", () => {
  for (const date of ["2026-10-27", "2026-12-01", "no-fecha"])
    assert.throws(() => quoteOrder({ ...base, date }), /fecha/);
});
test("Pausa y entrega al aula están controladas", () => {
  assert.throws(
    () => quoteOrder({ ...base, settings: { ...settings, paused: true } }),
    /pausó/,
  );
  assert.throws(() => quoteOrder({ ...base, delivery: "classroom" }), /aula/);
});
test("No admite cantidades negativas, decimales o ids duplicados", () => {
  for (const qty of [-1, 0, 1.5, 100])
    assert.throws(() =>
      quoteOrder({ ...base, items: [{ productId: "water", qty }] }),
    );
  assert.throws(
    () =>
      quoteOrder({
        ...base,
        items: [
          { productId: "water", qty: 1 },
          { productId: "water", qty: 1 },
        ],
      }),
    /duplicado/,
  );
});
test("El alumno no cancela preparados; el kiosquero sí", () => {
  const q = quoteOrder(base),
    order = { ...q, status: "received" };
  assert.throws(() => mayCancel(order, false, now, settings), /no permite/);
  assert.equal(mayCancel(order, true, now, settings), true);
});
test("Un pedido cancelado no vuelve a devolver dinero", () =>
  assert.throws(
    () => mayCancel({ status: "cancelled" }, true, now, settings),
    /cerrado/,
  ));
test("Cancelación de envasados solo antes del cierre y preparación", () => {
  const order = {
    status: "received",
    items: [{ cancellable: true }],
    date: base.date,
    slotId: "r1",
  };
  assert.equal(mayCancel(order, false, now, settings), true);
  assert.throws(() =>
    mayCancel({ ...order, status: "preparing" }, false, now, settings),
  );
  assert.throws(() => mayCancel(order, false, now + 3600000, settings));
});
test("No admite precios negativos ni stock decimal", () => {
  assert.throws(() => validateProduct({ ...products[0], price: -1 }));
  assert.throws(() => validateProduct({ ...products[0], stock: 1.5 }));
});
test("Valida cupos y evita recreos duplicados", () => {
  assert.throws(() =>
    validateSettings({
      ...settings,
      slots: [...settings.slots, ...settings.slots],
    }),
  );
  assert.throws(() => validateSettings({ ...settings, maxUnits: 0 }));
  assert.equal(validateSettings(settings).maxUnits, 5);
});
