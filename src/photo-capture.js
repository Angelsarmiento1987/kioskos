import { Camera } from "@capacitor/camera";

export function photoCancelled(error) {
  return ["OS-PLUG-CAMR-0006", "OS-PLUG-CAMR-0020"].includes(error?.code) || /cancel/i.test(error?.message || "");
}
export async function fileFromPhoto(photo) {
  if (!photo?.webPath) throw new Error("No se pudo leer la foto. Intentá sacarla nuevamente.");
  const response = await fetch(photo.webPath);
  if (!response.ok) throw new Error("No se pudo abrir la foto de la cámara.");
  const blob = await response.blob();
  const format = photo.metadata?.format === "png" ? "png" : "jpeg";
  return new File([blob], `producto-${Date.now()}.${format === "png" ? "png" : "jpg"}`, {
    type: ["image/jpeg", "image/png", "image/webp"].includes(blob.type) ? blob.type : `image/${format}`,
  });
}
export async function takeNativePhoto() {
  return fileFromPhoto(await Camera.takePhoto({
    quality: 85, targetWidth: 1600, targetHeight: 1600,
    correctOrientation: true, saveToGallery: false, includeMetadata: true,
  }));
}
