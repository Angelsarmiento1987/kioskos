import test from "node:test";
import assert from "node:assert/strict";
// Node 24 experimental Web Locks are not used for browser-local fixture tests.
Object.defineProperty(globalThis, "navigator", {
  value: {},
  configurable: true,
});
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => mem.set(k, v),
  removeItem: (k) => mem.delete(k),
};
globalThis.window = { dispatchEvent() {} };
const { getDemo, demoAction, demoSnapshot, resetDemo } = await import(
  "./fixtures/demo.js"
);
const owner = {
    uid: "staff-1",
    name: "Dueño",
    role: "owner",
    kioskId: "escuela-sol",
  },
  student = {
    uid: "student-1",
    name: "Sofía",
    role: "student",
    kioskId: "escuela-sol",
  };
function prepare() {
  resetDemo();
  const s = getDemo();
  for (const slot of s.kiosks[0].slots) {
    slot.time = "23:59";
    slot.cutoffMinutes = 0;
  }
  localStorage.setItem("recreo-demo-v1", JSON.stringify(s));
  return s;
}
test("La misma solicitud de carga acredita una sola vez", async () => {
  prepare();
  const req = {
    userId: student.uid,
    amount: 100000,
    method: "cash",
    requestId: "top-1",
  };
  await demoAction("topup", req, owner);
  await demoAction("topup", req, owner);
  assert.equal(demoSnapshot(owner.kioskId).members[0].balance, 1100000);
  assert.equal(
    demoSnapshot(owner.kioskId).movements.filter((m) => m.requestId === "top-1")
      .length,
    1,
  );
});
test("El alumno no puede cargar saldo", async () => {
  prepare();
  await assert.rejects(
    demoAction(
      "topup",
      { userId: student.uid, amount: 100000, requestId: "forged" },
      student,
    ),
    /permisos/,
  );
});
test("La misma compra no descuenta dos veces y cancelar repone una sola vez", async () => {
  prepare();
  const { localDate } = await import("../shared/domain.mjs");
  const req = {
    items: [{ productId: "p2", qty: 1 }],
    slotId: "r1",
    date: localDate(new Date(Date.now() + 86400000)),
    requestId: "order-1",
  };
  const a = await demoAction("placeOrder", req, student);
  await demoAction("placeOrder", req, student);
  let s = demoSnapshot(owner.kioskId);
  assert.equal(s.members[0].balance, 580000);
  assert.equal(s.products.find((p) => p.id === "p2").stock, 11);
  await demoAction(
    "cancelOrder",
    { orderId: a.id, reason: "Sin producto" },
    owner,
  );
  s = demoSnapshot(owner.kioskId);
  assert.equal(s.members[0].balance, 1000000);
  assert.equal(s.products.find((p) => p.id === "p2").stock, 12);
  await assert.rejects(
    demoAction("cancelOrder", { orderId: a.id, reason: "Repetido" }, owner),
    /cerrado/,
  );
});
test("Un nuevo kiosco tiene inventario, alumnos e historial independientes", async () => {
  prepare();
  await demoAction(
    "createKiosk",
    { name: "Otro kiosco", school: "Otra escuela", code: "OTRA24" },
    { ...owner, role: "superadmin" },
  );
  const s = getDemo(),
    newK = s.kiosks.find((k) => k.code === "OTRA24"),
    snapshot = demoSnapshot(newK.id);
  assert.equal(snapshot.products.length, 0);
  assert.equal(snapshot.orders.length, 0);
  assert.equal(snapshot.movements.length, 0);
  assert.equal(snapshot.members.filter((m) => m.role === "student").length, 0);
});
test("El QR de mostrador se paga una sola vez y no genera otra carga de dinero", async () => {
  prepare();
  const c = await demoAction(
    "createCounterSale",
    { requestId: "counter-one", items: [{ productId: "p3", qty: 1 }] },
    owner,
  );
  await demoAction("payCounterSale", { saleId: c.id }, student);
  await demoAction("payCounterSale", { saleId: c.id }, student);
  const s = demoSnapshot(owner.kioskId);
  assert.equal(s.members[0].balance, 880000);
  assert.equal(s.products.find((p) => p.id === "p3").stock, 35);
  assert.equal(s.orders.filter((o) => o.channel === "counter").length, 1);
  assert.equal(s.movements.filter((m) => m.type === "topup").length, 1);
});
test("Reutilizar una foto no consume cupo; borrarla desvincula productos sin eliminarlos", async () => {
  prepare();
  await demoAction(
    "saveImage",
    { name: "Bebida", url: "https://example.test/a.webp", bytes: 50000 },
    owner,
  );
  const image = demoSnapshot(owner.kioskId).images[0];
  for (const pid of ["p4", "p5"]) {
    const product = demoSnapshot(owner.kioskId).products.find(
      (p) => p.id === pid,
    );
    await demoAction(
      "saveProduct",
      { product: { ...product, galleryId: image.id } },
      owner,
    );
  }
  assert.equal(demoSnapshot(owner.kioskId).images.length, 1);
  await demoAction("deleteImage", { imageId: image.id }, owner);
  const s = demoSnapshot(owner.kioskId);
  assert.equal(s.images.length, 0);
  assert.equal(s.products.length, 9);
  assert.ok(
    s.products
      .filter((p) => ["p4", "p5"].includes(p.id))
      .every((p) => !p.imageUrl && !p.galleryId),
  );
});
test("Devolución excepcional es idempotente y cierre desactiva sin borrar historial", async () => {
  prepare();
  const req = {
    userId: student.uid,
    amount: 1000000,
    method: "cash",
    reason: "Cierre",
    close: true,
    requestId: "return-one",
  };
  await demoAction("cashout", req, owner);
  await demoAction("cashout", req, owner);
  const s = demoSnapshot(owner.kioskId);
  assert.equal(s.members[0].balance, 0);
  assert.equal(s.members[0].disabled, true);
  assert.equal(s.movements.filter((m) => m.type === "cashout").length, 1);
  assert.ok(s.movements.some((m) => m.type === "topup"));
});
test("Solo superadmin modifica planes y no permite bajar con fotos excedentes", async () => {
  prepare();
  await demoAction(
    "saveImage",
    { name: "1", url: "https://example.test/a", bytes: 1 },
    owner,
  );
  await assert.rejects(
    demoAction(
      "updateKioskPlan",
      { limits: { images: 0, products: 100 }, monthlyFee: 0 },
      owner,
    ),
    /permisos/,
  );
  await assert.rejects(
    demoAction(
      "updateKioskPlan",
      { limits: { images: 0, products: 100 }, monthlyFee: 0 },
      { ...owner, role: "superadmin" },
    ),
    /Antes de reducir/,
  );
});

test('QR and manual lookup open the same order without modifying money, stock or state', async()=>{
 prepare();
 const before=localStorage.getItem('recreo-demo-v1');
 const qr=await demoAction('findOrder',{value:'recreo:order:escuela-sol:o-demo-1'},owner);
 const manual=await demoAction('findOrder',{value:' r-1042 '},owner);
 assert.equal(qr.id,manual.id);
 assert.equal(localStorage.getItem('recreo-demo-v1'),before);
 await assert.rejects(demoAction('findOrder',{value:'recreo:order:other:o-demo-1'},owner),/otro kiosko/);
 await assert.rejects(demoAction('findOrder',{value:'NO-EXISTE'},owner),/No encontramos/);
 await assert.rejects(demoAction('findOrder',{value:'R-1042'},student),/permisos/);
 const delivered=await demoAction('findOrder',{value:'R-1041'},owner);
 assert.equal(delivered.status,'delivered');
});
