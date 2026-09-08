-- JIMDUR ERP · Esquema PostgreSQL para Neon
-- La aplicación inicializa estas estructuras automáticamente al recibir la primera solicitud.

CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nombre TEXT,
  rol TEXT NOT NULL DEFAULT 'admin',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categorias (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS almacenes (
  id BIGSERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS productos (
  id BIGSERIAL PRIMARY KEY,
  codigo TEXT UNIQUE,
  nombre TEXT NOT NULL,
  marca TEXT,
  unidad TEXT NOT NULL DEFAULT 'UND',
  precio_compra NUMERIC(14,2) NOT NULL DEFAULT 0,
  precio_venta NUMERIC(14,2) NOT NULL DEFAULT 0,
  stock_critico NUMERIC(14,3) NOT NULL DEFAULT 15,
  ubicacion TEXT,
  categoria_id BIGINT REFERENCES categorias(id) ON DELETE SET NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS terceros (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT NOT NULL DEFAULT 'cliente',
  nombre_razon_social TEXT NOT NULL,
  documento_tipo TEXT,
  documento_numero TEXT,
  telefono TEXT,
  correo TEXT,
  direccion TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS existencias (
  id BIGSERIAL PRIMARY KEY,
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  almacen_id BIGINT NOT NULL REFERENCES almacenes(id) ON DELETE RESTRICT,
  cantidad NUMERIC(14,3) NOT NULL DEFAULT 0,
  reservado NUMERIC(14,3) NOT NULL DEFAULT 0,
  danado NUMERIC(14,3) NOT NULL DEFAULT 0,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (producto_id, almacen_id)
);

CREATE TABLE IF NOT EXISTS documentos (
  id BIGSERIAL PRIMARY KEY,
  numero TEXT NOT NULL UNIQUE,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  tipo TEXT NOT NULL,
  tercero_id BIGINT REFERENCES terceros(id) ON DELETE SET NULL,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  igv NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'borrador',
  observacion TEXT,
  creado_por TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  metadatos JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documento_items (
  id BIGSERIAL PRIMARY KEY,
  documento_id BIGINT NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  almacen_id BIGINT NOT NULL REFERENCES almacenes(id) ON DELETE RESTRICT,
  almacen_destino_id BIGINT REFERENCES almacenes(id) ON DELETE RESTRICT,
  cantidad NUMERIC(14,3) NOT NULL CHECK (cantidad > 0),
  cantidad_danada NUMERIC(14,3) NOT NULL DEFAULT 0,
  precio_unitario NUMERIC(14,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS movimientos_stock (
  id BIGSERIAL PRIMARY KEY,
  producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  almacen_id BIGINT NOT NULL REFERENCES almacenes(id) ON DELETE RESTRICT,
  documento_id BIGINT REFERENCES documentos(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','salida','ajuste_positivo','ajuste_negativo')),
  cantidad NUMERIC(14,3) NOT NULL CHECK (cantidad > 0),
  observacion TEXT,
  creado_por TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos (nombre);
CREATE INDEX IF NOT EXISTS idx_existencias_producto ON existencias (producto_id);
CREATE INDEX IF NOT EXISTS idx_documentos_tipo_fecha ON documentos (tipo, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos_stock (creado_en DESC);

CREATE OR REPLACE FUNCTION registrar_movimiento_stock(
  p_producto_id BIGINT,
  p_almacen_id BIGINT,
  p_tipo TEXT,
  p_cantidad NUMERIC,
  p_documento_id BIGINT DEFAULT NULL,
  p_observacion TEXT DEFAULT NULL,
  p_creado_por TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_saldo NUMERIC;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor que cero.';
  END IF;

  INSERT INTO existencias (producto_id, almacen_id)
  VALUES (p_producto_id, p_almacen_id)
  ON CONFLICT (producto_id, almacen_id) DO NOTHING;

  IF p_tipo IN ('entrada', 'ajuste_positivo') THEN
    UPDATE existencias
    SET cantidad = cantidad + p_cantidad,
        actualizado_en = NOW()
    WHERE producto_id = p_producto_id AND almacen_id = p_almacen_id;
  ELSIF p_tipo IN ('salida', 'ajuste_negativo') THEN
    UPDATE existencias
    SET cantidad = cantidad - p_cantidad,
        actualizado_en = NOW()
    WHERE producto_id = p_producto_id
      AND almacen_id = p_almacen_id
      AND cantidad - reservado - danado >= p_cantidad;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Stock insuficiente para realizar la salida.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Tipo de movimiento no válido.';
  END IF;

  INSERT INTO movimientos_stock (
    producto_id, almacen_id, documento_id, tipo, cantidad, observacion, creado_por
  )
  VALUES (
    p_producto_id, p_almacen_id, p_documento_id, p_tipo, p_cantidad, p_observacion, p_creado_por
  );

  SELECT cantidad INTO v_saldo
  FROM existencias
  WHERE producto_id = p_producto_id AND almacen_id = p_almacen_id;

  RETURN v_saldo;
END;
$$;

INSERT INTO almacenes (nombre)
VALUES ('Almacén principal')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO categorias (nombre)
VALUES ('General')
ON CONFLICT (nombre) DO NOTHING;
