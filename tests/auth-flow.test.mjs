import test from "node:test";
import assert from "node:assert/strict";
import { loadLoginSession, accessErrorMessage } from "../src/auth-flow.js";
const user = (claims = {}) => ({
  uid: "user-test",
  email: "test@example.test",
  displayName: "Prueba",
  getIdTokenResult: async () => ({ claims }),
});
test("Superadmin se obtiene de usuarios/{UID} sin consultar membresías", async () => {
  const result = await loadLoginSession({
    user: user(),
    readProfile: async () => ({ rol: "superadmin" }),
    readMember: () => {
      throw Error("No debe consultar membresías");
    },
  });
  assert.equal(result.role, "superadmin");
  assert.equal(result.kioskId, null);
});
test("El antiguo claim de Auth no otorga permisos sin documento de usuarios", async () => {
  const result = await loadLoginSession({
    user: user({ superadmin: true }),
    adminEntrance: true,
    readProfile: async () => ({ rol: "alumno" }),
  });
  assert.equal(result.role, "student");
});
test("Alumno nuevo conserva registro libre y queda listo para elegir escuela", async () => {
  const result = await loadLoginSession({
    user: user(),
    readProfile: async () => null,
    resolveOwner: () => {
      throw Error("No requiere autorización de dueño");
    },
  });
  assert.equal(result.role, "student");
  assert.equal(result.kioskId, null);
});
test("Kioskero obtiene solo la autorización confirmada por servidor", async () => {
  const result = await loadLoginSession({
    user: user(),
    intent: "owner",
    readProfile: async () => null,
    resolveOwner: async () => ({ status: "authorized", kioskId: "school" }),
  });
  assert.equal(result.role, "owner");
  assert.equal(result.kioskId, "school");
  const denied = await loadLoginSession({
    user: user(),
    intent: "owner",
    readProfile: async () => null,
    resolveOwner: async () => ({ status: "not-authorized" }),
  });
  assert.equal(denied.role, "student");
  assert.equal(denied.ownerAccessStatus, "not-authorized");
});
test("Una lectura que nunca responde termina en error visible en vez de esperar indefinidamente", async () => {
  await assert.rejects(
    loadLoginSession({
      user: user(),
      readProfile: () => new Promise(() => {}),
      timeoutMs: 15,
    }),
    (e) => e.code === "access/timeout",
  );
});
test("Los fallos de reglas y ventanas bloqueadas conservan un diagnóstico útil", async () => {
  await assert.rejects(
    loadLoginSession({
      user: user(),
      readProfile: async () => {
        throw Object.assign(Error("Forbidden"), { code: "permission-denied" });
      },
    }),
  );
  assert.match(accessErrorMessage({ code: "permission-denied" }), /reglas/);
  assert.match(accessErrorMessage({ code: "auth/popup-blocked" }), /ventana/);
});

test("Un documento desactivado no permite ingresar aunque tenga rol superadmin", async () => {
  await assert.rejects(
    loadLoginSession({
      user: user(),
      readProfile: async () => ({ rol: "superadmin", activo: false }),
    }),
    /desactivada/,
  );
});
