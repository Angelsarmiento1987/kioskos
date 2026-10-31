import { call } from "./firebase.js";
import { uploadToCloudinary } from "./cloudinary-upload.js";
export async function compressImage(file) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw Error("Usá JPG, PNG o WebP de hasta 10 MB.");
  const bitmap = await createImageBitmap(file),
    canvas = document.createElement("canvas");
  let max = 640,
    blob;
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const ratio = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      canvas
        .getContext("2d")
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      blob = await new Promise((r) =>
        canvas.toBlob(r, "image/webp", Math.max(0.45, 0.8 - attempt * 0.09)),
      );
      if (blob && blob.size <= 102400) return blob;
      max = Math.round(max * 0.78);
    }
    throw Error("No pudimos reducir la foto a 100 KB. Probá otra imagen.");
  } finally {
    bitmap.close();
  }
}
export async function dataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(Error("No se pudo leer la foto."));
    reader.readAsDataURL(blob);
  });
}
export async function uploadImage(blob, name, kioskId) {
  return uploadToCloudinary({
    blob,
    name,
    kioskId,
    call,
    cloudName: process.env.REACT_APP_CLOUDINARY_CLOUD_NAME,
    preset: process.env.REACT_APP_CLOUDINARY_UPLOAD_PRESET,
  });
}
