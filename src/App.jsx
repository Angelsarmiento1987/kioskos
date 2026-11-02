import { compressImage, uploadImage } from "./images.js";
import { isAndroid, loginGoogle, linkGoogle, logoutAccount, homeHref } from "./native";
import NativeQrButton from "./components/NativeQrButton";
import { useAndroidBack } from "./useAndroidBack";
import OrderScanner from "./components/OrderScanner";
import {
  orderQrValue,
  closedOrderNotice,
  orderForView,
} from "../shared/order-qr.mjs";
import { operationErrorMessage } from "./operation-errors.js";
import { loadLoginSession, accessErrorMessage } from "./auth-flow.js";
import {
  onboardingFor,
  readAccessIntent,
  isAdminEntrance,
  canAccessAdmin,
} from "./access.js";
import { newId } from "./id.js";
import Team, { Audit } from "./pages/Team";
import Gallery from "./pages/Gallery";
import Reports from "./pages/Reports";
import Platform, { SchoolPoster, KioskForm } from "./pages/Platform";
import Counter, { StudentPayment } from "./pages/Counter";
import ProductForm from "./components/ProductForm";
import Refund from "./components/Refund";
import { Brand, downloadFile } from "./components/ui";
import React, { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Users,
  Wallet,
  Settings,
  LogOut,
  ChevronRight,
  Plus,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  Check,
  Clock,
  CheckCircle2,
  X,
  Menu,
  School,
  ShoppingCart,
  Minus,
  ArrowLeft,
  QrCode,
  ScanLine,
  AlertCircle,
  Pause,
  Play,
  Download,
  RefreshCw,
  ShieldCheck,
  Store,
  Trash2,
  Leaf,
  ArrowRight,
  ImagePlus,
  Loader2,
  Bell,
  Copy,
  CalendarDays,
  Images,
  BarChart3,
  Monitor,
  Mail,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  signOut,
  sendEmailVerification,
} from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  getDoc,
  getDocFromServer,
} from "firebase/firestore";
import { auth, db, configured, call } from "./firebase";
import { localDate, slotDeadline } from "../shared/domain.mjs";
const fmt = (n) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: n % 100 ? 2 : 0,
  }).format((n || 0) / 100);
const ts = (x) => (typeof x === "number" ? x : x?.toMillis?.() || 0);
const time = (x) =>
  new Date(ts(x)).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
