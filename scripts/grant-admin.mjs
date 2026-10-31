// Run in functions directory with Application Default Credentials; never ship a service account to the browser.
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const email = process.argv[2];
if (!email) {
  console.error("Uso: node scripts/grant-admin.mjs email-del-administrador");
  process.exit(1);
}
initializeApp({ credential: applicationDefault() });
const user = await getAuth().getUserByEmail(email);
const { getFirestore } = require("firebase-admin/firestore");
await getFirestore()
  .collection("usuarios")
  .doc(user.uid)
  .set({ email: user.email, rol: "superadmin", activo: true }, { merge: true });
console.log(
  "Documento usuarios/" +
    user.uid +
    " actualizado. Cerrá sesión y volvé a ingresar.",
);
