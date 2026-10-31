# reKreo · React + Firebase + Cloudinary

Aplicación web para kioskos escolares. React 19 con Webpack; sin Vite, servidor propio ni Firebase Functions. Auth autentica, el SDK web hace CRUD y transacciones en Firestore, y Cloudinary aloja las imágenes.

## Iniciar en VS Code

1. Abrir esta carpeta, no `src`.
2. Ejecutar `npm install`.
3. El archivo `.env.local` entregado ya contiene la configuración pública de tu proyecto Firebase. Conservá tus valores si ya lo modificaste.
4. En Firebase → Firestore Database → Reglas, copiar **todo** `firestore.rules` y pulsar **Publicar**. Las reglas anteriores bloqueaban las escrituras directas y no sirven para esta versión.
5. Ejecutar `npm start` y abrir **http://localhost:3000**. El panel de plataforma está en **http://localhost:3000/superadmin**.

No hace falta desplegar Functions ni habilitar Blaze por esta implementación. Firebase y Cloudinary conservan sus propios límites y planes. No se incluyen credenciales administrativas en el navegador. `firebase-admin` es una dependencia de desarrollo usada solo para preparar datos de prueba en emuladores.

## Superadministrador y alta

Seguí `INICIO-SUPERADMIN.md` para el documento `usuarios/{UID}` con `rol: "superadmin"`. Desde ese panel podés crear un kiosko y autorizar el email de su dueño. El alta guarda, en una sola transacción, kiosko, ficha privada, código público y autorización del correo. El dueño se registra con ese correo y lo verifica. Los alumnos se registran libremente y se unen con el código de su escuela.

El kiosko maneja productos, stock, pedidos, cargas de saldo, cobros por QR, devoluciones excepcionales, galería, equipo y reportes. El superadministrador tiene ficha privada, planes, límites y acceso a estadísticas por kiosko. El nombre público se puede modificar sin alterar la referencia interna del cliente.

## Operaciones con crédito

La carga registra dinero recibido fuera de la app (efectivo o transferencia verificada por el kiosko). Las compras consumen crédito y no vuelven a sumar efectivo a la caja. Los importes se almacenan en centavos enteros. Transacciones y reglas vinculan compra, saldo, stock, cupo y movimiento. Los alumnos no pueden editar libremente su saldo ni asignarse permisos.

Máximo **5 productos distintos por compra**, para mantener la validación atómica dentro de los límites de lectura de las reglas de Firestore. El límite de unidades se configura aparte. La concurrencia se resuelve con transacciones: si dos alumnos compran la última unidad, solo uno puede completar la compra. Las solicitudes financieras conservan identificadores para evitar duplicados.

Las cancelaciones del alumno se permiten solo para productos cancelables y dentro del plazo. El kioskero puede cancelar y reintegrar crédito. Las devoluciones de dinero registran lo entregado fuera de la app; se bloquean con pedidos pendientes. El sistema no transfiere dinero por sí mismo.

## Imágenes

Ver `CONFIGURACION.md`: configurar cloud name y preset **unsigned** restringido a WebP; el límite de 100 KB se controla en la app. Las fotos se comprimen en el navegador y una sola foto sirve para varias variantes. El límite de fotos es independiente del límite de productos.

**Limitación sin backend:** Cloudinary permite borrar desde el navegador con un token temporal, por unos minutos. Después, la app marca el borrado pendiente y mantiene el cupo ocupado. El superadministrador elimina el archivo desde Cloudinary y confirma en la galería del kiosko para liberar cupo. Nunca colocar el API Secret en React. La reserva no garantiza por sí sola el límite real de una cuenta Cloudinary: el preset público debe restringirse y el administrador debe revisar su consumo.

## Verificación

- `npm test`: lógica compartida, flujos de acceso y demostración.
- `npm run build`: salida estática en `build/`.
- `npm run test:firestore`: pruebas integradas con Auth y Firestore emulados, nunca con tu proyecto real. Necesita Java compatible con Firebase CLI. Prueba el SDK cliente con las reglas reales; el Admin SDK solo prepara usuarios y comprueba los resultados.

No se accedió a tu consola de Firebase ni se publicaron sus reglas desde este entorno. La verificación local no reemplaza una prueba real en tu proyecto después de publicar las reglas. Cloudinary necesita tus datos públicos; no se ha probado una subida real sin ellos.

## Estructura

- `src/firestore-operations.js`: acciones que ejecuta el navegador.
- `src/firestore-client.js`: referencias y transacciones del SDK público.
- `shared/`: validación y cálculos compartidos con la demostración y las pruebas.
- `firestore.rules`: permisos y validación de escrituras directas.
- `src/images.js`: compresión y carga unsigned a Cloudinary.

Para otro hosting estático, ejecutar el build y configurar fallback de rutas a `index.html`; se incluye también `superadmin/index.html`. El panel y el catálogo son responsivos. La app Android y publicación en Play Store quedan para la etapa siguiente. No hay integración con Mercado Pago ni facturación ARCA en esta versión.

## QR de retiro de pedidos

Cada pedido pendiente muestra su QR y código escrito en Mis pedidos y al confirmar la compra. El kioskero abre Pedidos → Escanear pedido; puede usar la cámara o ingresar el código. El QR identifica kiosko y pedido: no carga saldo ni confirma la entrega. La app consulta el estado actual y muestra aviso si está entregado, cancelado o no retirado; no ofrece volver a entregarlo. Confirmar la entrega requiere pulsar Marcar entregado. Una búsqueda por código ambiguo pide el QR exacto.

La cámara requiere permiso y HTTPS o localhost. El QR de la cuenta es distinto y se usa en Alumnos y cargas. Esta mejora utiliza las reglas existentes; no necesita Functions ni reglas adicionales.

Cloudinary: activar **Return delete token** en el preset (Advanced). Ese parámetro no se envía en la solicitud unsigned. Un rechazo explícito de la subida libera su reserva; ante fallos de red o resultados inciertos se mantiene el cupo hasta revisar el proveedor.
