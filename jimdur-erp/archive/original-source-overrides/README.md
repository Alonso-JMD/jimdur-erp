# JIMDUR ERP — copia recuperada

Esta entrega contiene el código fuente real asociado al Site **JIMDUR ERP**.
La fuente fue recuperada desde la versión publicada 43 y coincide con el
commit `4ea1b00f823765f4082b8892b0e9b7498db3f642`. El README original del
proyecto se conserva en `README.SITE-ORIGINAL.md`.

## Qué incluye

- Frontend React/Vinext en `app/`, estilos, páginas, componentes y recursos.
- Backend de Cloudflare Worker en `worker/` y lógica de negocio en
  `app/jimdur-server.ts`.
- Rutas `/` y `/instalar`.
- API de autenticación, operaciones y snapshot en `app/api/`.
- Esquema Drizzle, cuatro migraciones y metadatos en `db/` y `drizzle/`.
- Recursos gráficos, instalador de Windows y exportador SQL Server en `public/`.
- Pruebas y configuración de Vite, Vinext, Next, TypeScript y ESLint.
- Instantánea de la base viva en `data/live-db/`.
- Auditoría de recuperación en `docs/RECOVERY_AUDIT.md`.

## Requisitos

- Node.js `>=22.13.0`.
- Para los scripts `install:ci` y `build`: Linux o WSL con Bash, `flock`,
  `curl`, `sha256sum` y GNU `timeout`.
- Para producción: un runtime compatible con Cloudflare Workers y una base
  Cloudflare D1 enlazada como `DB`.

## Instalación local

En Linux o WSL, desde la raíz del proyecto:

```bash
npm run install:ci
```

En otros sistemas puede usarse `npm ci`, aunque los scripts de construcción
incluidos están escritos para Bash/Linux.

1. Copia `.env.example` como `.dev.vars`.
2. Sustituye todos los valores de ejemplo por valores privados.
3. Genera una clave de autenticación aleatoria, por ejemplo:

```bash
node --input-type=module -e 'import { randomBytes } from "node:crypto"; console.log(randomBytes(32).toString("hex"))'
```

4. Para obtener el hash de un código de activación o recuperación, normaliza el
   código a mayúsculas y elimina caracteres no alfanuméricos antes de aplicar
   SHA-256. Ejemplo:

```bash
node --input-type=module -e 'import { createHash } from "node:crypto"; const v=(process.argv[1]??"").toUpperCase().replace(/[^A-Z0-9]/g,""); console.log(createHash("sha256").update(v).digest("hex"))' "TU_CODIGO"
```

La aplicación usa D1 local a través del plugin de Cloudflare/Vite. Si la
instancia local todavía no tiene tablas, aplica las migraciones de `drizzle/`
con la instancia local de Wrangler antes de iniciar sesión. La instantánea de
`data/live-db/` puede usarse como fuente de datos después de crear el esquema.

## Ejecutar y validar

```bash
npm run dev
```

Comandos disponibles:

```bash
npm run build       # compila el artefacto Worker/Sites
npm run start       # inicia el artefacto compilado
npm test            # compila y ejecuta las pruebas incluidas
npm run lint        # revisión ESLint
npm run db:generate # genera una nueva migración Drizzle
```

El sistema permite activar el primer administrador, iniciar/cerrar sesión,
recuperar o cambiar contraseña, administrar usuarios y permisos, gestionar
almacenes, productos, recepciones, proformas, órdenes de salida/despacho,
transferencias, inventario, ajustes, kardex, stock crítico, reportes CSV,
copias e importación desde SQL Server. La importación de pedidos admite Excel,
CSV, DOCX, PDF e imágenes con lectura OCR, con los límites implementados en
`app/order-file-import.ts`.

## Variables de entorno

Las variables necesarias están enumeradas sin valores privados en
`.env.example`. La copia no incluye el secreto original del Site, hashes/sales
de contraseñas ni sesiones activas. Por ello, al usar la instantánea sanitaria
de la base se debe activar nuevamente el administrador con un código de
configuración nuevo. Para conservar las contraseñas actuales se necesitarían,
por separado, el `JIMDUR_AUTH_SECRET` original y los campos criptográficos de
los usuarios.

## Base de datos recuperada

`data/live-db/` contiene un archivo JSON por tabla, leído de la base D1 viva el
8 de septiembre de 2026. Se recuperaron 18 tablas y 2.344 registros; se
guardaron 2.341 registros después de excluir sesiones, límites de autenticación
y campos criptográficos. Consulta `data/live-db/README.md` antes de restaurar.

La instantánea es una lectura distribuida y de solo lectura, no una transacción
congelada. Si el sistema estaba siendo usado durante la captura, conviene
comparar los totales antes de restaurar.

## Despliegue conservando la arquitectura

El código actual está preparado para Cloudflare Worker/Sites, no para un
servidor Node tradicional. Deben existir:

- binding D1 `DB`;
- binding de activos `ASSETS`, proporcionado por el empaquetado Worker;
- binding `IMAGES` si se usa la ruta de optimización de imágenes del Worker;
- las variables privadas de `.env.example` en el entorno de producción.

`.openai/hosting.json` conserva el binding lógico `DB` y el identificador del
Site original. No borres ese archivo si vas a continuar administrando el Site
original; reemplaza la infraestructura y los identificadores únicamente al
migrar a otra cuenta.

## Vercel: limitación importante

Esta copia **no se puede desplegar en Vercel sin adaptación** manteniendo todas
las funcionalidades. El motivo no es una falta de archivos: el backend importa
`cloudflare:workers`, usa D1 mediante `env.DB`, define `worker/index.ts` y se
compila con Vinext y el plugin de Cloudflare. Vercel no proporciona esos
bindings ni ejecuta ese Worker como está.

La ruta de migración a Vercel está descrita en `docs/VERCEL_PORTING.md`. Requiere
portar el adaptador de base de datos a un servicio compatible con Vercel,
reemplazar el entrypoint Worker, configurar las funciones API, migrar el
esquema y probar autenticación e inventario. Esa adaptación todavía no forma
parte de esta entrega porque sería una reconstrucción distinta de la aplicación
real.

## Auditoría

Lee `docs/RECOVERY_AUDIT.md` para la procedencia, inventario de archivos,
funcionalidades, servicios externos, variables, datos recuperados y límites de
verificación.

