// Solo ejecuta contra emuladores locales. Nunca utiliza un proyecto real.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
if (
  process.env.GCLOUD_PROJECT !== "demo-rekreo" ||
  process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099"
)
  throw Error("Usá únicamente los emuladores demo-rekreo. Ver README.");
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const api = await import("../functions/index.mjs");
const { getFirestore } = require("firebase-admin/firestore");
const db = getFirestore();
let passed = 0;
const ok = (msg) => {
  passed++;
  console.log("✓ " + msg);
};
async function signup(email) {
  const r = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password: "demo-test-password-123",
        returnSecureToken: true,
      }),
    },
  );
  const x = await r.json();
  if (!r.ok) throw Error(JSON.stringify(x));
  return {
    uid: x.localId,
    idToken: x.idToken,
    token: { email, name: email.split("@")[0], email_verified: true },
  };
}
const salt = Date.now(),
  [a, o, s1, s2] = await Promise.all(
    ["admin", "owner", "student1", "student2"].map((n) =>
      signup(`${n}-${salt}@example.test`),
    ),
  );
await db
  .collection("usuarios")
  .doc(a.uid)
  .set({ email: a.token.email, rol: "superadmin" });
const run = (name, auth, data) =>
  api[name].run({ auth: { uid: auth.uid, token: auth.token }, data });
const k = await run("createKiosk", a, {
  name: "Kiosko prueba",
  school: "Escuela prueba",
  internalName: "Cliente original",
  ownerName: "Dueño",
  ownerSurname: "Prueba",
  ownerEmail: o.token.email,
  productLimit: 100,
  imageLimit: 2,
  monthlyFee: 5000000,
});
const kid = k.id,
  base = db.collection("kiosks").doc(kid);
await assert.rejects(run("createKiosk", s1, { name: "forged" }));
ok("Alumno no puede dar de alta kioskos");
assert.equal(
  (
    await run(
      "resolveOwnerAccess",
      { ...o, token: { ...o.token, email_verified: false } },
      {},
    )
  ).status,
  "verification-required",
);
assert.equal(
  (await run("resolveOwnerAccess", s1, { email: o.token.email })).status,
  "not-authorized",
);
const automaticOwner = await run("resolveOwnerAccess", o, {});
assert.equal(automaticOwner.status, "authorized");
assert.equal(automaticOwner.kioskId, kid);
assert.equal((await run("resolveOwnerAccess", o, {})).kioskId, kid);
await assert.rejects(
  run("createKiosk", a, {
    name: "Duplicado",
    school: "Otra",
    ownerEmail: o.token.email,
  }),
);
ok(
  "Email autorizado y verificado vincula al dueño automáticamente; no acepta email del cliente ni duplicados",
);
await Promise.all(
  [s1, s2].map((s) => run("joinSchool", s, { code: k.code, course: "4 B" })),
);
const top = {
  kioskId: kid,
  userId: s1.uid,
  amount: 1000000,
  method: "cash",
  requestId: "duplicate-top",
};
await Promise.all([run("topup", o, top), run("topup", o, top)]);
assert.equal(
  (await base.collection("members").doc(s1.uid).get()).data().balance,
  1000000,
);
await assert.rejects(run("topup", s1, { ...top, requestId: "forged" }));
ok("Carga duplicada concurrente acredita una vez; alumno no puede recargarse");
await run("topup", o, { ...top, userId: s2.uid, requestId: "s2-top" });
const p = await run("saveProduct", o, {
  kioskId: kid,
  product: {
    name: "Agua",
    price: 100000,
    stock: 1,
    category: "Bebidas",
    active: true,
    prepared: false,
    cancellable: true,
  },
});
const sales = await Promise.all(
  ["sale-a", "sale-b"].map((requestId) =>
    run("createCounterSale", o, {
      kioskId: kid,
      requestId,
      items: [{ productId: p.id, qty: 1 }],
    }),
  ),
);
const outcomes = await Promise.allSettled([
  run("payCounterSale", s1, { kioskId: kid, saleId: sales[0].id }),
  run("payCounterSale", s2, { kioskId: kid, saleId: sales[1].id }),
]);
assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
assert.equal(
  (await base.collection("products").doc(p.id).get()).data().stock,
  0,
);
const winner = outcomes[0].status === "fulfilled" ? s1 : s2,
  index = winner === s1 ? 0 : 1;
await run("payCounterSale", winner, { kioskId: kid, saleId: sales[index].id });
assert.equal(
  (await base.collection("members").doc(winner.uid).get()).data().balance,
  900000,
);
ok(
  "Dos cobros compiten por una unidad: solo uno paga y repetirlo no duplica el débito",
);
const r = {
  kioskId: kid,
  userId: winner.uid,
  amount: 900000,
  method: "cash",
  reason: "Cierre",
  close: true,
  requestId: "refund-once",
};
await Promise.all([run("cashout", o, r), run("cashout", o, r)]);
assert.equal(
  (await base.collection("members").doc(winner.uid).get()).data().balance,
  0,
);
assert.equal(
  (await base.collection("members").doc(winner.uid).get()).data().disabled,
  true,
);
await assert.rejects(run("cashout", s1, r));
ok("Devolución concurrente es idempotente y exclusiva del dueño");
const clientBefore = (await db.collection("clients").doc(kid).get()).data()
  .internalName;
