# Auditoría de migración Vercel + Neon

## Alcance

Se comparó la copia recuperada con la versión adaptada para verificar que la
migración cambia la plataforma de ejecución y la base de datos sin eliminar la
interfaz ni la lógica funcional.

## Inventario funcional

- Frontend React/Next.js en `app/`.
- Rutas API de autenticación, operaciones y snapshot.
- Lógica de autenticación PBKDF2, sesiones por cookie, recuperación, roles y
  permisos.
- Productos, almacenes, stock, movimientos, recepciones, proformas, órdenes,
  transferencias, usuarios, importación y auditoría.
- Importación de Excel/CSV/DOCX/PDF/imágenes con lectura OCR en el navegador.
- Recursos PWA, iconos, logos e instaladores de Windows en `public/`.

## Cambios de infraestructura auditados

| Área | Antes | Ahora |
| --- | --- | --- |
| Build | Vinext/Vite/Cloudflare | Next.js estándar |
| Backend | Worker Cloudflare | Route Handlers Node.js |
| Datos | Cloudflare D1/SQLite | Neon PostgreSQL |
| Variables | Binding `env` | `process.env` |
| PDF.js | Import Vite `?url` | Worker estático en `public/` |
| Migraciones | SQL SQLite/D1 | `db/neon-schema.sql` |
| Restauración | D1 | `npm run db:import` |

## Base de datos

La auditoría de recuperación leyó 18 tablas y 2.344 filas de la base original.
La copia sanitaria guarda 2.341 filas. Se excluyeron:

- hashes, salts y claves de recuperación de usuarios;
- tokens y sesiones activas;
- claves de límites de autenticación.

La estructura de esas columnas sí está presente en el esquema Neon. Después de
la importación se debe activar un administrador nuevo.

## Servicios externos identificados

- Vercel para hosting y funciones Node.js.
- Neon para PostgreSQL.
- jsDelivr para el motor/modelos de Tesseract.js cuando se usa OCR en el
  navegador; no requiere credenciales.
- No se detectaron dependencias activas de ChatGPT Auth, Cloudflare D1/R2,
  Stripe, Supabase o almacenamiento externo.

## Pruebas estáticas realizadas

- Todas las rutas API originales siguen presentes.
- Todas las funcionalidades del componente principal siguen referenciadas.
- El código de servidor ya no importa `cloudflare:workers` en la versión activa.
- El esquema activo usa `drizzle-orm/pg-core`.
- `package.json` usa scripts estándar de Next.js.
- La cadena de conexión solo se lee desde `DATABASE_URL`.
- El archivo de importación valida nombres de tabla y columna antes de ejecutar
  SQL.
- Los archivos del instalador no apuntan automáticamente al dominio original.

## Verificación local realizada

- `npm ci --ignore-scripts --no-audit --no-fund`: correcto.
- `npm run typecheck`: correcto.
- `npm run db:generate`: correcto; Drizzle reconoce las 18 tablas.
- `npm run build`: correcto; Next.js genera el build de producción.
- `node --test tests/*.test.mjs`: 35 pruebas correctas.
- `npx next start -H 127.0.0.1`: `/` y `/instalar` responden HTTP 200.
- Sin `DATABASE_URL`, `/api/auth` responde 500 con un mensaje de configuración
  claro y `/api/snapshot` responde 401; ambos son comportamientos esperados
  antes de configurar Neon.

El navegador automatizado no pudo iniciar en este contenedor por la limitación
del sistema `uv_interface_addresses`; la prueba HTTP del servidor compilado sí
se completó correctamente. Vercel debe probarse con una Preview real y la base
Neon conectada.

## Pruebas que deben ejecutarse con credenciales reales

No es posible confirmar conexión, migración o consultas contra Neon sin una
`DATABASE_URL` del usuario. Antes de producción deben ejecutarse:

```bash
npm run typecheck
npm run lint
npm run db:setup
npm run build
npm test
```

Después se debe probar en una Preview: activación de administrador, login,
permisos, creación de producto, recepción, reserva, despacho, reversión,
transferencia, ajuste, importación, reportes y cambio de contraseña.

## Riesgos y mitigaciones

- **Credenciales sanitizadas:** configurar un administrador nuevo.
- **SQL heredado de SQLite:** el adaptador contiene conversiones explícitas y
  debe probarse con la base Neon vacía y con datos importados.
- **Esquema existente:** ejecutar `db:setup` inicialmente sobre una base nueva;
  no mezclarlo sin revisión con una base que ya tenga tablas distintas.
- **Instalador Windows:** reemplazar la URL de ejemplo después de conocer el
  dominio definitivo.
- **Archivos grandes:** la lectura OCR continúa en el navegador y conserva el
  límite de 15 MB implementado por la aplicación.
