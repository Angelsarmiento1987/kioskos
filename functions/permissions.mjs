// Administrative access is stored only in the protected usuarios/{Firebase Auth UID} document.
export const isPlatformAdmin = (profile) =>
  profile?.rol === "superadmin" && profile.activo !== false;
