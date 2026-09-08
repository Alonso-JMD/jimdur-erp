# JIMDUR ERP — Vercel + Neon

Esta carpeta contiene el proyecto real recuperado de JIMDUR ERP y adaptado para
ejecutarse fuera de ChatGPT en **Vercel con Neon PostgreSQL**. Se conserva la
interfaz, las rutas API, la lógica de inventario, autenticación, permisos,
reportes, importación de archivos y recursos públicos.

La fuente original de Cloudflare se conserva, organizada en
`archive/cloudflare-original/`. La versión activa de este directorio usa
Next.js estándar y funciones Node.js de Vercel.

## Funcionalidades conservadas

- Inicio de sesión propio, activación inicial del administrador, recuperación y
  cambio de contraseña.
- Roles, permisos y administración de usuarios.
- Dashboard, productos, almacenes, inventario, stock crítico y kardex.
- Recepciones de mercadería y reversión controlada.
- Proformas, pedidos, reserva de stock, despacho, recepción, cancelación y
  anulación.
- Transferencias entre almacenes y ajustes con trazabilidad.
- Reportes y exportaciones CSV, copias locales e importación desde SQL Server.
- Lectura de pedidos desde Excel, CSV, DOCX, PDF e imágenes mediante OCR.
- PWA, instalador de Windows, iconos, logos y demás recursos de `public/`.

## Arquitectura de la migración

| Parte | Implementación |
| --- | --- |
| Frontend | React 19 + Next.js App Router |
| API/backend | Route Handlers en `app/api/` + `app/jimdur-server.ts` |
| Runtime | Funciones Node.js de Vercel |
| Base de datos | Neon PostgreSQL mediante `@neondatabase/serverless` |
| ORM/esquema | Drizzle ORM en `db/schema.ts` |
| Migración inicial | `db/neon-schema.sql` |
| Datos recuperados | JSON en `data/live-db/` |

## Requisitos

- Node.js `>=22.13.0`.
- Una cuenta de Vercel.
- Una base de datos Neon PostgreSQL.
- Git para conectar el proyecto a Vercel, o Vercel CLI para desplegarlo desde
  una carpeta local.

## Configuración local

Desde la raíz del proyecto:

```bash
npm ci
cp .env.example .env.local
```

Edita `.env.local` y completa `DATABASE_URL` y los secretos de JIMDUR. Después
crea las tablas e importa la información recuperada:

```bash
npm run db:setup
npm run dev
```

Abre `http://localhost:3000`.

Si ya tienes las tablas y solo quieres importar nuevamente la instantánea:

```bash
npm run db:import
```

La importación usa `ON CONFLICT DO NOTHING`; está pensada para una base nueva.
Para una restauración exacta, crea una base Neon vacía antes de ejecutar
`npm run db:setup`.

## Variables de entorno

| Variable | Obligatoria | Uso |
| --- | --- | --- |
| `DATABASE_URL` | Sí | Cadena privada de conexión a Neon PostgreSQL. |
| `JIMDUR_AUTH_SECRET` | Sí | Secreto adicional para derivar contraseñas. |
| `JIMDUR_SETUP_CODE_HASH` | Sí | SHA-256 del código de activación inicial. |
| `NEXT_PUBLIC_APP_URL` | Recomendada | URL pública de Vercel para metadatos y enlaces. |
| `JIMDUR_PASSWORD_RECOVERY_CODE_HASH` | Opcional | Código temporal de recuperación. |
| `JIMDUR_PASSWORD_RECOVERY_USERNAME` | Opcional | Usuario asociado al código temporal. |
| `JIMDUR_PASSWORD_RECOVERY_EXPIRES_AT` | Opcional | Fecha UTC de vencimiento del código. |

Genera un secreto nuevo:

```bash
node --input-type=module -e 'import { randomBytes } from "node:crypto"; console.log(randomBytes(32).toString("hex"))'
```

Genera el hash de un código normalizado:

