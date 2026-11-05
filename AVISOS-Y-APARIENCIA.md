# Avisos y apariencia · reKreo 1.4

## Activar las alarmas

En el panel del kiosquero, tocá la campana **Activar sonido** y después **Activar y probar**. Vas a escuchar una campanita de tres notas. Podés ajustar su volumen y usar **Probar sonido** o **Desactivar sonido**. La elección queda guardada en ese navegador/dispositivo.

El navegador puede requerir otra interacción al volver a abrir la app: el control indica **Sonido activo** solo cuando el audio está habilitado para reproducirse. No hace falta dar permiso para micrófono ni descargar un archivo de sonido.

Cuando llega un pedido nuevo confirmado por Firestore:

- Se muestra un aviso con alumno y código, o la cantidad de pedidos si llegan varios.
- Si está activado, el sonido se reproduce de inmediato y se repite a los 4 y 8 segundos. Los pedidos nuevos que llegan juntos se agrupan en un aviso.
- **Ver pedidos** abre la lista y detiene ese aviso. El botón de cerrar el aviso también lo atiende. Ninguna de estas acciones entrega, cancela ni cobra el pedido.
- Un cambio de estado, volver a recibir el mismo documento o repetir una solicitud idempotente no generan otro aviso.
- Al entrar al panel, el primer conjunto confirmado de datos se usa como referencia: no suena por pedidos antiguos. Si el panel pierde conexión y sigue abierto, al sincronizar avisa por nuevos pedidos recibidos que aún estén en estado recibido.
- Al salir de la cuenta o cambiar de kiosko se detienen los avisos y se reinicia la referencia de pedidos. Los avisos corresponden al dueño/equipo de ese kiosko; no se disparan para alumnos ni para la vista de plataforma del superadmin.

**Alcance:** el panel debe permanecer abierto, funcionando y con conexión. El sistema operativo puede suspender una pestaña en segundo plano, bloquear el audio o cerrar la app. Esta implementación no promete una alarma con la app cerrada ni con pantalla bloqueada. El esquema acordado usa la notebook abierta para recepción; el alumno ve sus novedades al volver a entrar (ver `AVISOS-SIN-BLAZE.md`). Los pedidos siguen guardados en Firebase aunque el dispositivo no haya reproducido el sonido.

El control de volumen de reKreo no puede reemplazar el volumen, modo silencio, auriculares ni otras restricciones del dispositivo. Probá el sonido en el equipo del kiosko antes del recreo.

## Modo claro y oscuro

El botón de sol/luna está en el acceso y en la barra superior de los paneles de todos los roles. La preferencia se conserva por navegador/dispositivo; al primer uso toma el modo del sistema. Se sincroniza entre pestañas del mismo navegador.

Las tarjetas se distinguen por fondo y borde:

- Verde: ventas con crédito.
- Ámbar: dinero recibido.
- Violeta: saldo pendiente de consumir.
- Azul: alumnos con saldo.

También se adaptan fondos, encabezados de secciones, tablas, formularios, ventanas, galería, controles y mensajes. Los QR mantienen su fondo blanco para preservar la lectura; el cartel imprimible conserva colores claros.

## Actualizar

Copiá el contenido del ZIP sobre el proyecto unificado, conservando tu carpeta `.git`. La configuración Firebase/Cloudinary y Google Android se mantiene.

```sh
npm install
npm run android:sync
npm run android:open
```

Generá el nuevo APK para probar en el celular. La versión Android es `versionCode 5`, `versionName 1.4.0`. Para actualizar la web de GitHub Pages, ejecutá `npm run deploy`. Publicar la web no cambia el APK instalado.

## Prueba en dos equipos

1. Dejá el panel del kiosquero abierto y activá/probá el sonido.
2. Desde una cuenta de alumno en otro equipo, hacé un pedido con saldo y stock de prueba.
3. Comprobá que aparece el aviso y suena; atendelo con **Ver pedidos**.
4. Cambiá el estado del pedido: no debe sonar como si fuera uno nuevo.
5. Recargá el panel: no debe sonar por el historial. Probá un pedido nuevo otra vez.
6. Alterná modo claro/oscuro, recargá y comprobá que se conserve.

Referencias técnicas: https://firebase.google.com/docs/firestore/query-data/listen y https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
