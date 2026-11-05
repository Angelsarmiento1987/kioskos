# reKreo 1.4 · avisos dentro de la app

Esta versión usa el plan Spark existente: React, Firebase Auth/Firestore y Cloudinary. No requiere Blaze, FCM, Firebase Functions ni un servidor adicional. No se cambió la facturación ni se publicaron cambios en Firebase desde esta entrega. El uso sigue sujeto a las cuotas de tus servicios.

## Alumno

Al iniciar sesión o volver a entrar a su kiosko, el alumno ve un resumen de avisos sin leer y el botón **Avisos** en la barra superior. Incluye:

- Cancelaciones: pedido, motivo y crédito reintegrado cuando el movimiento está confirmado.
- Reintegros registrados en el historial, incluso si el pedido no se recibió todavía en la sincronización.
- Devolución externa registrada como efectivo o transferencia. El mensaje informa del registro; la app no ejecuta transferencias bancarias.
- Pedido listo para retirar, cuando el kiosko usa estados de preparación. Ese aviso deja de aparecer si el pedido ya fue entregado o cerrado, para no invitar a retirarlo otra vez.

Los avisos de cancelación y devolución se reconstruyen con los pedidos y movimientos guardados. Cerrar la app no los pierde. Al abrir la nueva versión por primera vez, los registros históricos todavía no leídos también aparecen. No hay avisos por compras de mostrador ni por cargar todo el historial como si acabara de ocurrir.

**Ver pedidos/movimientos** lleva a la sección correspondiente; la lectura es explícita con **Marcar leído** o **Marcar todos como leídos**. Esa elección se guarda en `usuarios/{UID}/noticeReads` y se sincroniza entre dispositivos de la misma cuenta. No cambia saldos, pedidos ni movimientos. Cada alumno solo puede acceder a sus propios marcadores. Los avisos se separan por kiosko.

Si está abierta la app, los avisos se actualizan con Firestore. Si está cerrada, se ven al abrirla y sincronizar. No hay push ni avisos en la pantalla bloqueada. No se agregó alarma sonora al alumno.

## Kiosquero

Para recibir pedidos en vivo, dejá el panel abierto en una **notebook con internet**, evitá su suspensión y activá/probá el sonido con la campana. Mantené el volumen del equipo encendido. El navegador puede pedir un nuevo clic al abrir otra vez la página. La alarma suena por pedidos nuevos confirmados y no por la carga inicial del historial.

Al iniciar cada turno revisá los pedidos pendientes: los pedidos hechos mientras el panel estaba cerrado siguen guardados, aunque no hayan sonado. La alarma puede fallar si se corta internet, se suspende el equipo o el navegador restringe el audio. No es una garantía de aviso con el equipo suspendido.

En el teléfono podés entrar con **la misma cuenta** para escanear alumnos y cargar saldo, buscar pedidos por QR y marcarlos como entregados. Se sincroniza con la notebook. Las demás funciones del teléfono se conservan. Podés dejar el sonido del teléfono desactivado y activar solo el de la notebook para evitar alarmas en ambos.

## Instalar esta actualización

1. Respaldá tu proyecto actual y copiá el contenido de `rekreo-react/` del ZIP dentro de su carpeta, conservando `.git`.
2. **Si copiaste el ZIP anterior de push**, eliminá los archivos que hayan quedado: `push-functions/`, `src/push.js`, `src/usePush.js`, `src/components/PushControl.jsx`, `shared/push-routing.mjs`, `tests/push.test.mjs` y `PUSH-CONFIGURACION.md`. Esta entrega no los utiliza. También podés borrar la carpeta histórica `functions/`, que no se usa. No borres `shared/`.
3. Ejecutá `npm install` desde la raíz. El package.json de esta entrega quita el plugin push; npm actualiza las dependencias.
4. **Publicá las nuevas reglas de Firestore** desde la pestaña Reglas de tu base, copiando `firestore.rules` completo y pulsando Publicar. También podés usar:

   ```sh
   firebase deploy --only firestore:rules --project rekreo-app-89930
   ```

   Esto no requiere Blaze. No crees manualmente colecciones de avisos: el primer marcador de lectura crea la subcolección automáticamente. Si no publicás las reglas, la app mostrará un error al sincronizar/guardar la lectura.
5. Para la web: `npm run deploy`.
6. Para Android: `npm run android:sync`, `npm run android:open` y generá un nuevo APK/AAB desde Android Studio con tu firma habitual. Se conserva el paquete y el JSON de Firebase. Versión `versionCode 5`, `versionName 1.4.0`.

No hay funciones que desplegar ni facturación que habilitar. El cambio de reglas agrega únicamente el acceso privado a marcadores de lectura; las transacciones y permisos financieros se conservan.

## Prueba antes de usar con clientes

1. Notebook del kiosquero abierta, sonido activado; hacer un pedido desde una cuenta de alumno en otro equipo. Comprobar pedido y campanita.
2. Cerrar normalmente la app del alumno. Cancelar desde el kiosquero un pedido de prueba. Abrir la app del alumno: aparece el aviso con motivo y reintegro confirmado, una sola vez en la bandeja.
3. Marcarlo leído, cerrar y abrir; probar la misma cuenta desde otro dispositivo. Debe conservarse la lectura.
4. Registrar una devolución externa de prueba; verificar el nuevo aviso y el movimiento correspondiente. La devolución real se entrega fuera de la app.
5. Si se usan estados, marcar otro pedido como listo; al entregarlo no debe seguir invitando a retirarlo.
6. Escanear con el celular del kiosquero mientras la notebook sigue abierta. Verificar la actualización en ambos y comprobar modo claro/oscuro.

No se probaron los cambios en un APK compilado en este entorno: hace falta Android Studio con JDK 21 y SDK 36. Ver `VERIFICACION.md`.
