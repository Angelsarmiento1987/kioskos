// The selected entrance only guides onboarding. Permissions come from Firebase.
export function onboardingFor({ role, kioskId }, intent) {
  if (role === "superadmin") return null;
  if (intent === "owner" && !["owner", "staff"].includes(role)) return "owner";
  if (kioskId) return null;
  return intent === "owner" ? "owner" : "student";
}
export function readAccessIntent(storage) {
  try {
    const value = storage.getItem("rekreo-access-intent");
    return ["student", "owner"].includes(value) ? value : null;
  } catch {
    return null;
  }
}
export function isAdminEntrance(pathname) {
  return pathname.replace(/\/+$/, "") === "/superadmin";
}
export function canAccessAdmin(session) {
  return session?.role === "superadmin";
}
