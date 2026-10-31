import React, { useState } from "react";
import {
  ImagePlus,
  Image,
  Trash2,
  Search,
  Check,
  ArrowRight,
} from "lucide-react";
import { Modal, Placeholder } from "../components/ui";
import { compressImage, dataUrl, uploadImage } from "../images";
export default function Gallery({ data, session, action, notify, onProducts }) {
  const [search, setSearch] = useState(""),
    [uploading, setUploading] = useState(false),
    [remove, setRemove] = useState(null),
    [removeError, setRemoveError] = useState("");
  const images = data.images || [],
    limit = data.kiosk?.limits?.images ?? 100,
    stored = images.length;
  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const blob = await compressImage(file);
      if (session.mode === "demo")
        await action(
          "saveImage",
          { url: await dataUrl(blob), name: file.name, bytes: blob.size },
          "Imagen guardada en tu galería",
        );
      else {
        await uploadImage(blob, file.name, session.kioskId);
        notify("Imagen guardada en tu galería");
      }
    } catch (e) {
      notify(e.message, true);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }
  return (
    <>
      <section className="gallery-intro">
        <div>
          <span className="eyebrow">UNA FOTO, MUCHOS PRODUCTOS</span>
          <h2>Tu galería, sin duplicados.</h2>
          <p>
            Subí una imagen y usala en todas sus variantes. Cada archivo ocupa
            un solo lugar de tu plan.
          </p>
        </div>
        <div className="quota">
          <strong>
            {stored}
            <small> / {limit}</small>
          </strong>
          <span>fotos almacenadas</span>
          <div className="progress">
            <i
              style={{
                width: Math.min(100, (stored / Math.max(1, limit)) * 100) + "%",
              }}
            />
          </div>
        </div>
      </section>
      <div className="list-toolbar">
        <div className="search">
          <Search size={17} />
          <input
            aria-label="Buscar imagen"
            placeholder="Buscar en tu galería…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label
          className={
            "button primary upload-label " +
            (stored >= limit ? "is-disabled" : "")
          }
        >
          <ImagePlus size={18} />
          {uploading
            ? "Comprimiendo y subiendo…"
            : stored >= limit
              ? "Cupo completo"
              : "Subir imagen"}
          <input
            type="file"
            hidden
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading || stored >= limit}
            onChange={upload}
          />
        </label>
      </div>
      <div className="image-grid">
        {images
          .filter((i) => i.name?.toLowerCase().includes(search.toLowerCase()))
          .map((i) => {
            const linked = data.products.filter((p) => p.galleryId === i.id);
            return (
              <article className="panel image-card" key={i.id}>
                <div className="image-preview">
                  {i.url ? (
                    <img src={i.url} alt={i.name} loading="lazy" />
                  ) : (
                    <Image size={42} />
                  )}
                  <span className="badge gray">
                    {i.status === "pending"
                      ? "Carga pendiente"
                      : i.status === "deleting"
                        ? "Borrado pendiente"
                        : Math.ceil((i.bytes || 0) / 1024) + " KB"}
                  </span>
                </div>
                <div>
                  <h3>{i.name}</h3>
                  <p>
                    {linked.length
                      ? `Usada en ${linked.length} producto${linked.length === 1 ? "" : "s"}`
                      : "Sin productos vinculados"}
                  </p>
                  <button
                    className="text-button danger"
                    onClick={() => {
                      setRemoveError("");
                      setRemove(i);
                    }}
                  >
                    <Trash2 size={15} />
                    {i.status === "deleting"
                      ? "Ver borrado pendiente"
                      : "Eliminar imagen"}
                  </button>
                  {i.status === "deleting" && session.role === "superadmin" && (
                    <button
                      className="text-button"
                      onClick={() => {
                        setRemoveError("");
                        setRemove({ ...i, confirmProviderDeletion: true });
                      }}
                    >
                      Ya la eliminé en Cloudinary · liberar cupo
                    </button>
                  )}
                </div>
              </article>
            );
          })}
      </div>
      {!images.length && (
        <Placeholder title="Tu primera foto empieza acá">
          Subila desde el celular o la computadora. La comprimimos a un máximo
          de 100 KB.
        </Placeholder>
      )}
      <p className="hint">
        Las imágenes se administran aparte de los productos. Para ampliar tu
        cupo, contactá a reKreo.
      </p>
      {remove && (
        <Modal title="Eliminar imagen" onClose={() => setRemove(null)}>
          <p>Esta foto corresponde a los siguientes productos:</p>
          <ul className="linked-products">
            {data.products
              .filter((p) => p.galleryId === remove.id)
              .map((p) => (
                <li key={p.id}>{p.name}</li>
              ))}
          </ul>
          {!data.products.some((p) => p.galleryId === remove.id) && (
            <p className="hint">No tiene productos vinculados.</p>
          )}
          <p>
            Los productos seguirán disponibles con su ícono de categoría. El
            cupo se libera cuando se confirma el borrado del archivo.
          </p>
          {session.mode !== "demo" && (
            <p className="hint">
              Si Cloudinary ya no permite el borrado desde esta app, quedará
              pendiente para reKreo y seguirá ocupando cupo hasta que se elimine
              desde el panel de Cloudinary.
            </p>
          )}
          {remove.publicId && (
            <p className="hint">
              Archivo en Cloudinary: <code>{remove.publicId}</code>
            </p>
          )}
          {remove.confirmProviderDeletion && (
            <p>
              Confirmás que ya borraste este archivo en Cloudinary. Se eliminará
              su referencia de la galería y se liberará el cupo.
            </p>
          )}
          {removeError && (
            <div className="form-operation-error" role="alert">
              {removeError}
            </div>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setRemove(null)}
            >
              Cancelar
            </button>
            <button
              className="button danger-button"
              disabled={uploading}
              onClick={async () => {
                setUploading(true);
                setRemoveError("");
                try {
                  const r = await action(
                    "deleteImage",
                    {
                      imageId: remove.id,
                      confirmProviderDeletion: !!remove.confirmProviderDeletion,
                    },
                    undefined,
                    { throwOnError: true },
                  );
                  if (r) {
                    setRemove(null);
                    notify(
                      r.pendingDeletion
                        ? "Borrado solicitado. El cupo sigue ocupado hasta eliminar el archivo en Cloudinary."
                        : "Imagen eliminada y cupo liberado",
                    );
                  }
                } catch (error) {
                  setRemoveError(error.message);
                } finally {
                  setUploading(false);
                }
              }}
            >
              {remove.confirmProviderDeletion
                ? "Confirmar borrado y liberar cupo"
                : "Eliminar imagen"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
