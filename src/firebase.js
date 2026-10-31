import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { createFirestoreOperations } from "./firestore-operations.js";
const config = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
};
export const configured = !!(config.apiKey && config.projectId && config.appId);
export const app = configured ? initializeApp(config) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
if (app && process.env.REACT_APP_USE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
const operations = app ? createFirestoreOperations(db, auth) : null;
export async function call(name, data = {}) {
  if (!operations)
    throw new Error(
      "Conectá Firebase para usar cuentas reales. Podés explorar la demo.",
    );
  let timer;
  try {
    return await Promise.race([
      operations(name, data),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(
            "Firestore tardó en confirmar la operación. Actualizá la lista antes de reintentar.",
          );
          error.code = "deadline-exceeded";
          reject(error);
        }, 25000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
