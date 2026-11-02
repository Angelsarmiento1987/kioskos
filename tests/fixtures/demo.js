import { parseOrderLookup } from "../../shared/order-qr.mjs";
import { newId } from "../../src/id.js";
import {
  quoteCounter,
  assertRefund,
  assertLimits,
  summary,
} from "../../shared/business.mjs";
import {
  quoteOrder,
  mayCancel,
  validateProduct,
  validateSettings,
  localDate,
} from "../../shared/domain.mjs";
const key = "recreo-demo-v1";
const uid = () => newId();
const student = {
  id: "student-1",
  name: "Sofía Martínez",
  email: "sofia@demo.test",
  course: "4° B",
  role: "student",
  balance: 1000000,
};
const products = [
  ["Tostado de jamón y queso", "Preparados", 250000, 24, "🥪", true],
  ["Hamburguesa completa", "Preparados", 420000, 12, "🍔", true],
  ["Alfajor de chocolate", "Golosinas", 120000, 36, "🍫", false],
  ["Agua mineral 500 ml", "Bebidas", 130000, 30, "💧", false],
  ["Jugo de naranja", "Bebidas", 150000, 20, "🧃", false],
  ["Galletitas con chips", "Golosinas", 180000, 18, "🍪", false],
  ["Porción de pizza", "Preparados", 220000, 15, "🍕", true],
  ["Manzana roja", "Frutas", 70000, 16, "🍎", false],
  ["Barrita de cereal", "Golosinas", 90000, 25, "🌾", false],
].map(([name, category, price, stock, emoji, prepared], i) => ({
  id: `p${i + 1}`,
  name,
  category,
  price,
  stock,
  emoji,
  prepared,
  cancellable: !prepared,
  active: true,
  imageUrl: "",
  description: prepared
    ? "Preparado en el kiosco, para disfrutar en tu recreo."
    : "Una opción para acompañar tu recreo.",
}));
function seed() {
  const today = localDate();
  return {
    kiosks: [
      {
        id: "escuela-sol",
        name: "El recreo de la 23",
        school: "Escuela Secundaria N.º 23",
        code: "ESCUELA23",
        maxUnits: 5,
        paused: false,
        deliveryEnabled: false,
        preparationEnabled: false,
        notice: "Pedí con tiempo y aprovechá todo tu recreo.",
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
          {
            id: "r3",
            label: "Turno tarde",
            time: "16:00",
            cutoffMinutes: 10,
            maxOrders: 20,
            maxPrepared: 10,
          },
        ],
      },
    ],
    products: { "escuela-sol": products },
    members: {
      "escuela-sol": [
        student,
        {
          id: "student-2",
          name: "Tomás González",
          email: "tomas@demo.test",
          course: "3° A",
          role: "student",
          balance: 650000,
        },
        {
          id: "student-3",
          name: "Valentina López",
          email: "vale@demo.test",
          course: "5° C",
          role: "student",
          balance: 320000,
        },
        {
          id: "staff-1",
          name: "Ángel Sarmiento",
          role: "owner",
          course: "",
          balance: 0,
        },
      ],
    },
    orders: {
      "escuela-sol": [
        {
          id: "o-demo-1",
          code: "R-1042",
          studentId: "student-2",
          studentName: "Tomás González",
          course: "3° A",
          items: [
            {
              productId: "p1",
              name: products[0].name,
              price: 250000,
              qty: 1,
              prepared: true,
              cancellable: false,
              emoji: "🥪",
            },
          ],
          total: 250000,
          date: today,
          slotId: "r1",
          slotLabel: "Primer recreo",
          slotTime: "10:20",
          status: "received",
          delivery: "pickup",
          createdAt: Date.now() - 900000,
        },
        {
          id: "o-demo-2",
          code: "R-1041",
          studentId: "student-3",
          studentName: "Valentina López",
          course: "5° C",
          items: [
            {
              productId: "p3",
              name: products[2].name,
              price: 120000,
              qty: 1,
              prepared: false,
              cancellable: true,
              emoji: "🍫",
            },
          ],
          total: 120000,
          date: today,
          slotId: "r2",
          slotLabel: "Segundo recreo",
          slotTime: "11:40",
          status: "delivered",
          delivery: "pickup",
          createdAt: Date.now() - 1800000,
        },
      ],
    },
    movements: {
      "escuela-sol": [
        {
          id: uid(),
          userId: student.id,
          type: "topup",
          amount: 1000000,
          balanceAfter: 1000000,
          createdAt: Date.now() - 3600000,
          note: "Carga en efectivo · demostración",
          actor: "Ángel Sarmiento",
          method: "cash",
        },
      ],
    },
  };
}
function enrich(s) {
  s.images ??= {};
  s.clients ??= {};
  s.counterSales ??= {};
  s.audit ??= {};
  for (const k of s.kiosks) {
    s.images[k.id] ??= [];
    s.audit[k.id] ??= [];
    s.counterSales[k.id] ??= [];
    s.clients[k.id] ??= {
      internalName: k.name,
      ownerName: "Ángel",
      ownerSurname: "Sarmiento",
      ownerEmail: "dueno@demo.test",
      dni: "30123456",
      address: "Av. Rivadavia 21000, Ituzaingó",
      taxId: "20-30123456-0",
      taxStatus: "Monotributo",
      paymentAlias: "KIOSKO.DEMO",
      phone: "11 5555 0101",
    };
    k.limits ??= { products: 100, images: 100 };
    k.plan ??= "Inicial";
    k.monthlyFee ??= 5000000;
    k.productCount = s.products[k.id]?.filter((p) => p.active).length || 0;
    k.imageCount = s.images[k.id].length;
  }
  return s;
}
export function getDemo() {
  try {
    const x = JSON.parse(localStorage.getItem(key));
    if (x?.kiosks) return enrich(x);
  } catch {}
  const s = enrich(seed());
  localStorage.setItem(key, JSON.stringify(s));
  return s;
}
export function demoSnapshot(kioskId) {
  const s = getDemo();
  return {
    kiosk: s.kiosks.find((k) => k.id === kioskId),
    kiosks: s.kiosks,
    products: s.products[kioskId] || [],
    members: s.members[kioskId] || [],
    orders: s.orders[kioskId] || [],
    movements: s.movements[kioskId] || [],
    images: s.images[kioskId] || [],
    counterSales: s.counterSales[kioskId] || [],
    client: s.clients[kioskId] || {},
    audit: s.audit[kioskId] || [],
  };
}
export async function demoAction(action, data, session) {
  const run = () => {
    const s = getDemo(),
      kid = data.kioskId || session.kioskId,
      k = s.kiosks.find((k) => k.id === kid),
      members = s.members[kid] || [];
    const staff = ["owner", "staff", "superadmin"].includes(session.role);
    const owner = () => {
      if (!["owner", "superadmin"].includes(session.role))
        throw Error("Solo el dueño puede realizar esta operación.");
    };
    const needStaff = () => {
      if (!staff) throw Error("No tenés permisos para esta operación.");
    };
    if (action === "findOrder") {
      needStaff();
      const target = parseOrderLookup(data.value, kid);
      const matches = (s.orders[kid] || []).filter((o) =>
        target.orderId ? o.id === target.orderId : o.code === target.code,
      );
      if (!matches.length)
        throw new Error("No encontramos ese pedido en este kiosko.");
      if (matches.length > 1)
        throw new Error("Hay más de un pedido con ese código. Escaneá su QR.");
      return { ...matches[0] };
    }
    const movement = (userId, type, amount, balanceAfter, note) =>
      s.movements[kid].unshift({
        id: uid(),
        userId,
        type,
        amount,
        balanceAfter,
        note,
        createdAt: Date.now(),
        actor: session.name,
      });
    let result = {};
    if (action === "getCounterSale") {
      const c = (s.counterSales[kid] || []).find((c) => c.id === data.saleId);
      if (!c) throw Error("Cobro no encontrado.");
      return c;
    }
    if (action === "placeOrder") {
      const previous = s.orders[kid].find((o) => o.id === data.requestId);
      if (previous) {
        if (previous.studentId !== session.uid) throw Error("Pedido inválido.");
        return previous;
      }
      const member = members.find((m) => m.id === session.uid);
      if (member?.disabled || k.closed)
        throw Error("La cuenta o el kiosko están desactivados.");
      if (!member || member.role !== "student")
        throw Error("Ingresá como alumno para pedir.");
      const q = quoteOrder({
        ...data,
        products: s.products[kid],
        wallet: member,
        settings: k,
        existing: s.orders[kid],
      });
      const order = {
        ...q,
        id: data.requestId || uid(),
        code: `R-${String(Date.now()).slice(-6)}`,
        status: "received",
        studentId: session.uid,
        studentName: member.name,
        course: member.course,
        channel: "preorder",
        createdAt: Date.now(),
      };
      member.balance -= q.total;
      for (const i of q.items)
        s.products[kid].find((p) => p.id === i.productId).stock -= i.qty;
      s.orders[kid].unshift(order);
      movement(
        member.id,
        "purchase",
        -q.total,
        member.balance,
        `Pedido ${order.code}`,
      );
      result = order;
    } else if (action === "topup") {
      needStaff();
      const m = members.find(
        (m) => m.id === data.userId && m.role === "student",
      );
      if (!m) throw Error("No se encontró al alumno.");
      if (
        !Number.isSafeInteger(data.amount) ||
        data.amount <= 0 ||
        data.amount > 100000000
      )
        throw Error("Ingresá un importe entre $0,01 y $1.000.000.");
      if (s.movements[kid].some((x) => x.requestId === data.requestId))
        return {};
      if (m.disabled || k.closed)
        throw Error("No se puede cargar una cuenta o kiosko desactivado.");
      m.balance += data.amount;
      movement(
        m.id,
        "topup",
        data.amount,
        m.balance,
        `Carga ${data.method === "transfer" ? "por transferencia verificada" : "en efectivo"}${data.note ? " · " + data.note : ""}`,
      );
      s.movements[kid][0].requestId = data.requestId;
      s.movements[kid][0].method = data.method;
    } else if (action === "cancelOrder") {
      const o = s.orders[kid].find((o) => o.id === data.orderId);
      if (!o || (!staff && o.studentId !== session.uid))
        throw Error("Pedido no encontrado.");
      mayCancel(o, staff, Date.now(), k);
      const m = members.find((m) => m.id === o.studentId);
      m.balance += o.total;
      o.status = "cancelled";
      o.cancelReason = data.reason || "Cancelado por el alumno";
      for (const i of o.items) {
        const p = s.products[kid].find((p) => p.id === i.productId);
        if (p) p.stock += i.qty;
      }
      movement(m.id, "refund", o.total, m.balance, `Devolución ${o.code}`);
    } else if (action === "setOrderStatus") {
      needStaff();
      const o = s.orders[kid].find((o) => o.id === data.orderId);
      if (!o || ["delivered", "cancelled", "uncollected"].includes(o.status))
        throw Error("El pedido ya está cerrado.");
      const allowed = [
        "delivered",
        "uncollected",
        ...(k.preparationEnabled ? ["preparing", "ready"] : []),
      ];
      if (!allowed.includes(data.status)) throw Error("Estado inválido.");
      if (
        (data.status === "preparing" && o.status !== "received") ||
        (data.status === "ready" &&
          !["received", "preparing"].includes(o.status))
      )
        throw Error("Transición inválida.");
      o.status = data.status;
    } else if (action === "saveProduct") {
      needStaff();
      const p = validateProduct({ ...data.product, imageUrl: "" });
      p.galleryId = data.product.galleryId || "";
      if (p.galleryId) {
        const image = (s.images[kid] || []).find((i) => i.id === p.galleryId);
        if (!image) throw Error("Imagen no disponible.");
        p.imageUrl = image.url;
        p.imageId = image.publicId || "";
      }
      const old = s.products[kid].find((x) => x.id === data.product.id);
      if (
        p.active &&
        !old?.active &&
        s.products[kid].filter((x) => x.active).length >=
          (k.limits?.products ?? 100)
      )
        throw Error("Llegaste al límite de productos activos.");
      if (data.product.demoImage) p.imageUrl = data.product.demoImage;
      if (data.product.id) {
        const index = s.products[kid].findIndex(
          (p) => p.id === data.product.id,
        );
        if (index < 0) throw Error("Producto no encontrado.");
        s.products[kid][index] = { ...p, id: data.product.id };
      } else s.products[kid].push({ ...p, id: uid() });
    } else if (action === "saveSettings") {
      needStaff();
      const clean = validateSettings(data.settings);
      Object.assign(k, clean, { code: k.code });
    } else if (action === "joinSchool") {
      const school = s.kiosks.find(
        (k) => k.code === data.code.trim().toUpperCase(),
      );
      if (!school) throw Error("No encontramos ese código de escuela.");
      if (!s.members[school.id].some((m) => m.id === session.uid))
        s.members[school.id].push({
          id: session.uid,
          name: session.name,
          email: session.email || "",
          course: data.course,
          role: "student",
          balance: 0,
        });
      result = { kioskId: school.id };
    } else if (action === "createKiosk") {
      if (session.role !== "superadmin")
        throw Error(
          "Solo el administrador de la plataforma puede crear kioscos.",
        );
      if (!data.code)
        data.code = "K" + uid().replaceAll("-", "").slice(0, 5).toUpperCase();
      if (!data.name?.trim() || !data.school?.trim() || !data.code?.trim())
        throw Error("Completá los datos del kiosco.");
      if (s.kiosks.some((k) => k.code === data.code.trim().toUpperCase()))
        throw Error("El código ya está en uso.");
      const id = uid();
      s.kiosks.push({
        ...s.kiosks[0],
        id,
        name: data.name.trim(),
        school: data.school.trim(),
        code: data.code.trim().toUpperCase(),
        paused: false,
      });
      s.products[id] = [];
      s.members[id] = [
        { id: "staff-1", name: "Ángel Sarmiento", role: "owner", balance: 0 },
      ];
      s.orders[id] = [];
      s.movements[id] = [];
      s.images[id] = [];
      s.audit[id] = [];
      s.counterSales[id] = [];
      s.clients[id] = { ...data, internalName: data.internalName || data.name };
      Object.assign(s.kiosks.at(-1), {
        limits: {
          products: Number(data.productLimit) || 100,
          images: Number(data.imageLimit) || 100,
        },
        plan: data.plan || "Inicial",
        monthlyFee: Number(data.monthlyFee) || 5000000,
        imageCount: 0,
        productCount: 0,
      });
      result = {
        id,
        code: data.code,
        ownerEmail: data.ownerEmail || "dueno@demo.test",
      };
    } else if (action === "saveImage") {
      needStaff();
      if ((s.images[kid] || []).length >= (k.limits?.images ?? 100))
        throw Error("Llegaste al límite de fotos.");
      s.images[kid].unshift({
        id: uid(),
        name: String(data.name || "Foto").slice(0, 100),
        url: data.url,
        bytes: data.bytes || 0,
        createdAt: Date.now(),
      });
      k.imageCount = s.images[kid].length;
    } else if (action === "deleteImage") {
      needStaff();
      const image = s.images[kid].find((i) => i.id === data.imageId);
      if (!image) throw Error("Imagen no encontrada.");
      for (const p of s.products[kid])
        if (p.galleryId === image.id) {
          p.galleryId = "";
          p.imageUrl = "";
          p.imageId = "";
        }
      s.images[kid] = s.images[kid].filter((i) => i.id !== image.id);
      k.imageCount = s.images[kid].length;
    } else if (action === "deleteProduct") {
      needStaff();
      s.products[kid] = s.products[kid].filter((p) => p.id !== data.productId);
    } else if (action === "cashout") {
      owner();
      if (s.movements[kid].some((m) => m.requestId === data.requestId))
        return {};
      const m = members.find((m) => m.id === data.userId);
      assertRefund({ member: m, amount: data.amount, orders: s.orders[kid] });
      if (data.close && data.amount !== m.balance)
        throw Error("Para cerrar devolvé el saldo completo.");
      m.balance -= data.amount;
      if (data.close) m.disabled = true;
      movement(m.id, "cashout", -data.amount, m.balance, data.reason);
      Object.assign(s.movements[kid][0], {
        method: data.method,
        requestId: data.requestId,
      });
    } else if (action === "setMemberStatus") {
      owner();
      const m = members.find(
        (m) => m.id === data.userId && m.role === "student",
      );
      if (!m) throw Error("Alumno no encontrado.");
      m.disabled = !!data.disabled;
    } else if (action === "createCounterSale") {
      needStaff();
      const old = s.counterSales[kid].find((c) => c.id === data.requestId);
      if (old) return old;
      const q = quoteCounter(data.items, s.products[kid], k);
      result = {
        ...q,
        id: data.requestId || uid(),
        status: "pending",
        createdAt: Date.now(),
        expiresAt: Date.now() + 5 * 60000,
      };
      s.counterSales[kid].unshift(result);
    } else if (action === "payCounterSale") {
      const c = s.counterSales[kid].find((c) => c.id === data.saleId);
      if (!c) throw Error("Cobro no encontrado.");
      if (c.status === "paid") {
        if (c.studentId !== session.uid) throw Error("El cobro ya fue pagado.");
        return c;
      }
      if (Date.now() > c.expiresAt || c.status !== "pending")
        throw Error("Este QR venció.");
      const m = members.find(
        (m) => m.id === session.uid && m.role === "student",
      );
      if (!m || m.disabled) throw Error("Cuenta no habilitada.");
      const q = quoteCounter(c.items, s.products[kid], k);
      if (
        q.total !== c.total ||
        q.items.some((x, i) => x.price !== c.items[i].price)
      )
        throw Error("Cambiaron los precios. Generá otro QR.");
      if (m.balance < c.total) throw Error("Saldo insuficiente.");
      m.balance -= c.total;
      for (const i of c.items)
        s.products[kid].find((p) => p.id === i.productId).stock -= i.qty;
      Object.assign(c, {
        status: "paid",
        studentId: m.id,
        studentName: m.name,
        paidAt: Date.now(),
      });
      const o = {
        ...c,
        id: "pos-" + c.id,
        code: "M-" + c.id.slice(0, 6).toUpperCase(),
        channel: "counter",
        status: "delivered",
        date: localDate(),
        slotLabel: "Mostrador",
        slotTime: "Entrega inmediata",
        delivery: "pickup",
        createdAt: Date.now(),
      };
      s.orders[kid].unshift(o);
      movement(
        m.id,
        "purchase",
        -c.total,
        m.balance,
        "Compra en mostrador " + o.code,
      );
      result = c;
    } else if (action === "cancelCounterSale") {
      needStaff();
      const c = s.counterSales[kid].find((x) => x.id === data.saleId);
      if (!c || c.status !== "pending")
        throw Error("El cobro ya está cerrado.");
      c.status = "cancelled";
    } else if (action === "updateKioskPlan") {
      if (session.role !== "superadmin") throw Error("Sin permisos.");
      assertLimits(data.limits, {
        products: s.products[kid].filter((p) => p.active).length,
        images: s.images[kid].length,
      });
      Object.assign(k, {
        limits: data.limits,
        plan: data.plan,
        monthlyFee: data.monthlyFee,
      });
      Object.assign(s.clients[kid], data.client || {});
    } else if (action === "manageStaff") {
      owner();
      if (data.remove) {
        s.members[kid] = members.filter(
          (m) => !(m.id === data.userId && m.role === "staff"),
        );
      } else {
        if (members.some((m) => m.email === data.email))
          throw Error("La cuenta ya tiene un rol en este kiosko.");
        members.push({
          id: uid(),
          name: data.email.split("@")[0],
          email: data.email,
          role: "staff",
          balance: 0,
          course: "",
        });
      }
    } else if (action === "closeKiosk") {
      if (session.role !== "superadmin") throw Error("Sin permisos.");
      k.closed = !!data.closed;
      k.paused = !!data.closed;
    } else if (action === "platformOverview") {
      if (session.role !== "superadmin") throw Error("Sin permisos.");
      return {
        rows: s.kiosks.map((k) => ({
          id: k.id,
          ...summary(
            {
              orders: s.orders[k.id],
              members: s.members[k.id],
              movements: s.movements[k.id],
            },
            data.from,
            data.to,
          ),
          imageCount: s.images[k.id]?.length || 0,
          productCount: s.products[k.id]?.filter((p) => p.active).length || 0,
          client: s.clients[k.id] || {},
        })),
      };
    } else throw Error("Acción desconocida.");
    if (staff && k)
      s.audit[kid].unshift({
        id: uid(),
        type: action,
        detail:
          data.product?.name ||
          data.reason ||
          data.email ||
          "Operación de administración",
        actor: session.uid,
        actorName: session.name,
        createdAt: Date.now(),
      });
    localStorage.setItem(key, JSON.stringify(s));
    window.dispatchEvent(new Event("recreo-update"));
    return result;
  };
  return globalThis.navigator?.locks
    ? navigator.locks.request("recreo-demo", run)
    : run();
}
export function resetDemo() {
  localStorage.removeItem(key);
  getDemo();
  window.dispatchEvent(new Event("recreo-update"));
}
