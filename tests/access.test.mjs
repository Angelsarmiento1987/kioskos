import test from "node:test";
import assert from "node:assert/strict";
import { onboardingFor, readAccessIntent } from "../src/access.js";
test("Seleccionar kioskero guía la activación sin asignar permisos", () => {
  const profile = { role: "student", kioskId: null };
  assert.equal(onboardingFor(profile, "owner"), "owner");
  assert.equal(profile.role, "student");
  assert.equal(onboardingFor(profile, "student"), "student");
});
test("Los permisos y el kiosko existentes prevalecen sobre el acceso elegido", () => {
  assert.equal(
    onboardingFor({ role: "owner", kioskId: "k1" }, "student"),
    null,
  );
  assert.equal(
    onboardingFor({ role: "superadmin", kioskId: null }, "owner"),
    null,
  );
});
test("Conserva solo opciones de ingreso válidas y tolera almacenamiento bloqueado", () => {
  assert.equal(readAccessIntent({ getItem: () => "owner" }), "owner");
  assert.equal(readAccessIntent({ getItem: () => "superadmin" }), null);
  assert.equal(
    readAccessIntent({
      getItem() {
        throw Error();
      },
    }),
    null,
  );
});
import { isAdminEntrance, canAccessAdmin } from "../src/access.js";
test("La ruta administrativa acepta barra final y no rutas parecidas", () => {
  assert.equal(isAdminEntrance("/superadmin"), true);
  assert.equal(isAdminEntrance("/superadmin/"), true);
  assert.equal(isAdminEntrance("/superadministrator"), false);
  assert.equal(isAdminEntrance("/"), false);
});
test("La entrada privada exige rol real de administrador, no intención de acceso", () => {
  assert.equal(canAccessAdmin(null), false);
  assert.equal(
    canAccessAdmin({ role: "student", accessIntent: "owner" }),
    false,
  );
  assert.equal(canAccessAdmin({ role: "owner" }), false);
  assert.equal(canAccessAdmin({ role: "superadmin" }), true);
});

test("Elegir kioskero con una cuenta de alumno no abre el catálogo como dueño", () => {
  assert.equal(
    onboardingFor({ role: "student", kioskId: "school" }, "owner"),
    "owner",
  );
  assert.equal(
    onboardingFor({ role: "staff", kioskId: "school" }, "owner"),
    null,
  );
});