const statuses = {
  received: ["Recibido", "amber"],
  preparing: ["En preparación", "blue"],
  ready: ["Listo para retirar", "green"],
  delivered: ["Entregado", "gray"],
  cancelled: ["Cancelado", "red"],
  uncollected: ["No retirado", "gray"],
};
const empty = {
  kiosk: null,
  kiosks: [],
  products: [],
  orders: [],
  members: [],
  movements: [],
  images: [],
  counterSales: [],
  audit: [],
};
function tomorrow() {
  return localDate(new Date(Date.now() + 86400000));
}
function IconButton({ children, ...props }) {
  return (
    <button className="icon-button" {...props}>
      {children}
    </button>
  );
}
function Badge({ status }) {
  const [label, tone] = statuses[status] || [status, "gray"];
  return (
    <span className={`badge ${tone}`}>
      <i />
      {label}
    </span>
  );
}
function Empty({ icon: Icon = ShoppingBag, title, children }) {
  return (
    <div className="empty">
      <Icon size={35} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    const prev = document.activeElement;
    const el = ref.current;
    el.showModal();
    const escape = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    el.addEventListener("keydown", escape);
    return () => {
      el.close();
      prev?.focus?.();
      el.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <IconButton onClick={onClose} aria-label="Cerrar">
          <X size={20} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
function Scanner({ onValue, onClose }) {
  const [error, setError] = useState("");
  useEffect(() => {
    if (isAndroid) return;
    let scanner,
      stopped = false;
    const start = async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (stopped) return;
        scanner = new Html5Qrcode("camera-reader");
        await scanner.start(
          { facingMode: "environment" },
          { fps: 8, qrbox: { width: 220, height: 220 } },
          (value) => {
            if (!stopped) {
              stopped = true;
              onValue(value);
            }
          },
          () => {},
        );
        if (stopped && scanner.isScanning) await scanner.stop();
      } catch {
        if (!stopped)
          setError(
            "No pudimos abrir la cámara. Permití el acceso o usá el código manual.",
          );
      }
    };
    start();
    return () => {
      stopped = true;
      if (scanner?.isScanning) scanner.stop().catch(() => {});
    };
  }, []);
  return (
    <Modal title="Escanear credencial" onClose={onClose}>
      {isAndroid ? <NativeQrButton onValue={onValue} /> : <div id="camera-reader" />}
      {error && <p className="error">{error}</p>}
      <p className="hint">
        El QR identifica la cuenta. Confirmá el nombre del alumno antes de
        acreditar dinero.
      </p>
    </Modal>
  );
}
function ProductVisual({ p, small = false }) {
  return (
    <div
      className={`product-visual ${small ? "small" : ""} food-${p.category === "Bebidas" ? "blue" : p.category === "Frutas" ? "green" : p.category === "Golosinas" ? "pink" : "yellow"}`}
    >
      {p.imageUrl ? (
        <img src={p.imageUrl} alt={p.name} loading="lazy" />
      ) : (
        <span aria-hidden="true">{p.emoji || "🥪"}</span>
      )}
    </div>
  );
}
export default function App() {
  const adminEntrance = isAdminEntrance(location.pathname);
  const orderRequest = useRef(newId());
  const [session, setSession] = useState(null),
    [authLoading, setAuthLoading] = useState(configured),
    [authError, setAuthError] = useState(""),
    [data, setData] = useState(empty),
    [page, setPage] = useState("home"),
    [toast, setToast] = useState(null),
    [modal, setModal] = useState(null),
    [busy, setBusy] = useState(false),
    [mobileMenu, setMobileMenu] = useState(false),
    [cart, setCart] = useState({}),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState("Todos"),
    [orderFilter, setOrderFilter] = useState("active"),
    [date, setDate] = useState(localDate()),
    [slotId, setSlotId] = useState(""),
    [delivery, setDelivery] = useState("pickup"),
    [checkout, setCheckout] = useState(false),
    [loginMode, setLoginMode] = useState("login"),
    [accessIntent, setAccessIntent] = useState(() =>
      readAccessIntent(sessionStorage),
    ),
    [scan, setScan] = useState(false),
    [orderScan, setOrderScan] = useState(false),
    [orderActionError, setOrderActionError] = useState(""),
    [memberSearch, setMemberSearch] = useState(""),
    [schoolInfo, setSchoolInfo] = useState(null);
  useAndroidBack(() => {
    const dialogs = document.querySelectorAll("dialog[open]");
    if (dialogs.length) { dialogs[dialogs.length - 1].dispatchEvent(new Event("cancel", { cancelable: true })); return true; }
    if (mobileMenu) { setMobileMenu(false); return true; }
    if (scan) { setScan(false); return true; }
    if (orderScan) { setOrderScan(false); return true; }
    if (checkout) { setCheckout(false); return true; }
    if (modal) { setModal(null); return true; }
    const home = session?.role === "superadmin" ? "platform" : "home";
    if (page !== home) { setPage(home); setSearch(""); return true; }
    if (!session && accessIntent) { chooseAccess(null); return true; }
    return false;
  });
  useEffect(() => {
    setOrderActionError("");
  }, [modal?.type, modal?.order?.id]);
  useEffect(() => {
    const code = new URLSearchParams(location.search).get("escuela");
    if (!code) return;
    if (configured)
      call("getSchoolInfo", { code })
        .then(setSchoolInfo)
        .catch(() => {});

  }, []);
  const staff = session && session.role !== "student",
    k = data.kiosk,
    me = data.members.find((m) => m.id === session?.uid),
    myOrders = data.orders.filter((o) => o.studentId === session?.uid),
    myMovements = data.movements.filter((m) => m.userId === session?.uid);
  const notify = (message, error = false) => setToast({ message, error });
  useEffect(() => {
    const handler = (event) => setToast({ message: event.detail, error: true });
    window.addEventListener("rekreo:file-error", handler);
    return () => window.removeEventListener("rekreo:file-error", handler);
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    if (!configured) return;
    let active = true,
      generation = 0;
    async function finishLogin(user, attempt) {
      if (!user) {
        if (active && attempt === generation) {
          setSession(null);
          setAuthLoading(false);
        }
        return;
      }
      setAuthLoading(true);
      setAuthError("");
      try {
        const result = await loadLoginSession({
          user,
          intent: readAccessIntent(sessionStorage) || "student",
          adminEntrance,
          readProfile: async (uid) =>
            (await getDocFromServer(doc(db, "usuarios", uid))).data(),
          readMember: async (kioskId, uid) =>
            (
              await getDocFromServer(doc(db, "kiosks", kioskId, "members", uid))
            ).data(),
          resolveOwner: () => call("resolveOwnerAccess"),
        });
        if (!active || attempt !== generation) return;
        setSession(result);
        setPage(result.role === "superadmin" ? "platform" : "home");
        if (result.ownerAccessError) notify(result.ownerAccessError, true);
      } catch (error) {
        if (active && attempt === generation) {
          setSession(null);
          setAuthError(accessErrorMessage(error));
        }
      } finally {
        if (active && attempt === generation) setAuthLoading(false);
      }
    }
    // Keep the Firebase observer synchronous. SDK calls run outside its callback's promise chain.
    const stop = onAuthStateChanged(auth, (user) => {
      const attempt = ++generation;
      void finishLogin(user, attempt);
    });
    return () => {
      active = false;
      generation++;
      stop();
    };
  }, []);
  useEffect(() => {
    // Old local demo sessions are never restored as authenticated sessions.
    try {
      localStorage.removeItem("recreo-session");
      localStorage.removeItem("recreo-demo-v1");
    } catch {}
  }, []);
  useEffect(() => {
    setData(empty);
    if (!session) return;
    const stops = [];
    const fail = (e) =>
      notify(
        e.code === "permission-denied"
          ? "No tenés permiso para acceder a estos datos."
          : "No pudimos sincronizar los datos. Revisá la conexión.",
        true,
      );
    if (session.role === "superadmin")
      stops.push(
        onSnapshot(
          collection(db, "kiosks"),
          (s) =>
            setData((d) => ({
              ...d,
              kiosks: s.docs.map((x) => ({ id: x.id, ...x.data() })),
            })),
          fail,
        ),
      );
    if (!session.kioskId) return () => stops.forEach((f) => f());
    const base = ["kiosks", session.kioskId];
    stops.push(
      onSnapshot(
        doc(db, ...base),
        (s) =>
          setData((d) => ({
            ...d,
            kiosk: s.exists() ? { id: s.id, ...s.data() } : null,
          })),
        fail,
      ),
    );
    for (const name of [
      "products",
      "orders",
      "members",
      "movements",
      "images",
      ...(staff ? ["counterSales", "audit"] : []),
    ]) {
      const c = collection(db, ...base, name);
      if (name === "members" && !staff) {
        stops.push(
          onSnapshot(
            doc(db, ...base, "members", session.uid),
            (s) =>
              setData((d) => ({
                ...d,
                members: s.exists() ? [{ id: s.id, ...s.data() }] : [],
              })),
            fail,
          ),
        );
        continue;
      }
      const q =
        !staff && ["orders", "movements"].includes(name)
          ? query(
              c,
              where(
                name === "orders" ? "studentId" : "userId",
                "==",
                session.uid,
              ),
            )
          : c;
      stops.push(
        onSnapshot(
          q,
          (s) => {
            const rows = s.docs.map((x) => ({ id: x.id, ...x.data() }));
            if (name === "orders" || name === "movements")
              rows.sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
            setData((d) => ({ ...d, [name]: rows }));
          },
          fail,
        ),
      );
    }
    return () => stops.forEach((f) => f());
  }, [session?.uid, session?.kioskId, session?.role, session?.mode]);
  useEffect(() => {
    setCart({});
    setSearch("");
    setCategory("Todos");
    setSlotId("");
  }, [session?.kioskId, session?.role]);
  useEffect(() => {
    if (k && !slotId) {
      const available = k.slots.find((s) => Date.now() < slotDeadline(date, s));
      if (available) setSlotId(available.id);
    }
  }, [k, date, slotId]);
  async function action(name, payload = {}, success, options = {}) {
    if (busy && !options.background) {
      const error = new Error(
        "Hay otra operación en curso. Esperá a que termine y volvé a intentar.",
      );
      if (options.throwOnError) throw error;
      notify(error.message, true);
      return null;
    }
    if (!options.background) setBusy(true);
    try {
      const result = await call(name, {
        ...payload,
        kioskId: payload.kioskId || session.kioskId,
      });
      if (success) notify(success);
      return result ?? {};
    } catch (e) {
      const message = operationErrorMessage(e);
      if (options.throwOnError) throw new Error(message);
      notify(message, true);
      return null;
    } finally {
      if (!options.background) setBusy(false);
    }
  }
  const go = (p) => {
    setPage(p);
    setSearch("");
    setMobileMenu(false);
  };
  async function logout() {
    if (auth) await logoutAccount(auth);
    setSession(null);
    setCart({});
    setModal(null);
    setPage("home");
  }
  async function login(e) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    if (!configured) {
      notify(
        "Falta configurar la conexión a Firebase. Contactá al administrador.",
        true,
      );
      return;
    }
    setAuthError("");
    setBusy(true);
    try {
      if (loginMode === "register") {
        const result = await createUserWithEmailAndPassword(
          auth,
          f.get("email"),
          f.get("password"),
        );
        await updateProfile(result.user, { displayName: f.get("name") });
        await sendEmailVerification(result.user);
        notify("Cuenta creada. Revisá tu email para verificarla.");
        await result.user.getIdToken(true);
        setSession((s) => (s ? { ...s, name: f.get("name") } : s));
      } else {
        if (auth.currentUser) await signOut(auth);
        await signInWithEmailAndPassword(
          auth,
          f.get("email"),
          f.get("password"),
        );
      }
    } catch (e) {
      const errors = {
        "auth/invalid-credential": "El email o la contraseña no coinciden.",
        "auth/email-already-in-use": "Ese email ya tiene una cuenta.",
        "auth/weak-password": "Usá una contraseña de al menos 8 caracteres.",
        "auth/too-many-requests": "Demasiados intentos. Probá más tarde.",
      };
      const message = errors[e.code] || accessErrorMessage(e);
      setAuthError(message);
      notify(message, true);
    } finally {
      setBusy(false);
    }
  }
  function chooseAccess(intent) {
    setAccessIntent(intent);
    try {
      if (intent) sessionStorage.setItem("rekreo-access-intent", intent);
      else sessionStorage.removeItem("rekreo-access-intent");
    } catch {}
    setSession((current) =>
      current ? { ...current, accessIntent: intent || "student" } : current,
    );
  }
  async function googleLogin() {
    if (!configured) {
      notify(
        "Falta configurar Firebase para ingresar con Google.",
        true,
      );
      return;
    }
    setAuthError("");
    setBusy(true);
    try {
      if (auth.currentUser) await signOut(auth);
      await loginGoogle(auth);
    } catch (e) {
      const message =
        e.code === "auth/popup-closed-by-user"
          ? "Se cerró la ventana de Google antes de terminar. Podés intentarlo nuevamente."
          : e.code === "auth/account-exists-with-different-credential"
            ? "Ingresá con tu contraseña y vinculá Google desde Mi credencial."
            : isAndroid && ["NOT_CONFIGURED", "GOOGLE_SIGN_IN_FAILED"].includes(e.code)
              ? e.message : accessErrorMessage(e);
      setAuthError(message);
      notify(message, true);
    } finally {
      setBusy(false);
    }
  }
  async function refreshOwnerAccess() {
    if (busy || !auth?.currentUser) return;
    setBusy(true);
    try {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      const result = await call("resolveOwnerAccess");
      setSession((current) => ({
        ...current,
        ownerAccessStatus: result.status,
        ...(result.status === "authorized"
          ? { role: result.role || "owner", kioskId: result.kioskId }
          : {}),
      }));
      if (result.status === "authorized") {
        setPage("home");
        notify("Email autorizado. Bienvenido a tu kiosko.");
      }
    } catch (e) {
      setSession((current) => ({ ...current, ownerAccessStatus: "error" }));
      notify(
        e.message ||
          "No se pudo comprobar el acceso. Revisá las reglas de Firestore.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }
  async function join(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    let info;
    {
      try {
        info = await call("getSchoolInfo", { code: f.get("code") });
      } catch (e) {
        notify(e.message || "Código no encontrado", true);
        return;
      }
      if (!window.confirm(`¿Querés unirte a ${info.name}, ${info.school}?`))
        return;
    }
    const res = await action(
      "joinSchool",
      { code: f.get("code"), course: f.get("course") },
      "Escuela vinculada correctamente",
    );
    if (res) {
      setSession((s) => ({ ...s, kioskId: res.kioskId }));
      setPage("home");
    }
  }
  function add(p, delta) {
    if (delta > 0 && !cart[p.id] && Object.keys(cart).length >= 5) {
      notify("Podés elegir hasta 5 productos distintos por compra.", true);
      return;
    }
    setCart((c) => {
      const q = (c[p.id] || 0) + delta;
      if (q > p.stock) {
        notify("No queda stock para agregar más.", true);
        return c;
      }
      const next = { ...c };
      if (q <= 0) delete next[p.id];
      else next[p.id] = q;
      return next;
    });
  }
  const cartItems = Object.entries(cart)
      .map(([id, qty]) => ({ ...data.products.find((p) => p.id === id), qty }))
      .filter((p) => p.id),
    cartTotal = cartItems.reduce((n, p) => n + p.price * p.qty, 0),
    cartQty = cartItems.reduce((n, p) => n + p.qty, 0);
  async function purchase(e) {
    e.preventDefault();
    const res = await action(
      "placeOrder",
      {
        requestId: orderRequest.current,
        items: cartItems.map((p) => ({ productId: p.id, qty: p.qty })),
        slotId,
        date,
        delivery,
      },
      "¡Pedido confirmado! Tu saldo ya fue actualizado.",
    );
    if (res) {
      orderRequest.current = newId();
      setCart({});
      setCheckout(false);
      setModal({ type: "receipt", order: res });
      setPage("orders");
    }
  }
  function downloadCSV() {
    const rows = [
      [
        "Fecha",
        "Tipo",
        "Alumno",
        "Importe ARS",
        "Saldo posterior ARS",
        "Detalle",
      ],
      ...data.movements.map((m) => [
        new Date(ts(m.createdAt)).toISOString(),
        m.type,
        data.members.find((x) => x.id === m.userId)?.name || m.userId,
        m.amount / 100,
        m.balanceAfter / 100,
        m.note,
      ]),
    ];
    const escape = (x) =>
      '"' +
      String(x ?? "")
        .replaceAll('"', '""')
        .replace(/^[=+@-]/, "'$&") +
      '"';
    downloadFile(`recreo-movimientos-${localDate()}.csv`,
      "\uFEFF" + rows.map((r) => r.map(escape).join(";")).join("\r\n"),
      "text/csv;charset=utf-8");
  }
  const todayOrders = data.orders.filter((o) => o.date === localDate()),
    activeOrders = data.orders.filter(
      (o) => !["delivered", "cancelled", "uncollected"].includes(o.status),
    ),
    sales = todayOrders
      .filter((o) => o.status !== "cancelled")
      .reduce((n, o) => n + o.total, 0),
    todayTopups = data.movements
      .filter(
        (m) =>
          m.type === "topup" &&
          localDate(new Date(ts(m.createdAt))) === localDate(),
      )
      .reduce((n, m) => n + m.amount, 0);
  const visibleProducts = data.products.filter(
    (p) =>
      (staff || p.active) &&
      (!search ||
        (p.name + " " + p.category)
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (category === "Todos" || p.category === category),
  );
  const nav = staff
    ? [
        ["home", "Resumen", LayoutDashboard],
        ["orders", "Pedidos", ShoppingBag],
        ["products", "Productos", Package],
        ["counter", "Cobrar en mostrador", Monitor],
        ["students", "Alumnos y cargas", Users],
        ["gallery", "Galería de imágenes", Images],
        ["reports", "Caja y estadísticas", BarChart3],
        ["movements", "Movimientos", Wallet],
        ...(session.role !== "staff"
          ? [
              ["settings", "Mi kiosco", Settings],
              ["team", "Mi equipo", Users],
            ]
          : []),
        ["audit", "Actividad", Clock],
        ...(session?.role === "superadmin"
          ? [["platform", "Plataforma", ShieldCheck]]
          : []),
      ]
    : [
        ["home", "Mi kiosco", Store],
        ["orders", "Mis pedidos", ShoppingBag],
        ["wallet", "Mi saldo", Wallet],
        ["account", "Mi credencial", QrCode],
        ["pay", "Pagar en mostrador", ScanLine],
      ];
  const title = {
    home: staff ? "Un buen día empieza acá." : "¿Qué comemos en el recreo?",
    orders: staff ? "Todos tus pedidos" : "Mis pedidos",
    products: "Tu catálogo, a tu manera.",
    students: "Alumnos y cargas",
    movements: "Cada movimiento, en orden.",
    settings: "Así funciona tu kiosco.",
    wallet: "Tu saldo, siempre a mano.",
    account: "Tu credencial escolar",
    platform: "Tu red de kioskos",
    gallery: "Una foto, muchas posibilidades.",
    reports: "Tus números, bien claros.",
    counter: "Cobrá sin buscar cambio.",
    team: "Tu equipo, conectado.",
    audit: "Cada acción, registrada.",
    pay: "Pagar en mostrador",
  };
  const orderList = (staff ? data.orders : myOrders).filter(
    (o) =>
      (orderFilter === "all" ||
        (orderFilter === "active"
          ? !["delivered", "cancelled", "uncollected"].includes(o.status)
          : o.status === orderFilter)) &&
      (!search ||
        (o.code + " " + o.studentName + " " + o.course)
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  const input = (label, name, defaultValue, other = {}) => (
    <label>
      {label}
      <input name={name} defaultValue={defaultValue} {...other} />
    </label>
  );
  const ownerAccessPanel = (
    <>
      <p className="notice compact">
        {session?.ownerAccessStatus === "verification-required"
          ? "Verificá tu email para comprobar el acceso al kiosko."
          : session?.ownerAccessStatus === "error"
            ? "No pudimos comprobar tu autorización. Revisá la conexión y que las funciones de Firebase estén desplegadas."
            : "Esta cuenta todavía no tiene un kiosko habilitado. Contactá a reKreo."}
      </p>
      <p className="hint">
        Email de tu cuenta: <b>{session?.email}</b>. El administrador debe
        autorizar este mismo correo como responsable del kiosko.
      </p>
      {auth?.currentUser && !auth.currentUser.emailVerified && (
        <button
          className="button secondary full"
          disabled={busy}
          onClick={async () => {
            try {
              await sendEmailVerification(auth.currentUser);
              notify("Email de verificación enviado. Revisá también spam.");
            } catch {
              notify("No se pudo enviar. Probá de nuevo más tarde.", true);
            }
          }}
        >
          Enviar verificación de email
        </button>
      )}
      <button
        className="button primary full"
        disabled={busy}
        onClick={refreshOwnerAccess}
      >
        {busy
          ? "Comprobando…"
          : "Ya verifiqué / autorizaron mi email · comprobar"}
      </button>
      <button className="text-button owner-entry" onClick={logout}>
        Ingresar con otro email
      </button>
    </>
  );
  if (authLoading)
    return (
      <div className="loading-screen">
        <Loader2 className="spin" />
        <p>Comprobando tu cuenta y permisos…</p>
        <p className="hint">
          Si falta alguna configuración, te mostraremos el motivo.
        </p>
      </div>
    );
  if (adminEntrance && session && !canAccessAdmin(session))
    return (
      <main className="restricted-access">
        <Brand />
        <span className="feature-icon">
          <ShieldCheck />
        </span>
        <h1>Acceso restringido</h1>
        <p>
          Tu sesión está iniciada, pero falta habilitar el rol de
          superadministrador en tu documento de usuarios.
        </p>
        <p className="hint">
          Iniciaste sesión como {session.email || session.name}. El permiso se
          configura en Firestore, en usuarios/{session.uid}, con el campo rol
          igual a superadmin.
        </p>
        <div className="admin-document-help">
          <p>
            <b>Colección:</b> usuarios
          </p>
          <p>
            <b>ID del documento (tu UID):</b>
          </p>
          <code>{session.uid}</code>
          <p>
            <b>Campo:</b> rol · <b>Tipo:</b> string · <b>Valor:</b> superadmin
          </p>
          <button
            className="button secondary tiny"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(session.uid);
              } catch {}
            }}
          >
            Copiar mi UID
          </button>
        </div>
        <button className="button primary" onClick={logout}>
          Ingresar con otra cuenta
        </button>
        <a className="text-button" href={homeHref()}>
          Volver al acceso de alumnos y kioskeros
        </a>
      </main>
    );
  return (
    <>
      {!session ? (
        <main className="login-page">
          <section className="login-story">
            <a className="brand" href={homeHref()}>
              <Brand />
            </a>
            <div>
              <div className="eyebrow light">EL RECREO ES PARA DISFRUTARLO</div>
              <h1>
                Menos filas.
                <br />
                Más recreo.
              </h1>
              <p>
                Tu kiosco escolar, conectado.
                <br />
                Cargá saldo, elegí lo que te gusta y pasá a retirar.
              </p>
              <div className="login-illustration">
                <div className="illustration-sun">✳</div>
                <span className="floating-food">🥪</span>
                <div className="mini-receipt">
                  <span className="mini-check">
                    <Check size={18} />
                  </span>
                  <div>
                    <b>¡Tu pedido está listo!</b>
                    <small>Nos vemos en el recreo</small>
                  </div>
                </div>
                <span className="food-second">🧃</span>
              </div>
            </div>
            <div className="login-footer">
              <ShieldCheck size={16} /> Un espacio para cada escuela.
            </div>
          </section>
          <section className="login-form">
            <div className="login-form-inner">
              <span className="eyebrow">BIENVENIDO A REKREO</span>
              {authError && (
                <div className="auth-error-panel" role="alert">
                  <AlertCircle size={20} />
                  <div>
                    <b>No se pudo completar el acceso</b>
                    <p>{authError}</p>
                  </div>
                </div>
              )}
              {schoolInfo && (
                <div className="school-arrival">
                  <School size={21} />
                  <div>
                    <b>{schoolInfo.name}</b>
                    <small>{schoolInfo.school}</small>
                  </div>
                </div>
              )}
              {schoolInfo && process.env.REACT_APP_PLAY_STORE_URL && (
                <a
                  className="button secondary full"
                  href={(() => {
                    const url = new URL(process.env.REACT_APP_PLAY_STORE_URL);
                    url.searchParams.set(
                      "referrer",
                      new URLSearchParams({
                        kiosk: schoolInfo.code,
                      }).toString(),
                    );
                    return url.toString();
                  })()}
                >
                  Descargar app Android
                </a>
              )}
              {new URLSearchParams(location.search).get("escuela") && (
                <p className="notice compact">
                  Código de kiosko:{" "}
                  <b>{new URLSearchParams(location.search).get("escuela")}</b>.
                  Lo conservamos para después del ingreso.
                </p>
              )}
              {!accessIntent && !adminEntrance ? (
                <>
                  <h2>¿Cómo vas a usar reKreo?</h2>
                  <p className="muted">Elegí tu acceso para empezar.</p>
                  <div className="access-choices">
                    <button
                      className="access-choice"
                      onClick={() => chooseAccess("student")}
                    >
                      <span className="access-choice-icon">
                        <ShoppingBag size={27} />
                      </span>
                      <span>
                        <b>Soy alumno / cliente</b>
                        <small>
                          Comprá, cargá crédito y pedí para el recreo.
                        </small>
                      </span>
                      <ArrowRight size={20} />
                    </button>
                    <button
                      className="access-choice"
                      onClick={() => chooseAccess("owner")}
                    >
                      <span className="access-choice-icon owner">
                        <Store size={27} />
                      </span>
                      <span>
                        <b>Soy kioskero</b>
                        <small>
                          Ingresá con el email autorizado para tu kiosko.
                        </small>
                      </span>
                      <ArrowRight size={20} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="selected-access">
                    <span>
                      {adminEntrance ? (
                        <ShieldCheck size={18} />
                      ) : accessIntent === "owner" ? (
                        <Store size={18} />
                      ) : (
                        <ShoppingBag size={18} />
                      )}
                      <b>
                        {adminEntrance
                          ? "Administración de reKreo"
                          : accessIntent === "owner"
                            ? "Acceso kioskeros"
                            : "Acceso alumnos / clientes"}
                      </b>
                    </span>
                    {!adminEntrance && (
                      <button
                        className="text-button"
                        onClick={() => chooseAccess(null)}
                      >
                        Cambiar
                      </button>
                    )}
                  </div>
                  <h2>
                    {adminEntrance
                      ? "Administrar reKreo."
                      : loginMode === "register"
                        ? accessIntent === "owner"
                          ? "Tu kiosko empieza acá."
                          : "Tu cuenta, tu recreo."
                        : accessIntent === "owner"
                          ? "Bienvenido a tu kiosko."
                          : "Qué bueno verte."}
                  </h2>
                  <p className="muted">
                    {adminEntrance
                      ? "Ingresá con tu cuenta autorizada de superadministrador."
                      : loginMode === "register"
                        ? accessIntent === "owner"
                          ? "Creá tu cuenta con el email que autorizó reKreo para tu kiosko."
                          : "Creá tu cuenta y vinculá tu escuela."
                        : accessIntent === "owner"
                          ? "Ingresá para gestionar tu kiosko, pedidos y ventas."
                          : "Ingresá para seguir donde lo dejaste."}
                  </p>
                  <button
                    className="button google-button full"
                    disabled={busy}
                    onClick={googleLogin}
                  >
                    <span className="google-letter">G</span>Continuar con Google
                  </button>
                  <div className="auth-divider">
                    <span>o con tu email</span>
                  </div>
                  {!adminEntrance && (
                    <div className="segmented">
                      <button
                        className={loginMode === "login" ? "selected" : ""}
                        onClick={() => setLoginMode("login")}
                      >
                        Ingresar
                      </button>
                      <button
                        className={loginMode === "register" ? "selected" : ""}
                        onClick={() => setLoginMode("register")}
                      >
                        Crear cuenta
                      </button>
                    </div>
                  )}
                  <form onSubmit={login}>
                    {loginMode === "register" &&
                      input("Nombre y apellido", "name", "", {
                        required: true,
                        maxLength: 100,
                        autoComplete: "name",
                      })}
                    {input("Email", "email", "", {
                      type: "email",
                      required: true,
                      autoComplete: "email",
                      placeholder: "tu@email.com",
                    })}
                    {input("Contraseña", "password", "", {
                      type: "password",
                      required: true,
                      minLength: 8,
                      autoComplete:
                        loginMode === "register"
                          ? "new-password"
                          : "current-password",
                      placeholder: "Al menos 8 caracteres",
                    })}
                    <button className="button primary full" disabled={busy}>
                      {busy ? <Loader2 className="spin" size={18} /> : null}
                      {loginMode === "register"
                        ? "Crear mi cuenta"
                        : "Ingresar"}
                      <ArrowRight size={18} />
                    </button>
                  </form>
                  {configured && (
                    <button
                      className="text-button forgot"
                      onClick={() => setModal({ type: "reset" })}
                    >
                      Olvidé mi contraseña
                    </button>
                  )}
                </>
              )}
              {!configured && (
                <p className="connection-note">
                  <i /> Conexión a Firebase pendiente
                </p>
              )}
            </div>
          </section>
        </main>
      ) : (
        <div className="app-shell">
          <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
            <div className="sidebar-head">
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  go("home");
                }}
                className="brand"
              >
                <Brand />
              </a>
              <IconButton
                className="icon-button mobile-close"
                onClick={() => setMobileMenu(false)}
                aria-label="Cerrar menú"
              >
                <X />
              </IconButton>
            </div>
            <div className="school-card">
              <span className="school-icon">
                <School size={20} />
              </span>
              <div>
                <b>{k?.name || "Tu escuela"}</b>
                <small>{k?.school || "Vinculá tu cuenta"}</small>
              </div>
            </div>
            {session.role === "superadmin" && (
              <button
                className="button secondary tiny full"
                onClick={() => go("platform")}
              >
                Todos mis kioskos
              </button>
            )}
            <span className="nav-label">
              {staff ? "TU ESPACIO DE TRABAJO" : "TU RECREO"}
            </span>
            <nav>
              {nav.map(([id, label, Icon]) => (
                <button
                  key={id}
                  className={page === id ? "nav-item active" : "nav-item"}
                  onClick={() =>
                    id === "pay" ? setModal({ type: "pay" }) : go(id)
                  }
                >
                  <Icon size={19} />
                  <span>{label}</span>
                  {id === "orders" &&
                    (staff
                      ? activeOrders.length
                      : myOrders.filter(
                          (o) =>
                            !["delivered", "cancelled", "uncollected"].includes(
                              o.status,
                            ),
                        ).length) > 0 && (
                      <b className="nav-count">
                        {staff
                          ? activeOrders.length
                          : myOrders.filter(
                              (o) =>
                                ![
                                  "delivered",
                                  "cancelled",
                                  "uncollected",
                                ].includes(o.status),
                            ).length}
                      </b>
                    )}
                </button>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <div className="profile">
                <span className="avatar">
                  {session.name
                    .split(" ")
                    .map((x) => x[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <div>
                  <b>{session.name}</b>
                  <small>
                    {session.role === "student"
                      ? "Alumno"
                      : session.role === "owner"
                        ? "Kiosquero"
                        : "Administrador"}
                  </small>
                </div>
                <IconButton onClick={logout} aria-label="Cerrar sesión">
                  <LogOut size={18} />
                </IconButton>
              </div>
            </div>
          </aside>
          {mobileMenu && (
            <div
              className="sidebar-overlay"
              onClick={() => setMobileMenu(false)}
            />
          )}
          <div className="main-shell">
            <header className="topbar">
              <div className="breadcrumb">
                <IconButton
                  onClick={() => setMobileMenu(true)}
                  className="icon-button mobile-menu"
                  aria-label="Abrir menú"
                >
                  <Menu size={22} />
                </IconButton>
                <span>{staff ? "Mi espacio" : "Mi escuela"}</span>
                <ChevronRight size={14} />
                <b>{nav.find((x) => x[0] === page)?.[1]}</b>
              </div>
              <div className="topbar-right">
                <span className="connection">
                  <i />
                  Conectado
                </span>
                <span className="today">
                  <CalendarDays size={15} />
                  {new Date().toLocaleDateString("es-AR", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
                <span className="avatar small-avatar">{session.name[0]}</span>
              </div>
            </header>
            <main className="content">
              {onboardingFor(session, session.accessIntent) ? (
                <div className="join-card">
                  <span className="feature-icon">
                    <School />
                  </span>
                  {onboardingFor(session, session.accessIntent) === "owner" ? (
                    <>
                      <h1>Tu acceso como kioskero</h1>
                      <p>
                        Ingresaste como kioskero. Tu panel se habilita con el
                        mismo email que autorizó el administrador de reKreo.
                      </p>
                      {ownerAccessPanel}
                      <button
                        className="text-button owner-entry"
                        onClick={() => chooseAccess("student")}
                      >
                        Soy alumno / cliente · unirme a mi escuela
                      </button>
                    </>
                  ) : (
                    <>
                      <h1>¿Cuál es tu escuela?</h1>
                      <p>
                        Ingresá el código que te dio tu kiosco. Lo vinculamos
                        una vez y listo.
                      </p>
                      <form onSubmit={join}>
                        {input(
                          "Código de escuela",
                          "code",
                          new URLSearchParams(location.search).get("escuela") ||
                            "",
                          {
                            required: true,
                            placeholder: "Ej. ESCUELA23",
                            maxLength: 20,
                          },
                        )}
                        {input("Curso, división y turno", "course", "", {
                          required: true,
                          placeholder: "Ej. 4° B · mañana",
                          maxLength: 60,
                        })}
                        <button className="button primary full" disabled={busy}>
                          Vincular mi escuela
                          <ArrowRight size={18} />
                        </button>
                      </form>
                      <button
                        className="text-button owner-entry"
                        onClick={() => chooseAccess("owner")}
                      >
                        Soy kioskero · Comprobar mi email
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">
                        {staff
                          ? "HOLA, " + session.name.split(" ")[0].toUpperCase()
                          : "TU KIOSCO, MÁS CERCA"}
                      </span>
                      <h1>{title[page]}</h1>
                      <p>
                        {page === "home"
                          ? staff
                            ? "Todo lo que necesitás para un recreo más organizado."
                            : k?.notice
                          : page === "products"
                            ? "Precios, disponibilidad y fotos. Todo en un solo lugar."
                            : page === "students"
                              ? "Recibí el dinero, identificá al alumno y acreditá su saldo."
                              : page === "orders"
                                ? "Cada pedido confirmado ya está descontado del saldo."
                                : page === "settings"
                                  ? "Elegí las reglas que mejor se adapten a tu escuela."
                                  : ""}
                      </p>
                    </div>
                    <div className="heading-actions">
                      {staff && k && page === "home" && (
                        <>
                          <button
                            className="button secondary"
                            onClick={async () => {
                              if (k)
                                await action(
                                  "saveSettings",
                                  { settings: { ...k, paused: !k.paused } },
                                  k.paused
                                    ? "Pedidos habilitados"
                                    : "Pedidos pausados",
                                );
                            }}
                            disabled={busy || !k}
                          >
                            {k?.paused ? (
                              <Play size={16} />
                            ) : (
                              <Pause size={16} />
                            )}{" "}
                            {k?.paused ? "Reanudar pedidos" : "Pausar pedidos"}
                          </button>
                          <button
                            className="button primary"
                            onClick={() =>
                              setModal({ type: "topup", requestId: newId() })
                            }
                          >
                            <Plus size={17} />
                            Cargar saldo
                          </button>
                        </>
                      )}
                      {staff && page === "products" && (
                        <button
                          className="button primary"
                          onClick={() => setModal({ type: "product" })}
                        >
                          <Plus size={17} />
                          Nuevo producto
                        </button>
                      )}
                      {staff && page === "movements" && (
                        <button
                          className="button secondary"
                          onClick={downloadCSV}
                        >
                          <Download size={16} />
                          Exportar CSV
                        </button>
                      )}
                    </div>
                  </div>
                  {page === "home" && staff && k && (
                    <>
                      <Reports data={data} compact />
                      <div className="dashboard-grid">
                        <section className="panel orders-panel">
                          <div className="panel-heading">
                            <div>
                              <h2>
                                La próxima entrega{" "}
                                <span className="count-chip">
                                  {activeOrders.length}
                                </span>
                              </h2>
                              <p>Los pedidos que están esperando su recreo.</p>
                            </div>
                            <button
                              className="text-button"
                              onClick={() => go("orders")}
                            >
                              Ver todos
                              <ArrowUpRight size={16} />
                            </button>
                          </div>
                          {activeOrders.length ? (
                            <div className="queue-list">
                              {activeOrders.slice(0, 5).map((o) => (
                                <div className="queue-row" key={o.id}>
                                  <div className="order-avatar">
                                    {o.studentName[0]}
                                  </div>
                                  <div className="queue-person">
                                    <b>{o.studentName}</b>
                                    <span>
                                      {o.course} · {o.code}
                                    </span>
                                  </div>
                                  <div className="queue-items">
                                    <b>
                                      {o.items
                                        .map((i) => `${i.qty} ${i.name}`)
                                        .join(", ")}
                                    </b>
                                    <span>
                                      {o.date} · {o.slotLabel} · {o.slotTime}
                                    </span>
                                  </div>
                                  <div className="queue-end">
                                    <b>{fmt(o.total)}</b>
                                    <button
                                      className="text-button"
                                      onClick={() =>
                                        setModal({ type: "order", order: o })
                                      }
                                    >
                                      Ver pedido
                                      <ChevronRight size={15} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <Empty title="Todo al día">
                              Los nuevos pedidos van a aparecer acá.
                            </Empty>
                          )}
                        </section>
                        <section className="daily-note">
                          <span className="note-tag">
                            <span />
                            TU KIOSCO EN MARCHA
                          </span>
                          <div className="note-art">
                            <span>🥪</span>
                            <i>✳</i>
                          </div>
                          <h2>
                            Prepará con tiempo.
                            <br />
                            Entregá sin vueltas.
                          </h2>
                          <p>
                            Compartí el código de tu escuela para que tus
                            alumnos se sumen.
                          </p>
                          <button
                            className="school-code"
                            onClick={() => setModal({ type: "schoolQR" })}
                          >
                            <QrCode size={22} />
                            <div>
                              <small>CÓDIGO DE ESCUELA</small>
                              <b>{k?.code || "—"}</b>
                            </div>
                            <ArrowUpRight size={19} />
                          </button>
                        </section>
                        <section className="panel capacity-panel">
                          <div className="panel-heading">
                            <div>
                              <h2>Un recreo a la vez</h2>
                              <p>
                                Cupos de hoy · pedidos y productos preparados.
                              </p>
                            </div>
                            <button
                              className="text-button"
                              onClick={() => go("settings")}
                            >
                              Configurar
                              <Settings size={15} />
                            </button>
                          </div>
                          <div className="slot-grid">
                            {k?.slots.map((s) => {
                              const os = todayOrders.filter(
                                  (o) =>
                                    o.slotId === s.id &&
                                    o.status !== "cancelled",
                                ),
                                prep = os.reduce(
                                  (n, o) =>
                                    n +
                                    o.items.reduce(
                                      (m, i) => m + (i.prepared ? i.qty : 0),
                                      0,
                                    ),
                                  0,
                                );
                              return (
                                <div className="slot-card" key={s.id}>
                                  <div>
                                    <span className="slot-time">{s.time}</span>
                                    <span className="badge gray">
                                      {s.label}
                                    </span>
                                  </div>
                                  <b>
                                    {os.length}
                                    <small> / {s.maxOrders} pedidos</small>
                                  </b>
                                  <div className="progress">
                                    <i
                                      style={{
                                        width: `${Math.min(100, (os.length / s.maxOrders) * 100)}%`,
                                      }}
                                    />
                                  </div>
                                  <p>
                                    {prep} de {s.maxPrepared} preparados ·
                                    cierre {s.cutoffMinutes} min antes
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </section>
                        <section className="panel stock-panel">
                          <div className="panel-heading">
                            <div>
                              <h2>Atención al stock</h2>
                              <p>Productos con 5 unidades o menos.</p>
                            </div>
                          </div>
                          {data.products.filter((p) => p.active && p.stock <= 5)
                            .length ? (
                            data.products
                              .filter((p) => p.active && p.stock <= 5)
                              .map((p) => (
                                <button
                                  className="stock-row"
                                  key={p.id}
                                  onClick={() =>
                                    setModal({ type: "product", product: p })
                                  }
                                >
                                  <ProductVisual p={p} small />
                                  <b>{p.name}</b>
                                  <span className="badge amber">
                                    {p.stock} unidades
                                  </span>
                                  <ChevronRight size={16} />
                                </button>
                              ))
                          ) : (
                            <div className="stock-ok">
                              <CheckCircle2 size={24} />
                              <b>Todo listo para vender</b>
                              <p>No tenés productos con stock bajo.</p>
                            </div>
                          )}
                        </section>
                      </div>
                    </>
                  )}
                  {((page === "home" && !staff) || page === "products") && (
                    <>
                      {staff && (
                        <div className="catalog-quota">
                          <span>
                            <Package size={16} />{" "}
                            {data.products.filter((p) => p.active).length} /{" "}
                            {k?.limits?.products ?? 100} productos activos
                          </span>
                          <button
                            className="text-button"
                            onClick={() => go("gallery")}
                          >
                            <Images size={16} />
                            {data.images.length} / {k?.limits?.images ?? 100}{" "}
                            fotos almacenadas
                          </button>
                        </div>
                      )}
                      {!staff && (
                        <div className="student-hero">
                          <div>
                            <span className="eyebrow">TU SALDO DISPONIBLE</span>
                            <h2>{fmt(me?.balance || 0)}</h2>
                            <p>
                              Cargá saldo en el kiosco y comprá sin efectivo.
                            </p>
                            <button
                              className="button white"
                              onClick={() => setModal({ type: "account" })}
                            >
                              <QrCode size={17} />
                              Mi QR para recargar
                              <ArrowUpRight size={16} />
                            </button>
                          </div>
                          <div className="hero-food">
                            <span>🥪</span>
                            <i>✳</i>
                            <b>🧃</b>
                          </div>
                        </div>
                      )}
                      {(k?.closed || me?.disabled) && (
                        <div className="notice">
                          <AlertCircle size={18} />
                          Esta cuenta o kiosko está desactivado. El saldo y los
                          movimientos se conservan. Contactá al responsable.
                        </div>
                      )}
                      {k?.paused && (
                        <div className="notice">
                          <Pause size={18} />
                          El kiosco pausó los pedidos. Podés seguir viendo el
                          catálogo.
                        </div>
                      )}
                      <div className="catalog-toolbar">
                        <div className="tabs">
                          {[
                            "Todos",
                            ...new Set(data.products.map((p) => p.category)),
                          ].map((c) => (
                            <button
                              key={c}
                              onClick={() => setCategory(c)}
                              className={category === c ? "selected" : ""}
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                        <div className="search">
                          <Search size={17} />
                          <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar algo rico…"
                            aria-label="Buscar productos"
                          />
                        </div>
                      </div>
                      <div className="product-grid">
                        {visibleProducts.map((p) => (
                          <article
                            className={`product-card ${!p.active ? "disabled-product" : ""}`}
                            key={p.id}
                          >
                            <div className="visual-wrap">
                              <ProductVisual p={p} />
                              {p.prepared && (
                                <span className="product-tag">
                                  Hecho en el kiosco
                                </span>
                              )}
                              {!p.stock && (
                                <span className="sold-out">Agotado</span>
                              )}
                            </div>
                            <div className="product-info">
                              <span className="product-category">
                                {p.category}
                              </span>
                              <h3>{p.name}</h3>
                              <p>
                                {p.stock
                                  ? `${p.stock} disponibles`
                                  : "Sin stock"}
                                {staff && !p.active ? " · Oculto" : ""}
                              </p>
                              <div className="product-bottom">
                                <b>{fmt(p.price)}</b>
                                {staff ? (
                                  <button
                                    className="button tiny secondary"
                                    onClick={() =>
                                      setModal({ type: "product", product: p })
                                    }
                                  >
                                    Editar
                                  </button>
                                ) : cart[p.id] ? (
                                  <div className="quantity">
                                    <button
                                      aria-label={`Quitar ${p.name}`}
                                      onClick={() => add(p, -1)}
                                    >
                                      <Minus size={15} />
                                    </button>
                                    <b>{cart[p.id]}</b>
                                    <button
                                      aria-label={`Agregar ${p.name}`}
                                      disabled={cart[p.id] >= p.stock}
                                      onClick={() => add(p, 1)}
                                    >
                                      <Plus size={15} />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    className="add-button"
                                    aria-label={`Agregar ${p.name}`}
                                    disabled={
                                      !p.stock ||
                                      k?.paused ||
                                      k?.closed ||
                                      me?.disabled
                                    }
                                    onClick={() => add(p, 1)}
                                  >
                                    <Plus size={21} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                      {!visibleProducts.length && (
                        <Empty icon={Package} title="No encontramos productos">
                          Probá otra búsqueda o agregá un producto al catálogo.
                        </Empty>
                      )}
                      {!staff && cartQty > 0 && (
                        <button
                          className="cart-bar"
                          onClick={() => setCheckout(true)}
                        >
                          <span className="cart-number">{cartQty}</span>
                          <b>Ver mi pedido</b>
                          <span>{fmt(cartTotal)}</span>
                          <ArrowRight size={20} />
                        </button>
                      )}
                    </>
                  )}
                  {page === "orders" && (
                    <>
                      <div className="list-toolbar">
                        <div className="tabs">
                          {[
                            ["active", "Pendientes"],
                            ["all", "Todos"],
                            ["delivered", "Entregados"],
                            ["cancelled", "Cancelados"],
                            ["uncollected", "No retirados"],
                          ].map(([id, label]) => (
                            <button
                              key={id}
                              className={orderFilter === id ? "selected" : ""}
                              onClick={() => setOrderFilter(id)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="search">
                          <Search size={17} />
                          <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar pedido…"
                            aria-label="Buscar pedido"
                          />
                        </div>
                        {staff && (
                          <button
                            className="button primary"
                            onClick={() => setOrderScan(true)}
                          >
                            <ScanLine size={18} />
                            Escanear pedido
                          </button>
                        )}
                      </div>
                      <section className="panel">
                        {orderList.length ? (
                          <div className="table-scroll">
                            <table>
                              <thead>
                                <tr>
                                  <th>Pedido / alumno</th>
                                  <th>Productos</th>
                                  <th>Retiro</th>
                                  <th>Total</th>
                                  <th>Estado</th>
                                  <th />
                                </tr>
                              </thead>
                              <tbody>
                                {orderList.map((o) => (
                                  <tr key={o.id}>
                                    <td>
                                      <b>{o.code}</b>
                                      <small>
                                        {o.studentName} · {o.course}
                                      </small>
                                    </td>
                                    <td>
                                      {o.items
                                        .map((i) => `${i.qty} × ${i.name}`)
                                        .join(", ")}
                                    </td>
                                    <td>
                                      {o.date}
                                      <small>
                                        {o.slotTime} ·{" "}
                                        {o.delivery === "classroom"
                                          ? "Al aula"
                                          : "En kiosco"}
                                      </small>
                                    </td>
                                    <td>
                                      <b>{fmt(o.total)}</b>
                                    </td>
                                    <td>
                                      <Badge status={o.status} />
                                    </td>
                                    <td>
                                      <button
                                        className="text-button"
                                        onClick={() =>
                                          setModal({ type: "order", order: o })
                                        }
                                      >
                                        Ver
                                        <ChevronRight size={16} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <Empty title="Todavía no hay pedidos acá">
                            {staff
                              ? "Cuando tus alumnos confirmen, los vas a ver en esta lista."
                              : "Elegí tus productos y confirmá tu primer pedido."}
                          </Empty>
                        )}
                      </section>
                    </>
                  )}
                  {page === "students" && (
                    <>
                      <div className="list-toolbar">
                        <div className="search wide-search">
                          <Search size={17} />
                          <input
                            value={memberSearch}
                            onChange={(e) => setMemberSearch(e.target.value)}
                            placeholder="Buscar nombre, curso o número de cuenta…"
                            aria-label="Buscar alumno"
                          />
                        </div>
                        <button
                          className="button secondary"
                          onClick={() => setScan(true)}
                        >
                          <ScanLine size={18} />
                          Escanear QR
                        </button>
                      </div>
                      <section className="panel">
                        <div className="table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>Alumno</th>
                                <th>Curso</th>
                                <th>Cuenta</th>
                                <th>Saldo disponible</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {data.members
                                .filter(
                                  (m) =>
                                    m.role === "student" &&
                                    `${m.name} ${m.course} ${m.id}`
                                      .toLowerCase()
                                      .includes(memberSearch.toLowerCase()),
                                )
                                .map((m) => (
                                  <tr key={m.id}>
                                    <td>
                                      <div className="table-person">
                                        <span className="avatar">
                                          {m.name[0]}
                                        </span>
                                        <div>
                                          <b>{m.name}</b>
                                          <small>
                                            {m.email}
                                            {m.disabled ? " · Desactivada" : ""}
                                          </small>
                                        </div>
                                      </div>
                                    </td>
                                    <td>{m.course}</td>
                                    <td>
                                      <code>{m.id}</code>
                                    </td>
                                    <td>
                                      <b>{fmt(m.balance)}</b>
                                    </td>
                                    <td>
                                      <button
                                        disabled={m.disabled || k?.closed}
                                        className="button secondary tiny"
                                        onClick={() =>
                                          setModal({
                                            type: "topup",
                                            userId: m.id,
                                            requestId: newId(),
                                          })
                                        }
                                      >
                                        <Plus size={15} />
                                        Cargar saldo
                                      </button>
                                      {["owner", "superadmin"].includes(
                                        session.role,
                                      ) && (
                                        <div className="student-actions">
                                          <button
                                            className="text-button"
                                            disabled={!m.balance}
                                            onClick={() =>
                                              setModal({
                                                type: "cashout",
                                                member: m,
                                              })
                                            }
                                          >
                                            Devolver saldo
                                          </button>
                                          <button
                                            className="text-button danger"
                                            onClick={() =>
                                              action(
                                                "setMemberStatus",
                                                {
                                                  userId: m.id,
                                                  disabled: !m.disabled,
                                                },
                                                m.disabled
                                                  ? "Cuenta habilitada"
                                                  : "Cuenta desactivada",
                                              )
                                            }
                                          >
                                            {m.disabled
                                              ? "Reactivar"
                                              : "Desactivar"}
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                        {!data.members.some((m) => m.role === "student") && (
                          <Empty
                            icon={Users}
                            title="Tu escuela está lista para recibir alumnos"
                          >
                            Compartí el código de escuela para que se registren.
                          </Empty>
                        )}
                      </section>
                      <div className="notice">
                        <ShieldCheck size={18} />
                        Confirmá siempre que recibiste el dinero antes de
                        acreditar una carga. Las cargas quedan registradas con
                        su responsable.
                      </div>
                    </>
                  )}
                  {(page === "movements" || page === "wallet") && (
                    <>
                      {!staff && (
                        <div className="wallet-overview">
                          <div>
                            <span className="eyebrow">
                              DISPONIBLE EN ESTE KIOSCO
                            </span>
                            <h2>{fmt(me?.balance || 0)}</h2>
                            <p>Este saldo corresponde a {k?.name}.</p>
                          </div>
                          <button
                            className="button primary"
                            onClick={() => setModal({ type: "account" })}
                          >
                            <QrCode size={18} />
                            Mostrar QR para recargar
                          </button>
                        </div>
                      )}
                      <section className="panel">
                        <div className="panel-heading">
                          <div>
                            <h2>
                              {staff
                                ? "Historial de movimientos"
                                : "Tus últimos movimientos"}
                            </h2>
                            <p>
                              Cargas, compras y devoluciones. Todo queda
                              registrado.
                            </p>
                          </div>
                        </div>
                        {(staff ? data.movements : myMovements).length ? (
                          <div className="movement-list">
                            {(staff ? data.movements : myMovements).map((m) => (
                              <div className="movement" key={m.id}>
                                <span
                                  className={`movement-icon ${m.amount > 0 ? "positive" : ""}`}
                                >
                                  {m.amount > 0 ? (
                                    <ArrowDownLeft size={20} />
                                  ) : (
                                    <ArrowUpRight size={20} />
                                  )}
                                </span>
                                <div>
                                  <b>
                                    {m.type === "topup"
                                      ? "Carga de saldo"
                                      : m.type === "refund"
                                        ? "Reintegro por cancelación"
                                        : m.type === "cashout"
                                          ? "Devolución de dinero"
                                          : "Compra en el kiosko"}
                                  </b>
                                  <small>
                                    {staff
                                      ? (data.members.find(
                                          (x) => x.id === m.userId,
                                        )?.name || m.userId) + " · "
                                      : ""}
                                    {m.note}
                                  </small>
                                  <small>
                                    {new Date(
                                      ts(m.createdAt),
                                    ).toLocaleDateString("es-AR")}{" "}
                                    · {time(m.createdAt)}
                                    {staff
                                      ? " · " + (m.actor || "Sistema")
                                      : ""}
                                  </small>
                                </div>
                                <div className="movement-amount">
                                  <b
                                    className={
                                      m.amount > 0 ? "positive-text" : ""
                                    }
                                  >
                                    {m.amount > 0 ? "+" : ""}
                                    {fmt(m.amount)}
                                  </b>
                                  <small>Saldo: {fmt(m.balanceAfter)}</small>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <Empty icon={Wallet} title="Tu historial empieza acá">
                            Las cargas y compras aparecerán automáticamente.
                          </Empty>
                        )}
                      </section>
                    </>
                  )}
                  {page === "account" && (
                    <button
                      className="button secondary"
                      onClick={async () => {
                        try {
                          await linkGoogle(auth.currentUser);
                          notify(
                            "Google vinculado a tu cuenta actual. Conservás saldo e historial.",
                          );
                        } catch {
                          notify(
                            "No se pudo vincular Google. Puede que ya esté vinculado o pertenezca a otra cuenta.",
                            true,
                          );
                        }
                      }}
                    >
                      Vincular Google a mi cuenta
                    </button>
                  )}
                  {page === "account" && (
                    <div className="account-layout">
                      <AccountQR session={session} me={me} kiosk={k} />
                      <section className="panel account-help">
                        <h2>Una credencial, tu cuenta.</h2>
                        <p>
                          Mostrá este QR cuando quieras cargar saldo. El
                          kiosquero identifica tu cuenta y acredita el dinero
                          que le entregás.
                        </p>
                        <div>
                          <ShieldCheck />
                          <p>
                            El QR no permite comprar ni acceder a tu sesión. No
                            contiene tu contraseña.
                          </p>
                        </div>
                        <div>
                          <School />
                          <p>
                            Tu saldo se utiliza únicamente en {k?.name}. Si
                            cambiás de escuela, no se transfiere
                            automáticamente.
                          </p>
                        </div>
                      </section>
                    </div>
                  )}
                  {page === "settings" && k && (
                    <SettingsForm
                      kiosk={k}
                      busy={busy}
                      onSave={(settings) =>
                        action(
                          "saveSettings",
                          { settings },
                          "Configuración guardada correctamente",
                        )
                      }
                    />
                  )}
                  {page === "platform" && session.role === "superadmin" && (
                    <Platform
                      data={data}
                      session={session}
                      action={action}
                      notify={notify}
                      onOpen={(school) => {
                        setSession((x) => ({ ...x, kioskId: school.id }));
                        go("home");
                      }}
                    />
                  )}
                  {page === "team" &&
                    ["owner", "superadmin"].includes(session.role) &&
                    k && <Team data={data} session={session} action={action} />}
                  {page === "audit" && staff && k && <Audit data={data} />}
                  {page === "gallery" && staff && k && (
                    <Gallery
                      data={data}
                      session={session}
                      action={action}
                      notify={notify}
                      onProducts={() => go("products")}
                    />
                  )}
                  {page === "reports" && staff && k && <Reports data={data} />}
                  {page === "counter" && staff && k && (
                    <Counter data={data} action={action} />
                  )}
                </>
              )}
            </main>
            <footer className="app-footer">
              <span>
                reKreo. <span>Un recreo más simple.</span>
              </span>
              <span>
                Kioscos escolares conectados
              </span>
            </footer>
          </div>
        </div>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? "error-toast" : ""}`}
          role="status"
        >
          {toast.error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span>{toast.message}</span>
          <IconButton onClick={() => setToast(null)} aria-label="Cerrar aviso">
            <X size={16} />
          </IconButton>
        </div>
      )}
      {orderScan && staff && (
        <OrderScanner
          onClose={() => setOrderScan(false)}
          onValue={async (value) => {
            const order = await action("findOrder", { value }, undefined, {
              throwOnError: true,
              background: true,
            });
            if (order) {
              setOrderScan(false);
              setModal({ type: "order", order });
            }
          }}
        />
      )}
      {scan && (
        <Scanner
          onClose={() => setScan(false)}
          onValue={(v) => {
            setScan(false);
            const parts = v.split(":");
            if (
              parts.length !== 4 ||
              parts[0] !== "recreo" ||
              parts[1] !== "account" ||
              parts[2] !== session.kioskId
            ) {
              notify("La credencial no corresponde a este kiosco.", true);
              return;
            }
            const m = data.members.find(
              (m) => m.id === parts[3] && m.role === "student",
            );
            if (!m) {
              notify("Alumno no encontrado en este kiosco.", true);
              return;
            }
            setModal({ type: "topup", userId: m.id, requestId: newId() });
          }}
        />
      )}
      {modal?.type === "account" && (
        <Modal title="Mi QR para cargar saldo" onClose={() => setModal(null)}>
          <AccountQR session={session} me={me} kiosk={k} />
        </Modal>
      )}
      {modal?.type === "schoolQR" && (
        <SchoolPoster kiosk={k} onClose={() => setModal(null)} />
      )}
      {modal?.type === "topup" && (
        <Modal title="Nueva carga de saldo" onClose={() => setModal(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const result = await action(
                "topup",
                {
                  userId: f.get("userId"),
                  amount: Math.round(Number(f.get("amount")) * 100),
                  method: f.get("method"),
                  note: f.get("note"),
                  requestId: modal.requestId,
                },
                "Saldo acreditado correctamente",
              );
              if (result) setModal(null);
            }}
          >
            <label>
              Alumno
              <select name="userId" defaultValue={modal.userId || ""} required>
                <option value="" disabled>
                  Seleccioná un alumno
                </option>
                {data.members
                  .filter((m) => m.role === "student")
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} · {m.course} · {m.id}
                    </option>
                  ))}
              </select>
            </label>
            {input("Importe recibido en pesos", "amount", "", {
              type: "number",
              min: 0.01,
              max: 1000000,
              step: 0.01,
              required: true,
              placeholder: "10000",
            })}
            <label>
              Medio de pago
              <select name="method">
                <option value="cash">Efectivo recibido</option>
                <option value="transfer">Transferencia verificada</option>
              </select>
            </label>
            {input("Referencia o nota (opcional)", "note", "", {
              maxLength: 150,
              placeholder: "Ej. carga de la semana",
            })}
            <label className="checkbox">
              <input type="checkbox" required />
              <span>
                Confirmo que recibí el dinero y que los datos del alumno son
                correctos.
              </span>
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setModal(null)}
              >
                Volver
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Acreditando…" : "Confirmar carga"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal?.type === "product" && (
        <ProductForm
          product={modal.product}
          images={data.images}
          imageLimit={data.kiosk?.limits?.images ?? 100}
          photoContext={`${session.uid}:${session.kioskId}`}
          onUploadPhoto={async (file) => {
            const blob = await compressImage(file);
            const image = await uploadImage(blob, file.name, session.kioskId);
            notify("Foto guardada en tu galería y seleccionada para el producto");
            return image;
          }}
          busy={busy}
          onClose={() => setModal(null)}
          onGallery={() => {
            if (
              window.confirm(
                "¿Ir a la galería? Los cambios sin guardar se perderán.",
              )
            ) {
              setModal(null);
              go("gallery");
            }
          }}
          onDelete={async () => {
            if (
              window.confirm(
                "¿Eliminar este producto? Los pedidos y la imagen de galería se conservan.",
              )
            ) {
              const r = await action(
                "deleteProduct",
                { productId: modal.product.id },
                "Producto eliminado",
              );
              if (r) setModal(null);
            }
          }}
          onSave={async (product) => {
            const r = await action(
              "saveProduct",
              { product },
              "Producto guardado",
            );
            if (r) setModal(null);
          }}
        />
      )}
      {modal?.type === "cashout" && (
        <Refund
          member={modal.member}
          orders={data.orders}
          action={action}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "pay" && (
        <StudentPayment
          data={data}
          session={session}
          action={action}
          notify={notify}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "order" &&
        (() => {
          const o = orderForView(
              data.orders.find((x) => x.id === modal.order.id),
              modal.order,
            ),
            closed = ["cancelled", "delivered", "uncollected"].includes(
              o.status,
            ),
            canStudentCancel =
              o.status === "received" &&
              o.items.every((i) => i.cancellable) &&
              Date.now() <
                slotDeadline(
                  o.date,
                  k.slots.find((s) => s.id === o.slotId) || { time: "00:00" },
                );
          return (
            <Modal title={`Pedido ${o.code}`} onClose={() => setModal(null)}>
              <div className="order-details">
                <Badge status={o.status} />
                {staff && closedOrderNotice(o.status) && (
                  <div className="notice compact" role="alert">
                    {closedOrderNotice(o.status)}
                  </div>
                )}
                {orderActionError && (
                  <div className="form-operation-error" role="alert">
                    {orderActionError}
                  </div>
                )}
                <h3>{o.studentName}</h3>
                <p>
                  {o.course} · {o.date} · {o.slotTime} ·{" "}
                  {o.delivery === "classroom"
                    ? "Entrega al aula"
                    : "Retiro en kiosco"}
                </p>
                {o.items.map((i) => (
                  <div className="receipt-line" key={i.productId}>
                    <span>
                      {i.qty} × {i.name}
                    </span>
                    <b>{fmt(i.price * i.qty)}</b>
                  </div>
                ))}
                <div className="receipt-total">
                  <span>Total abonado</span>
                  <b>{fmt(o.total)}</b>
                </div>
                {o.cancelReason && (
                  <p className="hint">Motivo: {o.cancelReason}</p>
                )}
                {!staff && !closed && (
                  <div className="qr-wrap">
                    <QRCodeSVG
                      value={orderQrValue(session.kioskId, o.id)}
                      size={190}
                      role="img"
                      aria-label={`QR de retiro del pedido ${o.code}`}
                    />
                    <p>
                      Mostrá este QR al retirar. Código: <b>{o.code}</b>
                    </p>
                  </div>
                )}
                {staff && !closed && (
                  <div className="order-actions">
                    {k.preparationEnabled && o.status === "received" && (
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          action(
                            "setOrderStatus",
                            { orderId: o.id, status: "preparing" },
                            "Pedido en preparación",
                          )
                        }
                      >
                        Empezar preparación
                      </button>
                    )}
                    {k.preparationEnabled &&
                      ["received", "preparing"].includes(o.status) && (
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={() =>
                            action(
                              "setOrderStatus",
                              { orderId: o.id, status: "ready" },
                              "Pedido listo",
                            )
                          }
                        >
                          Marcar listo
                        </button>
                      )}
                    <button
                      className="button primary full"
                      disabled={busy}
                      onClick={async () => {
                        setOrderActionError("");
                        try {
                          const r = await action(
                            "setOrderStatus",
                            { orderId: o.id, status: "delivered" },
                            "Pedido entregado",
                            { throwOnError: true },
                          );
                          if (r) setModal(null);
                        } catch (error) {
                          setOrderActionError(error.message);
                        }
                      }}
                    >
                      <Check size={17} />
                      Marcar entregado
                    </button>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        setModal({ type: "uncollected", order: o })
                      }
                    >
                      Marcar como no retirado
                    </button>
                  </div>
                )}
                {!closed && (staff || canStudentCancel) && (
                  <button
                    className="text-button danger"
                    onClick={() => setModal({ type: "cancel", order: o })}
                  >
                    Cancelar y devolver {fmt(o.total)}
                  </button>
                )}
                {!staff && !closed && !canStudentCancel && (
                  <p className="notice compact">
                    Este pedido no admite cancelación del alumno. Si no lo
                    retirás, no se devuelve el saldo automáticamente.
                  </p>
                )}
              </div>
            </Modal>
          );
        })()}
      {modal?.type === "cancel" && (
        <Modal title="Cancelar y devolver saldo" onClose={() => setModal(null)}>
          <p>
            Se devolverán <b>{fmt(modal.order.total)}</b> y se repondrá el
            stock. Esta acción quedará registrada.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const r = await action(
                "cancelOrder",
                { orderId: modal.order.id, reason: f.get("reason") },
                "Pedido cancelado y saldo devuelto",
              );
              if (r) setModal(null);
            }}
          >
            {input("Motivo de cancelación", "reason", "", {
              required: true,
              maxLength: 150,
            })}
            <button className="button danger-button full" disabled={busy}>
              {busy ? "Procesando…" : "Confirmar cancelación y devolución"}
            </button>
          </form>
        </Modal>
      )}
      {modal?.type === "uncollected" && (
        <Modal
          title="¿El pedido no fue retirado?"
          onClose={() => setModal(null)}
        >
          <p>
            Se cerrará el pedido <b>{modal.order.code}</b> sin devolver el saldo
            ni reponer el stock.
          </p>
          <button
            className="button primary full"
            disabled={busy}
            onClick={async () => {
              const r = await action(
                "setOrderStatus",
                { orderId: modal.order.id, status: "uncollected" },
                "Pedido marcado como no retirado",
              );
              if (r) setModal(null);
            }}
          >
            Confirmar pedido no retirado
          </button>
        </Modal>
      )}
      {modal?.type === "receipt" && (
        <Modal
          title="¡Tu pedido está confirmado!"
          onClose={() => setModal(null)}
        >
          <div className="qr-wrap">
            <span className="success-circle">
              <Check size={30} />
            </span>
            <h2>{modal.order.code}</h2>
            <QRCodeSVG
              value={orderQrValue(session.kioskId, modal.order.id)}
              size={190}
              role="img"
              aria-label={`QR de retiro del pedido ${modal.order.code}`}
            />
            <p>Mostrá este QR al kioskero para retirar.</p>
            <p>
              Retiro: {modal.order.date} · {modal.order.slotLabel} ·{" "}
              {modal.order.slotTime}
            </p>
            <p>
              Abonado con saldo: <b>{fmt(modal.order.total)}</b>
            </p>
            <button
              className="button primary full"
              onClick={() => setModal({ type: "order", order: modal.order })}
            >
              Ver código de retiro
              <QrCode size={18} />
            </button>
          </div>
        </Modal>
      )}
      {checkout && (
        <Modal title="Tu próximo recreo" onClose={() => setCheckout(false)}>
          <form onSubmit={purchase}>
            {cartItems.map((p) => (
              <div className="cart-item" key={p.id}>
                <ProductVisual p={p} small />
                <div>
                  <b>{p.name}</b>
                  <small>{fmt(p.price)} c/u</small>
                </div>
                <div className="quantity">
                  <button
                    type="button"
                    onClick={() => add(p, -1)}
                    aria-label={`Quitar ${p.name}`}
                  >
                    <Minus size={14} />
                  </button>
                  <b>{p.qty}</b>
                  <button
                    type="button"
                    onClick={() => add(p, 1)}
                    aria-label={`Agregar ${p.name}`}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            ))}
            <div className="form-row">
              <label>
                Fecha de retiro
                <input
                  type="date"
                  value={date}
                  min={localDate()}
                  max={localDate(new Date(Date.now() + 7 * 86400000))}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setSlotId("");
                  }}
                  required
                />
              </label>
              <label>
                Recreo
                <select
                  value={slotId}
                  onChange={(e) => setSlotId(e.target.value)}
                  required
                >
                  <option value="">Elegí un recreo</option>
                  {k?.slots.map((s) => (
                    <option
                      key={s.id}
                      value={s.id}
                      disabled={Date.now() >= slotDeadline(date, s)}
                    >
                      {s.label} · {s.time}
                      {Date.now() >= slotDeadline(date, s) ? " (cerrado)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {k?.deliveryEnabled && (
              <label>
                Cómo recibís tu pedido
                <select
                  value={delivery}
                  onChange={(e) => setDelivery(e.target.value)}
                >
                  <option value="pickup">Retiro en kiosco</option>
                  <option value="classroom">
                    Entrega al aula · {me?.course}
                  </option>
                </select>
              </label>
            )}
            {k?.slots.every((s) => Date.now() >= slotDeadline(date, s)) && (
              <p className="notice compact">
                Los recreos de hoy ya cerraron. Podés elegir otra fecha.
              </p>
            )}
            <div className="receipt-total">
              <span>Total del pedido</span>
              <b>{fmt(cartTotal)}</b>
            </div>
            <p className="hint">
              Saldo disponible: <b>{fmt(me?.balance || 0)}</b> · Luego de
              comprar: <b>{fmt((me?.balance || 0) - cartTotal)}</b>
            </p>
            <label className="checkbox">
              <input type="checkbox" required />
              <span>
                Confirmo el descuento de mi saldo.{" "}
                {cartItems.some((p) => !p.cancellable)
                  ? "Este pedido incluye productos sin cancelación. Si no retiro, no se reintegra automáticamente."
                  : "Puedo cancelar antes del cierre del recreo, mientras no esté en preparación."}
              </span>
            </label>
            <button
              className="button primary full"
              disabled={
                busy ||
                !cartQty ||
                cartTotal > (me?.balance || 0) ||
                !slotId ||
                k?.paused
              }
            >
              {busy
                ? "Confirmando…"
                : cartTotal > (me?.balance || 0)
                  ? "Necesitás cargar saldo"
                  : "Confirmar y pagar con saldo"}
              <ArrowRight size={18} />
            </button>
          </form>
        </Modal>
      )}
      {modal?.type === "reset" && (
        <Modal title="Recuperar acceso" onClose={() => setModal(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const email = new FormData(e.currentTarget).get("email");
              try {
                await sendPasswordResetEmail(auth, email);
                notify(
                  "Si el email tiene una cuenta, recibirás instrucciones para recuperar el acceso.",
                );
                setModal(null);
              } catch {
                notify(
                  "No se pudo enviar. Revisá el email e intentá de nuevo.",
                  true,
                );
              }
            }}
          >
            {input("Email de tu cuenta", "email", "", {
              required: true,
              type: "email",
            })}
            <button className="button primary full">
              Enviar instrucciones
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function Stat({ label, value, icon: Icon, foot, tone }) {
  return (
    <section className="stat-card">
      <div>
        <span>{label}</span>
        <span className={`stat-icon ${tone}`}>
          <Icon size={19} />
        </span>
      </div>
      <h2>{value}</h2>
      <p>{foot}</p>
    </section>
  );
}
function AccountQR({ session, me, kiosk }) {
  return (
    <section className="account-card">
      <div className="account-brand">
        <Brand />
      </div>
      <span className="eyebrow">MI CREDENCIAL</span>
      <h2>{me?.name || session.name}</h2>
      <p>
        {me?.course || "Alumno"} · {kiosk?.school}
      </p>
      <div className="qr-paper">
        <QRCodeSVG
          value={`recreo:account:${session.kioskId}:${session.uid}`}
          size={190}
        />
      </div>
      <span className="account-number">Cuenta: {session.uid}</span>
      <small>Mostrá este QR para cargar saldo en tu kiosco.</small>
    </section>
  );
}
function SettingsForm({ kiosk, busy, onSave }) {
  const [s, setS] = useState(() => structuredClone(kiosk));
  useEffect(() => setS(structuredClone(kiosk)), [kiosk]);
  const set = (k, v) => setS((s) => ({ ...s, [k]: v }));
  return (
    <form
      className="settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(s);
      }}
    >
      <section className="panel settings-section">
        <div>
          <span className="feature-icon">
            <Store />
          </span>
          <h2>Identidad del kiosco</h2>
          <p>Así te encuentran tus alumnos.</p>
        </div>
        <div>
          <label>
            Nombre del kiosco
            <input
              value={s.name}
              onChange={(e) => set("name", e.target.value)}
              required
              maxLength={100}
            />
          </label>
          <label>
            Escuela
            <input
              value={s.school}
              onChange={(e) => set("school", e.target.value)}
              required
              maxLength={120}
            />
          </label>
          <label>
            Código de ingreso
            <input value={s.code} readOnly />
            <small>El código lo administra la plataforma.</small>
          </label>
          <label>
            Mensaje del catálogo
            <textarea
              value={s.notice}
              onChange={(e) => set("notice", e.target.value)}
              maxLength={300}
            />
          </label>
        </div>
      </section>
      <section className="panel settings-section">
        <div>
          <span className="feature-icon">
            <Clock />
          </span>
          <h2>Horarios y capacidad</h2>
          <p>El stock y el cupo se validan al confirmar cada pedido.</p>
        </div>
        <div>
          {s.slots.map((slot, i) => (
            <div className="slot-edit" key={slot.id}>
              <div className="form-row">
                <label>
                  Nombre
                  <input
                    value={slot.label}
                    onChange={(e) =>
                      set(
                        "slots",
                        s.slots.map((x, j) =>
                          j === i ? { ...x, label: e.target.value } : x,
                        ),
                      )
                    }
                    required
                  />
                </label>
                <label>
                  Hora
                  <input
                    type="time"
                    value={slot.time}
                    onChange={(e) =>
                      set(
                        "slots",
                        s.slots.map((x, j) =>
                          j === i ? { ...x, time: e.target.value } : x,
                        ),
                      )
                    }
                    required
                  />
                </label>
              </div>
              <div className="form-row three">
                {[
                  ["maxOrders", "Pedidos máximos", 1, 500],
                  ["maxPrepared", "Preparados máximos", 0, 1000],
                  ["cutoffMinutes", "Cierre previo (min)", 0, 180],
                ].map(([key, label, min, max]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="number"
                      min={min}
                      max={max}
                      value={slot[key]}
                      onChange={(e) =>
                        set(
                          "slots",
                          s.slots.map((x, j) =>
                            j === i
                              ? { ...x, [key]: Number(e.target.value) }
                              : x,
                          ),
                        )
                      }
                      required
                    />
                  </label>
                ))}
              </div>
              {s.slots.length > 1 && (
                <button
                  type="button"
                  className="text-button danger"
                  onClick={() =>
                    set(
                      "slots",
                      s.slots.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 size={14} />
                  Quitar recreo
                </button>
              )}
            </div>
          ))}
          {s.slots.length < 10 && (
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                set("slots", [
                  ...s.slots,
                  {
                    id: newId(),
                    label: "Nuevo recreo",
                    time: "15:00",
                    maxOrders: 20,
                    maxPrepared: 10,
                    cutoffMinutes: 10,
                  },
                ])
              }
            >
              <Plus size={16} />
              Agregar recreo
            </button>
          )}
          <label>
            Unidades máximas por pedido
            <input
              type="number"
              min="1"
              max="99"
              value={s.maxUnits}
              onChange={(e) => set("maxUnits", Number(e.target.value))}
              required
            />
          </label>
        </div>
      </section>
      <section className="panel settings-section">
        <div>
          <span className="feature-icon">
            <Settings />
          </span>
          <h2>Tu forma de trabajar</h2>
          <p>Activá solo los pasos que necesites.</p>
        </div>
        <div>
          {[
            [
              "preparationEnabled",
              "Estados de preparación",
              "Agrega los pasos opcionales «En preparación» y «Listo».",
            ],
            [
              "deliveryEnabled",
              "Entrega al aula",
              "Permite entregar al curso registrado del alumno. Activá solo con autorización de la escuela.",
            ],
            [
              "paused",
              "Pausar nuevos pedidos",
              "El catálogo sigue visible, pero no se aceptan compras.",
            ],
          ].map(([key, label, desc]) => (
            <label className="toggle-row" key={key}>
              <div>
                <b>{label}</b>
                <small>{desc}</small>
              </div>
              <input
                type="checkbox"
                checked={s[key]}
                onChange={(e) => set(key, e.target.checked)}
              />
            </label>
          ))}
        </div>
      </section>
      <div className="save-bar">
        <p>
          <ShieldCheck size={16} />
          Los cambios se aplican a los nuevos pedidos.
        </p>
        <button className="button primary" disabled={busy}>
          {busy ? "Guardando…" : "Guardar configuración"}
          <Check size={17} />
        </button>
      </div>
    </form>
  );
}
