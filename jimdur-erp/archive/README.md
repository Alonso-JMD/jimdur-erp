# Archivo de procedencia

Esta carpeta contiene material original que no debe cargarse como código activo
en Vercel:

- `cloudflare-original/` conserva la infraestructura específica del Site
  original: Worker, Vinext/Vite, binding D1, migraciones SQLite y scripts.
- `original-source-overrides/` conserva las versiones originales de los
  archivos que fueron modificados para el portado a Next.js + Neon.
- `vercel-build-cache/` contiene solo cachés generadas por las comprobaciones
  locales.

La aplicación activa está en la raíz del proyecto. `tsconfig.json`, ESLint y
la configuración de Vercel excluyen este archivo histórico del build.
