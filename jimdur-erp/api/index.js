import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS usuarios (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    nombre TEXT,
    rol TEXT NOT NULL DEFAULT 'admin',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS categorias (
    id BIGSERIAL PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS almacenes (
    id BIGSERIAL PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS productos (
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
  )`,
  `CREATE TABLE IF NOT EXISTS terceros (
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
  )`,
  `CREATE TABLE IF NOT EXISTS existencias (
    id BIGSERIAL PRIMARY KEY,
    producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    almacen_id BIGINT NOT NULL REFERENCES almacenes(id) ON DELETE RESTRICT,
    cantidad NUMERIC(14,3) NOT NULL DEFAULT 0,
    reservado NUMERIC(14,3) NOT NULL DEFAULT 0,
    danado NUMERIC(14,3) NOT NULL DEFAULT 0,
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (producto_id, almacen_id)
  )`,
  `CREATE TABLE IF NOT EXISTS documentos (
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
  )`,
  `CREATE TABLE IF NOT EXISTS documento_items (
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
  )`,
  `CREATE TABLE IF NOT EXISTS movimientos_stock (
    id BIGSERIAL PRIMARY KEY,
    producto_id BIGINT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    almacen_id BIGINT NOT NULL REFERENCES almacenes(id) ON DELETE RESTRICT,
    documento_id BIGINT REFERENCES documentos(id) ON DELETE SET NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('entrada','salida','ajuste_positivo','ajuste_negativo')),
    cantidad NUMERIC(14,3) NOT NULL CHECK (cantidad > 0),
    observacion TEXT,
    creado_por TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos (nombre)`,
  `CREATE INDEX IF NOT EXISTS idx_existencias_producto ON existencias (producto_id)`,
  `CREATE INDEX IF NOT EXISTS idx_documentos_tipo_fecha ON documentos (tipo, fecha DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos_stock (creado_en DESC)`,
  `CREATE OR REPLACE FUNCTION registrar_movimiento_stock(
    p_producto_id BIGINT,
    p_almacen_id BIGINT,
    p_tipo TEXT,
    p_cantidad NUMERIC,
    p_documento_id BIGINT DEFAULT NULL,
    p_observacion TEXT DEFAULT NULL,
    p_creado_por TEXT DEFAULT NULL
  ) RETURNS NUMERIC LANGUAGE plpgsql AS $$
  DECLARE v_saldo NUMERIC;
  BEGIN
    IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
      RAISE EXCEPTION 'La cantidad debe ser mayor que cero.';
    END IF;
    INSERT INTO existencias (producto_id, almacen_id) VALUES (p_producto_id, p_almacen_id)
      ON CONFLICT (producto_id, almacen_id) DO NOTHING;
    IF p_tipo IN ('entrada', 'ajuste_positivo') THEN
      UPDATE existencias SET cantidad = cantidad + p_cantidad, actualizado_en = NOW()
      WHERE producto_id = p_producto_id AND almacen_id = p_almacen_id;
    ELSIF p_tipo IN ('salida', 'ajuste_negativo') THEN
      UPDATE existencias SET cantidad = cantidad - p_cantidad, actualizado_en = NOW()
      WHERE producto_id = p_producto_id AND almacen_id = p_almacen_id
        AND cantidad - reservado - danado >= p_cantidad;
      IF NOT FOUND THEN RAISE EXCEPTION 'Stock insuficiente para realizar la salida.'; END IF;
    ELSE
      RAISE EXCEPTION 'Tipo de movimiento no válido.';
    END IF;
    INSERT INTO movimientos_stock (producto_id, almacen_id, documento_id, tipo, cantidad, observacion, creado_por)
      VALUES (p_producto_id, p_almacen_id, p_documento_id, p_tipo, p_cantidad, p_observacion, p_creado_por);
    SELECT cantidad INTO v_saldo FROM existencias
      WHERE producto_id = p_producto_id AND almacen_id = p_almacen_id;
    RETURN v_saldo;
  END;
  $$`,
  `INSERT INTO almacenes (nombre) VALUES ('Almacén principal') ON CONFLICT (nombre) DO NOTHING`,
  `INSERT INTO categorias (nombre) VALUES ('General') ON CONFLICT (nombre) DO NOTHING`
];

const tableQueries = {
  categorias: `SELECT t.* FROM categorias t`,
  almacenes: `SELECT t.* FROM almacenes t`,
  productos: `SELECT p.*, CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('nombre', c.nombre) END AS categorias FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id`,
  terceros: `SELECT t.* FROM terceros t`,
  existencias: `SELECT e.*, CASE WHEN p.id IS NULL THEN NULL ELSE json_build_object('id',p.id,'codigo',p.codigo,'nombre',p.nombre,'ubicacion',p.ubicacion,'unidad',p.unidad,'stock_critico',p.stock_critico,'precio_venta',p.precio_venta,'precio_compra',p.precio_compra) END AS productos, CASE WHEN a.id IS NULL THEN NULL ELSE json_build_object('nombre',a.nombre) END AS almacenes FROM existencias e LEFT JOIN productos p ON p.id=e.producto_id LEFT JOIN almacenes a ON a.id=e.almacen_id`,
  documentos: `SELECT d.*, CASE WHEN t.id IS NULL THEN NULL ELSE json_build_object('nombre_razon_social',t.nombre_razon_social) END AS terceros FROM documentos d LEFT JOIN terceros t ON t.id=d.tercero_id`,
  documento_items: `SELECT i.*, CASE WHEN p.id IS NULL THEN NULL ELSE json_build_object('codigo',p.codigo,'nombre',p.nombre,'unidad',p.unidad) END AS productos, CASE WHEN a.id IS NULL THEN NULL ELSE json_build_object('nombre',a.nombre) END AS almacenes, CASE WHEN ad.id IS NULL THEN NULL ELSE json_build_object('nombre',ad.nombre) END AS almacen_destino FROM documento_items i LEFT JOIN productos p ON p.id=i.producto_id LEFT JOIN almacenes a ON a.id=i.almacen_id LEFT JOIN almacenes ad ON ad.id=i.almacen_destino_id`,
  movimientos_stock: `SELECT m.*, CASE WHEN p.id IS NULL THEN NULL ELSE json_build_object('codigo',p.codigo,'nombre',p.nombre) END AS productos, CASE WHEN a.id IS NULL THEN NULL ELSE json_build_object('nombre',a.nombre) END AS almacenes, CASE WHEN d.id IS NULL THEN NULL ELSE json_build_object('numero',d.numero) END AS documentos FROM movimientos_stock m LEFT JOIN productos p ON p.id=m.producto_id LEFT JOIN almacenes a ON a.id=m.almacen_id LEFT JOIN documentos d ON d.id=m.documento_id`
};

const tableAliases = {
  categorias: 't',
  almacenes: 't',
  productos: 'p',
  terceros: 't',
  existencias: 'e',
  documentos: 'd',
  documento_items: 'i',
  movimientos_stock: 'm'
};

const filterColumns = {
  categorias: new Set(['id', 'nombre', 'activo']),
  almacenes: new Set(['id', 'nombre', 'activo']),
  productos: new Set(['id', 'codigo', 'nombre', 'activo', 'categoria_id']),
  terceros: new Set(['id', 'tipo', 'nombre_razon_social', 'activo']),
  existencias: new Set(['id', 'producto_id', 'almacen_id']),
  documentos: new Set(['id', 'tipo', 'estado', 'tercero_id']),
  documento_items: new Set(['id', 'documento_id', 'producto_id', 'almacen_id']),
  movimientos_stock: new Set(['id', 'producto_id', 'almacen_id', 'documento_id', 'tipo'])
};

const orderColumns = {
  categorias: new Set(['id', 'nombre', 'creado_en']),
  almacenes: new Set(['id', 'nombre', 'creado_en']),
  productos: new Set(['id', 'nombre', 'codigo', 'creado_en', 'actualizado_en']),
  terceros: new Set(['id', 'nombre_razon_social', 'creado_en']),
  existencias: new Set(['id', 'actualizado_en']),
  documentos: new Set(['id', 'fecha', 'creado_en', 'numero']),
  documento_items: new Set(['id', 'creado_en']),
  movimientos_stock: new Set(['id', 'creado_en'])
};

const insertColumns = {
  productos: new Set(['codigo','nombre','marca','unidad','precio_compra','precio_venta','stock_critico','ubicacion','categoria_id','activo']),
  terceros: new Set(['tipo','nombre_razon_social','documento_tipo','documento_numero','telefono','correo','direccion','activo']),
  documentos: new Set(['numero','fecha','tipo','tercero_id','subtotal','igv','total','estado','observacion','creado_por','metadatos']),
  documento_items: new Set(['documento_id','producto_id','almacen_id','almacen_destino_id','cantidad','cantidad_danada','precio_unitario','subtotal'])
};

let sqlClient;
let schemaPromise;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function databaseUrl() {
  return process.env.DATABASE_URL || process.env.STORAGE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
}

function getSql() {
  const url = databaseUrl();
  if (!url) throw new HttpError(503, 'La base de datos Neon todavía no está conectada a Vercel.');
  if (!sqlClient) sqlClient = neon(url);
  return sqlClient;
}

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const sql = getSql();
      for (const statement of schemaStatements) await sql.query(statement);
    })().catch(error => {
      schemaPromise = undefined;
      throw error;
    });
  }
  await schemaPromise;
}

function sessionSecret() {
  return process.env.SESSION_SECRET || databaseUrl() || 'jimdur-development-secret';
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decode(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function signToken(payload) {
  const body = encode(payload);
  const signature = createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifyToken(token) {
  try {
    const [body, signature] = String(token || '').split('.');
    if (!body || !signature) return null;
    const expected = createHmac('sha256', sessionSecret()).update(body).digest('base64url');
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
    const payload = decode(body);
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function normaliseEmail(value) {
  const input = String(value || '').trim().toLowerCase();
  return input.includes('@') ? input : `${input}@gmail.com`;
}

function sessionFor(user) {
  const exp = Date.now() + 12 * 60 * 60 * 1000;
  const token = signToken({ sub: user.id, email: user.email, role: user.rol, exp });
  return {
    token,
    session: { user: { id: user.id, email: user.email, user_metadata: { name: user.nombre || '' } }, expires_at: Math.floor(exp / 1000) }
  };
}

function bearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

async function requireUser(req, sql) {
  const payload = verifyToken(bearer(req));
  if (!payload) throw new HttpError(401, 'La sesión ha vencido. Ingrese nuevamente.');
  const result = await sql.query('SELECT id, email, nombre, rol, activo FROM usuarios WHERE id = $1 LIMIT 1', [payload.sub]);
  const user = result[0];
  if (!user || !user.activo) throw new HttpError(401, 'La sesión ya no está activa.');
  return user;
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

function actionFrom(req) {
  const url = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);
  return url.searchParams.get('action') || parseBody(req).action || 'status';
}

function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').end(JSON.stringify(body));
}

async function status(sql) {
  const result = await sql.query('SELECT COUNT(*)::int AS count FROM usuarios');
  return { configured: true, hasUsers: Number(result[0]?.count || 0) > 0, needsSetup: Number(result[0]?.count || 0) === 0 };
}

async function queryTable(sql, table, body) {
  if (!tableQueries[table]) throw new HttpError(400, 'Tabla no permitida.');
  const alias = tableAliases[table];
  const params = [];
  const where = [];
  for (const [column, value] of Object.entries(body.eq || {})) {
    if (!filterColumns[table]?.has(column)) throw new HttpError(400, 'Filtro no permitido.');
    params.push(value);
    where.push(`${alias}.${column} = $${params.length}`);
  }
  const order = orderColumns[table]?.has(body.order) ? body.order : null;
  let statement = tableQueries[table];
  if (where.length) statement += ` WHERE ${where.join(' AND ')}`;
  if (order) statement += ` ORDER BY ${alias}.${order} ${body.asc ? 'ASC' : 'DESC'}`;
  else if (table === 'documentos') statement += ' ORDER BY d.creado_en DESC';
  else if (table === 'movimientos_stock') statement += ' ORDER BY m.creado_en DESC';
  else if (table === 'existencias') statement += ' ORDER BY e.actualizado_en DESC';
  return sql.query(statement, params);
}

async function insertRows(sql, table, payload) {
  if (!insertColumns[table]) throw new HttpError(400, 'Operación de inserción no permitida.');
  const rows = Array.isArray(payload) ? payload : [payload];
  const result = [];
  for (const row of rows) {
    const entries = Object.entries(row || {}).filter(([key, value]) => insertColumns[table].has(key) && value !== undefined);
    if (table === 'documento_items' && !entries.some(([key]) => key === 'subtotal')) {
      const quantity = Number(row.cantidad || 0);
      const price = Number(row.precio_unitario || 0);
      entries.push(['subtotal', Math.round(quantity * price * 100) / 100]);
    }
    if (!entries.length) throw new HttpError(400, 'No hay datos para guardar.');
    const columns = entries.map(([key]) => `"${key}"`);
    const values = entries.map(([, value]) => value && typeof value === 'object' && !(value instanceof Date) ? JSON.stringify(value) : value);
    const placeholders = values.map((_, index) => `$${index + 1}`);
    const statement = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    const rowsInserted = await sql.query(statement, values);
    result.push(rowsInserted[0]);
  }
  return result;
}

async function login(sql, body) {
  const email = normaliseEmail(body.email || body.username);
  const password = String(body.password || '');
  const result = await sql.query('SELECT id, email, nombre, rol, activo, password_hash FROM usuarios WHERE lower(email) = lower($1) LIMIT 1', [email]);
  const user = result[0];
  if (!user || !user.activo || !(await bcrypt.compare(password, user.password_hash))) throw new HttpError(401, 'Usuario o contraseña incorrectos.');
  return sessionFor(user);
}

async function setupFirstUser(sql, body) {
  const exists = await sql.query('SELECT id FROM usuarios LIMIT 1');
  if (exists.length) throw new HttpError(409, 'La configuración inicial ya fue realizada.');
  const email = normaliseEmail(body.email || body.username);
  const password = String(body.password || '');
  const nombre = String(body.nombre || 'Administrador').trim() || 'Administrador';
  if (!email || !email.includes('@') || password.length < 8) throw new HttpError(400, 'Ingrese un usuario válido y una contraseña de al menos 8 caracteres.');
  const user = { id: randomUUID(), email, nombre, rol: 'admin' };
  const hash = await bcrypt.hash(password, 12);
  await sql.query('INSERT INTO usuarios (id, email, password_hash, nombre, rol) VALUES ($1, $2, $3, $4, $5)', [user.id, user.email, hash, user.nombre, user.rol]);
  return sessionFor(user);
}

async function rpc(sql, name, args, user) {
  if (name !== 'registrar_movimiento_stock') throw new HttpError(400, 'Operación no permitida.');
  const result = await sql.query(
    'SELECT registrar_movimiento_stock($1, $2, $3, $4, $5, $6, $7) AS saldo',
    [args.p_producto_id, args.p_almacen_id, args.p_tipo, args.p_cantidad, args.p_documento_id ?? null, args.p_observacion ?? null, user.id]
  );
  return result[0]?.saldo ?? null;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  try {
    const sql = getSql();
    await ensureSchema();
    const action = actionFrom(req);
    const body = parseBody(req);

    if (action === 'status') return send(res, 200, { data: await status(sql) });
    if (action === 'login') return send(res, 200, { data: await login(sql, body) });
    if (action === 'setup') return send(res, 200, { data: await setupFirstUser(sql, body) });
    if (action === 'session') {
      const user = await requireUser(req, sql);
      return send(res, 200, { data: { session: { user: { id: user.id, email: user.email, user_metadata: { name: user.nombre || '' } } } } });
    }
    if (action === 'logout') return send(res, 200, { data: { ok: true } });

    const user = await requireUser(req, sql);
    if (action === 'query') return send(res, 200, { data: await queryTable(sql, body.table, body) });
    if (action === 'insert') return send(res, 200, { data: await insertRows(sql, body.table, body.payload) });
    if (action === 'rpc') return send(res, 200, { data: await rpc(sql, body.name, body.args || {}, user) });
    throw new HttpError(404, 'Operación no encontrada.');
  } catch (error) {
    console.error('[JIMDUR API]', error);
    const statusCode = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : 'No se pudo completar la operación.';
    return send(res, statusCode, { error: message });
  }
}
