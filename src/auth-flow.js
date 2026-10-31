import { isPlatformAdmin } from "../shared/permissions.mjs";
// Every privileged role comes from protected Firestore documents. Auth identifies the UID only.
export function withTimeout(promise, ms = 12000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        const e = Error(
          "La comprobación de acceso tardó demasiado. Revisá la conexión y la configuración de Firebase.",
        );
        e.code = "access/timeout";
        reject(e);
      }, ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
export function accessErrorMessage(error) {
  const code = error?.code || "";
  if (code === "permission-denied" || code === "firestore/permission-denied")
    return "Firebase inició la sesión, pero Firestore rechazó el acceso. Falta publicar las reglas del proyecto o revisar sus permisos.";
  if (code === "unavailable" || code === "firestore/unavailable")
    return "No se pudo consultar Firestore. Comprobá que creaste la base de datos y que tenés conexión.";
  if (code === "auth/unauthorized-domain")
    return "Este dominio no está autorizado en Firebase Authentication.";
  if (code === "auth/popup-blocked")
    return "El navegador bloqueó la ventana de Google. Permití las ventanas emergentes para esta página.";
  if (code === "auth/network-request-failed")
    return "No se pudo conectar con Firebase Authentication. Revisá la conexión.";
  return (
    error?.message || "No se pudo completar el ingreso. Intentá nuevamente."
  );
}
export function loadLoginSession({
  user,
  intent = "student",
  adminEntrance = false,
  readProfile,
  readMember,
  resolveOwner,
  timeoutMs = 12000,
}) {
  return withTimeout(
    (async () => {
      const profile = (await readProfile(user.uid)) || {};
      if (profile.activo === false)
        throw Error("Tu cuenta fue desactivada. Contactá a reKreo.");
      const isAdmin = isPlatformAdmin(profile);
      const session = {
        mode: "live",
        uid: user.uid,
        name: user.displayName || "Mi cuenta",
        email: user.email,
        accessIntent: intent,
        role: isAdmin ? "superadmin" : "student",
        kioskId: null,
        ownerAccessStatus: null,
      };
      // An existing profile may grant global administration; otherwise deny on /superadmin.
      if (adminEntrance || isAdmin) return session;
      session.kioskId = profile.kioskId || null;
      if (session.kioskId) {
        const member = await readMember(session.kioskId, user.uid);
        session.role = ["owner", "staff", "student"].includes(member?.role)
          ? member.role
          : "student";
      }
      if (intent === "owner" && session.role === "student") {
        try {
          const result = await resolveOwner();
          session.ownerAccessStatus = result.status;
          if (result.status === "authorized") {
            session.role = result.role === "staff" ? "staff" : "owner";
            session.kioskId = result.kioskId;
          }
        } catch (e) {
          session.ownerAccessStatus = "error";
          session.ownerAccessError = accessErrorMessage(e);
        }
      }
      return session;
    })(),
    timeoutMs,
  );
}
