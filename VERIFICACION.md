# Verificación · reKreo 1.4

## Cambios verificados

- Se retiró la integración de push de la entrega anterior: no hay plugin FCM, emisor, credenciales administrativas ni funciones configuradas. Se conserva la arquitectura React + Firestore con reglas, Auth y Cloudinary. No se habilitó Blaze ni se cambió producción.
- Se mantuvieron alarmas del kiosquero, colores, modo oscuro, cámara y QR. La notebook recibe pedidos en vivo con el panel abierto y sonido habilitado; el teléfono conserva todas sus funciones.
- Avisos del alumno derivados de pedidos y movimientos existentes. Cancelación/reintegro del mismo pedido comparten identificador para evitar dos avisos por el mismo hecho. Solo se incorporan a la bandeja snapshots sin escrituras pendientes. Un pedido listo deja de invitar al retiro al cerrarse/entregarse.
- Marcadores privados de lectura persistentes por alumno/kiosko. Lectura individual o múltiple, errores visibles y acceso a pedidos/movimientos. No modifican operaciones financieras.
- `npm test`: **73 pruebas aprobadas**. Incluyen deduplicación de cancelación/reintegro, identidad, estados de preparación, devoluciones externas y separación de marcadores por kiosko/estado.
- `npm run test:firestore`: **22 verificaciones aprobadas** usando solo los emuladores locales de Auth/Firestore y reglas reales. Nueva comprobación con cancelación del kiosquero: el alumno lee el reintegro confirmado y su marcador se recupera desde otra instancia autenticada; acceso ajeno, campos adicionales y kiosko sin membresía son rechazados.
- `npm run android:sync`: compilación React y sincronización correctas con los cuatro plugins App, Camera, Filesystem y Share, además del plugin local de Google/QR.
- Android conserva paquete `com.websinvueltas.rekreo` y configuración Firebase del usuario. Nueva versión: `versionCode 5`, `versionName 1.4.0`.

## Alcance y pendientes

- No se compiló ni firmó APK/AAB en este entorno: falta SDK Android/JDK 21. Debe probarse la actualización en el teléfono y en la notebook reales. No se afirma haber verificado el sonido físico ni push.
- No se probaron visualmente las nuevas pantallas en un navegador en esta entrega; la revisión de claro/oscuro de la versión anterior no sustituye esa prueba.
- Hay que publicar `firestore.rules` para guardar/sincronizar la lectura. No se publicaron reglas ni se modificaron datos reales desde este entorno.
- No hay avisos de sistema con app cerrada. El alumno encuentra los avisos al abrir y sincronizar. El kiosquero revisa pendientes al iniciar el turno: cargar historial no genera alarma retroactiva.
- Los avisos usan el historial existente; borrar administrativamente pedidos/movimientos también afecta su disponibilidad. No hay una segunda copia independiente de esos datos.
- Spark conserva sus cuotas; esta entrega no implica uso ilimitado ni exige ampliar el plan.

Instalación, limpieza del ZIP anterior y prueba funcional: `AVISOS-SIN-BLAZE.md`.
