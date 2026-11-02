import { Capacitor, registerPlugin } from "@capacitor/core";
import { GoogleAuthProvider, signInWithCredential, signInWithPopup, linkWithCredential, linkWithPopup, signOut } from "firebase/auth";

export const isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
const native = registerPlugin("RekreoNative");

async function googleCredential() {
  try {
    const { idToken } = await native.signInGoogle();
    if (!idToken) throw new Error("Google no devolvió una credencial. Probá nuevamente.");
    return GoogleAuthProvider.credential(idToken);
  } catch (error) {
    if (error.code === "CANCELLED") error.code = "auth/popup-closed-by-user";
    throw error;
  }
}
export async function loginGoogle(auth) {
  return isAndroid
    ? signInWithCredential(auth, await googleCredential())
    : signInWithPopup(auth, new GoogleAuthProvider());
}
export async function linkGoogle(user) {
  return isAndroid
    ? linkWithCredential(user, await googleCredential())
    : linkWithPopup(user, new GoogleAuthProvider());
}
export async function logoutAccount(auth) {
  await signOut(auth);
  if (isAndroid) await native.clearGoogleSession().catch(() => {});
}
export async function scanNativeQr() {
  const result = await native.scanQr();
  if (!result.value) throw new Error("No se encontró un código QR.");
  return result.value;
}
export function homeHref() {
  return isAndroid ? "/" : process.env.REACT_APP_PUBLIC_APP_URL || "/";
}
export async function saveOrShare(name, content, type) {
  if (isAndroid) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"), import("@capacitor/share"),
    ]);
    const path = name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const { uri } = await Filesystem.writeFile({ path, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: name, files: [uri] });
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