const settings = (await base.get()).data();
await run("saveSettings", o, {
  kioskId: kid,
  settings: { ...settings, name: "Nuevo nombre público" },
});
assert.equal(
  (await db.collection("clients").doc(kid).get()).data().internalName,
  clientBefore,
);
ok("Cambiar nombre público conserva referencia privada original");
const endpoint = `http://127.0.0.1:8080/v1/projects/demo-rekreo/databases/(default)/documents`;
const headers = {
  Authorization: "Bearer " + s1.idToken,
  "Content-Type": "application/json",
};
let res = await fetch(`${endpoint}/kiosks/${kid}/members/${s1.uid}`, {
  headers,
});
assert.equal(res.status, 200);
res = await fetch(`${endpoint}/kiosks/${kid}/members/${s2.uid}`, { headers });
assert.equal(res.status, 403);
res = await fetch(`${endpoint}/clients/${kid}`, { headers });
assert.equal(res.status, 403);
res = await fetch(
  `${endpoint}/kiosks/${kid}/members/${s1.uid}?updateMask.fieldPaths=balance`,
  {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      fields: { balance: { integerValue: "999999999" } },
    }),
  },
);
assert.equal(res.status, 403);
ok(
  "Reglas: alumno lee su saldo, no otro alumno ni datos fiscales, y no puede modificar dinero",
);
const other = await run("createKiosk", a, {
  name: "Otro",
  school: "Otra",
  ownerEmail: "other@example.test",
  productLimit: 100,
  imageLimit: 100,
  monthlyFee: 0,
});
const otherP = await run("saveProduct", a, {
  kioskId: other.id,
  product: { name: "Otro producto", price: 100, stock: 5, active: true },
});
res = await fetch(`${endpoint}/kiosks/${other.id}/products/${otherP.id}`, {
  headers,
});
assert.equal(res.status, 403);
ok("Reglas aíslan catálogos entre kioskos");
await base
  .collection("images")
  .doc("image1")
  .set({
    status: "active",
    url: "https://example.test/test.webp",
    publicId: `kiosks/${kid}/image1`,
  });
await base.update({ imageCount: 1 });
await assert.rejects(
  run("updateKioskPlan", a, {
    kioskId: kid,
    limits: { products: 100, images: 0 },
    monthlyFee: 0,
    client: {},
  }),
);
ok("Reducir cupo de imágenes verifica archivos registrados");
const overview = await run("platformOverview", a, {
  from: "2020-01-01",
  to: "2099-12-31",
});
assert.ok(overview.rows.find((x) => x.id === kid));
ok("Superadministrador puede consultar estadísticas y ficha del cliente");
const [s3, s4] = await Promise.all(
  ["student3", "student4"].map((n) => signup(`${n}-${salt}@example.test`)),
);
for (const st of [s3, s4]) {
  await run("joinSchool", st, { code: k.code, course: "5 A" });
  await run("topup", o, { ...top, userId: st.uid, requestId: st.uid });
}
const setting2 = (await base.get()).data();
setting2.slots[0].maxOrders = 1;
setting2.slots[0].maxPrepared = 1;
await run("saveSettings", o, { kioskId: kid, settings: setting2 });
const prep = await run("saveProduct", o, {
  kioskId: kid,
  product: {
    name: "Hamburguesa",
    price: 200000,
    stock: 10,
    active: true,
    prepared: true,
  },
});
const { localDate } = await import("../functions/domain.mjs");
const preReq = {
  kioskId: kid,
  slotId: "r1",
  date: localDate(new Date(Date.now() + 86400000)),
  items: [{ productId: prep.id, qty: 1 }],
};
const preResults = await Promise.allSettled([
  run("placeOrder", s3, { ...preReq, requestId: "pre-a" }),
  run("placeOrder", s4, { ...preReq, requestId: "pre-b" }),
]);
assert.equal(preResults.filter((r) => r.status === "fulfilled").length, 1);
assert.equal(
  (await base.collection("capacity").doc(`${preReq.date}_r1`).get()).data()
    .orders,
  1,
);
ok("Pedidos anticipados simultáneos respetan cupo del recreo y preparación");
const employee = await signup(`employee-${salt}@example.test`);
const { getAuth } = require("firebase-admin/auth");
await getAuth().updateUser(employee.uid, { emailVerified: true });
await run("manageStaff", o, { kioskId: kid, email: employee.token.email });
await assert.rejects(
  run("saveSettings", employee, { kioskId: kid, settings: setting2 }),
);
await assert.rejects(run("cashout", employee, r));
await run("manageStaff", o, {
  kioskId: kid,
  remove: true,
  userId: employee.uid,
});
await assert.rejects(run("topup", employee, { ...top, requestId: "revoked" }));
ok("Empleado no devuelve dinero ni configura y pierde acceso al ser removido");
// The admin document is the single source of global authority, for REST rules and handlers.
let forged = await fetch(
  `${endpoint}/usuarios/${s1.uid}?updateMask.fieldPaths=rol`,
  {
    method: "PATCH",
    headers,
    body: JSON.stringify({ fields: { rol: { stringValue: "superadmin" } } }),
  },
);
assert.equal(forged.status, 403);
await assert.rejects(
  run(
    "platformOverview",
    { ...s1, token: { ...s1.token, superadmin: true } },
    { from: "2020-01-01", to: "2099-12-31" },
  ),
);
await db.collection("usuarios").doc(a.uid).update({ rol: "alumno" });
await assert.rejects(
  run("platformOverview", a, { from: "2020-01-01", to: "2099-12-31" }),
);
await db.collection("usuarios").doc(a.uid).update({ rol: "superadmin" });
assert.ok(
  (await run("platformOverview", a, { from: "2020-01-01", to: "2099-12-31" }))
    .rows.length,
);
ok(
  "Usuarios protegido: no hay autoascenso, el claim antiguo se ignora y revocar/restaurar rol cambia permisos del servidor",
);
console.log(`\n${passed} verificaciones de integración y reglas correctas.`);
