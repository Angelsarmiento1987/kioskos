# reKreo · proyecto único para web y Android

React + Capacitor 8 + Firebase Auth/Firestore + Cloudinary. El código de pantallas y lógica está en `src/`; Android Studio empaqueta su compilación desde `android/`. No se agrega un servidor propio ni Firebase Functions.

## Incorporar esta actualización

1. Hacé una copia de seguridad de tu proyecto web actual.
2. Copiá el contenido de `rekreo-react/` de este ZIP **dentro de la carpeta original**, donde está `package.json`. Conservá la carpeta `.git` de tu original: el ZIP no incluye otra historia de Git.
3. El antiguo archivo `src/demo.js` puede eliminarse si queda de la versión anterior: ya no se importa ni forma parte de la aplicación. Los fixtures de prueba están en `tests/fixtures/`.
4. Desde esa carpeta ejecutá:

   ```sh
   npm install
   npm run android:sync
   ```

5. Abrí Android Studio con:

   ```sh
   npm run android:open
   ```

La carpeta Android se incorporó desde la que enviaste y conserva el paquete `com.websinvueltas.rekreo`, el plugin de Google/QR y `android/app/google-services.json`. No hace falta volver a registrar otra app en Firebase ni crear otra base. `android:config` extrae el OAuth correcto del JSON antes de compilar React.

No se incluyen `local.properties`, `.gradle`, `.idea`, claves de firma ni carpetas de compilación de tu PC. Android Studio vuelve a crear su configuración local. Usá JDK 21 y Android SDK 36; mantené las mismas claves de firma que utilices para publicar. Para actualizar sobre el APK de prueba instalado, compilá en tu misma PC con su `debug.keystore` habitual.

## Trabajo diario

| Acción | Comando |
| --- | --- |
| Probar web en localhost:3000 | `npm start` |
| Actualizar web de GitHub Pages | `npm run deploy` |
| Pasar cambios de React al proyecto Android | `npm run android:sync` |
| Abrir Android Studio | `npm run android:open` |
| Pruebas de lógica | `npm test` |
| Pruebas con Firestore/Auth emulados | `npm run test:firestore` |

Ahora modificás React una sola vez. La web y Android conservan formas de publicación diferentes: subir la web no cambia el código del APK instalado. Para Android hay que sincronizar, generar una nueva compilación y distribuirla por Play. Los datos de Firebase/Cloudinary se comparten sin recompilar.

GitHub Pages conserva la URL pública `https://angelsarmiento1987.github.io/kioskos/` y el acceso `/kioskos/superadmin/`. Al contratar un dominio, cambiá `REACT_APP_PUBLIC_APP_URL` en `.env.local` y recompilá. No se cambió el sistema de compilación del proyecto: sigue React con Webpack, sin Vite.

## Cambios incluidos

- Capacitor dentro del proyecto original, con Google nativo, lectura QR, Atrás y compartir archivos.
- Eliminados los accesos, cambio de roles, banner y reinicio de demostración. Las sesiones locales de la demo anterior no se restauran; el acceso siempre depende de Firebase Auth y las autorizaciones de Firestore.
- **Sacar foto** y **Elegir archivo** al crear/editar productos y en la galería. Android abre la cámara del teléfono; la web usa la cámara del navegador con permiso desde HTTPS o localhost.
- La foto se comprime a WebP de hasta 100 KB, se guarda en la galería del kiosko y se selecciona para el producto sin salir del formulario. Reutilizarla no ocupa otro lugar; subir una nueva sí. La reserva y el límite se validan también en Firestore.
- Cancelar la cámara no sube archivos. Una foto que ya terminó de subirse permanece en la galería aunque canceles el producto, para reutilizarla después.
- Ante cierre del proceso Android mientras está la cámara abierta, se conserva una referencia a la foto recuperada; el mismo usuario/kiosko puede pulsar **Usar foto recuperada** al volver a un formulario o a la galería. Los campos del formulario no se restauran si el sistema cerró todo el proceso. Si el archivo temporal fue eliminado por Android, habrá que tomar otra foto.

## Fotos y permisos

La cámara nativa no guarda fotos en la galería personal del teléfono (`saveToGallery: false`) ni solicita permisos generales de almacenamiento. La web pide permiso para cámara y no pide micrófono. Si el navegador rechaza la cámara o el dispositivo no la tiene, se puede elegir un archivo.

La galería mantiene el manejo existente de borrados de Cloudinary: fuera de la ventana del token temporal, el borrado queda pendiente y el superadmin debe eliminar el archivo en Cloudinary y confirmarlo antes de liberar cupo. Nunca pongas el API Secret de Cloudinary en React.

## Firebase, saldo e imágenes

Se conservan las reglas y las transacciones existentes. `INICIO-SUPERADMIN.md` explica la autorización en `usuarios/{UID}`. Elegir kioskero no otorga permisos: hay que tener el correo previamente autorizado. No se publicaron reglas ni se modificaron datos reales desde esta actualización.

Las cargas registran dinero recibido fuera de la app. Las compras descuentan saldo, stock y cupo con transacciones; no vuelven a sumar efectivo a caja. Máximo 5 productos distintos por compra, además de los límites de unidades configurados. Los permisos se validan en `firestore.rules`.

`.env.local` y `google-services.json` contienen configuración pública de Firebase/Cloudinary, no una cuenta de servicio ni claves de firma. Están excluidos de Git para que conserves su configuración local; el ZIP los incluye para mantener lo que ya configuraste. No se necesitan credenciales administrativas en el navegador.

## Estado de verificación y publicación

Ver `VERIFICACION.md`. Antes de vender/publicar falta probar esta actualización en el teléfono (especialmente la nueva cámara) y completar firma, ficha, privacidad, eliminación de cuentas y revisión de Play. Quitar la demostración no completa esos trámites.
