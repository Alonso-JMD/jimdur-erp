# JIMDUR ERP

Aplicación web independiente para Moto Repuestos JIMDUR.

## Configuración rápida

La aplicación conserva la interfaz y los módulos del ERP original, pero ahora usa una API de servidor conectada a PostgreSQL en Neon.

1. Conecte el recurso Neon al proyecto `jimdur-erp` en Vercel.
2. Despliegue el proyecto con `package.json`, `api/index.js` y `db/schema.sql`.
3. Abra la aplicación: en el primer acceso aparecerá el formulario para crear el administrador.
4. Después del primer acceso, use el mismo usuario en la pantalla normal de login.

El esquema se inicializa automáticamente en la primera solicitud. El archivo `db/schema.sql` también puede ejecutarse manualmente desde el SQL Editor de Neon.

## Seguridad

Nunca coloque la cadena de conexión de Neon ni contraseñas en archivos del navegador. La conexión se lee únicamente desde las variables de entorno del servidor de Vercel y las contraseñas se almacenan con hash seguro.

## Módulos incluidos

- Inicio de sesión
- Dashboard gerencial
- Productos
- Inventario y movimientos controlados
- Pedidos de tienda y directos
- Proformas
- Órdenes de salida
- Recepciones
- Transferencias
- Ajustes de stock
- Clientes y proveedores
- Reportes
