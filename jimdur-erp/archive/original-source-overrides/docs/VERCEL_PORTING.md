# Portado requerido para Vercel

La copia recuperada es fiel al proyecto alojado, pero su runtime de producción
es Cloudflare Worker/Sites. No es una aplicación Next.js estándar lista para
`vercel --prod`.

## Cambios necesarios

1. Sustituir `worker/index.ts` y el import `cloudflare:workers` de
   `app/jimdur-server.ts` por un runtime compatible con Vercel.
2. Reemplazar `db/index.ts`, el dialecto SQLite/D1 y las consultas D1 por una
   base compatible con Vercel, por ejemplo Postgres/Neon, y generar migraciones
   para ese dialecto.
3. Convertir `DB` y cualquier binding `ASSETS`/`IMAGES` en variables o clientes
   disponibles dentro de las funciones de Vercel.
4. Cambiar el build Vinext/Cloudflare por el build que se adopte para Next.js en
   Vercel y mantener las rutas API equivalentes.
5. Importar el contenido de `data/live-db/` después de crear el nuevo esquema.
6. Configurar los secretos de `.env.example` en Vercel. No reutilices secretos
   de producción en archivos del repositorio.
7. Probar login, permisos, recepción, reserva/despacho, ajustes, importación de
   archivos, reportes y recuperación de contraseña antes de cambiar el dominio.

Hasta completar esos cambios, la forma de conservar todas las funcionalidades
es ejecutar la arquitectura Worker + D1 en un entorno Cloudflare compatible.
La entrega no incluye un adaptador Vercel porque hacerlo sería una adaptación
de plataforma, no una copia del proyecto original.

