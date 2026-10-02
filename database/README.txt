INSTALACIÓN DE LA BASE INDEPENDIENTE

1. Abrir phpMyAdmin en el mismo hosting.
2. Importar cokifimi-registros.sql.
3. Antes de importar, cambiar CAMBIAR_POR_UNA_PASSWORD_SEGURA por una contraseña fuerte.
4. Si el hosting no permite CREATE DATABASE o CREATE USER desde phpMyAdmin, crear ambos desde el panel del hosting y ejecutar solamente desde USE cokifimi_registros.
5. La contraseña del usuario MySQL no es la contraseña del administrador de la aplicación. La aplicación tendrá su propia tabla admin_usuarios con contraseñas cifradas.

Datos que luego deberán configurarse en el backend:

DB_HOST=localhost
DB_NAME=cokifimi_registros
DB_USER=cokifimi_admin
DB_PASSWORD=la_contraseña_definida_en_el_hosting
