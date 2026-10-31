# Habilitar tu cuenta superadministradora

La aplicación ahora lee el permiso desde **Cloud Firestore → usuarios → TU_UID**. No usa un email fijo en React ni necesita custom claims o Cloud Shell.

1. En Firebase, seleccioná el proyecto **rekreo-app-89930**.
2. Entrá a **Authentication → Usuarios**. Buscá **angelsar.desarrolladorweb@gmail.com** y copiá su **UID de usuario**. Si no figura, iniciá sesión con Google en la app para que Firebase cree la cuenta.
3. Entrá a **Firestore Database → Datos → Iniciar colección**.
4. Nombre de colección: **usuarios** (minúsculas).
5. ID del documento: pegá el **UID exacto**, no el email y no un ID automático.
6. Agregá estos campos:

| Campo | Tipo | Valor |
|---|---|---|
| email | string | angelsar.desarrolladorweb@gmail.com |
| rol | string | superadmin |

Opcional: **activo**, tipo **boolean**, valor **true**. Si está en false, la cuenta queda desactivada. No es necesario cargarlo para entrar.

7. Guardá. Si el documento ya existe, agregá/modificá los campos sin borrar los demás.
8. En **Firestore Database → Reglas**, reemplazá el contenido por el archivo **firestore.rules** incluido en este proyecto y tocá **Publicar**. No uses reglas que permitan escribir a cualquiera.
9. Reemplazá los archivos locales por esta versión, conservando `.env.local`. Detené el servidor con Ctrl+C y ejecutá `npm start`.
10. Cerrá sesión y volvé a ingresar en **http://localhost:3000/superadmin** con ese email.

Si te muestra Acceso restringido, compará el UID que muestra la app con el ID del documento. El campo se llama **rol**, no role; el valor debe ser **superadmin**, todo en minúsculas y de tipo string.

El email es informativo. La identidad que autoriza es el UID de Firebase Auth y el rol guardado en el documento protegido. No crees documentos con rol superadmin para alumnos o kioskeros.

## Para operar después del ingreso

Con las reglas de esta entrega publicadas, el alta de kioskos y las operaciones se hacen directamente desde React a Firestore. No hay que crear ni desplegar Functions. Cloudinary se configura aparte y no bloquea el alta de kioskos. Ver CONFIGURACION.md.

## Instalaciones anteriores

Esta versión cambia `users/{UID}` por `usuarios/{UID}` y deja de usar el claim `superadmin` de Auth. Si ya tenías perfiles reales en `users`, copiá sus datos a `usuarios` manteniendo los mismos IDs antes de usar el nuevo código. No borres pedidos, membresías, saldos ni perfiles originales durante una migración. Si solo estabas probando y todavía no hay datos, basta con crear tu documento inicial como se indica arriba.
