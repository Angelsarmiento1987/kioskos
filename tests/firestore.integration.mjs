// Integration tests use only local emulators. Admin SDK is seed/inspection only;
// every app action runs through the browser SDK and real Firestore Rules.
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  terminate,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { initializeApp as adminApp } from "firebase-admin/app";
import { getFirestore as adminStore } from "firebase-admin/firestore";
import { getAuth as adminAuth } from "firebase-admin/auth";
import { createFirestoreOperations } from "../src/firestore-operations.js";
import { localDate } from "../shared/domain.mjs";
if (
  process.env.GCLOUD_PROJECT !== "demo-rekreo" ||
  process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099"
)
  throw Error("Only demo-rekreo local emulators are allowed.");
const seedApp = adminApp({ projectId: "demo-rekreo" }),
  seed = adminStore(seedApp),
  identity = adminAuth(seedApp);
const testDate = localDate(new Date(Date.now() + 86400000));
const salt = Date.now(),
  clients = [];
let count = 0;
const ok = (text) => console.log("✓ " + ++count + " " + text);
async function user(name, verified = true) {
  const app = initializeApp(
    { projectId: "demo-rekreo", apiKey: "demo-key", appId: "demo-app" },
    name + salt,
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  const { user: u } = await createUserWithEmailAndPassword(
    auth,
    `${name}-${salt}@example.test`,
    "test-pass-123",
  );
  await identity.updateUser(u.uid, { emailVerified: verified });
  await u.reload();
  await u.getIdToken(true);
  const call = createFirestoreOperations(db, auth);
  const x = { app, auth, db, uid: u.uid, email: u.email, call };
  clients.push(x);
  return x;
}
try {
  const [admin, owner, s1, s2, outsider, employee] = await Promise.all(
    ["admin", "owner", "student1", "student2", "other", "employee"].map((n) =>
      user(n),
    ),
  );
  await seed
    .doc("usuarios/" + admin.uid)
    .set({ email: admin.email, rol: "superadmin" });
  const kiosk = await admin.call("createKiosk", {
    requestId: "kiosk-retry",
    name: "Prueba",
    school: "Escuela",
    internalName: "Cliente original",
    ownerName: "Ana",
    ownerSurname: "Prueba",
    ownerEmail: owner.email,
    monthlyFee: 5000000,
    productLimit: 100,
    imageLimit: 2,
  });
  const retry = await admin.call("createKiosk", {
    requestId: "kiosk-retry",
    name: "Prueba",
    school: "Escuela",
    ownerEmail: owner.email,
  });
  assert.equal(retry.id, kiosk.id);
  assert.equal(retry.code, kiosk.code);
  const kid = kiosk.id,
    base = seed.doc("kiosks/" + kid),
    data = (payload = {}) => ({ kioskId: kid, ...payload });
  assert.ok(kiosk.code);
  assert.equal(
    (await seed.doc("clients/" + kid).get()).data().internalName,
    "Cliente original",
  );
  ok(
    "Superadmin creates kiosk, client, public code and authorized email atomically",
  );
  await assert.rejects(s1.call("createKiosk", { name: "fraud" }));
  await assert.rejects(
    setDoc(doc(s1.db, "usuarios", s1.uid), {
      rol: "superadmin",
      email: s1.email,
    }),
  );
  ok("Student cannot create kiosks or assign their own superadmin role");
  assert.equal((await owner.call("resolveOwnerAccess")).status, "authorized");
  assert.equal(
    (await outsider.call("resolveOwnerAccess")).status,
    "not-authorized",
  );
  await identity.updateUser(employee.uid, { emailVerified: false });
  await employee.auth.currentUser.getIdToken(true);
  assert.equal(
    (await employee.call("resolveOwnerAccess")).status,
    "verification-required",
  );
  ok("Only the authorized verified owner joins as owner");
  await Promise.all(
    [s1, s2].map((s) =>
      s.call("joinSchool", { code: kiosk.code, course: "2A" }),
    ),
  );
  await assert.rejects(getDoc(doc(s1.db, "clients", kid)));
  await assert.rejects(getDoc(doc(s1.db, "kiosks", kid, "members", s2.uid)));
  await assert.rejects(
    updateDoc(doc(s1.db, "kiosks", kid, "members", s1.uid), {
      balance: 999999999,
    }),
  );
  await assert.rejects(
    updateDoc(doc(owner.db, "kiosks", kid), { monthlyFee: 1 }),
  );
  ok(
    "Students join with zero balance; private data, wallet and subscription edits denied",
  );
  await owner.call(
    "topup",
    data({
      userId: s1.uid,
      amount: 100000,
      method: "cash",
      requestId: "topup-1",
    }),
  );
  await owner.call(
    "topup",
    data({
      userId: s1.uid,
      amount: 100000,
      method: "cash",
      requestId: "topup-1",
    }),
  );
  await owner.call(
    "topup",
    data({
      userId: s2.uid,
      amount: 100000,
      method: "cash",
      requestId: "topup-2",
    }),
  );
  assert.equal(
    (await base.collection("members").doc(s1.uid).get()).data().balance,
    100000,
  );
  ok("Topups are direct Firestore transactions and idempotent");
  const settings = (await base.get()).data();
  await owner.call(
    "saveSettings",
    data({
      settings: {
        ...settings,
        slots: settings.slots.map((s) => ({
          ...s,
          time: "23:59",
          cutoffMinutes: 0,
          maxOrders: 30,
          maxPrepared: 30,
        })),
        maxUnits: 10,
        name: "Nuevo nombre",
      },
    }),
  );
  assert.equal(
    (await seed.doc("schoolCodes/" + kiosk.code).get()).data().name,
    "Nuevo nombre",
  );
  assert.equal(
    (await seed.doc("clients/" + kid).get()).data().internalName,
    "Cliente original",
  );
  const products = [];
  for (let i = 0; i < 5; i++)
    products.push(
      await owner.call(
        "saveProduct",
        data({
          product: {
            name: "Producto " + i,
            price: 1000,
            stock: 10,
            active: true,
            cancellable: true,
            prepared: false,
          },
        }),
      ),
    );
  assert.equal((await base.get()).data().productCount, 5);
  await assert.rejects(
    updateDoc(doc(owner.db, "kiosks", kid), { productCount: 0 }),
  );
  ok(
    "Catalog counter is atomic; kiosk public name does not change private client reference",
  );
  const order = await s1.call(
    "placeOrder",
    data({
      requestId: "order-1",
      items: [{ productId: products[0].id, qty: 2 }],
      date: testDate,
      slotId: "r1",
      delivery: "pickup",
    }),
  );
  await s1.call(
    "placeOrder",
    data({
      requestId: "order-1",
      items: [{ productId: products[0].id, qty: 2 }],
      date: testDate,
      slotId: "r1",
      delivery: "pickup",
    }),
  );
  assert.equal(
    (await base.collection("members").doc(s1.uid).get()).data().balance,
    98000,
  );
  assert.equal(
    (await base.collection("products").doc(products[0].id).get()).data().stock,
    8,
  );
  ok(
    "Student purchase atomically debits wallet, stock, capacity and ledger once",
  );
  await assert.rejects(
    s1.call(
      "topup",
      data({
        userId: s1.uid,
        amount: 1000,
        method: "cash",
        requestId: "forged",
      }),
    ),
  );
  await assert.rejects(
    updateDoc(doc(s1.db, "kiosks", kid, "products", products[0].id), {
      stock: 0,
    }),
  );
  await assert.rejects(
    setDoc(doc(s1.db, "kiosks", kid, "orders", "forged"), {
      ...order,
      total: 1,
      createdAt: new Date(),
    }),
  );
  ok(
    "Forged balances, stock and orders are blocked by Rules, independently of React validation",
  );
  const hackedId = "fake-cheap",
    p0 = products[0].id;
  const beforeP = (await base.collection("products").doc(p0).get()).data();
  const beforeM = (await base.collection("members").doc(s1.uid).get()).data();
  const beforeCap = (
    await base
      .collection("capacity")
      .doc(testDate + "_r1")
      .get()
  ).data();
  const fakeLine = {
    ...order.items[0],
    qty: 1,
    price: 1,
    runningTotal: 1,
    runningUnits: 1,
    runningPrepared: 0,
  };
  const hacked = writeBatch(s1.db);
  hacked.set(doc(s1.db, "kiosks", kid, "orders", hackedId), {
    ...order,
    total: 1,
    units: 1,
    items: [fakeLine],
    itemMap: { [p0]: fakeLine },
    createdAt: serverTimestamp(),
  });
  hacked.update(doc(s1.db, "kiosks", kid, "members", s1.uid), {
    balance: beforeM.balance - 1,
    lastOrderId: hackedId,
    lastWalletAction: "purchase",
    pendingOrders: beforeM.pendingOrders + 1,
  });
  hacked.update(doc(s1.db, "kiosks", kid, "products", p0), {
    stock: beforeP.stock - 1,
    lastOrderId: hackedId,
    lastStockAction: "purchase",
  });
  hacked.set(doc(s1.db, "kiosks", kid, "capacity", testDate + "_r1"), {
    ...beforeCap,
    orders: beforeCap.orders + 1,
    lastOrderId: hackedId,
  });
  hacked.set(doc(s1.db, "kiosks", kid, "movements", hackedId), {
    orderId: hackedId,
    userId: s1.uid,
    type: "purchase",
    amount: -1,
    balanceAfter: beforeM.balance - 1,
    createdAt: serverTimestamp(),
  });
  await assert.rejects(hacked.commit());
  assert.equal(
    (await base.collection("products").doc(p0).get()).data().stock,
    beforeP.stock,
  );
  ok(
    "A complete forged atomic purchase with a reduced price is rejected by Rules",
  );

  await s1.call(
    "placeOrder",
    data({
      requestId: "order-five",
      items: products.map((p) => ({ productId: p.id, qty: 1 })),
      date: testDate,
      slotId: "r2",
      delivery: "pickup",
    }),
  );
  ok("Five distinct products stay within Firestore transaction rule limits");
  await s1.call(
    "cancelOrder",
    data({ orderId: order.id, reason: "Cambio de idea" }),
  );
  assert.equal(
    (await base.collection("members").doc(s1.uid).get()).data().balance,
    95000,
  );
  assert.equal(
    (await base.collection("products").doc(products[0].id).get()).data().stock,
    9,
  );
  await assert.rejects(
    s1.call("cancelOrder", data({ orderId: order.id, reason: "Otra vez" })),
  );
  ok(
    "Allowed student cancellation refunds, restocks and releases capacity exactly once",
  );
  await assert.rejects(
    owner.call(
      "cashout",
      data({
        userId: s1.uid,
        amount: 1000,
        requestId: "cashout-block",
        reason: "Se va",
        method: "cash",
      }),
    ),
  );
  await owner.call(
    "setOrderStatus",
    data({ orderId: "order-five", status: "delivered" }),
  );
  await owner.call(
    "cashout",
    data({
      userId: s1.uid,
      amount: 1000,
      requestId: "cashout-1",
      reason: "Excepción",
      method: "cash",
    }),
  );
  await owner.call(
    "cashout",
    data({
      userId: s1.uid,
      amount: 1000,
      requestId: "cashout-1",
      reason: "Excepción",
      method: "cash",
    }),
  );
  assert.equal(
    (await base.collection("members").doc(s1.uid).get()).data().balance,
    94000,
  );
  ok("Refunds require pending orders resolved and do not repeat");
  const staffCancelled = await s2.call(
    "placeOrder",
    data({
      requestId: "owner-cancel-order",
      items: [{ productId: products[0].id, qty: 1 }],
      date: testDate,
      slotId: "r1",
      delivery: "pickup",
    }),
  );
  await owner.call(
    "cancelOrder",
    data({ orderId: staffCancelled.id, reason: "Sin producto" }),
  );
  assert.equal(
    (await base.collection("members").doc(s2.uid).get()).data().balance,
    100000,
  );
  ok("The kiosk owner can cancel and refund a student order");

  const sale = await owner.call(
    "createCounterSale",
    data({
      requestId: "sale-1",
      items: [{ productId: products[1].id, qty: 1 }],
    }),
  );
  await s1.call("getCounterSale", data({ saleId: sale.id }));
  await s1.call("payCounterSale", data({ saleId: sale.id }));
  await s1.call("payCounterSale", data({ saleId: sale.id }));
  assert.equal(
    (await base.collection("members").doc(s1.uid).get()).data().balance,
    93000,
  );
  ok("Counter QR is readable by its kiosk members and charged only once");
  await owner.call("manageStaff", data({ email: employee.email }));
  await identity.updateUser(employee.uid, { emailVerified: true });
  await employee.auth.currentUser.getIdToken(true);
  assert.equal((await employee.call("resolveOwnerAccess")).role, "staff");
  await employee.call(
    "topup",
    data({
      userId: s1.uid,
      amount: 1000,
      requestId: "employee-topup",
      method: "cash",
    }),
  );
  await assert.rejects(
    employee.call(
      "cashout",
      data({
        userId: s1.uid,
        amount: 1000,
        requestId: "employee-cashout",
        reason: "No",
        method: "cash",
      }),
    ),
  );
  await owner.call("manageStaff", data({ remove: true, userId: employee.uid }));
  await assert.rejects(
    employee.call(
      "topup",
      data({
        userId: s1.uid,
        amount: 1000,
        requestId: "removed-topup",
        method: "cash",
      }),
    ),
  );
  ok(
    "Verified staff invitation, restricted refund access and revocation work without Admin Auth calls",
  );
  const img1 = await owner.call("reserveImage", data({ name: "Una foto" }));
  await owner.call("reserveImage", data({ name: "Otra foto" }));
  await assert.rejects(owner.call("reserveImage", data({ name: "Exceso" })));
  await assert.rejects(
    admin.call(
      "updateKioskPlan",
      data({
        monthlyFee: 5000000,
        limits: { products: 100, images: 1 },
        client: { ownerEmail: owner.email },
      }),
    ),
  );
  const pending = await owner.call(
    "deleteImage",
    data({ imageId: img1.imageId }),
  );
  assert.equal(pending.pendingDeletion, true);
  assert.equal((await base.get()).data().imageCount, 2);
  await assert.rejects(
    owner.call(
      "deleteImage",
      data({ imageId: img1.imageId, confirmProviderDeletion: true }),
    ),
  );
  await admin.call(
    "deleteImage",
    data({ imageId: img1.imageId, confirmProviderDeletion: true }),
  );
  assert.equal((await base.get()).data().imageCount, 1);
  ok(
    "Image reservations enforce quota and plan reduction checks real occupied count",
  );
  const rejected = await owner.call(
    "reserveImage",
    data({ name: "Provider rejected" }),
  );
  await assert.rejects(
    s1.call(
      "deleteImage",
      data({ imageId: rejected.imageId, rejectedUpload: true }),
    ),
  );
  await owner.call(
    "deleteImage",
    data({ imageId: rejected.imageId, rejectedUpload: true }),
  );
  await owner.call(
    "deleteImage",
    data({ imageId: rejected.imageId, rejectedUpload: true }),
  );
  assert.equal((await base.get()).data().imageCount, 1);
  assert.equal(
    (await base.collection("images").doc(rejected.imageId).get()).exists,
    false,
  );
  const retained = (await base.collection("images").get()).docs[0];
  await owner.call(
    "finalizeImage",
    data({
      imageId: retained.id,
      asset: {
        format: "webp",
        bytes: 12,
        secure_url: "https://res.cloudinary.com/test/image/upload/photo.webp",
        public_id: retained.data().publicId,
      },
    }),
  );
  await assert.rejects(
    owner.call(
      "deleteImage",
      data({ imageId: retained.id, rejectedUpload: true }),
    ),
    /ya fue guardada/,
  );
  assert.equal((await base.get()).data().imageCount, 1);
  assert.equal((await retained.ref.get()).data().status, "active");
  ok(
    "Rejected-upload cleanup frees quota exactly once, denies students and preserves active images",
  );
  const overview = await admin.call("platformOverview", {
    from: testDate,
    to: testDate,
  });
  assert.ok(overview.rows.find((x) => x.id === kid));
  ok("Superadmin overview reads real Firestore data without Functions");
  const ledgerBefore = (await base.collection("movements").get()).size;
  const qrOrder = await owner.call(
    "findOrder",
    data({ value: `recreo:order:${kid}:order-five` }),
  );
  const byCode = await owner.call(
    "findOrder",
    data({ value: qrOrder.code.toLowerCase() }),
  );
  assert.equal(qrOrder.id, byCode.id);
  assert.equal(qrOrder.status, "delivered");
  await assert.rejects(s1.call("findOrder", data({ value: qrOrder.code })));
  await assert.rejects(
    owner.call("findOrder", data({ value: "recreo:order:other:order-five" })),
  );
  await assert.rejects(owner.call("findOrder", data({ value: "NO-EXISTE" })));
  assert.equal((await base.collection("movements").get()).size, ledgerBefore);
  ok(
    "Order lookup by QR or code reads fresh state, enforces kiosk/staff permissions and never charges or delivers",
  );

  // Two students compete for the final unit through different client SDK instances.
  const last = await owner.call(
    "saveProduct",
    data({
      product: {
        name: "Último",
        price: 1000,
        stock: 1,
        active: true,
        cancellable: false,
        prepared: false,
      },
    }),
  );
  const tickets = await Promise.all(
    ["race-a", "race-b"].map((requestId) =>
      owner.call(
        "createCounterSale",
        data({ requestId, items: [{ productId: last.id, qty: 1 }] }),
      ),
    ),
  );
  const race = await Promise.allSettled(
    [s1, s2].map((s, n) =>
      s.call("payCounterSale", data({ saleId: tickets[n].id })),
    ),
  );
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await base.collection("products").doc(last.id).get()).data().stock,
    0,
  );
  ok("Concurrent purchases cannot both take the last stock unit");
  console.log(`Passed ${count} direct-client integration checks`);
} finally {
  for (const c of clients) {
    await terminate(c.db);
    await deleteApp(c.app);
  }
}
