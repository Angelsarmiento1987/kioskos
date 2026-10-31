// Unsigned requests may only send supported parameters. Return delete token is
// configured in the upload preset, never appended to this multipart request.
export async function uploadToCloudinary({
  blob,
  name,
  kioskId,
  cloudName,
  preset,
  call,
  fetcher = fetch,
}) {
  if (!cloudName || !preset)
    throw new Error(
      "Falta configurar Cloudinary: cloud name y upload preset unsigned en .env.local. Reiniciá npm start después de agregarlos.",
    );
  const reservation = await call("reserveImage", { kioskId, name });
  let uploaded = false,
    rejectedUpload = false;
  try {
    const form = new FormData();
    form.append("file", blob, "foto.webp");
    form.append("upload_preset", preset);
    form.append("public_id", reservation.publicId);
    const response = await fetcher(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
      { method: "POST", body: form },
    );
    const asset = await response.json();
    if (!response.ok) {
      // Only explicit validation/authentication rejections establish no asset
      // was uploaded. Network errors, conflicts and 5xx remain uncertain.
      rejectedUpload =
        [400, 401, 403, 404, 413, 415, 422].includes(response.status) &&
        typeof asset.error?.message === "string";
      throw new Error(asset.error?.message || "Cloudinary rechazó la carga.");
    }
    uploaded = true;
    try {
      return await call("finalizeImage", {
        kioskId,
        imageId: reservation.imageId,
        asset,
      });
    } catch (error) {
      error.message +=
        " La carga quedó pendiente. Revisá Cloudinary antes de eliminar la reserva.";
      throw error;
    }
  } catch (error) {
    if (!uploaded) {
      try {
        const cleanup = await call("deleteImage", {
          kioskId,
          imageId: reservation.imageId,
          rejectedUpload,
        });
        if (cleanup?.pendingDeletion)
          error.message +=
            " La reserva sigue ocupando cupo hasta revisar el archivo en Cloudinary.";
      } catch {
        error.message +=
          " No pudimos liberar la reserva. Pedile al administrador que la revise.";
      }
    }
    throw error;
  }
}
