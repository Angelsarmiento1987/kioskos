import test from "node:test";
import assert from "node:assert/strict";
import {
  quoteCounter,
  assertRefund,
  assertLimits,
  summary,
} from "../shared/business.mjs";
import { localDate } from "../shared/domain.mjs";
const p = [{ id: "a", name: "Agua", price: 100000, stock: 2, active: true }];
test("Mostrador calcula desde catálogo y rechaza stock, duplicados y precio cliente", () => {
  assert.equal(
    quoteCounter([{ productId: "a", qty: 2, price: 1 }], p, {}).total,
    200000,
  );
  assert.throws(
    () => quoteCounter([{ productId: "a", qty: 3 }], p, {}),
    /Stock/,
  );
  assert.throws(() =>
    quoteCounter(
      [
        { productId: "a", qty: 1 },
        { productId: "a", qty: 1 },
      ],
      p,
      {},
    ),
  );
  assert.throws(() =>
    quoteCounter([{ productId: "a", qty: 1 }], p, { closed: true }),
  );
});
test("Devolución respeta saldo y pedidos pendientes", () => {
  const member = { id: "u", role: "student", balance: 1000 };
  assert.throws(() => assertRefund({ member, amount: 1001, orders: [] }));
  assert.throws(() =>
    assertRefund({
      member,
      amount: 1000,
      orders: [{ studentId: "u", status: "received" }],
    }),
  );
  assert.doesNotThrow(() =>
    assertRefund({
      member,
      amount: 1000,
      orders: [{ studentId: "u", status: "delivered" }],
    }),
  );
});
test("Reducir el plan exige eliminar el excedente real", () => {
  assert.throws(
    () =>
      assertLimits(
        { products: 100, images: 100 },
        { products: 50, images: 200 },
      ),
    /Antes de reducir/,
  );
  assert.doesNotThrow(() =>
    assertLimits(
      { products: 200, images: 100 },
      { products: 200, images: 100 },
    ),
  );
});
test("Caja separa ingreso, venta y devolución sin duplicar dinero", () => {
  const now = Date.now(),
    s = summary(
      {
        members: [{ id: "u", role: "student", balance: 500000 }],
        orders: [
          {
            studentId: "u",
            total: 300000,
            status: "delivered",
            channel: "counter",
            createdAt: now,
          },
          {
            studentId: "u",
            total: 100000,
            status: "cancelled",
            createdAt: now,
          },
        ],
        movements: [
          { type: "topup", amount: 1000000, method: "cash", createdAt: now },
          { type: "purchase", amount: -300000, createdAt: now },
          { type: "cashout", amount: -200000, method: "cash", createdAt: now },
        ],
      },
      localDate(),
      localDate(),
    );
  assert.equal(s.sales, 300000);
  assert.equal(s.topups, 1000000);
  assert.equal(s.cashNet, 800000);
  assert.equal(s.balance, 500000);
  assert.equal(s.counter, 300000);
  assert.equal(s.withBalance, 1);
});
