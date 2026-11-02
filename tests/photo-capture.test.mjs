import test from "node:test";
import assert from "node:assert/strict";
import { photoCancelled, fileFromPhoto } from "../src/photo-capture.js";

test("Cancelar la cámara no se confunde con un teléfono sin cámara", () => {
  assert.equal(photoCancelled({ code: "OS-PLUG-CAMR-0006" }), true);
  assert.equal(photoCancelled({ code: "OS-PLUG-CAMR-0020" }), true);
  assert.equal(photoCancelled({ code: "OS-PLUG-CAMR-0007", message: "No camera available" }), false);
  assert.equal(photoCancelled({ message: "Photo cancelled" }), true);
});
test("La foto nativa se convierte a File sin perder sus bytes", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(new Uint8Array([1,2,3]), { headers: { "content-type": "image/jpeg" } });
    const file = await fileFromPhoto({ webPath: "https://localhost/_capacitor_file_/photo.jpg", metadata: { format: "jpg" } });
    assert.equal(file.type, "image/jpeg"); assert.equal(file.size, 3); assert.match(file.name, /\.jpg$/);
    assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [1,2,3]);
  } finally { globalThis.fetch = original; }
});
test("El MIME genérico de archivos Android usa el formato conocido de la cámara", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(new Uint8Array([1]), { headers: { "content-type": "application/octet-stream" } });
    const file = await fileFromPhoto({ webPath: "photo", metadata: { format: "png" } });
    assert.equal(file.type, "image/png"); assert.match(file.name, /\.png$/);
    globalThis.fetch = async () => new Response(null, { status: 404 });
    await assert.rejects(fileFromPhoto({ webPath: "gone" }), /abrir la foto/);
    await assert.rejects(fileFromPhoto({}), /leer la foto/);
  } finally { globalThis.fetch = original; }
});