```bash
node --input-type=module -e 'import { createHash } from "node:crypto"; const v=(process.argv[1]??"").toUpperCase().replace(/[^A-Z0-9]/g,""); console.log(createHash("sha256").update(v).digest("hex"))' "TU_CODIGO"
```

No subas `.env.local` al repositorio. Nunca pongas `DATABASE_URL`, claves ni
secretos en variables `NEXT_PUBLIC_*`.

## Servicios externos

- **Vercel:** hosting, builds y funciones Node.js.
- **Neon:** PostgreSQL; es el único servicio externo necesario para guardar la
  información del ERP.
- **jsDelivr:** Tesseract.js lo usa por defecto para descargar el motor y los
  modelos de idioma la primera vez que se ejecuta OCR en el navegador. No
  requiere cuenta ni API key. Si necesitas operación completamente offline,
  esos archivos pueden autoalojarse y configurarse en el importador.

El portado activo no necesita ChatGPT Auth, Cloudflare D1/R2, Stripe, Supabase
ni cuentas o API keys de otros servicios.

## Crear Neon desde Vercel

La opción recomendada es instalar Neon desde el Marketplace de Vercel para que
la conexión quede asociada al proyecto y se inyecte como variable de entorno.
También puedes crear la base directamente en Neon y copiar su cadena privada a
`DATABASE_URL`.

Antes de desplegar la aplicación, ejecuta las migraciones y la importación
contra la base Neon destino:

```bash
npm run db:setup
```

El archivo `data/live-db/` contiene 2.341 filas guardadas de 2.344 filas leídas
de la base original. Se excluyeron sesiones, límites de autenticación y campos
criptográficos por seguridad. Por ello, después de importar debes activar un
nuevo administrador y establecer una contraseña nueva.

## Despliegue en Vercel mediante el panel

1. Sube este proyecto a un repositorio privado de GitHub o GitLab.
2. En Vercel selecciona **Add New Project** e importa el repositorio.
3. Verifica que el framework detectado sea **Next.js**.
4. Usa `npm ci` como comando de instalación y `npm run build` como comando de
   construcción. Vercel normalmente los detecta automáticamente.
5. Instala Neon desde **Storage/Marketplace** o configura manualmente
   `DATABASE_URL`.
6. Configura las variables de `.env.example` en Production y Preview.
7. Despliega primero una Preview y prueba el acceso, productos, inventario,
   recepción, despacho, transferencias, reportes e importación de archivos.
8. Cuando la Preview esté validada, promuévela a Production y agrega el dominio
   definitivo.

## Despliegue mediante Vercel CLI

```bash
npm install --global vercel
vercel login
vercel link
vercel env pull .env.local
vercel
vercel --prod
```

No incluyas secretos en comandos, commits ni capturas de pantalla. Configúralos
desde Vercel o mediante `vercel env add`.

## Validaciones locales

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

`predev` y `prebuild` copian automáticamente el worker de PDF.js a
`public/pdf.worker.min.mjs`, necesario para el lector de PDF en Next.js.

## Instalador de Windows

El instalador se conserva en `public/`. Como la URL de Vercel se conoce después
del primer despliegue, edita `public/INSTALAR_JIMDUR_WINDOWS.ps1` o define antes
de ejecutarlo:

```powershell
$env:JIMDUR_APP_URL = "https://tu-dominio.vercel.app"
```

El instalador no contiene ni copia la base de datos; solo crea un acceso directo
que abre el sistema web centralizado.

## Limitaciones de seguridad de la copia recuperada

La copia no contiene el secreto original de producción, hashes/salts de
contraseñas, claves de recuperación ni sesiones activas. Es intencional: esos
valores no deben viajar dentro de un ZIP ni de un repositorio. La funcionalidad
de autenticación se conserva, pero el administrador debe activarse nuevamente
en Neon.

Consulta `docs/VERCEL_MIGRATION_AUDIT.md` para el inventario y las pruebas de la
adaptación, y `docs/RECOVERY_AUDIT.md` para la auditoría histórica de la fuente
original.
