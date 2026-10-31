# Configuración · sin servidor propio ni Firebase Functions

## Lo necesario para probar el alta ahora

La configuración pública de Firebase ya está en `.env.local`. No necesitás Cloudinary para crear un kiosko ni cargar productos sin foto.

1. Abrir **Firebase → proyecto rekreo-app-89930 → Firestore Database → Reglas**.
2. Reemplazar el contenido por **todo el archivo `firestore.rules` de esta entrega** y pulsar **Publicar**. No agregar reglas que permitan todas las escrituras.
3. Mantener `usuarios/TU_UID` con `email` y `rol: "superadmin"`; el ID es el UID de Authentication, no el email.
4. Actualizar el proyecto local, ejecutar `npm install`, detener el proceso anterior con Ctrl+C y ejecutar `npm start`.
5. Entrar en `/superadmin` con la cuenta autorizada. Crear el kiosko y autorizar el email del dueño. La app escribe directamente en Firestore.

Si falta Firestore, crearlo desde la consola. Authentication debe tener Google y correo/contraseña habilitados, y `localhost` entre los dominios autorizados. No se requiere Functions ni activar facturación para este flujo. Las cuotas propias de los servicios siguen aplicando.

## Dueño, empleados y alumnos

- El superadministrador autoriza el email exacto del dueño al crear el kiosko. Se guarda en `ownerEmails/{email_en_minúsculas}`. Solo el superadministrador puede modificar esa autorización; cada dueño puede consultar la suya.
- El dueño elige “Soy kioskero”, ingresa con Google o contraseña y verifica su correo. Las reglas permiten crear su membresía únicamente si el correo verificado coincide con la autorización de ese kiosko. El UID queda vinculado al kiosko.
- El dueño puede autorizar empleados por email. Ingresan por “Soy kioskero”, verifican ese correo y obtienen rol empleado. El dueño puede revocarles la membresía y la autorización.
- El alumno se registra libremente y se une con el código público del kiosko y su curso. La membresía inicial tiene saldo cero. No puede elegir roles privilegiados.
- El perfil global puede indicar kiosko/rol para la navegación, pero la autorización de operaciones se verifica con las reglas y la membresía del kiosko; solo el documento protegido con rol superadmin habilita administración global.

## Cloudinary

Crear un preset de subida **unsigned**, configurado desde Cloudinary con:

- Formato permitido: **WebP**.
- Los **102400 bytes** se validan y comprimen en la app; Cloudinary no tiene límite de tamaño por preset.
- Sin sobrescritura de archivos existentes; conservar identificadores únicos.
- **Advanced → Return delete token: activado.** No se envía ese parámetro en el FormData de la subida unsigned.
- Sin transformaciones entrantes que aumenten el peso. La app comprime a WebP antes de subir.

Agregar en `.env.local`:

```dotenv
REACT_APP_CLOUDINARY_CLOUD_NAME=tu_cloud_name
REACT_APP_CLOUDINARY_UPLOAD_PRESET=tu_preset_unsigned
```

Reiniciar `npm start`. Estos dos datos son públicos; **no agregar API Secret, cuentas de servicio ni claves privadas**. Al ser un preset público, las reglas de Firestore no protegen directamente el endpoint de Cloudinary. Restringí el preset desde su panel y revisá el consumo; el cupo del kiosko controla las reservas de la app, no todos los archivos que alguien pudiera subir directamente al preset.

La app reserva cupo en Firestore, sube directamente a Cloudinary y guarda la URL/ID devueltos. Puede reutilizarse una foto en varios productos. Para bajar de plan, primero debe disminuir el número real de fotos y productos activos.

### Borrado sin backend

Cloudinary devuelve un token temporal de borrado para la subida. Si sigue válido, la app puede eliminar el archivo directamente. Cuando vence, el borrado queda pendiente y el cupo sigue ocupado. El superadministrador debe:

1. Abrir la galería del kiosko desde su dashboard.
2. Identificar el `publicId` mostrado y eliminar ese archivo desde Media Library de Cloudinary.
3. Volver a la galería y tocar **“Ya la eliminé en Cloudinary · liberar cupo”**. Confirmar solo después de eliminarlo allí.

Los productos vinculados quedan con su ícono y conservan sus datos. El token se almacena en una colección legible solo por el personal. Una carga interrumpida puede dejar una reserva pendiente: revisar Cloudinary antes de confirmar su limpieza.

## Datos y migración desde la versión anterior

No borrar usuarios, saldos, pedidos ni membresías. Esta versión mantiene las colecciones principales y reemplaza las llamadas al backend por CRUD/transacciones del SDK web. Los módulos compartidos ya no están en `functions/` sino en `shared/`.

Si se habían creado autorizaciones de dueño con la versión de backend, su documento podía usar un hash como ID: copiar cada autorización a `ownerEmails/{email_en_minúsculas}` conservando su `kioskId`. El superadministrador puede hacerlo desde la consola; no crear autorizaciones para emails no contratados. Conservar los originales durante la migración. Los pedidos nuevos agregan referencias para validar saldo/stock/cupos en las reglas. Los históricos siguen legibles; cualquier cancelación de pedidos históricos debe hacerla el kioskero.

## Comprobación antes de usar saldos reales

Probar con dos cuentas y un kiosko de prueba: alta, dueño verificado, alumno, carga, pedido, QR, cancelación, devolución, última unidad de stock y permisos entre kioskos. Verificar además una subida/borrado real en Cloudinary. Los reportes separan caja de ventas con crédito; no calculan ganancia neta sin costos y gastos. Configurar copias de seguridad y revisar consumos antes de ofrecer el servicio a clientes.

### Reserva de una carga rechazada en versiones anteriores

La entrada sin imagen marcada “Borrado pendiente” puede venir de un rechazo 400 por un parámetro no permitido. Para esa entrada anterior, el superadministrador abre el dashboard del kiosko y su galería, comprueba que el `publicId` no exista en Cloudinary y confirma “Ya la eliminé en Cloudinary · liberar cupo”. Para las cargas nuevas, un rechazo explícito se limpia automáticamente. Una foto cargada o una respuesta de red incierta no se descarta automáticamente.
