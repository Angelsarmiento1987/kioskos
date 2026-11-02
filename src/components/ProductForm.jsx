import PhotoInput from "./PhotoInput";
import React, { useState } from "react";
import { Image, Check, Trash2 } from "lucide-react";
import { Modal } from "./ui";
export default function ProductForm({
  product,
  images = [],
  busy,
  imageLimit = 100,
  photoContext,
  onUploadPhoto,
  onClose,
  onSave,
  onGallery,
  onDelete,
}) {
  const [p, setP] = useState(
    product || {
      name: "",
      category: "Preparados",
      description: "",
      price: 0,
      stock: 0,
      emoji: "🥪",
      prepared: true,
      cancellable: false,
      active: true,
      galleryId: "",
      imageUrl: "",
      imageId: "",
    },
  );
  const [uploading, setUploading] = useState(false), [uploaded, setUploaded] = useState([]);
  const mergedImages = [...images, ...uploaded.filter((i) => !images.some((x) => x.id === i.id))];
  const close = () => { if (!uploading && !busy) onClose(); };
  const set = (key, v) => setP((p) => ({ ...p, [key]: v }));
  return (
    <Modal
      title={product?.id ? "Editar producto" : "Nuevo producto"}
      onClose={close}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!uploading && !busy) onSave(p);
        }}
      >
        <div className="form-row">
          <label>
            Nombre
            <input
              value={p.name}
              onChange={(e) => set("name", e.target.value)}
              required
              maxLength={100}
            />
          </label>
          <label>
            Categoría
            <select
              value={p.category}
              onChange={(e) => set("category", e.target.value)}
            >
              {["Preparados", "Bebidas", "Golosinas", "Frutas", "Otros"].map(
                (c) => (
                  <option key={c}>{c}</option>
                ),
              )}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            Precio en pesos
            <input
              type="number"
              min="0.01"
              max="1000000"
              step="0.01"
              value={p.price / 100 || ""}
              onChange={(e) =>
                set("price", Math.round(Number(e.target.value) * 100))
              }
              required
            />
          </label>
          <label>
            Stock disponible
            <input
              type="number"
              min="0"
              max="100000"
              step="1"
              value={p.stock}
              onChange={(e) => set("stock", Number(e.target.value))}
              required
            />
          </label>
        </div>
        <label>
          Descripción
          <textarea
            value={p.description || ""}
            onChange={(e) => set("description", e.target.value)}
            maxLength={300}
          />
        </label>
        <div className="form-section-title">
          Imagen del producto · no consume cupo al reutilizar
        </div>
        <PhotoInput context={photoContext} disabled={busy || mergedImages.length >= imageLimit} onBusyChange={setUploading}
          onFile={async (file) => {
            const image = await onUploadPhoto(file);
            setUploaded((current) => [...current, image]);
            setP((current) => ({ ...current, galleryId: image.id, imageUrl: image.url, imageId: image.publicId }));
          }} />
        <p className="hint">{mergedImages.length} / {imageLimit} fotos ocupadas. Las fotos nuevas quedan en la galería aunque canceles el producto. Podés reutilizar una foto sin ocupar otro lugar.</p>
        {p.imageUrl && <img className="selected-product-photo" src={p.imageUrl} alt="Foto seleccionada para el producto" />}
        <div className="gallery-picker">
          <button
            type="button"
            className={!p.galleryId ? "chosen" : ""}
            onClick={() =>
              setP((p) => ({ ...p, galleryId: "", imageUrl: "", imageId: "" }))
            }
          >
            <span className="picker-emoji">{p.emoji}</span>
            <small>Sin foto</small>
          </button>
          {mergedImages
            .filter((i) => !i.status || i.status === "active")
            .map((i) => (
              <button
                type="button"
                key={i.id}
                className={p.galleryId === i.id ? "chosen" : ""}
                onClick={() =>
                  setP((p) => ({
                    ...p,
                    galleryId: i.id,
                    imageUrl: i.url,
                    imageId: i.publicId || "",
                  }))
                }
              >
                <img src={i.url} alt={i.name} />
                <small>{i.name}</small>
                {p.galleryId === i.id && <Check size={15} />}
              </button>
            ))}
        </div>
        <button className="text-button" type="button" disabled={busy || uploading} onClick={onGallery}>
          <Image size={15} />
          Ir a la galería para subir una foto
        </button>
        <p className="hint">
          Guardá primero los cambios del producto. Una foto puede usarse en
          todas sus variantes.
        </p>
        <label>
          Ícono de categoría si no tiene foto
          <select
            value={p.emoji}
            onChange={(e) => set("emoji", e.target.value)}
          >
            {[
              "🥪",
              "🍔",
              "🍫",
              "💧",
              "🧃",
              "🍪",
              "🍕",
              "🍎",
              "🌾",
              "🥤",
              "🍬",
              "🥐",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={p.active}
            onChange={(e) => set("active", e.target.checked)}
          />
          <span>Producto activo y visible</span>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={p.prepared}
            onChange={(e) => set("prepared", e.target.checked)}
          />
          <span>Requiere preparación · consume cupo del recreo</span>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={p.cancellable}
            onChange={(e) => set("cancellable", e.target.checked)}
          />
          <span>
            Permitir cancelación del alumno antes del cierre, mientras no empezó
            la preparación
          </span>
        </label>
        <div className="modal-actions">
          {product?.id && (
            <button
              type="button"
              className="text-button danger"
              disabled={busy || uploading}
              onClick={onDelete}
            >
              <Trash2 size={15} />
              Eliminar producto
            </button>
          )}
          <button type="button" className="button secondary" disabled={busy || uploading} onClick={close}>
            Cancelar
          </button>
          <button className="button primary" disabled={busy || uploading}>
            {uploading ? "Procesando foto…" : busy ? "Guardando…" : "Guardar producto"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
