# Instantánea de la base viva

Estos archivos fueron leídos de la base D1 del Site JIMDUR ERP el 8 de
septiembre de 2026. Cada archivo corresponde a una tabla y contiene sus
columnas, filas y metadatos de redacción.

Por seguridad no se guardaron:

- `app_users.password_hash`, `password_salt` y `recovery_key_hash`;
- filas de `app_sessions`;
- filas de `auth_rate_limits` y sus claves derivadas.

Las migraciones completas del esquema permanecen en `../../drizzle/` y el
modelo Drizzle en `../../db/schema.ts`. Primero crea el esquema en la nueva
base y después importa las tablas de negocio. No restaures sesiones ni límites
de autenticación; deben generarse de nuevo.

La lectura se hizo mediante consultas paginadas de solo lectura. No constituye
un backup transaccional de D1 y puede requerir una comparación con el sistema
original si hubo operaciones durante la captura.

