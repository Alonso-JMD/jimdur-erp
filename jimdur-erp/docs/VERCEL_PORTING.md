# Portado de JIMDUR a Vercel + Neon

## Estado

El portado está incorporado en esta carpeta. La aplicación activa ya no
depende de Vinext, `worker/index.ts`, `cloudflare:workers` ni del binding D1
`DB`.

## Cambios realizados

1. Se cambió el arranque de Vinext/Vite/Cloudflare a Next.js estándar:
   `next dev`, `next build` y `next start`.
2. Se mantuvieron las rutas API existentes:
   - `GET/POST /api/auth`
   - `POST /api/operations`
   - `GET /api/snapshot`
3. Se reemplazó `cloudflare:workers` por `process.env` para los secretos.
4. Se creó `db/index.ts`, un adaptador de la interfaz D1 usada por la lógica
   existente hacia Neon PostgreSQL.
5. Se convirtió `db/schema.ts` al dialecto PostgreSQL de Drizzle.
6. Se agregó `db/neon-schema.sql` para crear las 18 tablas e índices.
7. Se agregaron `scripts/neon-migrate.mjs` e `scripts/import-neon.mjs` para
   crear el esquema e importar `data/live-db/`.
8. Se reemplazó el importador Vite `?url` de PDF.js por un worker público
   preparado automáticamente durante `predev` y `prebuild`.
9. Se actualizaron metadatos y el instalador de Windows para no apuntar por
   defecto al dominio de ChatGPT.
10. Los archivos específicos de Cloudflare y las migraciones D1 originales se
    conservaron en `archive/cloudflare-original/`.

## Compatibilidad de consultas

La lógica de negocio conserva las consultas originales. El adaptador traduce
las diferencias necesarias entre SQLite/D1 y PostgreSQL: placeholders, fechas,
`INSERT OR IGNORE`, `MAX` escalar y el sufijo negativo de `SUBSTR`. Las
operaciones agrupadas se envían mediante la transacción no interactiva de Neon
cuando está disponible.

## Orden de restauración

```bash
npm ci
cp .env.example .env.local
# Completar DATABASE_URL y secretos en .env.local
npm run db:migrate
npm run db:import
npm run dev
```

La importación debe realizarse contra una base Neon nueva. La copia de
credenciales está deliberadamente sanitizada, por lo que el primer acceso se
activa con un código nuevo.

## Despliegue

Vercel debe usar el framework Next.js, `npm ci` como instalación y
`npm run build` como construcción. `DATABASE_URL` y los secretos deben estar
configurados en los entornos Production y Preview. Las migraciones y la carga
inicial de datos se ejecutan antes del primer despliegue desde una máquina
administrativa, no durante cada build de Vercel.

## Pendientes de operación

- Crear la cuenta/proyecto Neon destino.
- Configurar las variables privadas en Vercel.
- Ejecutar `npm run db:setup` contra la base destino.
- Probar una Preview con datos antes de cambiar el DNS.
- Reemplazar la URL del instalador de Windows por el dominio definitivo.
