# Auditoría de recuperación — JIMDUR ERP

> Documento histórico de la recuperación del Site. La versión ejecutable para
> el traslado está en la raíz y su auditoría vigente es
> `docs/VERCEL_MIGRATION_AUDIT.md`.

## Procedencia

- URL publicada: `https://jimdur-web.soporteia711.chatgpt.site`
- Título del Site: JIMDUR ERP
- Versión publicada inspeccionada: 43
- Commit fuente: `4ea1b00f823765f4082b8892b0e9b7498db3f642`
- Rama: `main`
- Árbol Git fuente: 72 archivos rastreados.
- El archivo fuente interno del Site reportaba 73 elementos; la diferencia
  corresponde al empaquetado del archivo, mientras que el repositorio fuente
  verificable contiene 72 archivos rastreados.

La recuperación se hizo clonando el repositorio fuente vinculado y verificando
que `HEAD` coincide con el commit de la versión 43. No se reconstruyó el sistema
a partir de HTML, capturas o una inspección visual.

## Inventario de código

| Área | Archivos o elementos | Resultado |
|---|---|---|
| Frontend | `app/JimdurApp.tsx`, tipos, estilos, importadores | Recuperado |
| Páginas | `/` y `/instalar` | Recuperado |
| API | `/api/auth`, `/api/operations`, `/api/snapshot` | Recuperado |
| Backend | `app/jimdur-server.ts`, `worker/index.ts`, `db/index.ts` | Recuperado |
| Datos | `db/schema.ts`, 4 migraciones Drizzle | Recuperado |
| Recursos | PNG, WebP, SVG, PWA, ZIP/CMD/PS1 | Recuperado |
| Configuración | `package.json`, lockfile, Vite, Next, TypeScript, ESLint, hosting | Recuperado |
| Pruebas | 3 archivos de pruebas | Recuperado |

La lista exacta de los archivos fuente originales se conserva en el propio
árbol recuperado y puede obtenerse con `git ls-tree -r --name-only HEAD` cuando
se disponga del repositorio original.

## Funcionalidades identificadas

- Activación del primer administrador, login, logout, cambio de contraseña,
  recuperación temporal y clave personal de recuperación.
- Sesiones mediante cookie HTTP-only, Secure y SameSite Strict, con duración de
  12 horas.
- Contraseñas con PBKDF2-SHA-256 y 100.000 iteraciones, más límite de cinco
  intentos por ventana de 15 minutos.
- Roles `ADMINISTRADOR` y `USUARIO`, con permisos de almacenes, productos,
  operaciones, pedidos de tienda, reportes, inventario, cancelaciones, usuarios
  e importaciones.
- Dashboard operativo, recepción de mercadería, proformas, órdenes de salida y
  despacho, transferencias entre almacenes.
- Inventario físico, reservado, dañado y disponible; ajustes, kardex, stock
  crítico menor de 15 unidades y exportación CSV.
- Catálogo de productos, almacenes, reportes de movimientos y administración de
  usuarios.
- Importación de pedidos desde XLS/XLSX/XLSM/CSV, DOCX, PDF y JPG/PNG/WEBP;
  incluye extracción de texto, lectura de PDF y OCR español/inglés.
- Importación de inventario desde un JSON exportado de SQL Server mediante los
  recursos incluidos en `public/`.
- PWA, instalador de Windows y pantalla `/instalar`.

## Esquema y datos vivos

La base D1 tiene el binding `DB` y estas 18 tablas:

`app_sessions`, `app_users`, `audit_logs`, `auth_rate_limits`, `import_runs`,
`movements`, `order_lines`, `order_product_aliases`, `orders`, `products`,
`proforma_lines`, `proformas`, `receipt_lines`, `receipts`, `stock`,
`transfer_lines`, `transfers`, `warehouses`.

La lectura recuperó 2.344 filas: 1.974 productos, 135 existencias, 144
movimientos, 43 auditorías, 17 líneas de recepción, 8 recepciones, 13 líneas
de orden, 3 órdenes, 2 almacenes, 1 usuario, 1 importación, 2 límites de
autenticación y 1 sesión. Se guardaron 2.341 filas sanitizadas. La información
sanitizada se encuentra en `data/live-db/`.

## Servicios externos y bindings

1. Cloudflare Worker/Sites para ejecutar el backend.
2. Cloudflare D1 para la base `DB`.
3. `ASSETS` para los archivos estáticos del Worker.
4. `IMAGES` es declarado por el entrypoint para la optimización de imágenes;
   el manifiesto recuperado no declara un binding R2 y no se detectó uso de R2.
5. Dependencias npm: React/React DOM, Next/Vinext, Vite, Wrangler, Drizzle,
   SheetJS, Mammoth, PDF.js y Tesseract.js.

No se detectaron APIs comerciales externas ni una base de datos externa en el
código recuperado.

## Variables y secretos

El entorno de producción expone las siguientes claves al runtime:

- `JIMDUR_AUTH_SECRET`
- `JIMDUR_SETUP_CODE_HASH`
- `JIMDUR_PASSWORD_RECOVERY_CODE_HASH`
- `JIMDUR_PASSWORD_RECOVERY_USERNAME`
- `JIMDUR_PASSWORD_RECOVERY_EXPIRES_AT`

Los valores secretos no se incluyeron. Tampoco se incluyeron hashes, sales,
claves de recuperación ni tokens de sesión. El nombre de usuario de recuperación
temporal estaba configurado, pero su ventana de expiración ya estaba vencida en
la fecha de captura; debe generarse una nueva si se necesita esa función.

## Validaciones realizadas

- Clone del repositorio fuente completado.
- `HEAD` coincide con la versión publicada 43.
- Los tres ZIP publicados para Windows/exportación pasaron `unzip -t` sin errores.
- Los 18 JSON de la instantánea fueron analizados correctamente.
- Búsqueda de secretos en la instantánea: no se encontraron hashes, tokens ni
  claves criptográficas; solo quedaron los nombres de campos redaccionados.

La instalación de npm, compilación y pruebas no pudieron ejecutarse en este
entorno porque el instalador necesitaba descargar el tarball bloqueado de
Vinext desde el registro de npm y la descarga de red fue rechazada. Esto es una
limitación del entorno de trabajo, no evidencia de un error de compilación del
código. Los comandos reproducibles quedan en `README.md`.

## Limitaciones de la copia

- El ZIP no incluye `.git`, credenciales temporales del repositorio ni secretos
  de producción.
- La instantánea de datos es paginada y no transaccional.
- Los datos criptográficos de usuarios y las sesiones no son recuperables en la
  entrega segura; el administrador debe configurarse de nuevo con el flujo de
  activación.
- Vercel no puede ejecutar esta arquitectura sin un portado del Worker, D1 y
  bindings. El detalle se encuentra en `docs/VERCEL_PORTING.md`.
