import { isPlatformAdmin } from "./permissions.mjs";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { v2 as cloudinary } from "cloudinary";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import {
  quoteCounter,
  assertRefund,
  assertLimits,
  summary,
} from "./business.mjs";
import {
  quoteOrder,
  mayCancel,
  validateProduct,
  validateSettings,
  DomainError,
  money,
} from "./domain.mjs";
initializeApp();
const db = getFirestore();
const region = "southamerica-east1";
const cloudSecret = defineSecret("CLOUDINARY_API_SECRET"),
  cloudName = defineString("CLOUDINARY_CLOUD_NAME"),
  cloudKey = defineString("CLOUDINARY_API_KEY"),
  cloudPreset = defineString("CLOUDINARY_UPLOAD_PRESET");
function endpoint(fn, options = {}) {
  return onCall({ region, maxInstances: 10, ...options }, async (req) => {
    if (!req.auth)
      throw new HttpsError("unauthenticated", "Iniciá sesión para continuar.");
    try {
      const actorProfile = await db
        .collection("usuarios")
        .doc(req.auth.uid)
        .get();
      if (actorProfile.data()?.activo === false)
        throw new HttpsError(
          "permission-denied",
          "Tu cuenta fue desactivada. Contactá a reKreo.",
        );
      req.platformAdmin = isPlatformAdmin(actorProfile.data());
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      if (e instanceof DomainError)
        throw new HttpsError("failed-precondition", e.message);
      console.error("Operation failed", { code: e.code, name: e.name });
      throw new HttpsError(
        "internal",
        "No se pudo completar la operación. Intentá nuevamente.",
      );
    }
  });
}
function id(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 128 ||
    value.includes("/")
  )
    throw new HttpsError("invalid-argument", "Identificador inválido.");
  return value;
}
function base(req) {
  return db.collection("kiosks").doc(id(req.data.kioskId));
}
async function staff(req, k, tx) {
  if (req.platformAdmin === true) return;
  const ref = k.collection("members").doc(req.auth.uid),
    s = tx ? await tx.get(ref) : await ref.get();
  if (!["owner", "staff"].includes(s.data()?.role))
    throw new HttpsError(
      "permission-denied",
      "No tenés permisos para administrar este kiosco.",
    );
}
const record = (userId, type, amount, balanceAfter, note, actor) => ({
  userId,
  type,
  amount,
  balanceAfter,
  note,
  actor,
  createdAt: FieldValue.serverTimestamp(),
});
export const joinSchool = endpoint(async (req) => {
  const code = String(req.data.code || "")
      .trim()
      .toUpperCase(),
    course = String(req.data.course || "")
      .trim()
      .slice(0, 60);
  if (!/^[A-Z0-9-]{4,20}$/.test(code) || !course)
    throw new HttpsError(
      "invalid-argument",
      "Ingresá un código de escuela y curso válidos.",
    );
  const map = await db.collection("schoolCodes").doc(code).get();
  if (!map.exists)
    throw new HttpsError("not-found", "No encontramos ese código de escuela.");
  const kioskId = map.data().kioskId,
    k = db.collection("kiosks").doc(kioskId),
    user = db.collection("usuarios").doc(req.auth.uid),
    m = k.collection("members").doc(req.auth.uid);
  await db.runTransaction(async (tx) => {
    const [u, member, kiosk] = await Promise.all([
      tx.get(user),
      tx.get(m),
      tx.get(k),
    ]);
    if (!kiosk.exists)
      throw new HttpsError("not-found", "Escuela no disponible.");
    if (kiosk.data()?.closed)
      throw new DomainError("Este kiosko ya no recibe alumnos.");
    if (!member.exists)
      tx.create(m, {
        name: String(req.auth.token.name || "Alumno").slice(0, 100),
        email: req.auth.token.email || "",
        course,
        role: "student",
        balance: 0,
        createdAt: FieldValue.serverTimestamp(),
      });
    tx.set(
      user,
      {
        kioskId,
        kioskIds: FieldValue.arrayUnion(kioskId),
        rol: u.data()?.rol || "alumno",
        email: req.auth.token.email || "",
      },
      { merge: true },
    );
  });
  return { kioskId };
});
export const placeOrder = endpoint(async (req) => {
  const k = base(req),
    requestId = id(req.data.requestId),
    orderRef = k.collection("orders").doc(requestId),
    m = k.collection("members").doc(req.auth.uid);
  if (!Array.isArray(req.data.items) || req.data.items.length > 50)
    throw new HttpsError("invalid-argument", "Carrito inválido.");
  const ids = req.data.items.map((x) => id(x.productId));
  const slotId = id(req.data.slotId),
    date = String(req.data.date),
    cap = k.collection("capacity").doc(`${date}_${slotId}`);
  return db.runTransaction(async (tx) => {
    const [settings, member, capacity, previous] = await Promise.all([
      tx.get(k),
      tx.get(m),
      tx.get(cap),
      tx.get(orderRef),
    ]);
    if (
      !settings.exists ||
      !member.exists ||
      member.data().role !== "student" ||
      member.data().disabled ||
      settings.data()?.closed
    )
      throw new HttpsError(
        "permission-denied",
        "Tu cuenta no está habilitada como alumno de este kiosco.",
      );
    if (previous.exists) {
      if (previous.data().studentId !== req.auth.uid)
        throw new HttpsError("permission-denied", "Pedido inválido.");
      return { id: previous.id, ...previous.data(), createdAt: Date.now() };
    }
    const products = await Promise.all(
      ids.map(async (pid) => {
        const s = await tx.get(k.collection("products").doc(pid));
        return s.exists ? { id: s.id, ...s.data() } : null;
      }),
    );
    const q = quoteOrder({
      ...req.data,
      products: products.filter(Boolean),
      wallet: member.data(),
      settings: settings.data(),
      existing: [],
    });
    const limits = settings.data().slots.find((s) => s.id === slotId),
      count = capacity.data() || { orders: 0, prepared: 0 };
    if (count.orders >= limits.maxOrders)
      throw new DomainError("Este recreo alcanzó su cupo de pedidos.");
    if (count.prepared + q.prepared > limits.maxPrepared)
      throw new DomainError("Este recreo alcanzó su cupo de preparación.");
    const order = {
      ...q,
      code: `R-${requestId.replaceAll("-", "").slice(0, 8).toUpperCase()}`,
      studentId: req.auth.uid,
      studentName: member.data().name,
      course: member.data().course,
      status: "received",
      channel: "preorder",
      createdAt: FieldValue.serverTimestamp(),
    };
    const balance = member.data().balance - q.total;
    tx.update(m, { balance });
    for (const line of q.items) {
      const p = products.find((p) => p?.id === line.productId);
      tx.update(k.collection("products").doc(line.productId), {
        stock: p.stock - line.qty,
      });
    }
    tx.set(cap, {
      orders: count.orders + 1,
      prepared: count.prepared + q.prepared,
    });
    tx.create(orderRef, order);
    tx.create(
      k.collection("movements").doc(),
      record(
        req.auth.uid,
        "purchase",
        -q.total,
        balance,
        `Pedido ${order.code}`,
        member.data().name,
      ),
    );
    return { id: orderRef.id, ...order, createdAt: Date.now() };
  });
});
export const topup = endpoint(async (req) => {
  const k = base(req),
    m = k.collection("members").doc(id(req.data.userId)),
    ref = k.collection("topups").doc(id(req.data.requestId));
  money(req.data.amount);
  if (
    req.data.amount < 1 ||
    req.data.amount > 100000000 ||
    !["cash", "transfer"].includes(req.data.method)
  )
    throw new HttpsError(
      "invalid-argument",
      "Ingresá un importe entre $0,01 y $1.000.000 y un medio válido.",
    );
  return db.runTransaction(async (tx) => {
    await staff(req, k, tx);
    const [member, done] = await Promise.all([tx.get(m), tx.get(ref)]);
    if (done.exists) return { duplicate: true };
    if (!member.exists || member.data().role !== "student")
      throw new HttpsError("not-found", "Alumno no encontrado.");
    if (member.data().disabled)
      throw new DomainError("Esta cuenta está desactivada.");
    const kiosk = await tx.get(k);
    if (kiosk.data()?.closed) throw new DomainError("El kiosko está cerrado.");
    const balance = member.data().balance + req.data.amount;
    money(balance);
    tx.update(m, { balance });
    tx.create(ref, {
      userId: m.id,
      amount: req.data.amount,
      method: req.data.method,
      actor: req.auth.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.create(k.collection("movements").doc(), {
      ...record(
        m.id,
        "topup",
        req.data.amount,
        balance,
        `Carga ${req.data.method === "cash" ? "en efectivo" : "por transferencia verificada"}${req.data.note ? " · " + String(req.data.note).slice(0, 150) : ""}`,
        req.auth.token.name || req.auth.token.email || req.auth.uid,
      ),
      method: req.data.method,
      requestId: req.data.requestId,
    });
    return { balance };
  });
});
export const cancelOrder = endpoint(async (req) => {
  const k = base(req),
    ref = k.collection("orders").doc(id(req.data.orderId));
  const reason = String(req.data.reason || "")
    .trim()
    .slice(0, 150);
  if (!reason) throw new HttpsError("invalid-argument", "Ingresá un motivo.");
  return db.runTransaction(async (tx) => {
    const [order, actor, settings] = await Promise.all([
      tx.get(ref),
      tx.get(k.collection("members").doc(req.auth.uid)),
      tx.get(k),
    ]);
    if (!order.exists)
      throw new HttpsError("not-found", "Pedido no encontrado.");
    const o = order.data(),
      isStaff =
        req.platformAdmin === true ||
        ["owner", "staff"].includes(actor.data()?.role);
    if (!isStaff && o.studentId !== req.auth.uid)
      throw new HttpsError(
        "permission-denied",
        "No tenés acceso a este pedido.",
      );
    mayCancel(o, isStaff, Date.now(), settings.data());
    const memberRef = k.collection("members").doc(o.studentId),
      cap = k.collection("capacity").doc(`${o.date}_${o.slotId}`);
    const [member, capacity, ...products] = await Promise.all([
      tx.get(memberRef),
      tx.get(cap),
      ...o.items.map((i) => tx.get(k.collection("products").doc(i.productId))),
    ]);
    if (!member.exists)
      throw new HttpsError(
        "failed-precondition",
        "No se encontró la cuenta a reintegrar.",
      );
    const balance = member.data().balance + o.total;
    money(balance);
    tx.update(memberRef, { balance });
    tx.update(ref, {
      status: "cancelled",
      cancelReason: reason,
      cancelledBy: req.auth.uid,
      cancelledAt: FieldValue.serverTimestamp(),
    });
    o.items.forEach((i, index) => {
      if (products[index].exists)
        tx.update(products[index].ref, {
          stock: products[index].data().stock + i.qty,
        });
    });
    if (capacity.exists)
      tx.update(cap, {
        orders: Math.max(0, capacity.data().orders - 1),
        prepared: Math.max(0, capacity.data().prepared - o.prepared),
      });
    tx.create(
      k.collection("movements").doc(),
      record(
        o.studentId,
        "refund",
        o.total,
        balance,
        `Devolución ${o.code} · ${reason}`,
        req.auth.token.name || req.auth.uid,
      ),
    );
    return { balance };
  });
});
export const setOrderStatus = endpoint(async (req) => {
  const k = base(req),
    ref = k.collection("orders").doc(id(req.data.orderId));
  return db.runTransaction(async (tx) => {
    await staff(req, k, tx);
    const [order, settings] = await Promise.all([tx.get(ref), tx.get(k)]);
    if (!order.exists)
      throw new HttpsError("not-found", "Pedido no encontrado.");
    const o = order.data(),
      next = req.data.status;
    if (["delivered", "cancelled", "uncollected"].includes(o.status))
      throw new DomainError("El pedido ya está cerrado.");
    if (
      ![
        "delivered",
        "uncollected",
        ...(settings.data().preparationEnabled ? ["preparing", "ready"] : []),
      ].includes(next)
    )
      throw new DomainError("Estado no permitido.");
    if (
      (next === "preparing" && o.status !== "received") ||
      (next === "ready" && !["received", "preparing"].includes(o.status))
    )
      throw new DomainError("Transición de estado inválida.");
    tx.update(ref, {
      status: next,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: req.auth.uid,
    });
    return {};
  });
});
async function owner(req, k, tx) {
  if (req.platformAdmin === true) return;
  const ref = k.collection("members").doc(req.auth.uid),
    m = tx ? await tx.get(ref) : await ref.get();
  if (m.data()?.role !== "owner")
    throw new HttpsError(
      "permission-denied",
      "Solo el dueño puede realizar esta operación.",
    );
}
function admin(req) {
  if (req.platformAdmin !== true)
    throw new HttpsError(
      "permission-denied",
      "Solo el administrador de reKreo.",
    );
}
const audit = (req, k, type, detail) =>
  k.collection("audit").add({
    type,
    detail,
    actor: req.auth.uid,
    actorName: req.auth.token.name || req.auth.token.email || req.auth.uid,
    createdAt: FieldValue.serverTimestamp(),
  });
const cleanClient = (d) =>
  Object.fromEntries(
    [
      "internalName",
      "ownerName",
      "ownerSurname",
      "ownerEmail",
      "dni",
      "address",
      "taxId",
      "taxStatus",
      "paymentAlias",
      "bankAccount",
      "phone",
      "notes",
    ].map((x) => [
      x,
      String(d?.[x] || "")
        .trim()
        .slice(0, x === "notes" ? 1000 : 200),
    ]),
  );
export const saveProduct = endpoint(async (req) => {
  const k = base(req),
    p = validateProduct(req.data.product),
    ref = req.data.product.id
      ? k.collection("products").doc(id(req.data.product.id))
      : k.collection("products").doc();
  p.galleryId = req.data.product.galleryId
    ? id(req.data.product.galleryId)
    : "";
  return db.runTransaction(async (tx) => {
    await staff(req, k, tx);
    const [settings, old] = await Promise.all([tx.get(k), tx.get(ref)]);
    if (!settings.exists) throw new DomainError("Kiosko no encontrado.");
    if (p.galleryId) {
      const image = await tx.get(k.collection("images").doc(p.galleryId));
      if (image.data()?.status !== "active")
        throw new DomainError("La imagen ya no está disponible.");
      p.imageUrl = image.data().url;
      p.imageId = image.data().publicId;
    } else {
      p.imageUrl = "";
      p.imageId = "";
    }
    const count = settings.data().productCount || 0,
      delta = Number(p.active) - Number(!!old.data()?.active);
    if (delta > 0 && count >= (settings.data().limits?.products ?? 100))
      throw new DomainError(
        "Llegaste al límite de productos activos del plan.",
      );
    tx.set(
      ref,
      {
        ...p,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: req.auth.uid,
      },
      { merge: true },
    );
    tx.update(k, { productCount: Math.max(0, count + delta) });
    tx.create(k.collection("audit").doc(), {
      type: "product",
      detail: p.name,
      actor: req.auth.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { id: ref.id };
  });
});
export const deleteProduct = endpoint(async (req) => {
  const k = base(req),
    ref = k.collection("products").doc(id(req.data.productId));
  return db.runTransaction(async (tx) => {
    await staff(req, k, tx);
    const [p, kiosk] = await Promise.all([tx.get(ref), tx.get(k)]);
    if (!p.exists) return {};
    tx.delete(ref);
    if (p.data().active)
      tx.update(k, {
        productCount: Math.max(0, (kiosk.data().productCount || 0) - 1),
      });
    return {};
  });
});
export const saveSettings = endpoint(async (req) => {
  const k = base(req);
  await owner(req, k);
  const s = validateSettings(req.data.settings);
  delete s.code;
  await k.update({ ...s, updatedAt: FieldValue.serverTimestamp() });
  await audit(req, k, "settings", "Configuración del kiosko");
  return {};
});
function normalizedOwnerEmail(value) {
  const email = String(value || "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new DomainError("Ingresá un email válido para el dueño.");
  return email;
}
const ownerEmailRef = (email) =>
  db
    .collection("ownerEmails")
    .doc(createHash("sha256").update(email).digest("hex"));
export const createKiosk = endpoint(async (req) => {
  admin(req);
  const k = db.collection("kiosks").doc(),
    code = String(req.data.code || "K" + randomBytes(3).toString("hex"))
      .trim()
      .toUpperCase();
  if (!/^[A-Z0-9-]{4,20}$/.test(code))
    throw new DomainError("Código inválido.");
  const client = cleanClient({
    ...req.data,
    internalName: req.data.internalName || req.data.name,
  });
  client.ownerEmail = normalizedOwnerEmail(client.ownerEmail);
  const limits = {
    products: Number(req.data.productLimit ?? 100),
    images: Number(req.data.imageLimit ?? 100),
  };
  assertLimits(limits, { products: 0, images: 0 });
  const monthlyFee = Number(req.data.monthlyFee || 0);
  money(monthlyFee);
  const s = validateSettings({
    name: req.data.name,
    school: req.data.school,
    code,
    maxUnits: 5,
    paused: false,
    notice: "Pedí antes. Disfrutá el recreo.",
    slots: [
      {
        id: "r1",
        label: "Primer recreo",
        time: "10:20",
        cutoffMinutes: 10,
        maxOrders: 20,
        maxPrepared: 10,
      },
      {
        id: "r2",
        label: "Segundo recreo",
        time: "11:40",
        cutoffMinutes: 10,
        maxOrders: 20,
        maxPrepared: 10,
      },
    ],
  });
  const mapping = db.collection("schoolCodes").doc(code),
    authorization = ownerEmailRef(client.ownerEmail);
  await db.runTransaction(async (tx) => {
    const [exists, authorized] = await Promise.all([
      tx.get(mapping),
      tx.get(authorization),
    ]);
    if (exists.exists) throw new DomainError("El código ya está en uso.");
    if (authorized.exists)
      throw new DomainError(
        "Ese email ya está autorizado como dueño de otro kiosko.",
      );
    tx.create(k, {
      ...s,
      limits,
      monthlyFee,
      plan: String(req.data.plan || "Inicial").slice(0, 50),
      productCount: 0,
      imageCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      closed: false,
    });
    tx.create(mapping, { kioskId: k.id });
    tx.create(db.collection("clients").doc(k.id), {
      ...client,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.create(authorization, {
      kioskId: k.id,
      email: client.ownerEmail,
      authorizedAt: FieldValue.serverTimestamp(),
      authorizedBy: req.auth.uid,
    });
  });
  return { id: k.id, code, ownerEmail: client.ownerEmail };
});
export const resolveOwnerAccess = endpoint(async (req) => {
  if (!req.auth.token.email_verified)
    return { status: "verification-required" };
  const email = normalizedOwnerEmail(req.auth.token.email),
    authorization = ownerEmailRef(email);
  return db.runTransaction(async (tx) => {
    const allowed = await tx.get(authorization);
    if (!allowed.exists) return { status: "not-authorized" };
    const k = db.collection("kiosks").doc(allowed.data().kioskId),
      memberRef = k.collection("members").doc(req.auth.uid);
    const [settings, member] = await Promise.all([
      tx.get(k),
      tx.get(memberRef),
    ]);
    if (!settings.exists) return { status: "not-authorized" };
    if (settings.data().ownerUid && settings.data().ownerUid !== req.auth.uid)
      throw new DomainError(
        "Este kiosko ya está vinculado a otra cuenta. Contactá a reKreo.",
      );
    if (member.exists && member.data().role !== "owner")
      throw new DomainError(
        "Este email ya tiene otro rol en este kiosko. Contactá a reKreo para resolverlo.",
      );
    if (!member.exists)
      tx.create(memberRef, {
        role: "owner",
        name: req.auth.token.name || email,
        email,
        balance: 0,
        course: "",
        createdAt: FieldValue.serverTimestamp(),
      });
    tx.update(k, { ownerUid: req.auth.uid });
    tx.set(
      db.collection("usuarios").doc(req.auth.uid),
      {
        kioskId: k.id,
        kioskIds: FieldValue.arrayUnion(k.id),
        rol: "kioskero",
        email,
      },
      { merge: true },
    );
    return { status: "authorized", role: "owner", kioskId: k.id };
  });
});
export const updateKioskPlan = endpoint(async (req) => {
  admin(req);
  const k = base(req);
  money(req.data.monthlyFee);
  return db.runTransaction(async (tx) => {
    const clientRef = db.collection("clients").doc(k.id);
    const [settings, images, oldClient] = await Promise.all([
      tx.get(k),
      tx.get(k.collection("images")),
      tx.get(clientRef),
    ]);
    const clean = cleanClient({ ...oldClient.data(), ...req.data.client });
    clean.ownerEmail = normalizedOwnerEmail(clean.ownerEmail);
    const oldEmail = String(oldClient.data()?.ownerEmail || "")
        .trim()
        .toLowerCase(),
      newAuthorization = ownerEmailRef(clean.ownerEmail),
      existingAuthorization = await tx.get(newAuthorization);
    if (
      existingAuthorization.exists &&
      existingAuthorization.data().kioskId !== k.id
    )
      throw new DomainError("Ese email ya está autorizado para otro kiosko.");
    if (settings.data()?.ownerUid && oldEmail !== clean.ownerEmail)
      throw new DomainError(
        "El dueño ya ingresó. El cambio de titular requiere un trámite separado.",
      );
    if (!settings.exists) throw new DomainError("Kiosko no encontrado.");
    assertLimits(req.data.limits, {
      products: settings.data().productCount || 0,
      images: images.size,
    });
    tx.update(k, {
      limits: req.data.limits,
      monthlyFee: req.data.monthlyFee,
      plan: String(req.data.plan || "Inicial").slice(0, 50),
    });
    if (oldEmail && oldEmail !== clean.ownerEmail)
      tx.delete(ownerEmailRef(oldEmail));
    tx.set(newAuthorization, {
      kioskId: k.id,
      email: clean.ownerEmail,
      authorizedAt: FieldValue.serverTimestamp(),
      authorizedBy: req.auth.uid,
    });
    tx.set(clientRef, clean, { merge: true });
    return {};
  });
});
export const closeKiosk = endpoint(async (req) => {
  admin(req);
  const k = base(req);
  await k.update({ closed: !!req.data.closed, paused: !!req.data.closed });
  await audit(req, k, "close", "Estado: " + !!req.data.closed);
  return {};
});
export const setMemberStatus = endpoint(async (req) => {
  const k = base(req);
  await owner(req, k);
  const ref = k.collection("members").doc(id(req.data.userId));
  await db.runTransaction(async (tx) => {
    const m = await tx.get(ref);
    if (m.data()?.role !== "student")
      throw new DomainError("Alumno no encontrado.");
    tx.update(ref, { disabled: !!req.data.disabled });
  });
  return {};
});
export const cashout = endpoint(async (req) => {
  const k = base(req),
    ref = k.collection("members").doc(id(req.data.userId)),
    done = k.collection("cashouts").doc(id(req.data.requestId));
  if (
    !["cash", "transfer"].includes(req.data.method) ||
    !String(req.data.reason || "").trim()
  )
    throw new DomainError("Indicá medio y motivo de devolución.");
  return db.runTransaction(async (tx) => {
    await owner(req, k, tx);
    const [m, previous, orders] = await Promise.all([
      tx.get(ref),
      tx.get(done),
      tx.get(k.collection("orders").where("studentId", "==", ref.id)),
    ]);
    if (previous.exists) return { duplicate: true };
    assertRefund({
      member: m.exists ? { id: m.id, ...m.data() } : null,
      amount: req.data.amount,
      orders: orders.docs.map((d) => d.data()),
    });
    if (req.data.close && req.data.amount !== m.data().balance)
      throw new DomainError("Devolvé todo el saldo antes de cerrar la cuenta.");
    const balance = m.data().balance - req.data.amount;
    tx.update(ref, { balance, ...(req.data.close ? { disabled: true } : {}) });
    const recordData = {
      ...record(
        ref.id,
        "cashout",
        -req.data.amount,
        balance,
        String(req.data.reason).slice(0, 200),
        req.auth.token.name || req.auth.uid,
      ),
      method: req.data.method,
      requestId: req.data.requestId,
    };
    tx.create(done, {
      amount: req.data.amount,
      userId: ref.id,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.create(k.collection("movements").doc(), recordData);
    return { balance };
  });
});
export const createCounterSale = endpoint(async (req) => {
  const k = base(req),
    ref = k.collection("counterSales").doc(id(req.data.requestId));
  if (!Array.isArray(req.data.items) || req.data.items.length > 50)
    throw new DomainError("Carrito inválido.");
  return db.runTransaction(async (tx) => {
    await staff(req, k, tx);
    const [settings, previous, ...products] = await Promise.all([
      tx.get(k),
      tx.get(ref),
      ...req.data.items.map((i) =>
        tx.get(k.collection("products").doc(id(i.productId))),
      ),
    ]);
    if (previous.exists) return { id: ref.id, ...previous.data() };
    const quote = quoteCounter(
      req.data.items,
      products.filter((d) => d.exists).map((d) => ({ id: d.id, ...d.data() })),
      settings.data(),
    );
    const c = {
      ...quote,
      status: "pending",
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60000,
      actor: req.auth.uid,
    };
    tx.create(ref, c);
    return { id: ref.id, ...c };
  });
});
export const getCounterSale = endpoint(async (req) => {
  const k = base(req),
    m = await k.collection("members").doc(req.auth.uid).get();
  if (!m.exists && req.platformAdmin !== true)
    throw new DomainError("Unite a este kiosko primero.");
  const c = await k.collection("counterSales").doc(id(req.data.saleId)).get();
  if (!c.exists) throw new DomainError("Cobro no encontrado.");
  const d = c.data();
  return {
    id: c.id,
    items: d.items,
    total: d.total,
    status: d.status,
    expiresAt: d.expiresAt,
  };
});
export const cancelCounterSale = endpoint(async (req) => {
  const k = base(req);
  return db.runTransaction(async (tx) => {
    await staff(req, k, tx);
    const ref = k.collection("counterSales").doc(id(req.data.saleId)),
      c = await tx.get(ref);
    if (c.data()?.status !== "pending")
      throw new DomainError("El cobro ya está cerrado.");
    tx.update(ref, { status: "cancelled" });
    return {};
  });
});
export const payCounterSale = endpoint(async (req) => {
  const k = base(req),
    ref = k.collection("counterSales").doc(id(req.data.saleId)),
    member = k.collection("members").doc(req.auth.uid);
  return db.runTransaction(async (tx) => {
    const [c, m, settings] = await Promise.all([
      tx.get(ref),
      tx.get(member),
      tx.get(k),
    ]);
    if (!m.exists || m.data().role !== "student" || m.data().disabled)
      throw new DomainError("Cuenta no habilitada.");
    const sale = c.data();
    if (!sale) throw new DomainError("Cobro no encontrado.");
    if (sale.status === "paid") {
      if (sale.studentId !== req.auth.uid)
        throw new DomainError("El cobro ya fue pagado.");
      return { id: ref.id, ...sale };
    }
    if (sale.status !== "pending" || sale.expiresAt < Date.now())
      throw new DomainError("Este QR está vencido o cancelado.");
    const products = await Promise.all(
      sale.items.map((i) => tx.get(k.collection("products").doc(i.productId))),
    );
    const q = quoteCounter(
      sale.items,
      products.filter((p) => p.exists).map((p) => ({ id: p.id, ...p.data() })),
      settings.data(),
    );
    if (
      q.total !== sale.total ||
      q.items.some((i, n) => i.price !== sale.items[n].price)
    )
      throw new DomainError(
        "Cambiaron los precios. Pedile al kioskero otro QR.",
      );
    if (m.data().balance < sale.total)
      throw new DomainError("No tenés saldo suficiente.");
    const balance = m.data().balance - sale.total,
      code = "M-" + ref.id.slice(0, 8).toUpperCase();
    tx.update(member, { balance });
    products.forEach((p, i) =>
      tx.update(p.ref, { stock: p.data().stock - sale.items[i].qty }),
    );
    tx.update(ref, {
      status: "paid",
      studentId: req.auth.uid,
      studentName: m.data().name,
      paidAt: FieldValue.serverTimestamp(),
    });
    tx.create(k.collection("orders").doc("pos-" + ref.id), {
      ...q,
      channel: "counter",
      code,
      status: "delivered",
      studentId: req.auth.uid,
      studentName: m.data().name,
      course: m.data().course,
      date: new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Argentina/Buenos_Aires",
      }).format(new Date()),
      slotLabel: "Mostrador",
      slotTime: "Entrega inmediata",
      delivery: "pickup",
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.create(
      k.collection("movements").doc(),
      record(
        req.auth.uid,
        "purchase",
        -sale.total,
        balance,
        "Compra en mostrador " + code,
        m.data().name,
      ),
    );
    return { id: ref.id, status: "paid" };
  });
});
export const platformOverview = endpoint(async (req) => {
  admin(req);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(req.data.from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(req.data.to)
  )
    throw new DomainError("Fechas inválidas.");
  const kiosks = await db.collection("kiosks").get();
  const rows = [];
  for (const k of kiosks.docs) {
    const [orders, members, movements, images, client] = await Promise.all(
      ["orders", "members", "movements", "images"]
        .map((n) => k.ref.collection(n).get())
        .concat(db.collection("clients").doc(k.id).get()),
    );
    rows.push({
      id: k.id,
      ...summary(
        {
          orders: orders.docs.map((x) => x.data()),
          members: members.docs.map((x) => ({ id: x.id, ...x.data() })),
          movements: movements.docs.map((x) => x.data()),
        },
        req.data.from,
        req.data.to,
      ),
      imageCount: images.size,
      productCount: k.data().productCount || 0,
      client: client.data() || {},
    });
  }
  return { rows };
});
function cloudConfig() {
  cloudinary.config({
    cloud_name: cloudName.value(),
    api_key: cloudKey.value(),
    api_secret: cloudSecret.value(),
    secure: true,
  });
}
export const imageSignature = endpoint(
  async (req) => {
    const k = base(req),
      imageId = randomUUID(),
      public_id = `kiosks/${k.id}/${imageId}`,
      timestamp = Math.floor(Date.now() / 1000),
      upload_preset = cloudPreset.value();
    await db.runTransaction(async (tx) => {
      await staff(req, k, tx);
      const settings = await tx.get(k);
      if (
        (settings.data().imageCount || 0) >=
        (settings.data().limits?.images ?? 100)
      )
        throw new DomainError("Llegaste al límite de imágenes del plan.");
      tx.create(k.collection("images").doc(imageId), {
        status: "pending",
        publicId: public_id,
        name: String(req.data.name || "Foto").slice(0, 100),
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.update(k, { imageCount: (settings.data().imageCount || 0) + 1 });
    });
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, public_id, upload_preset },
      cloudSecret.value(),
    );
    return {
      imageId,
      timestamp,
      public_id,
      upload_preset,
      signature,
      api_key: cloudKey.value(),
      cloud_name: cloudName.value(),
    };
  },
  { secrets: [cloudSecret] },
);
export const finalizeImage = endpoint(
  async (req) => {
    const k = base(req);
    await staff(req, k);
    const ref = k.collection("images").doc(id(req.data.imageId)),
      pending = await ref.get();
    if (!pending.exists) throw new DomainError("Carga no encontrada.");
    if (pending.data().status === "active")
      return { id: ref.id, ...pending.data() };
    if (pending.data().status !== "pending")
      throw new DomainError("La imagen se está eliminando.");
    cloudConfig();
    const asset = await cloudinary.api.resource(pending.data().publicId, {
      resource_type: "image",
    });
    if (asset.bytes > 102400 || asset.format !== "webp") {
      await cloudinary.uploader.destroy(asset.public_id, { invalidate: true });
      throw new DomainError(
        "La imagen debe ser WebP y pesar como máximo 100 KB. Eliminá la carga pendiente e intentá de nuevo.",
      );
    }
    return db.runTransaction(async (tx) => {
      const img = await tx.get(ref);
      if (img.data()?.status !== "pending" && img.data()?.status !== "active")
        throw new DomainError("Carga ya cancelada.");
      const data = {
        url: asset.secure_url,
        bytes: asset.bytes,
        status: "active",
      };
      tx.update(ref, data);
      return { id: ref.id, ...data };
    });
  },
  { secrets: [cloudSecret] },
);
export const deleteImage = endpoint(
  async (req) => {
    const k = base(req),
      ref = k.collection("images").doc(id(req.data.imageId));
    await staff(req, k);
    const image = await db.runTransaction(async (tx) => {
      const img = await tx.get(ref);
      if (!img.exists) return null;
      tx.update(ref, { status: "deleting" });
      return img.data();
    });
    if (!image) return {};
    const products = await k
      .collection("products")
      .where("galleryId", "==", ref.id)
      .get();
    for (let n = 0; n < products.size; n += 400) {
      const batch = db.batch();
      products.docs
        .slice(n, n + 400)
        .forEach((p) =>
          batch.update(p.ref, { galleryId: "", imageId: "", imageUrl: "" }),
        );
      await batch.commit();
    }
    cloudConfig();
    const response = await cloudinary.uploader.destroy(image.publicId, {
      invalidate: true,
    });
    if (!["ok", "not found"].includes(response.result))
      throw new DomainError(
        "Cloudinary no confirmó el borrado. El cupo sigue ocupado; reintentá.",
      );
    await db.runTransaction(async (tx) => {
      const [img, settings] = await Promise.all([tx.get(ref), tx.get(k)]);
      if (img.exists) {
        tx.delete(ref);
        tx.update(k, {
          imageCount: Math.max(0, (settings.data().imageCount || 0) - 1),
        });
      }
    });
    return {};
  },
  { secrets: [cloudSecret] },
);
export const getSchoolInfo = onCall(
  { region, maxInstances: 5 },
  async (req) => {
    const code = String(req.data?.code || "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z0-9-]{4,20}$/.test(code))
      throw new HttpsError("invalid-argument", "Código inválido.");
    const map = await db.collection("schoolCodes").doc(code).get();
    if (!map.exists)
      throw new HttpsError("not-found", "No encontramos ese kiosko.");
    const k = await db.collection("kiosks").doc(map.data().kioskId).get();
    if (!k.exists || k.data().closed)
      throw new HttpsError("not-found", "Este kiosko no está disponible.");
    return { code, name: k.data().name, school: k.data().school };
  },
);
export const manageStaff = endpoint(async (req) => {
  const k = base(req);
  await owner(req, k);
  if (req.data.remove) {
    const uid = id(req.data.userId);
    await db.runTransaction(async (tx) => {
      const ref = k.collection("members").doc(uid),
        m = await tx.get(ref),
        u = db.collection("usuarios").doc(uid),
        profile = await tx.get(u);
      if (m.data()?.role !== "staff")
        throw new DomainError("Solo se pueden quitar empleados.");
      tx.delete(ref);
      if (profile.exists)
        tx.update(u, {
          kioskIds: FieldValue.arrayRemove(k.id),
          rol: "alumno",
          ...(profile.data().kioskId === k.id
            ? { kioskId: FieldValue.delete() }
            : {}),
        });
    });
    await audit(req, k, "staff", "Empleado removido");
    return {};
  }
  let u;
  try {
    u = await getAuth().getUserByEmail(String(req.data.email || "").trim());
  } catch {
    throw new DomainError(
      "El empleado debe crear su cuenta y verificar su email primero.",
    );
  }
  if (!u.emailVerified)
    throw new DomainError("El empleado debe verificar su email.");
  await db.runTransaction(async (tx) => {
    const ref = k.collection("members").doc(u.uid),
      m = await tx.get(ref);
    if (m.exists)
      throw new DomainError(
        "La cuenta ya tiene un rol en este kiosko. Usá una cuenta exclusiva para el empleado.",
      );
    tx.create(ref, {
      name: u.displayName || u.email,
      email: u.email,
      role: "staff",
      balance: 0,
      course: "",
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(
      db.collection("usuarios").doc(u.uid),
      {
        kioskId: k.id,
        kioskIds: FieldValue.arrayUnion(k.id),
        rol: "empleado",
        email: u.email,
      },
      { merge: true },
    );
  });
  await audit(req, k, "staff", "Empleado autorizado: " + u.email);
  return {};
});
