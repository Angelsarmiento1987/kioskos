import { parseOrderLookup } from "../shared/order-qr.mjs";
import { newId } from "./id.js";
import { isPlatformAdmin } from "../shared/permissions.mjs";
import { browserDatabase, FieldValue } from "./firestore-client.js";
import {
  quoteCounter,
  assertRefund,
  assertLimits,
  summary,
} from "../shared/business.mjs";
import {
  quoteOrder,
  mayCancel,
  validateProduct,
  validateSettings,
  DomainError,
  money,
} from "../shared/domain.mjs";
class AccessError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const HttpsError = AccessError;
function countedItems(items) {
  let total = 0,
    units = 0,
    prepared = 0;
  return items.map((i, index) => {
    total += i.price * i.qty;
    units += i.qty;
    prepared += i.prepared ? i.qty : 0;
    return {
      ...i,
      index,
      runningTotal: total,
      runningUnits: units,
      runningPrepared: prepared,
    };
  });
}
export function createFirestoreOperations(database, auth) {
  const db = browserDatabase(database);
  function endpoint(fn) {
    return async (data = {}) => {
      const u = auth.currentUser;
      if (!u)
        throw new AccessError(
          "unauthenticated",
          "Iniciá sesión para continuar.",
        );
      const profile = await db.collection("usuarios").doc(u.uid).get();
      if (profile.data()?.activo === false)
        throw new AccessError("permission-denied", "Cuenta desactivada.");
      const token = (await u.getIdTokenResult()).claims;
      return fn({
        data,
        auth: { uid: u.uid, token },
        platformAdmin: isPlatformAdmin(profile.data()),
      });
    };
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
  const record = (
    userId,
    type,
    amount,
    balanceAfter,
    note,
    actor,
    orderId = "",
  ) => ({
    orderId,
    userId,
    type,
    amount,
    balanceAfter,
    note,
    actor,
    createdAt: FieldValue.serverTimestamp(),
  });
  const joinSchool = endpoint(async (req) => {
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
      throw new HttpsError(
        "not-found",
        "No encontramos ese código de escuela.",
      );
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
          schoolCode: code,
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
  const placeOrder = endpoint(async (req) => {
    const k = base(req),
      requestId = id(req.data.requestId),
      orderRef = k.collection("orders").doc(requestId),
      m = k.collection("members").doc(req.auth.uid);
    if (!Array.isArray(req.data.items) || req.data.items.length > 5)
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
      q.items = countedItems(q.items);
      const order = {
        ...q,
        itemMap: Object.fromEntries(q.items.map((i) => [i.productId, i])),
        slotIndex: settings.data().slots.findIndex((s) => s.id === slotId),
        code: `R-${requestId.replaceAll("-", "").slice(0, 8).toUpperCase()}`,
        studentId: req.auth.uid,
        studentName: member.data().name,
        course: member.data().course,
        status: "received",
        channel: "preorder",
        createdAt: FieldValue.serverTimestamp(),
      };
      const balance = member.data().balance - q.total;
      tx.update(m, {
        balance,
        lastOrderId: orderRef.id,
        lastWalletAction: "purchase",
        pendingOrders: (member.data().pendingOrders || 0) + 1,
      });
      for (const line of q.items) {
        const p = products.find((p) => p?.id === line.productId);
        tx.update(k.collection("products").doc(line.productId), {
          stock: p.stock - line.qty,
          lastOrderId: orderRef.id,
          lastStockAction: "purchase",
        });
      }
      tx.set(cap, {
        orders: count.orders + 1,
        prepared: count.prepared + q.prepared,
        lastOrderId: orderRef.id,
      });
      tx.create(orderRef, order);
      tx.create(
        k.collection("movements").doc(orderRef.id),
        record(
          req.auth.uid,
          "purchase",
          -q.total,
          balance,
          `Pedido ${order.code}`,
          member.data().name,
          orderRef.id,
        ),
      );
      return { id: orderRef.id, ...order, createdAt: Date.now() };
    });
  });
  const topup = endpoint(async (req) => {
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
      if (kiosk.data()?.closed)
        throw new DomainError("El kiosko está cerrado.");
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
  const cancelOrder = endpoint(async (req) => {
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
        ...o.items.map((i) =>
          tx.get(k.collection("products").doc(i.productId)),
        ),
      ]);
      if (!member.exists)
        throw new HttpsError(
          "failed-precondition",
          "No se encontró la cuenta a reintegrar.",
        );
      const balance = member.data().balance + o.total;
      money(balance);
      tx.update(memberRef, {
        balance,
        lastOrderId: ref.id,
        lastWalletAction: "cancel",
        pendingOrders: Math.max(0, (member.data().pendingOrders || 0) - 1),
      });
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
            lastOrderId: ref.id,
            lastStockAction: "cancel",
          });
      });
      if (capacity.exists)
        tx.update(cap, {
          orders: Math.max(0, capacity.data().orders - 1),
          prepared: Math.max(0, capacity.data().prepared - o.prepared),
          lastOrderId: ref.id,
        });
      tx.create(
        k.collection("movements").doc("refund-" + ref.id),
        record(
          o.studentId,
          "refund",
          o.total,
          balance,
          `Devolución ${o.code} · ${reason}`,
          req.auth.token.name || req.auth.uid,
          ref.id,
        ),
      );
      return { balance };
    });
  });
  const setOrderStatus = endpoint(async (req) => {
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
      if (
        ["delivered", "uncollected"].includes(next) &&
        o.channel !== "counter"
      ) {
        const memberRef = k.collection("members").doc(o.studentId);
        const member = await tx.get(memberRef);
        tx.update(memberRef, {
          pendingOrders: Math.max(0, (member.data().pendingOrders || 0) - 1),
        });
      }
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
  const saveProduct = endpoint(async (req) => {
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
      tx.update(k, {
        productCount: Math.max(0, count + delta),
        lastProductId: ref.id,
      });
      tx.create(k.collection("audit").doc(), {
        type: "product",
        detail: p.name,
        actor: req.auth.uid,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { id: ref.id };
    });
  });
  const deleteProduct = endpoint(async (req) => {
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
          lastProductId: ref.id,
        });
      return {};
    });
  });
  const saveSettings = endpoint(async (req) => {
    const k = base(req);
    await owner(req, k);
    const s = validateSettings(req.data.settings);
    delete s.code;
    await db.runTransaction(async (tx) => {
      const settings = await tx.get(k);
      tx.update(k, { ...s, updatedAt: FieldValue.serverTimestamp() });
      tx.update(db.collection("schoolCodes").doc(settings.data().code), {
        name: s.name,
        school: s.school,
      });
    });
    await audit(req, k, "settings", "Configuración del kiosko");
    return {};
  });
  function normalizedOwnerEmail(value) {
    const email = String(value || "")
      .trim()
      .toLowerCase();
    if (email.includes("/") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new DomainError("Ingresá un email válido para el dueño.");
    return email;
  }
  const ownerEmailRef = (email) => db.collection("ownerEmails").doc(email);
  const createKiosk = endpoint(async (req) => {
    admin(req);
    const k = db
        .collection("kiosks")
        .doc(req.data.requestId ? id(req.data.requestId) : undefined),
      code = String(
        req.data.code || "K" + newId().replaceAll("-", "").slice(0, 6),
      )
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
    return db.runTransaction(async (tx) => {
      const previous = await tx.get(k);
      if (previous.exists) {
        const storedClient = await tx.get(db.collection("clients").doc(k.id));
        return {
          id: k.id,
          code: previous.data().code,
          ownerEmail: storedClient.data().ownerEmail,
        };
      }
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
      tx.create(mapping, {
        kioskId: k.id,
        code,
        name: s.name,
        school: s.school,
        closed: false,
      });
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
      return { id: k.id, code, ownerEmail: client.ownerEmail };
    });
  });
  const resolveOwnerAccess = endpoint(async (req) => {
    if (!req.auth.token.email_verified)
      return { status: "verification-required" };
    const email = normalizedOwnerEmail(req.auth.token.email);
    const ownerGrant = await ownerEmailRef(email).get();
    const staffGrant = ownerGrant.exists
      ? null
      : await db.collection("staffEmails").doc(email).get();
    const grant = ownerGrant.exists ? ownerGrant : staffGrant;
    if (!grant?.exists) return { status: "not-authorized" };
    const role = ownerGrant.exists ? "owner" : "staff";
    const k = db.collection("kiosks").doc(grant.data().kioskId);
    return db.runTransaction(async (tx) => {
      const m = k.collection("members").doc(req.auth.uid);
      const [settings, member, profile] = await Promise.all([
        tx.get(k),
        tx.get(m),
        tx.get(db.collection("usuarios").doc(req.auth.uid)),
      ]);
      if (!settings.exists || settings.data().closed)
        throw new DomainError("Este kiosko está cerrado.");
      if (
        role === "owner" &&
        settings.data().ownerUid &&
        settings.data().ownerUid !== req.auth.uid
      )
        throw new DomainError("Este kiosko ya tiene una cuenta vinculada.");
      if (member.exists && member.data().role !== role)
        throw new DomainError("Tu cuenta ya tiene otro rol en este kiosko.");
      if (!member.exists)
        tx.create(m, {
          role,
          email,
          name: req.auth.token.name || email,
          balance: 0,
          course: "",
          createdAt: FieldValue.serverTimestamp(),
        });
      if (role === "owner") tx.update(k, { ownerUid: req.auth.uid });
      tx.set(
        db.collection("usuarios").doc(req.auth.uid),
        {
          email,
          kioskId: k.id,
          kioskIds: FieldValue.arrayUnion(k.id),
          rol:
            profile.data()?.rol === "superadmin"
              ? "superadmin"
              : role === "owner"
                ? "kioskero"
                : "empleado",
        },
        { merge: true },
      );
      return { status: "authorized", role, kioskId: k.id };
    });
  });
  const updateKioskPlan = endpoint(async (req) => {
    admin(req);
    const k = base(req);
    money(req.data.monthlyFee);
    return db.runTransaction(async (tx) => {
      const clientRef = db.collection("clients").doc(k.id);
      const [settings, images, oldClient] = await Promise.all([
        tx.get(k),
        tx.get(k),
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
        images: settings.data().imageCount || 0,
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
  const closeKiosk = endpoint(async (req) => {
    admin(req);
    const k = base(req);
    await db.runTransaction(async (tx) => {
      const settings = await tx.get(k);
      tx.update(k, { closed: !!req.data.closed, paused: !!req.data.closed });
      tx.update(db.collection("schoolCodes").doc(settings.data().code), {
        closed: !!req.data.closed,
      });
    });
    await audit(req, k, "close", "Estado: " + !!req.data.closed);
    return {};
  });
  const setMemberStatus = endpoint(async (req) => {
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
  const cashout = endpoint(async (req) => {
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
      if ((m.data()?.pendingOrders || 0) > 0)
        throw new DomainError(
          "Resolvé los pedidos pendientes antes de devolver saldo.",
        );
      assertRefund({
        member: m.exists ? { id: m.id, ...m.data() } : null,
        amount: req.data.amount,
        orders: orders.docs.map((d) => d.data()),
      });
      if (req.data.close && req.data.amount !== m.data().balance)
        throw new DomainError(
          "Devolvé todo el saldo antes de cerrar la cuenta.",
        );
      const balance = m.data().balance - req.data.amount;
      tx.update(ref, {
        balance,
        ...(req.data.close ? { disabled: true } : {}),
      });
      const recordData = {
        ...record(
          ref.id,
          "cashout",
          -req.data.amount,
          balance,
          String(req.data.reason).slice(0, 200),
          req.auth.token.name || req.auth.uid,
          ref.id,
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
  const createCounterSale = endpoint(async (req) => {
    const k = base(req),
      ref = k.collection("counterSales").doc(id(req.data.requestId));
    if (!Array.isArray(req.data.items) || req.data.items.length > 5)
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
        products
          .filter((d) => d.exists)
          .map((d) => ({ id: d.id, ...d.data() })),
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
  const getCounterSale = endpoint(async (req) => {
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
  const cancelCounterSale = endpoint(async (req) => {
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
  const payCounterSale = endpoint(async (req) => {
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
        sale.items.map((i) =>
          tx.get(k.collection("products").doc(i.productId)),
        ),
      );
      const q = quoteCounter(
        sale.items,
        products
          .filter((p) => p.exists)
          .map((p) => ({ id: p.id, ...p.data() })),
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
      tx.update(member, {
        balance,
        lastOrderId: "pos-" + ref.id,
        lastWalletAction: "purchase",
      });
      products.forEach((p, i) =>
        tx.update(p.ref, {
          stock: p.data().stock - sale.items[i].qty,
          lastOrderId: "pos-" + ref.id,
          lastStockAction: "purchase",
        }),
      );
      tx.update(ref, {
        status: "paid",
        studentId: req.auth.uid,
        studentName: m.data().name,
        paidAt: FieldValue.serverTimestamp(),
      });
      q.items = countedItems(q.items);
      tx.create(k.collection("orders").doc("pos-" + ref.id), {
        ...q,
        itemMap: Object.fromEntries(q.items.map((i) => [i.productId, i])),
        saleId: ref.id,
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
        k.collection("movements").doc("pos-" + ref.id),
        record(
          req.auth.uid,
          "purchase",
          -sale.total,
          balance,
          "Compra en mostrador " + code,
          m.data().name,
          "pos-" + ref.id,
        ),
      );
      return { id: ref.id, status: "paid" };
    });
  });
  const platformOverview = endpoint(async (req) => {
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

  const getSchoolInfo = async (data = {}) => {
    const code = String(data.code || "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z0-9-]{4,20}$/.test(code))
      throw new DomainError("Código inválido.");
    const map = await db.collection("schoolCodes").doc(code).get();
    if (!map.exists) throw new DomainError("No encontramos ese kiosko.");
    if (map.data().closed) throw new DomainError("Este kiosko está cerrado.");
    return {
      code,
      kioskId: map.data().kioskId,
      name: map.data().name,
      school: map.data().school,
    };
  };
  const manageStaff = endpoint(async (req) => {
    const k = base(req);
    await owner(req, k);
    if (req.data.remove) {
      const ref = k.collection("members").doc(id(req.data.userId));
      await db.runTransaction(async (tx) => {
        const m = await tx.get(ref);
        if (m.data()?.role !== "staff")
          throw new DomainError("Solo se pueden quitar empleados.");
        tx.delete(ref);
        tx.delete(
          db.collection("staffEmails").doc(m.data().email.toLowerCase()),
        );
      });
    } else {
      const email = normalizedOwnerEmail(req.data.email);
      await db.runTransaction(async (tx) => {
        const ref = db.collection("staffEmails").doc(email);
        tx.set(ref, {
          email,
          kioskId: k.id,
          authorizedBy: req.auth.uid,
          authorizedAt: FieldValue.serverTimestamp(),
        });
      });
    }
    await audit(
      req,
      k,
      "staff",
      req.data.remove
        ? "Empleado removido"
        : "Email de empleado autorizado: " + req.data.email,
    );
    return {};
  });
  const reserveImage = endpoint(async (req) => {
    const k = base(req),
      ref = k.collection("images").doc();
    await db.runTransaction(async (tx) => {
      await staff(req, k, tx);
      const settings = await tx.get(k);
      if ((settings.data().imageCount || 0) >= settings.data().limits.images)
        throw new DomainError("Llegaste al límite de imágenes del plan.");
      tx.create(ref, {
        status: "pending",
        publicId: `kiosks/${k.id}/${ref.id}`,
        name: String(req.data.name || "Foto").slice(0, 100),
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.update(k, {
        imageCount: (settings.data().imageCount || 0) + 1,
        lastImageId: ref.id,
      });
    });
    return { imageId: ref.id, publicId: `kiosks/${k.id}/${ref.id}` };
  });
  const finalizeImage = endpoint(async (req) => {
    const k = base(req);
    await staff(req, k);
    const a = req.data.asset;
    if (
      !a ||
      a.format !== "webp" ||
      !Number.isInteger(a.bytes) ||
      a.bytes < 1 ||
      a.bytes > 102400 ||
      !String(a.secure_url).startsWith("https://res.cloudinary.com/")
    )
      throw new DomainError(
        "Cloudinary debe devolver una imagen WebP de hasta 100 KB.",
      );
    const ref = k.collection("images").doc(id(req.data.imageId));
    await db.runTransaction(async (tx) => {
      const image = await tx.get(ref);
      if (image.data()?.status !== "pending")
        throw new DomainError("La reserva de imagen ya no está disponible.");
      tx.update(ref, {
        status: "active",
        url: a.secure_url,
        bytes: a.bytes,
        publicId: a.public_id,
        uploadedAt: Date.now(),
      });
      if (a.delete_token)
        tx.set(k.collection("imageTokens").doc(ref.id), {
          token: a.delete_token,
          expiresAt: Date.now() + 9 * 60000,
        });
    });
    return { id: ref.id };
  });
  const deleteImage = endpoint(async (req) => {
    const k = base(req);
    await staff(req, k);
    const ref = k.collection("images").doc(id(req.data.imageId));
    const image = await db.runTransaction(async (tx) => {
      const img = await tx.get(ref);
      if (!img.exists) return null;
      const image = img.data();
      if (req.data.rejectedUpload) {
        if (image.url || !["pending", "deleting"].includes(image.status))
          throw new DomainError(
            "La foto ya fue guardada. No se puede descartar como carga rechazada.",
          );
        tx.update(ref, {
          status: "deleting",
          publicId: FieldValue.delete(),
          uploadRejected: true,
        });
        return { ...image, publicId: null };
      }
      tx.update(ref, { status: "deleting" });
      return image;
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
    let confirmed = !image.publicId;
    const tokenRef = k.collection("imageTokens").doc(ref.id);
    if (!confirmed && !req.data.confirmProviderDeletion) {
      const token = await tokenRef.get();
      if (token.exists && token.data().expiresAt > Date.now()) {
        const cloudName = process.env.REACT_APP_CLOUDINARY_CLOUD_NAME;
        const response = await fetch(
          `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/delete_by_token`,
          {
            method: "POST",
            body: new URLSearchParams({ token: token.data().token }),
          },
        );
        if (response.ok) {
          const data = await response.json();
          confirmed = data.result === "ok" || data.result === "not found";
        }
      }
    }
    if (req.data.confirmProviderDeletion) {
      admin(req);
      confirmed = true;
    }
    if (!confirmed) return { pendingDeletion: true };
    await db.runTransaction(async (tx) => {
      const [img, settings] = await Promise.all([tx.get(ref), tx.get(k)]);
      if (img.exists) {
        tx.delete(ref);
        tx.delete(tokenRef);
        tx.update(k, {
          imageCount: Math.max(0, (settings.data().imageCount || 0) - 1),
          lastImageId: ref.id,
        });
      }
    });
    return { deleted: true };
  });

  const findOrder = endpoint(async (req) => {
    const k = base(req);
    await staff(req, k);
    const target = parseOrderLookup(req.data.value, k.id);
    if (target.orderId) {
      const snapshot = await k.collection("orders").doc(target.orderId).get();
      if (!snapshot.exists)
        throw new DomainError("No encontramos ese pedido en este kiosko.");
      return { id: snapshot.id, ...snapshot.data() };
    }
    const matches = await k
      .collection("orders")
      .where("code", "==", target.code)
      .get();
    if (!matches.size)
      throw new DomainError(
        "No encontramos ese código de pedido en este kiosko.",
      );
    if (matches.size > 1)
      throw new DomainError(
        "Hay más de un pedido con ese código. Escaneá su QR para identificarlo.",
      );
    const snapshot = matches.docs[0];
    return { id: snapshot.id, ...snapshot.data() };
  });

  const operations = {
    findOrder,
    manageStaff,
    reserveImage,
    finalizeImage,
    deleteImage,
    joinSchool,
    placeOrder,
    topup,
    cancelOrder,
    setOrderStatus,
    saveProduct,
    deleteProduct,
    saveSettings,
    createKiosk,
    resolveOwnerAccess,
    updateKioskPlan,
    closeKiosk,
    setMemberStatus,
    cashout,
    createCounterSale,
    getCounterSale,
    cancelCounterSale,
    payCounterSale,
    platformOverview,
  };
  return async (name, data) => {
    if (name === "getSchoolInfo") return getSchoolInfo(data);
    const op = operations[name];
    if (!op) throw new Error("Operación no disponible: " + name);
    return op(data);
  };
}
