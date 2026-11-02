# Verificación · 2 de noviembre de 2026

- Se usaron el proyecto web original y la carpeta Android subidos por el usuario.
- Se conservaron Firebase, Cloudinary, URL de GitHub Pages, paquete Android y configuración Google Android del usuario.
- `npm test`: 60 pruebas aprobadas, incluyendo la conversión de fotos nativas, cancelación, tipo MIME genérico Android, respuesta de Cloudinary utilizable en el producto y los controles de acceso/negocio existentes.
- `npm run test:firestore`: 20 verificaciones aprobadas con emuladores Auth/Firestore. Incluyen carga única, saldo, stock, cobro QR, cuotas y compras concurrentes de última unidad. No se modificaron reglas ni datos de producción.
- `npm run android:sync`: compilación React correcta, configuración Google extraída del archivo suministrado y cuatro plugins Android sincronizados (App, Camera, Filesystem y Share), además del plugin local RekreoNative.
- Las pantallas de demostración y sus operaciones no se incluyen en el código de producción; los fixtures siguen disponibles solo para pruebas.
- No se generó un APK/AAB ni se probó la cámara real en este entorno: no tiene SDK Android/JDK 21. La nueva compilación debe probarse en el mismo teléfono donde funcionó la versión anterior.
- No se pudo ejecutar la prueba visual interactiva del formulario en este entorno: no hay un navegador local disponible y el navegador remoto no puede alcanzar el servidor local. Se verificó la compilación del formulario, pero no se afirma haber probado la captura visual ni la interacción de cámara.

## Prueba rápida en el celular

1. Abrir el proyecto original ya actualizado y ejecutar `npm install` y `npm run android:sync`.
2. Instalar una nueva compilación desde Android Studio y comprobar Google y email/contraseña.
3. Crear un producto, escribir nombre/precio/stock y sacar una foto. Comprobar que los campos se conservan y que queda la foto seleccionada. Guardar y consultar desde la web.
4. Cancelar una captura: no debe aparecer otra imagen ni crecer el cupo.
5. Reutilizar una imagen existente: no debe crecer el cupo. Con cupo completo, las acciones de foto nueva deben quedar deshabilitadas y las existentes seleccionables.
6. Probar archivo inválido/error de conexión y verificar que se muestra el error sin cerrar el formulario ni dar una subida fallida por completada.
7. Confirmar que no aparece la demostración ni se recupera una vieja sesión de ejemplo.
