import { cookies } from "next/headers";
import { getRawDb } from "../db";
import type { AppUser, Snapshot } from "./jimdur-types";

export const ALL_PERMISSIONS = [
  "warehouses",
  "products",
  "operations",
  "store_orders",
  "reports",
  "inventory",
  "cancellations",
  "users",
  "imports",
] as const;

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type DbRow = Record<string, unknown>;
type BoundValue = string | number | null;

const SESSION_COOKIE = "jimdur_session";
const SESSION_HOURS = 12;
const PASSWORD_ITERATIONS = 100000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const SECURE_SESSION_COOKIE = process.env.NODE_ENV === "production";

type AuthSession = {
  user: AppUser;
  mustChangePassword: boolean;
  tokenHash: string;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
};

function statement(sql: string, values: BoundValue[] = []) {
  const prepared = getRawDb().prepare(sql);
  return values.length ? prepared.bind(...values) : prepared;
}

async function allRows<T extends DbRow>(
  sql: string,
  values: BoundValue[] = [],
): Promise<T[]> {
  const result = await statement(sql, values).all<T>();
  return result.results ?? [];
}

async function firstRow<T extends DbRow>(
  sql: string,
  values: BoundValue[] = [],
): Promise<T | null> {
  return (await statement(sql, values).first<T>()) ?? null;
}

async function run(
  sql: string,
  values: BoundValue[] = [],
) {
  return statement(sql, values).run();
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function asBoolean(value: unknown, fallback = true) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return !["0", "NO", "N", "FALSE", "INACTIVO", "ANULADO"].includes(
    String(value).trim().toUpperCase(),
  );
}

function parsePermissions(value: unknown) {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function authEnvironment() {
  const bindings = process.env;
  if (!bindings.JIMDUR_AUTH_SECRET || !bindings.JIMDUR_SETUP_CODE_HASH) {
    throw new HttpError(
      503,
      "El acceso propio de JIMDUR todavía se está configurando.",
    );
  }
  return {
    secret: bindings.JIMDUR_AUTH_SECRET,
    setupCodeHash: bindings.JIMDUR_SETUP_CODE_HASH,
    recoveryCodeHash: bindings.JIMDUR_PASSWORD_RECOVERY_CODE_HASH || "",
    recoveryUsername: bindings.JIMDUR_PASSWORD_RECOVERY_USERNAME || "",
    recoveryExpiresAt: bindings.JIMDUR_PASSWORD_RECOVERY_EXPIRES_AT || "",
  };
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string) {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) {
    throw new HttpError(500, "La configuración de seguridad no es válida.");
  }
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToHex(new Uint8Array(digest));
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function randomHex(byteLength: number) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(byteLength)));
}

function normalizeUsername(value: unknown) {
  return asText(value).toUpperCase();
}

function validateUsername(value: unknown) {
  const username = normalizeUsername(value);
  if (!/^[A-Z0-9._-]{3,32}$/.test(username)) {
    throw new HttpError(
      400,
      "El usuario debe tener entre 3 y 32 caracteres: letras, números, punto, guion o guion bajo.",
    );
  }
  return username;
}

function validatePassword(value: unknown) {
  const password = typeof value === "string" ? value : "";
  if (
    password.length < 10 ||
    password.length > 128 ||
    !/[A-ZÁÉÍÓÚÑ]/.test(password) ||
    !/[a-záéíóúñ]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    throw new HttpError(
      400,
      "La contraseña debe tener al menos 10 caracteres, una mayúscula, una minúscula y un número.",
    );
  }
  return password;
}

async function derivePassword(
  password: string,
  saltHex: string,
  iterations = PASSWORD_ITERATIONS,
) {
  const { secret } = authEnvironment();
  const supportedIterations = Math.min(
    PASSWORD_ITERATIONS,
    Math.max(10000, Math.trunc(iterations)),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password + "\u0000" + secret),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: hexToBytes(saltHex),
      iterations: supportedIterations,
    },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

async function newPasswordRecord(passwordValue: unknown) {
  const password = validatePassword(passwordValue);
  const salt = randomHex(16);
  return {
    hash: await derivePassword(password, salt),
    salt,
    iterations: PASSWORD_ITERATIONS,
  };
}

async function verifyPassword(
  password: string,
  hash: string,
  salt: string,
  iterations: number,
) {
  const candidate = await derivePassword(password, salt, iterations);
  return safeEqual(candidate, hash);
}

async function ensureSystemDefaults() {
  await getRawDb().batch([
    statement(
      "INSERT OR IGNORE INTO warehouses (code,name,active) VALUES ('ALM-PRI','ALMACÉN PRINCIPAL',1)",
    ),
    statement(
      "INSERT OR IGNORE INTO warehouses (code,name,active) VALUES ('ALM-SEC','ALMACÉN SECUNDARIO',1)",
    ),
  ]);
}

async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: SECURE_SESSION_COOKIE,
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

async function clearSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: SECURE_SESSION_COOKIE,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

async function createSession(email: string) {
  const token = randomHex(32);
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await getRawDb().batch([
    statement("DELETE FROM app_sessions WHERE datetime(expires_at) <= CURRENT_TIMESTAMP"),
    statement(
      "INSERT INTO app_sessions (token_hash,user_email,expires_at,last_seen_at) VALUES (?,?,?,CURRENT_TIMESTAMP)",
      [tokenHash, email, expiresAt.toISOString()],
    ),
  ]);
  await setSessionCookie(token, expiresAt);
}

async function getSession(): Promise<AuthSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[0-9a-f]{64}$/i.test(token)) return null;
  const tokenHash = await sha256(token);
  const row = await firstRow<{
    email: string;
    username: string;
    display_name: string;
    role: string;
    active: number;
    permissions: string;
    last_access_at: string | null;
    must_change_password: number;
    password_hash: string;
    password_salt: string;
    password_iterations: number;
  }>(
    "SELECT u.email,u.username,u.display_name,u.role,u.active,u.permissions,u.last_access_at,u.must_change_password,u.password_hash,u.password_salt,u.password_iterations FROM app_sessions s JOIN app_users u ON u.email=s.user_email WHERE s.token_hash=? AND datetime(s.expires_at)>CURRENT_TIMESTAMP",
    [tokenHash],
  );
  if (!row || !asBoolean(row.active)) return null;
  await getRawDb().batch([
    statement(
      "UPDATE app_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE token_hash=?",
      [tokenHash],
    ),
    statement(
      "UPDATE app_users SET last_access_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE email=?",
      [row.email],
    ),
  ]);
  return {
    user: mapUser(row),
    mustChangePassword: asBoolean(row.must_change_password, false),
    tokenHash,
    passwordHash: asText(row.password_hash),
    passwordSalt: asText(row.password_salt),
    passwordIterations: asNumber(row.password_iterations, PASSWORD_ITERATIONS),
  };
}

function clientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "unknown"
  ).slice(0, 80);
}

async function rateKey(request: Request, username: string) {
  return sha256("login:" + clientIp(request) + ":" + username);
}

async function checkRateLimit(key: string) {
  const row = await firstRow<{
    attempts: number;
    window_started_at: string;
    locked_until: string | null;
  }>(
    "SELECT attempts,window_started_at,locked_until FROM auth_rate_limits WHERE key=?",
    [key],
  );
  if (row?.locked_until && Date.parse(row.locked_until) > Date.now()) {
    throw new HttpError(
      429,
      "Demasiados intentos. Espera 15 minutos antes de volver a ingresar.",
    );
  }
}

async function recordFailedAttempt(key: string) {
  const now = new Date();
  const row = await firstRow<{
    attempts: number;
    window_started_at: string;
  }>(
    "SELECT attempts,window_started_at FROM auth_rate_limits WHERE key=?",
    [key],
  );
  const inWindow =
    row && Date.parse(row.window_started_at) > now.getTime() - LOGIN_WINDOW_MS;
  const attempts = inWindow ? asNumber(row?.attempts) + 1 : 1;
  const lockedUntil =
    attempts >= LOGIN_MAX_ATTEMPTS
      ? new Date(now.getTime() + LOGIN_WINDOW_MS).toISOString()
      : null;
  await run(
    "INSERT INTO auth_rate_limits (key,attempts,window_started_at,locked_until) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET attempts=excluded.attempts,window_started_at=excluded.window_started_at,locked_until=excluded.locked_until",
    [
      key,
      attempts,
      inWindow ? asText(row?.window_started_at) : now.toISOString(),
      lockedUntil,
    ],
  );
}

export async function getAuthStatus() {
  const session = await getSession();
  if (session) {
    return {
      authenticated: true,
      setupRequired: false,
      mustChangePassword: session.mustChangePassword,
      user: session.user,
    };
  }
  const count = await firstRow<{ total: number }>(
    "SELECT COUNT(*) AS total FROM app_users WHERE username IS NOT NULL AND password_hash IS NOT NULL",
  );
  return {
    authenticated: false,
    setupRequired: asNumber(count?.total) === 0,
    mustChangePassword: false,
    user: null,
  };
}

export async function setupAdmin(body: unknown, request: Request) {
  const payload = (body ?? {}) as DbRow;
  const username = validateUsername(payload.username);
  const displayName = asText(payload.displayName).toUpperCase();
  if (displayName.length < 3 || displayName.length > 80) {
    throw new HttpError(400, "Ingresa el nombre del administrador.");
  }
  const key = await rateKey(request, "SETUP");
  await checkRateLimit(key);
  const suppliedCode = asText(payload.setupCode)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!safeEqual(await sha256(suppliedCode), authEnvironment().setupCodeHash)) {
    await recordFailedAttempt(key);
    throw new HttpError(401, "El código temporal no es correcto.");
  }
  const count = await firstRow<{ total: number }>(
    "SELECT COUNT(*) AS total FROM app_users WHERE username IS NOT NULL AND password_hash IS NOT NULL",
  );
  if (asNumber(count?.total) > 0) {
    throw new HttpError(409, "El acceso principal de JIMDUR ya fue activado.");
  }
  const password = await newPasswordRecord(payload.password);
  await ensureSystemDefaults();
  await getRawDb().batch([
    statement(
      "INSERT INTO app_users (email,username,display_name,role,active,permissions,password_hash,password_salt,password_iterations,must_change_password,password_updated_at,last_access_at) VALUES ('admin@jimdur.local',?,?,'ADMINISTRADOR',1,?,?,?,?,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(email) DO UPDATE SET username=excluded.username,display_name=excluded.display_name,role='ADMINISTRADOR',active=1,permissions=excluded.permissions,password_hash=excluded.password_hash,password_salt=excluded.password_salt,password_iterations=excluded.password_iterations,must_change_password=0,password_updated_at=CURRENT_TIMESTAMP,last_access_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP",
      [
        username,
        displayName,
        JSON.stringify(ALL_PERMISSIONS),
        password.hash,
        password.salt,
        password.iterations,
      ],
    ),
    statement("DELETE FROM auth_rate_limits WHERE key=?", [key]),
  ]);
  await createSession("admin@jimdur.local");
  return {
    message: "Acceso principal activado.",
    authenticated: true,
    mustChangePassword: false,
  };
}

export async function loginUser(body: unknown, request: Request) {
  const payload = (body ?? {}) as DbRow;
  const username = normalizeUsername(payload.username);
  const password = typeof payload.password === "string" ? payload.password : "";
  const key = await rateKey(request, username || "EMPTY");
  await checkRateLimit(key);
  const row = await firstRow<{
    email: string;
    username: string;
    display_name: string;
    role: string;
    active: number;
    permissions: string;
    last_access_at: string | null;
    password_hash: string;
    password_salt: string;
    password_iterations: number;
    must_change_password: number;
  }>(
    "SELECT email,username,display_name,role,active,permissions,last_access_at,password_hash,password_salt,password_iterations,must_change_password FROM app_users WHERE upper(username)=?",
    [username],
  );
  const valid =
    row &&
    asBoolean(row.active) &&
    row.password_hash &&
    row.password_salt &&
    (await verifyPassword(
      password,
      row.password_hash,
      row.password_salt,
      asNumber(row.password_iterations, PASSWORD_ITERATIONS),
    ));
  if (!valid || !row) {
    await recordFailedAttempt(key);
    throw new HttpError(401, "Usuario o contraseña incorrectos.");
  }
  await run("DELETE FROM auth_rate_limits WHERE key=?", [key]);
  await createSession(row.email);
  return {
    message: "Bienvenido a JIMDUR.",
    authenticated: true,
    mustChangePassword: asBoolean(row.must_change_password, false),
    user: mapUser(row),
  };
}

export async function recoverPassword(body: unknown, request: Request) {
  const payload = (body ?? {}) as DbRow;
  const username = validateUsername(payload.username);
  const {
    recoveryCodeHash,
    recoveryUsername,
    recoveryExpiresAt,
  } = authEnvironment();
  const key = await rateKey(request, "RECOVERY:" + username);
  await checkRateLimit(key);
  const suppliedCode = asText(payload.recoveryCode)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const suppliedHash = await sha256(suppliedCode);
  const account = await firstRow<{
    email: string;
    username: string;
    role: string;
    active: number;
    recovery_key_hash: string | null;
  }>(
    "SELECT email,username,role,active,recovery_key_hash FROM app_users WHERE upper(username)=?",
    [username],
  );

  const permanentMatch = Boolean(
    account?.recovery_key_hash &&
      safeEqual(suppliedHash, account.recovery_key_hash),
  );
  const configuredUsername = normalizeUsername(recoveryUsername);
  const expiresAt = Date.parse(recoveryExpiresAt);
  const temporaryConfigured =
    /^[0-9a-f]{64}$/i.test(recoveryCodeHash) &&
    Boolean(configuredUsername) &&
    Number.isFinite(expiresAt) &&
    Date.now() <= expiresAt;
  const temporaryMatch =
    temporaryConfigured &&
    username === configuredUsername &&
    safeEqual(suppliedHash, recoveryCodeHash);

  if (!account || !asBoolean(account.active) || (!permanentMatch && !temporaryMatch)) {
    await recordFailedAttempt(key);
    throw new HttpError(401, "Usuario o clave de recuperación incorrectos.");
  }

  const usedKey = temporaryMatch ? "recovery-used:" + recoveryCodeHash : "";
  if (temporaryMatch) {
    const alreadyUsed = await firstRow<{ key: string }>(
      "SELECT key FROM auth_rate_limits WHERE key=?",
      [usedKey],
    );
    if (alreadyUsed) {
      throw new HttpError(
        410,
        "Esta clave de recuperación ya fue utilizada.",
      );
    }
  }

  const next = await newPasswordRecord(payload.newPassword);
  const loginKey = await rateKey(request, username);
  const recoveryStatements = [
    statement(
      "UPDATE app_users SET password_hash=?,password_salt=?,password_iterations=?,must_change_password=0,password_updated_at=CURRENT_TIMESTAMP,recovery_key_hash=NULL,recovery_key_created_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE email=?",
      [next.hash, next.salt, next.iterations, account.email],
    ),
    statement("DELETE FROM app_sessions WHERE user_email=?", [account.email]),
    statement("DELETE FROM auth_rate_limits WHERE key IN (?,?)", [
      key,
      loginKey,
    ]),
    statement(
      "INSERT INTO audit_logs (user_email,action,module,entity,record_key,detail) VALUES (?,?,?,?,?,?)",
      [
        account.email,
        "RECUPERAR_ACCESO",
        "SEGURIDAD",
        "USUARIO",
        username,
        JSON.stringify({
          method: temporaryMatch
            ? "CODIGO_TEMPORAL_UNICO"
            : "CLAVE_PERSONAL_UNICA",
        }),
      ],
    ),
  ];
  if (temporaryMatch) {
    recoveryStatements.unshift(
      statement(
        "INSERT INTO auth_rate_limits (key,attempts,window_started_at,locked_until) VALUES (?,0,CURRENT_TIMESTAMP,NULL)",
        [usedKey],
      ),
    );
  }
  await getRawDb().batch(recoveryStatements);
  await createSession(account.email);
  return {
    message: "Contraseña restablecida correctamente.",
    authenticated: true,
    mustChangePassword: false,
  };
}

export async function createRecoveryKey(body: unknown) {
  const payload = (body ?? {}) as DbRow;
  const session = await getSession();
  if (!session) throw new HttpError(401, "Inicia sesión para continuar.");
  const currentPassword =
    typeof payload.currentPassword === "string" ? payload.currentPassword : "";
  const verified = await verifyPassword(
    currentPassword,
    session.passwordHash,
    session.passwordSalt,
    session.passwordIterations,
  );
  if (!verified) {
    throw new HttpError(401, "La contraseña actual no es correcta.");
  }

  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const compact = bytesToHex(bytes).toUpperCase();
  const recoveryKey =
    "JD-REC-" +
    compact.slice(0, 4) +
    "-" +
    compact.slice(4, 8) +
    "-" +
    compact.slice(8, 12);
  const recoveryKeyHash = await sha256(
    recoveryKey.replace(/[^A-Z0-9]/g, ""),
  );
  await run(
    "UPDATE app_users SET recovery_key_hash=?,recovery_key_created_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE email=?",
    [recoveryKeyHash, session.user.email],
  );
  await audit(
    session.user,
    "GENERAR_CLAVE_RECUPERACION",
    "SEGURIDAD",
    "USUARIO",
    session.user.username,
    { singleUse: true },
  );
  return {
    message: "Clave de recuperación creada. Guárdala en un lugar seguro.",
    recoveryKey,
  };
}

export async function logoutUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token && /^[0-9a-f]{64}$/i.test(token)) {
    await run("DELETE FROM app_sessions WHERE token_hash=?", [await sha256(token)]);
  }
  await clearSessionCookie();
  return { message: "Sesión cerrada." };
}

export async function changeOwnPassword(body: unknown) {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Inicia sesión para continuar.");
  const payload = (body ?? {}) as DbRow;
  const currentPassword =
    typeof payload.currentPassword === "string" ? payload.currentPassword : "";
  const currentMatches = await verifyPassword(
    currentPassword,
    session.passwordHash,
    session.passwordSalt,
    session.passwordIterations,
  );
  if (!currentMatches) {
    throw new HttpError(401, "La contraseña actual no es correcta.");
  }
  const nextPassword = validatePassword(payload.newPassword);
  if (
    await verifyPassword(
      nextPassword,
      session.passwordHash,
      session.passwordSalt,
      session.passwordIterations,
    )
  ) {
    throw new HttpError(409, "La nueva contraseña debe ser diferente.");
  }
  const next = await newPasswordRecord(nextPassword);
  await getRawDb().batch([
    statement(
      "UPDATE app_users SET password_hash=?,password_salt=?,password_iterations=?,must_change_password=0,password_updated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE email=?",
      [next.hash, next.salt, next.iterations, session.user.email],
    ),
    statement(
      "DELETE FROM app_sessions WHERE user_email=? AND token_hash<>?",
      [session.user.email, session.tokenHash],
    ),
  ]);
  return { message: "Contraseña actualizada correctamente." };
}

export async function requireAppUser(permission?: string): Promise<AppUser> {
  const session = await getSession();
  if (!session) {
    throw new HttpError(401, "Inicia sesión con tu usuario de JIMDUR.");
  }
  if (session.mustChangePassword) {
    throw new HttpError(403, "Debes cambiar tu contraseña temporal.");
  }
  const row = session.user;
  const permissions =
    row.role === "ADMINISTRADOR" ? [...ALL_PERMISSIONS] : row.permissions;
  const allowed =
    !permission ||
    permissions.includes(permission) ||
    (permission === "store_orders" && permissions.includes("operations"));
  if (!allowed) {
    throw new HttpError(403, "No tienes permiso para realizar esta operación.");
  }
  return { ...row, permissions };
}

function mapUser(row: DbRow): AppUser {
  const role = asText(row.role) === "ADMINISTRADOR" ? "ADMINISTRADOR" : "USUARIO";
  return {
    email: asText(row.email),
    username: asText(
      row.username,
      asText(row.email).split("@")[0],
    ).toUpperCase(),
    displayName: asText(row.display_name),
    role,
    active: asBoolean(row.active),
    permissions:
      role === "ADMINISTRADOR"
        ? [...ALL_PERMISSIONS]
        : parsePermissions(row.permissions),
    lastAccess: row.last_access_at ? asText(row.last_access_at) : null,
  };
}

export async function getSnapshot(user: AppUser): Promise<Snapshot> {
  await normalizeLegacyDocumentNumbers();
  const [
    productRows,
    orderAliasRows,
    stockRows,
    warehouseRows,
    movementRows,
    receiptRows,
    proformaRows,
    proformaLineRows,
    orderRows,
    orderLineRows,
    transferRows,
    userRows,
    importRows,
  ] = await Promise.all([
    allRows(
      "SELECT p.id,p.code,COALESCE(p.supplier_code,'') supplier_code,p.name,COALESCE(p.brand,'') brand,COALESCE(p.application,'') application,p.unit,COALESCE(p.location,'') location,p.cost,p.minimum_stock,p.active,COALESCE(SUM(s.physical),0) physical,COALESCE(SUM(s.reserved),0) reserved,COALESCE(SUM(s.damaged),0) damaged FROM products p LEFT JOIN stock s ON s.product_id=p.id GROUP BY p.id ORDER BY p.name",
    ),
    allRows(
      "SELECT a.id,a.alias,a.product_id,p.code product_code,p.name product_name,COALESCE(a.user_email,'') user_email,a.updated_at FROM order_product_aliases a JOIN products p ON p.id=a.product_id ORDER BY a.updated_at DESC LIMIT 500",
    ),
    allRows(
      "SELECT s.id,s.product_id,p.code,p.name,p.unit,COALESCE(p.location,'') location,p.minimum_stock,s.warehouse_id,w.name warehouse,s.physical,s.reserved,s.damaged FROM stock s JOIN products p ON p.id=s.product_id JOIN warehouses w ON w.id=s.warehouse_id WHERE p.active=1 ORDER BY p.name,w.name",
    ),
    allRows(
      "SELECT w.id,w.code,w.name,w.active,COUNT(DISTINCT CASE WHEN s.physical>0 THEN s.product_id END) products_with_stock,COALESCE(SUM(s.physical),0) physical,COALESCE(SUM(s.reserved),0) reserved,COALESCE(SUM(s.damaged),0) damaged FROM warehouses w LEFT JOIN stock s ON s.warehouse_id=w.id GROUP BY w.id ORDER BY w.id",
    ),
    allRows(
      "SELECT m.id,m.occurred_at,m.type,m.document,m.product_id,p.name product,p.code,m.quantity,m.warehouse_id,w.name warehouse,COALESCE(m.notes,'') notes,COALESCE(m.user_email,'') user_email FROM movements m JOIN products p ON p.id=m.product_id JOIN warehouses w ON w.id=m.warehouse_id ORDER BY m.occurred_at DESC,m.id DESC LIMIT 1000",
    ),
    allRows(
      "SELECT r.id,r.number,r.date,r.warehouse_id,w.name warehouse,COALESCE(r.supplier,'') supplier,COALESCE(r.source,'') source,COALESCE(r.document_number,'') document_number,COALESCE(r.carrier,'') carrier,COALESCE(r.notes,'') notes,r.status,COALESCE(r.user_email,'') user_email,COUNT(rl.id) products,COALESCE(SUM(rl.received),0) units FROM receipts r JOIN warehouses w ON w.id=r.warehouse_id LEFT JOIN receipt_lines rl ON rl.receipt_id=r.id GROUP BY r.id ORDER BY r.date DESC,r.id DESC LIMIT 500",
    ),
    allRows(
      "SELECT p.id,p.number,p.date,p.client,COALESCE(p.document,'') document,COALESCE(p.address,'') address,p.warehouse_id,w.name warehouse,p.payment_condition,p.status,COALESCE(p.user_email,'') user_email,COUNT(pl.id) products,COALESCE(SUM(pl.quantity),0) units,COALESCE(SUM(pl.quantity*pl.price),0) total FROM proformas p JOIN warehouses w ON w.id=p.warehouse_id LEFT JOIN proforma_lines pl ON pl.proforma_id=p.id GROUP BY p.id ORDER BY p.date DESC,p.id DESC LIMIT 500",
    ),
    allRows(
      "SELECT pl.id,pl.proforma_id,pl.product_id,p.code,p.name,p.unit,pl.quantity,pl.price FROM proforma_lines pl JOIN products p ON p.id=pl.product_id ORDER BY pl.id",
    ),
    allRows(
      "SELECT o.id,o.number,o.date,o.warehouse_id,w.name warehouse,o.destination,o.order_type,o.flow_mode,o.priority,COALESCE(o.notes,'') notes,o.status,COALESCE(o.user_email,'') user_email,o.started_at,o.ready_at,o.dispatched_at,COUNT(ol.id) products,COALESCE(SUM(ol.requested),0) requested,COALESCE(SUM(ol.reserved),0) reserved,COALESCE(SUM(ol.dispatched),0) dispatched FROM orders o JOIN warehouses w ON w.id=o.warehouse_id LEFT JOIN order_lines ol ON ol.order_id=o.id GROUP BY o.id ORDER BY o.date DESC,o.id DESC LIMIT 500",
    ),
    allRows(
      "SELECT ol.id,ol.order_id,ol.product_id,p.code,p.name,p.unit,COALESCE(p.location,'') location,ol.requested,ol.reserved,ol.dispatched,ol.status,COALESCE(ol.notes,'') notes,COALESCE(s.physical,0) physical,COALESCE(s.reserved,0) stock_reserved FROM order_lines ol JOIN orders o ON o.id=ol.order_id JOIN products p ON p.id=ol.product_id LEFT JOIN stock s ON s.product_id=ol.product_id AND s.warehouse_id=o.warehouse_id ORDER BY ol.id",
    ),
    allRows(
      "SELECT t.id,t.number,t.date,t.origin_warehouse_id,wo.name origin,t.destination_warehouse_id,wd.name destination,COALESCE(t.notes,'') notes,t.status,COALESCE(t.user_email,'') user_email,COUNT(tl.id) products,COALESCE(SUM(tl.quantity),0) units FROM transfers t JOIN warehouses wo ON wo.id=t.origin_warehouse_id JOIN warehouses wd ON wd.id=t.destination_warehouse_id LEFT JOIN transfer_lines tl ON tl.transfer_id=t.id GROUP BY t.id ORDER BY t.date DESC,t.id DESC LIMIT 500",
    ),
    allRows(
      "SELECT email,username,display_name,role,active,permissions,last_access_at FROM app_users WHERE username IS NOT NULL ORDER BY role,display_name",
    ),
    allRows(
      "SELECT id,imported_at,COALESCE(source_server,'') source_server,COALESCE(source_database,'') source_database,COALESCE(user_email,'') user_email,summary FROM import_runs ORDER BY id DESC LIMIT 20",
    ),
  ]);

  return {
    user,
    products: productRows.map((row) => ({
      id: asNumber(row.id),
      code: asText(row.code),
      supplierCode: asText(row.supplier_code),
      name: asText(row.name),
      brand: asText(row.brand),
      application: asText(row.application),
      unit: asText(row.unit, "UND"),
      location: asText(row.location),
      cost: asNumber(row.cost),
      minimum: asNumber(row.minimum_stock),
      active: asBoolean(row.active),
      physical: asNumber(row.physical),
      reserved: asNumber(row.reserved),
      damaged: asNumber(row.damaged),
      available: Math.max(0, asNumber(row.physical) - asNumber(row.reserved)),
    })),
    orderProductAliases: orderAliasRows.map((row) => ({
      id: asNumber(row.id),
      alias: asText(row.alias),
      productId: asNumber(row.product_id),
      productCode: asText(row.product_code),
      productName: asText(row.product_name),
      userEmail: asText(row.user_email),
      updatedAt: asText(row.updated_at),
    })),
    stock: stockRows.map((row) => ({
      id: asNumber(row.id),
      productId: asNumber(row.product_id),
      code: asText(row.code),
      name: asText(row.name),
      unit: asText(row.unit, "UND"),
      location: asText(row.location),
      minimum: asNumber(row.minimum_stock),
      warehouseId: asNumber(row.warehouse_id),
      warehouse: asText(row.warehouse),
      physical: asNumber(row.physical),
      reserved: asNumber(row.reserved),
      damaged: asNumber(row.damaged),
      available: Math.max(0, asNumber(row.physical) - asNumber(row.reserved)),
    })),
    warehouses: warehouseRows.map((row) => ({
      id: asNumber(row.id),
      code: asText(row.code),
      name: asText(row.name),
      active: asBoolean(row.active),
      productsWithStock: asNumber(row.products_with_stock),
      physical: asNumber(row.physical),
      reserved: asNumber(row.reserved),
      damaged: asNumber(row.damaged),
      available: Math.max(0, asNumber(row.physical) - asNumber(row.reserved)),
    })),
    movements: movementRows.map((row) => ({
      id: asNumber(row.id),
      date: asText(row.occurred_at),
      type: asText(row.type),
      document: asText(row.document),
      productId: asNumber(row.product_id),
      product: asText(row.product),
      code: asText(row.code),
      quantity: asNumber(row.quantity),
      warehouseId: asNumber(row.warehouse_id),
      warehouse: asText(row.warehouse),
      notes: asText(row.notes),
      userEmail: asText(row.user_email),
    })),
    receipts: receiptRows.map((row) => ({
      id: asNumber(row.id),
      number: asText(row.number),
      date: asText(row.date),
      warehouseId: asNumber(row.warehouse_id),
      warehouse: asText(row.warehouse),
      supplier: asText(row.supplier),
      source: asText(row.source),
      documentNumber: asText(row.document_number),
      carrier: asText(row.carrier),
      notes: asText(row.notes),
      status: asText(row.status),
      userEmail: asText(row.user_email),
      products: asNumber(row.products),
      units: asNumber(row.units),
    })),
    proformas: proformaRows.map((row) => ({
      id: asNumber(row.id),
      number: asText(row.number),
      date: asText(row.date),
      client: asText(row.client),
      document: asText(row.document),
      address: asText(row.address),
      warehouseId: asNumber(row.warehouse_id),
      warehouse: asText(row.warehouse),
      paymentCondition: asText(row.payment_condition),
      status: asText(row.status),
      userEmail: asText(row.user_email),
      products: asNumber(row.products),
      units: asNumber(row.units),
      total: asNumber(row.total),
      lines: proformaLineRows
        .filter((line) => asNumber(line.proforma_id) === asNumber(row.id))
        .map((line) => ({
          id: asNumber(line.id),
          proformaId: asNumber(line.proforma_id),
          productId: asNumber(line.product_id),
          code: asText(line.code),
          name: asText(line.name),
          unit: asText(line.unit, "UND"),
          quantity: asNumber(line.quantity),
          price: asNumber(line.price),
          subtotal: asNumber(line.quantity) * asNumber(line.price),
        })),
    })),
    orders: orderRows.map((row) => ({
      id: asNumber(row.id),
      number: asText(row.number),
      date: asText(row.date),
      warehouseId: asNumber(row.warehouse_id),
      warehouse: asText(row.warehouse),
      destination: asText(row.destination),
      orderType: asText(row.order_type),
      flowMode: asText(row.flow_mode),
      priority: asText(row.priority),
      notes: asText(row.notes),
      status: asText(row.status),
      userEmail: asText(row.user_email),
      products: asNumber(row.products),
      requested: asNumber(row.requested),
      reserved: asNumber(row.reserved),
      dispatched: asNumber(row.dispatched),
      startedAt: row.started_at ? asText(row.started_at) : null,
      readyAt: row.ready_at ? asText(row.ready_at) : null,
      dispatchedAt: row.dispatched_at ? asText(row.dispatched_at) : null,
      lines: orderLineRows
        .filter((line) => asNumber(line.order_id) === asNumber(row.id))
        .map((line) => ({
          id: asNumber(line.id),
          orderId: asNumber(line.order_id),
          productId: asNumber(line.product_id),
          code: asText(line.code),
          name: asText(line.name),
          unit: asText(line.unit, "UND"),
          location: asText(line.location),
          requested: asNumber(line.requested),
          reserved: asNumber(line.reserved),
          dispatched: asNumber(line.dispatched),
          status: asText(line.status),
          notes: asText(line.notes),
          physical: asNumber(line.physical),
          available: Math.max(
            0,
            asNumber(line.physical) -
              asNumber(line.stock_reserved) +
              asNumber(line.reserved),
          ),
        })),
    })),
    transfers: transferRows.map((row) => ({
      id: asNumber(row.id),
      number: asText(row.number),
      date: asText(row.date),
      originWarehouseId: asNumber(row.origin_warehouse_id),
      origin: asText(row.origin),
      destinationWarehouseId: asNumber(row.destination_warehouse_id),
      destination: asText(row.destination),
      notes: asText(row.notes),
      status: asText(row.status),
      userEmail: asText(row.user_email),
      products: asNumber(row.products),
      units: asNumber(row.units),
    })),
    users: userRows.map(mapUser),
    imports: importRows.map((row) => ({
      id: asNumber(row.id),
      importedAt: asText(row.imported_at),
      sourceServer: asText(row.source_server),
      sourceDatabase: asText(row.source_database),
      userEmail: asText(row.user_email),
      summary: asText(row.summary),
    })),
    generatedAt: new Date().toISOString(),
  };
}

async function audit(
  user: AppUser,
  action: string,
  module: string,
  entity: string,
  recordKey: string,
  detail: unknown,
) {
  await run(
    "INSERT INTO audit_logs (user_email,action,module,entity,record_key,detail) VALUES (?,?,?,?,?,?)",
    [
      user.email,
      action,
      module,
      entity,
      recordKey,
      JSON.stringify(detail),
    ],
  );
}

async function saveOrderProductAlias(user: AppUser, payload: DbRow) {
  const alias = asText(payload.alias).replace(/\s+/g, " ").slice(0, 500);
  const productId = asNumber(payload.productId);
  if (alias.length < 5 || !productId) {
    throw new HttpError(400, "La equivalencia del producto no es válida.");
  }
  const product = await firstRow<{ id: number }>(
    "SELECT id FROM products WHERE id=? AND active=1",
    [productId],
  );
  if (!product) throw new HttpError(404, "El producto seleccionado ya no está disponible.");
  await run(
    "INSERT INTO order_product_aliases (alias,product_id,user_email) VALUES (?,?,?) ON CONFLICT(alias) DO UPDATE SET product_id=excluded.product_id,user_email=excluded.user_email,updated_at=CURRENT_TIMESTAMP",
    [alias, productId, user.email],
  );
  await audit(user, "VINCULAR", "PEDIDOS", "EQUIVALENCIA_PRODUCTO", alias, { productId });
  return { message: "Equivalencia guardada para todos los usuarios." };
}

async function deleteOrderProductAlias(user: AppUser, payload: DbRow) {
  const id = asNumber(payload.id);
  if (!id) throw new HttpError(400, "La equivalencia no es válida.");
  const existing = await firstRow<{ alias: string; product_id: number }>(
    "SELECT alias,product_id FROM order_product_aliases WHERE id=?",
    [id],
  );
  if (!existing) throw new HttpError(404, "La equivalencia ya no existe.");
  await run("DELETE FROM order_product_aliases WHERE id=?", [id]);
  await audit(user, "ELIMINAR", "PEDIDOS", "EQUIVALENCIA_PRODUCTO", existing.alias, {
    productId: existing.product_id,
  });
  return { message: "Equivalencia eliminada." };
}

async function nextNumber(
  table: "receipts" | "proformas" | "orders" | "transfers",
  prefix: string,
  includeYear = true,
) {
  const year = new Date().getFullYear();
  const row = await firstRow<{ sequence: number }>(
    "SELECT COALESCE(MAX(CAST(SUBSTR(number,-6) AS INTEGER)),0)+1 AS sequence FROM " +
      table +
      " WHERE number LIKE ?",
    [includeYear ? prefix + "-" + year + "-%" : prefix + "-%"],
  );
  const sequence = String(asNumber(row?.sequence, 1)).padStart(6, "0");
  return includeYear
    ? prefix + "-" + year + "-" + sequence
    : prefix + "-" + sequence;
}

async function normalizeLegacyDocumentNumbers() {
  const pending = await firstRow<{ total: number }>(
    `SELECT
      (SELECT COUNT(*) FROM receipts WHERE LENGTH(number)=15 AND SUBSTR(number,1,4)='REC-' AND SUBSTR(number,9,1)='-') +
      (SELECT COUNT(*) FROM orders WHERE LENGTH(number)=14 AND SUBSTR(number,1,3)='OS-' AND SUBSTR(number,8,1)='-') +
      (SELECT COUNT(*) FROM movements WHERE LENGTH(document)=15 AND SUBSTR(document,1,4)='REC-' AND SUBSTR(document,9,1)='-') +
      (SELECT COUNT(*) FROM movements WHERE LENGTH(document)=14 AND SUBSTR(document,1,3)='OS-' AND SUBSTR(document,8,1)='-') +
      (SELECT COUNT(DISTINCT document) FROM movements WHERE type='AJUSTE' AND NOT (LENGTH(document)=9 AND SUBSTR(document,1,3)='AS-')) AS total`,
  );
  if (asNumber(pending?.total) === 0) return;

  await getRawDb().batch([
    statement(
      "UPDATE receipts SET number='REC-' || SUBSTR(number,-6) WHERE LENGTH(number)=15 AND SUBSTR(number,1,4)='REC-' AND SUBSTR(number,9,1)='-'",
    ),
    statement(
      "UPDATE orders SET number='OS-' || SUBSTR(number,-6) WHERE LENGTH(number)=14 AND SUBSTR(number,1,3)='OS-' AND SUBSTR(number,8,1)='-'",
    ),
    statement(
      "UPDATE movements SET document='REC-' || SUBSTR(document,-6) WHERE LENGTH(document)=15 AND SUBSTR(document,1,4)='REC-' AND SUBSTR(document,9,1)='-'",
    ),
    statement(
      "UPDATE movements SET document='OS-' || SUBSTR(document,-6) WHERE LENGTH(document)=14 AND SUBSTR(document,1,3)='OS-' AND SUBSTR(document,8,1)='-'",
    ),
  ]);

  const [sequenceRow, legacyAdjustments] = await Promise.all([
    firstRow<{ sequence: number }>(
      "SELECT COALESCE(MAX(CAST(SUBSTR(document,-6) AS INTEGER)),0) sequence FROM movements WHERE type='AJUSTE' AND LENGTH(document)=9 AND SUBSTR(document,1,3)='AS-'",
    ),
    allRows<{ document: string; first_id: number }>(
      "SELECT document,MIN(id) first_id FROM movements WHERE type='AJUSTE' AND NOT (LENGTH(document)=9 AND SUBSTR(document,1,3)='AS-') GROUP BY document ORDER BY first_id",
    ),
  ]);
  const currentSequence = asNumber(sequenceRow?.sequence);
  if (legacyAdjustments.length) {
    await getRawDb().batch(
      legacyAdjustments.map((row, index) =>
        statement(
          "UPDATE movements SET document=? WHERE type='AJUSTE' AND document=?",
          [
            "AS-" + String(currentSequence + index + 1).padStart(6, "0"),
            asText(row.document),
          ],
        ),
      ),
    );
  }
}

async function nextAdjustmentNumber() {
  await normalizeLegacyDocumentNumbers();
  const row = await firstRow<{ sequence: number }>(
    "SELECT COALESCE(MAX(CAST(SUBSTR(document,-6) AS INTEGER)),0)+1 sequence FROM movements WHERE type='AJUSTE' AND LENGTH(document)=9 AND SUBSTR(document,1,3)='AS-'",
  );
  return "AS-" + String(asNumber(row?.sequence, 1)).padStart(6, "0");
}

function cleanLines(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = (item ?? {}) as DbRow;
      return {
        productId: asNumber(row.productId),
        quantity: Math.max(0, asNumber(row.quantity)),
        expected: Math.max(0, asNumber(row.expected, asNumber(row.quantity))),
        received: Math.max(0, asNumber(row.received, asNumber(row.quantity))),
        damaged: Math.max(0, asNumber(row.damaged)),
        price: Math.max(0, asNumber(row.price)),
      };
    })
    .filter((line) => line.productId > 0 && line.quantity > 0);
}

async function createProduct(user: AppUser, payload: DbRow) {
  const code = asText(payload.code).toUpperCase();
  const name = asText(payload.name).toUpperCase();
  const warehouseId = asNumber(payload.warehouseId);
  if (!code || !name || !warehouseId) {
    throw new HttpError(400, "Completa código, producto y almacén.");
  }

  const existing = await firstRow<{ id: number }>(
    "SELECT id FROM products WHERE code=?",
    [code],
  );
  if (existing) {
    throw new HttpError(409, "Ya existe un producto con ese código.");
  }

  const inserted = await firstRow<{ id: number }>(
    "INSERT INTO products (code,supplier_code,name,brand,application,unit,location,cost,minimum_stock,active) VALUES (?,?,?,?,?,?,?,?,?,1) RETURNING id",
    [
      code,
      asText(payload.supplierCode),
      name,
      asText(payload.brand).toUpperCase(),
      asText(payload.application).toUpperCase(),
      asText(payload.unit, "UND").toUpperCase(),
      asText(payload.location).toUpperCase(),
      Math.max(0, asNumber(payload.cost)),
      Math.max(0, asNumber(payload.minimum)),
    ],
  );
  const productId = asNumber(inserted?.id);
  const initialStock = Math.max(0, asNumber(payload.initialStock));
  await run(
    "INSERT INTO stock (product_id,warehouse_id,physical,reserved,damaged) VALUES (?,?,?,0,0)",
    [productId, warehouseId, initialStock],
  );
  if (initialStock > 0) {
    await run(
      "INSERT INTO movements (type,document,product_id,warehouse_id,quantity,notes,user_email) VALUES ('INGRESO','STOCK-INICIAL',?,?,?,?,?)",
      [productId, warehouseId, initialStock, "Registro inicial", user.email],
    );
  }
  await audit(user, "CREAR", "PRODUCTOS", "PRODUCTO", code, payload);
  return { message: "Producto creado correctamente.", id: productId };
}

async function updateProduct(user: AppUser, payload: DbRow) {
  const id = asNumber(payload.id);
  if (!id) throw new HttpError(400, "Producto no válido.");
  await run(
    "UPDATE products SET supplier_code=?,name=?,brand=?,application=?,unit=?,location=?,cost=?,minimum_stock=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    [
      asText(payload.supplierCode),
      asText(payload.name).toUpperCase(),
      asText(payload.brand).toUpperCase(),
      asText(payload.application).toUpperCase(),
      asText(payload.unit, "UND").toUpperCase(),
      asText(payload.location).toUpperCase(),
      Math.max(0, asNumber(payload.cost)),
      Math.max(0, asNumber(payload.minimum)),
      asBoolean(payload.active) ? 1 : 0,
      id,
    ],
  );
  await audit(user, "EDITAR", "PRODUCTOS", "PRODUCTO", String(id), payload);
  return { message: "Producto actualizado correctamente." };
}

async function createReceipt(user: AppUser, payload: DbRow) {
  const warehouseId = asNumber(payload.warehouseId);
  const lines = cleanLines(payload.lines);
  if (!warehouseId || !lines.length) {
    throw new HttpError(400, "Agrega por lo menos un producto a la recepción.");
  }
  const number = await nextNumber("receipts", "REC", false);
  const date = asText(payload.date, new Date().toISOString().slice(0, 10));
  const receipt = await firstRow<{ id: number }>(
    "INSERT INTO receipts (number,date,warehouse_id,supplier,source,document_number,carrier,notes,status,user_email,confirmed_at) VALUES (?,?,?,?,?,?,?,?, 'CONFIRMADA',?,CURRENT_TIMESTAMP) RETURNING id",
    [
      number,
      date,
      warehouseId,
      asText(payload.supplier).toUpperCase(),
      asText(payload.source).toUpperCase(),
      asText(payload.documentNumber).toUpperCase(),
      asText(payload.carrier).toUpperCase(),
      asText(payload.notes),
      user.email,
    ],
  );
  const receiptId = asNumber(receipt?.id);
  const batch = [];
  for (const line of lines) {
    const received = line.received || line.quantity;
    const good = Math.max(0, received - line.damaged);
    batch.push(
      statement(
        "INSERT INTO receipt_lines (receipt_id,product_id,expected,received,damaged,incident) VALUES (?,?,?,?,?,?)",
        [
          receiptId,
          line.productId,
          line.expected || line.quantity,
          received,
          line.damaged,
          line.damaged > 0 ? "CON DAÑO" : "CONFORME",
        ],
      ),
      statement(
        "INSERT INTO stock (product_id,warehouse_id,physical,reserved,damaged) VALUES (?,?,?,0,?) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET physical=physical+excluded.physical,damaged=damaged+excluded.damaged,updated_at=CURRENT_TIMESTAMP",
        [line.productId, warehouseId, good, line.damaged],
      ),
    );
    if (good > 0) {
      batch.push(
        statement(
          "INSERT INTO movements (type,document,product_id,warehouse_id,quantity,notes,user_email) VALUES ('INGRESO',?,?,?,?,?,?)",
          [
            number,
            line.productId,
            warehouseId,
            good,
            "Recepción confirmada",
            user.email,
          ],
        ),
      );
    }
  }
  await getRawDb().batch(batch);
  await audit(user, "CONFIRMAR", "RECEPCIONES", "RECEPCION", number, payload);
  return { message: "Recepción confirmada e inventario actualizado.", number };
}

async function deleteReceipt(user: AppUser, payload: DbRow) {
  const id = asNumber(payload.id);
  if (!id) throw new HttpError(400, "Selecciona una recepción válida.");

  const receipt = await firstRow<{
    id: number;
    number: string;
    warehouse_id: number;
    status: string;
  }>(
    "SELECT id,number,warehouse_id,status FROM receipts WHERE id=?",
    [id],
  );
  if (!receipt) throw new HttpError(404, "La recepción ya no existe.");
  if (asText(receipt.status).toUpperCase() !== "CONFIRMADA") {
    throw new HttpError(409, "Solo se puede eliminar una recepción confirmada.");
  }

  const receiptLines = await allRows<{
    product_id: number;
    product: string;
    good: number;
    damaged: number;
  }>(
    "SELECT rl.product_id,p.name product,SUM(CASE WHEN rl.received>rl.damaged THEN rl.received-rl.damaged ELSE 0 END) good,SUM(rl.damaged) damaged FROM receipt_lines rl JOIN products p ON p.id=rl.product_id WHERE rl.receipt_id=? GROUP BY rl.product_id,p.name",
    [id],
  );

  for (const line of receiptLines) {
    const stock = await firstRow<{
      physical: number;
      reserved: number;
      damaged: number;
    }>(
      "SELECT physical,reserved,damaged FROM stock WHERE product_id=? AND warehouse_id=?",
      [asNumber(line.product_id), asNumber(receipt.warehouse_id)],
    );
    const good = asNumber(line.good);
    const damaged = asNumber(line.damaged);
    const remainingPhysical = asNumber(stock?.physical) - good;
    const remainingDamaged = asNumber(stock?.damaged) - damaged;
    if (
      !stock ||
      remainingPhysical < asNumber(stock.reserved) - 0.000001 ||
      remainingDamaged < -0.000001
    ) {
      throw new HttpError(
        409,
        "No se puede eliminar " +
          asText(receipt.number) +
          " porque el stock de " +
          asText(line.product, "un producto") +
          " ya fue reservado, trasladado o retirado. Corrige primero ese movimiento.",
      );
    }
  }

  const batch = receiptLines.map((line) =>
    statement(
      "UPDATE stock SET physical=MAX(0,physical-?),damaged=MAX(0,damaged-?),updated_at=CURRENT_TIMESTAMP WHERE product_id=? AND warehouse_id=?",
      [
        asNumber(line.good),
        asNumber(line.damaged),
        asNumber(line.product_id),
        asNumber(receipt.warehouse_id),
      ],
    ),
  );
  batch.push(
    statement(
      "DELETE FROM movements WHERE type='INGRESO' AND document=? AND warehouse_id=?",
      [asText(receipt.number), asNumber(receipt.warehouse_id)],
    ),
    statement("DELETE FROM receipt_lines WHERE receipt_id=?", [id]),
    statement("DELETE FROM receipts WHERE id=?", [id]),
    statement(
      "INSERT INTO audit_logs (user_email,action,module,entity,record_key,detail) VALUES (?,?,?,?,?,?)",
      [
        user.email,
        "ELIMINAR",
        "RECEPCIONES",
        "RECEPCION",
        asText(receipt.number),
        JSON.stringify({
          id,
          warehouseId: asNumber(receipt.warehouse_id),
          reversedLines: receiptLines.map((line) => ({
            productId: asNumber(line.product_id),
            product: asText(line.product),
            physical: asNumber(line.good),
            damaged: asNumber(line.damaged),
          })),
        }),
      ],
    ),
  );
  await getRawDb().batch(batch);
  return {
    message:
      "Recepción " +
      asText(receipt.number) +
      " eliminada y stock revertido correctamente.",
  };
}

async function createProforma(user: AppUser, payload: DbRow) {
  const warehouseId = asNumber(payload.warehouseId);
  const lines = cleanLines(payload.lines);
  if (!warehouseId || !asText(payload.client) || !lines.length) {
    throw new HttpError(400, "Completa el cliente y agrega productos.");
  }
  const number = await nextNumber("proformas", "PRO");
  const row = await firstRow<{ id: number }>(
    "INSERT INTO proformas (number,date,client,document,address,warehouse_id,payment_condition,status,user_email) VALUES (?,?,?,?,?,?,?,'VIGENTE',?) RETURNING id",
    [
      number,
      asText(payload.date, new Date().toISOString().slice(0, 10)),
      asText(payload.client).toUpperCase(),
      asText(payload.document).toUpperCase(),
      asText(payload.address).toUpperCase(),
      warehouseId,
      asText(payload.paymentCondition, "CONTADO").toUpperCase(),
      user.email,
    ],
  );
  const id = asNumber(row?.id);
  await getRawDb().batch(
    lines.map((line) =>
      statement(
        "INSERT INTO proforma_lines (proforma_id,product_id,quantity,price) VALUES (?,?,?,?)",
        [id, line.productId, line.quantity, line.price],
      ),
    ),
  );
  await audit(user, "CREAR", "PROFORMAS", "PROFORMA", number, payload);
  return { message: "Proforma registrada correctamente.", number };
}

function normalizeOrderFlow(value: unknown) {
  return asText(value).toUpperCase().includes("DIRECT")
    ? "DESPACHO DIRECTO"
    : "PEDIDO DE TIENDA";
}

function normalizeOrderStatus(value: unknown) {
  const status = asText(value).toUpperCase();
  if (status === "PENDIENTE") return "ENVIADA";
  if (status === "PREPARANDO") return "EN PREPARACIÓN";
  return status;
}

function lineValidation(requested: number, reserved: number) {
  if (reserved >= requested && requested > 0) return "COMPLETO";
  if (reserved > 0) return "PARCIAL";
  return "SIN STOCK";
}

async function reserveOrderStock(order: {
  id: number;
  warehouse_id: number;
}) {
  const lines = await allRows<{
    id: number;
    product_id: number;
    requested: number;
    reserved: number;
  }>(
    "SELECT id,product_id,requested,reserved FROM order_lines WHERE order_id=?",
    [order.id],
  );
  const batch = [];
  let totalReserved = 0;
  for (const line of lines) {
    const currentReserved = Math.max(0, asNumber(line.reserved));
    const requested = Math.max(0, asNumber(line.requested));
    const stock = await firstRow<{ physical: number; reserved: number }>(
      "SELECT physical,reserved FROM stock WHERE product_id=? AND warehouse_id=?",
      [line.product_id, order.warehouse_id],
    );
    const availableOutsideOrder = Math.max(
      0,
      asNumber(stock?.physical) - asNumber(stock?.reserved),
    );
    const additional = Math.min(
      Math.max(0, requested - currentReserved),
      availableOutsideOrder,
    );
    const nextReserved = currentReserved + additional;
    totalReserved += nextReserved;
    if (additional > 0) {
      batch.push(
        statement(
          "UPDATE stock SET reserved=reserved+?,updated_at=CURRENT_TIMESTAMP WHERE product_id=? AND warehouse_id=?",
          [additional, line.product_id, order.warehouse_id],
        ),
      );
    }
    batch.push(
      statement(
        "UPDATE order_lines SET reserved=?,status=? WHERE id=?",
        [nextReserved, lineValidation(requested, nextReserved), line.id],
      ),
    );
  }
  if (batch.length) await getRawDb().batch(batch);
  return totalReserved;
}

async function createOrder(user: AppUser, payload: DbRow) {
  const warehouseId = asNumber(payload.warehouseId);
  const lines = cleanLines(payload.lines);
  if (!warehouseId || !lines.length) {
    throw new HttpError(400, "Agrega por lo menos un producto a la orden.");
  }
  const flowMode = normalizeOrderFlow(payload.flowMode);
  const requestedInitialStatus = normalizeOrderStatus(payload.initialStatus);
  const initialStatus =
    flowMode === "DESPACHO DIRECTO"
      ? "EN PREPARACIÓN"
      : requestedInitialStatus === "BORRADOR"
        ? "BORRADOR"
        : "ENVIADA";
  const number = await nextNumber("orders", "OS", false);
  const order = await firstRow<{ id: number }>(
    "INSERT INTO orders (number,date,warehouse_id,destination,order_type,flow_mode,priority,notes,status,user_email,started_at) VALUES (?,?,?,?,?,?,?,?,?,?,CASE WHEN ?='EN PREPARACIÓN' THEN CURRENT_TIMESTAMP ELSE NULL END) RETURNING id",
    [
      number,
      asText(payload.date, new Date().toISOString().slice(0, 10)),
      warehouseId,
      asText(payload.destination, "TIENDA PRINCIPAL").toUpperCase(),
      asText(payload.orderType, "REPOSICIÓN").toUpperCase(),
      flowMode,
      asText(payload.priority, "NORMAL").toUpperCase(),
      asText(payload.notes),
      initialStatus,
      user.email,
      initialStatus,
    ],
  );
  const orderId = asNumber(order?.id);
  await getRawDb().batch(
    lines.map((line) =>
      statement(
        "INSERT INTO order_lines (order_id,product_id,requested,reserved,dispatched,status) VALUES (?,?,?,0,0,?)",
        [orderId, line.productId, line.quantity, initialStatus],
      ),
    ),
  );
  if (initialStatus === "EN PREPARACIÓN") {
    await reserveOrderStock({ id: orderId, warehouse_id: warehouseId });
  }
  await audit(user, "CREAR", "ORDENES", "ORDEN", number, {
    ...payload,
    initialStatus,
    flowMode,
  });
  return {
    message:
      initialStatus === "BORRADOR"
        ? "Pedido guardado como borrador."
        : initialStatus === "ENVIADA"
          ? "Pedido enviado al almacén."
          : "Despacho directo creado e iniciado en preparación.",
    number,
    id: orderId,
    status: initialStatus,
  };
}

async function updateOrderDraft(user: AppUser, payload: DbRow) {
  const id = asNumber(payload.id);
  const warehouseId = asNumber(payload.warehouseId);
  const lines = cleanLines(payload.lines);
  const order = await firstRow<{
    id: number;
    number: string;
    status: string;
  }>("SELECT id,number,status FROM orders WHERE id=?", [id]);
  if (!order) throw new HttpError(404, "No se encontró el pedido.");
  if (normalizeOrderStatus(order.status) !== "BORRADOR") {
    throw new HttpError(409, "Solo se puede editar un pedido en borrador.");
  }
  if (!warehouseId || !lines.length) {
    throw new HttpError(400, "Selecciona el almacén y agrega productos.");
  }
  const batch = [
    statement("DELETE FROM order_lines WHERE order_id=?", [id]),
    statement(
      "UPDATE orders SET date=?,warehouse_id=?,destination=?,order_type=?,priority=?,notes=? WHERE id=?",
      [
        asText(payload.date, new Date().toISOString().slice(0, 10)),
        warehouseId,
        asText(payload.destination, "TIENDA PRINCIPAL").toUpperCase(),
        asText(payload.orderType, "REPOSICIÓN").toUpperCase(),
        asText(payload.priority, "NORMAL").toUpperCase(),
        asText(payload.notes),
        id,
      ],
    ),
    ...lines.map((line) =>
      statement(
        "INSERT INTO order_lines (order_id,product_id,requested,reserved,dispatched,status) VALUES (?,?,?,0,0,'BORRADOR')",
        [id, line.productId, line.quantity],
      ),
    ),
  ];
  await getRawDb().batch(batch);
  await audit(user, "EDITAR", "ORDENES", "ORDEN", order.number, payload);
  return { message: "Borrador actualizado correctamente.", id, status: "BORRADOR" };
}

async function reviewOrderStock(user: AppUser, payload: DbRow) {
  const id = asNumber(payload.id);
  const order = await firstRow<{
    id: number;
    number: string;
    status: string;
    warehouse_id: number;
  }>("SELECT id,number,status,warehouse_id FROM orders WHERE id=?", [id]);
  if (!order) throw new HttpError(404, "No se encontró la orden.");
  if (normalizeOrderStatus(order.status) !== "EN PREPARACIÓN") {
    throw new HttpError(409, "El stock se revisa durante la preparación.");
  }
  const totalReserved = await reserveOrderStock(order);
  await audit(user, "REVISAR_STOCK", "ORDENES", "ORDEN", order.number, {
    totalReserved,
  });
  return {
    message: "Stock revisado. Cantidad lista para despacho: " + totalReserved + ".",
  };
}

async function setOrderStatus(user: AppUser, payload: DbRow) {
  const id = asNumber(payload.id);
  const order = await firstRow<{
    id: number;
    number: string;
    status: string;
    warehouse_id: number;
    flow_mode: string;
    notes: string | null;
  }>(
    "SELECT id,number,status,warehouse_id,flow_mode,notes FROM orders WHERE id=?",
    [id],
  );
  if (!order) throw new HttpError(404, "No se encontró la orden.");
  const current = normalizeOrderStatus(order.status);
  let target = normalizeOrderStatus(payload.targetStatus);
  if (!target) {
    target =
      current === "BORRADOR"
        ? "ENVIADA"
        : current === "ENVIADA"
          ? "EN PREPARACIÓN"
          : current === "EN PREPARACIÓN"
            ? "LISTA"
            : current === "LISTA"
              ? "DESPACHADA"
              : current === "DESPACHADA"
                ? "RECIBIDA"
                : "";
  }

  const normalTransitions: Record<string, string[]> = {
    BORRADOR: ["ENVIADA"],
    ENVIADA: ["EN PREPARACIÓN"],
    "EN PREPARACIÓN": ["LISTA"],
    LISTA: ["DESPACHADA"],
    DESPACHADA: ["RECIBIDA"],
  };
  const cancellable = ["BORRADOR", "ENVIADA", "EN PREPARACIÓN", "LISTA"];
  const canCancel = target === "CANCELADA" && cancellable.includes(current);
  const canAnnul =
    target === "ANULADA" && ["DESPACHADA", "RECIBIDA"].includes(current);
  if (!normalTransitions[current]?.includes(target) && !canCancel && !canAnnul) {
    throw new HttpError(
      409,
      "No se puede cambiar la orden de " + current + " a " + (target || "ese estado") + ".",
    );
  }

  if (target === "EN PREPARACIÓN") {
    await reserveOrderStock(order);
  }

  const lines = await allRows<{
    id: number;
    product_id: number;
    requested: number;
    reserved: number;
    dispatched: number;
  }>(
    "SELECT id,product_id,requested,reserved,dispatched FROM order_lines WHERE order_id=?",
    [id],
  );
  const batch = [];

  if (target === "DESPACHADA") {
    if (!lines.some((line) => asNumber(line.reserved) > 0)) {
      throw new HttpError(409, "La orden no tiene stock reservado para despachar.");
    }
    for (const line of lines) {
      const quantity = Math.max(0, asNumber(line.reserved));
      if (quantity <= 0) {
        batch.push(
          statement("UPDATE order_lines SET status='SIN STOCK' WHERE id=?", [line.id]),
        );
        continue;
      }
      batch.push(
        statement(
          "UPDATE stock SET physical=MAX(0,physical-?),reserved=MAX(0,reserved-?),updated_at=CURRENT_TIMESTAMP WHERE product_id=? AND warehouse_id=?",
          [quantity, quantity, line.product_id, order.warehouse_id],
        ),
        statement(
          "UPDATE order_lines SET reserved=0,dispatched=?,status='DESPACHADA' WHERE id=?",
          [quantity, line.id],
        ),
        statement(
          "INSERT INTO movements (type,document,product_id,warehouse_id,quantity,notes,user_email) VALUES ('SALIDA',?,?,?,?,?,?)",
          [
            order.number,
            line.product_id,
            order.warehouse_id,
            quantity,
            "Salida confirmada por despacho",
            user.email,
          ],
        ),
      );
    }
  }

  if (target === "RECIBIDA") {
    batch.push(
      statement(
        "UPDATE order_lines SET status=CASE WHEN dispatched>0 THEN 'RECIBIDA' ELSE status END WHERE order_id=?",
        [id],
      ),
    );
  }

  if (target === "CANCELADA") {
    for (const line of lines) {
      const quantity = Math.max(0, asNumber(line.reserved));
      if (quantity > 0) {
        batch.push(
          statement(
            "UPDATE stock SET reserved=MAX(0,reserved-?),updated_at=CURRENT_TIMESTAMP WHERE product_id=? AND warehouse_id=?",
            [quantity, line.product_id, order.warehouse_id],
          ),
        );
      }
      batch.push(
        statement(
          "UPDATE order_lines SET reserved=0,status='CANCELADA' WHERE id=?",
          [line.id],
        ),
      );
    }
  }

  if (target === "ANULADA") {
    for (const line of lines) {
      const quantity = Math.max(0, asNumber(line.dispatched));
      if (quantity > 0) {
        batch.push(
          statement(
            "UPDATE stock SET physical=physical+?,updated_at=CURRENT_TIMESTAMP WHERE product_id=? AND warehouse_id=?",
            [quantity, line.product_id, order.warehouse_id],
          ),
          statement(
            "INSERT INTO movements (type,document,product_id,warehouse_id,quantity,notes,user_email) VALUES ('INGRESO',?,?,?,?,?,?)",
            [
              order.number,
              line.product_id,
              order.warehouse_id,
              quantity,
              "Reversión de despacho anulado",
              user.email,
            ],
          ),
        );
      }
      batch.push(
        statement("UPDATE order_lines SET status='ANULADA' WHERE id=?", [line.id]),
      );
    }
  }

  const reason = asText(payload.reason);
  const nextNotes =
    target === "CANCELADA" || target === "ANULADA"
      ? [asText(order.notes), target + (reason ? ": " + reason : "")]
          .filter(Boolean)
          .join("\n")
      : asText(order.notes);
  const timestampColumn =
    target === "EN PREPARACIÓN"
      ? "started_at=CURRENT_TIMESTAMP,"
      : target === "LISTA"
        ? "ready_at=CURRENT_TIMESTAMP,"
        : target === "DESPACHADA"
          ? "dispatched_at=CURRENT_TIMESTAMP,"
          : "";
  batch.push(
    statement(
      "UPDATE orders SET " + timestampColumn + "status=?,notes=? WHERE id=?",
      [target, nextNotes, id],
    ),
  );
  await getRawDb().batch(batch);
  await audit(user, "CAMBIAR_ESTADO", "ORDENES", "ORDEN", order.number, {
    from: current,
    to: target,
    reason,
  });
  return {
    message:
      target === "DESPACHADA"
        ? "Salida confirmada. El stock fue descontado y registrado en Kardex."
        : target === "RECIBIDA"
          ? "Recepción del pedido confirmada."
          : target === "CANCELADA"
            ? "Pedido cancelado y reservas liberadas."
            : target === "ANULADA"
              ? "Despacho anulado. El stock fue devuelto al almacén."
              : "Orden actualizada a " + target + ".",
    status: target,
  };
}

async function createTransfer(user: AppUser, payload: DbRow) {
  const originId = asNumber(payload.originWarehouseId);
  const destinationId = asNumber(payload.destinationWarehouseId);
  const lines = cleanLines(payload.lines);
  if (!originId || !destinationId || originId === destinationId || !lines.length) {
    throw new HttpError(400, "Selecciona almacenes distintos y agrega productos.");
  }

  for (const line of lines) {
    const current = await firstRow<{ available: number }>(
      "SELECT MAX(0,physical-reserved) available FROM stock WHERE product_id=? AND warehouse_id=?",
      [line.productId, originId],
    );
    if (asNumber(current?.available) < line.quantity) {
      throw new HttpError(
        409,
        "No hay stock suficiente para completar la transferencia.",
      );
    }
  }

  const number = await nextNumber("transfers", "TR");
  const transfer = await firstRow<{ id: number }>(
    "INSERT INTO transfers (number,date,origin_warehouse_id,destination_warehouse_id,notes,status,user_email,confirmed_at) VALUES (?,?,?,?,?,'CONFIRMADA',?,CURRENT_TIMESTAMP) RETURNING id",
    [
      number,
      asText(payload.date, new Date().toISOString().slice(0, 10)),
      originId,
      destinationId,
      asText(payload.notes),
      user.email,
    ],
  );
  const transferId = asNumber(transfer?.id);
  const batch = [];
  for (const line of lines) {
    batch.push(
      statement(
        "INSERT INTO transfer_lines (transfer_id,product_id,quantity) VALUES (?,?,?)",
        [transferId, line.productId, line.quantity],
      ),
      statement(
        "UPDATE stock SET physical=physical-?,updated_at=CURRENT_TIMESTAMP WHERE product_id=? AND warehouse_id=?",
        [line.quantity, line.productId, originId],
      ),
      statement(
        "INSERT INTO stock (product_id,warehouse_id,physical,reserved,damaged) VALUES (?,?,?,0,0) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET physical=physical+excluded.physical,updated_at=CURRENT_TIMESTAMP",
        [line.productId, destinationId, line.quantity],
      ),
      statement(
        "INSERT INTO movements (type,document,product_id,warehouse_id,quantity,notes,user_email) VALUES ('TRANSFERENCIA_SALIDA',?,?,?,?,?,?)",
        [number, line.productId, originId, line.quantity, "Transferencia", user.email],
      ),
      statement(
        "INSERT INTO movements (type,document,product_id,warehouse_id,quantity,notes,user_email) VALUES ('TRANSFERENCIA_INGRESO',?,?,?,?,?,?)",
        [
          number,
          line.productId,
          destinationId,
          line.quantity,
          "Transferencia",
          user.email,
        ],
      ),
    );
  }
  await getRawDb().batch(batch);
  await audit(user, "CONFIRMAR", "TRANSFERENCIAS", "TRANSFERENCIA", number, payload);
  return { message: "Transferencia confirmada correctamente.", number };
}

async function adjustStock(user: AppUser, payload: DbRow) {
  const productId = asNumber(payload.productId);
  const warehouseId = asNumber(payload.warehouseId);
  const newPhysical = Math.max(0, asNumber(payload.newPhysical));
  if (!productId || !warehouseId) {
    throw new HttpError(400, "Selecciona un producto y un almacén.");
  }
  const [product, warehouse] = await Promise.all([
    firstRow<{ id: number; active: number }>(
      "SELECT id,active FROM products WHERE id=?",
      [productId],
    ),
    firstRow<{ id: number; active: number }>(
      "SELECT id,active FROM warehouses WHERE id=?",
      [warehouseId],
    ),
  ]);
  if (!product || !asBoolean(product.active)) {
    throw new HttpError(404, "El producto no está activo o ya no existe.");
  }
  if (!warehouse || !asBoolean(warehouse.active)) {
    throw new HttpError(404, "El almacén no está activo o ya no existe.");
  }
  const current = await firstRow<{ physical: number }>(
    "SELECT physical FROM stock WHERE product_id=? AND warehouse_id=?",
    [productId, warehouseId],
  );
  const previous = asNumber(current?.physical);
  const difference = newPhysical - previous;
  if (difference === 0) throw new HttpError(409, "El stock no cambió.");
  const document = await nextAdjustmentNumber();
  await getRawDb().batch([
    statement(
      "INSERT INTO stock (product_id,warehouse_id,physical,reserved,damaged) VALUES (?,?,?,0,0) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET physical=excluded.physical,updated_at=CURRENT_TIMESTAMP",
      [productId, warehouseId, newPhysical],
    ),
    statement(
      "INSERT INTO movements (type,document,product_id,warehouse_id,quantity,notes,user_email) VALUES ('AJUSTE',?,?,?,?,?,?)",
      [
        document,
        productId,
        warehouseId,
        difference,
        asText(payload.notes, "Ajuste de inventario"),
        user.email,
      ],
    ),
  ]);
  await audit(user, "AJUSTAR", "INVENTARIO", "STOCK", document, payload);
  return { message: "Stock ajustado correctamente.", document };
}

async function saveWarehouse(user: AppUser, payload: DbRow) {
  const id = asNumber(payload.id);
  const code = asText(payload.code).toUpperCase();
  const name = asText(payload.name).toUpperCase();
  const active = asBoolean(payload.active);
  if (!code || !name) {
    throw new HttpError(400, "Completa el código y nombre del almacén.");
  }

  const duplicate = await firstRow<{ id: number }>(
    id
      ? "SELECT id FROM warehouses WHERE upper(code)=? AND id<>?"
      : "SELECT id FROM warehouses WHERE upper(code)=?",
    id ? [code, id] : [code],
  );
  if (duplicate) {
    throw new HttpError(409, "Ya existe un almacén con ese código.");
  }

  if (id) {
    const current = await firstRow<{
      id: number;
      code: string;
      name: string;
      active: number;
    }>("SELECT id,code,name,active FROM warehouses WHERE id=?", [id]);
    if (!current) throw new HttpError(404, "Almacén no encontrado.");
    if (asBoolean(current.active) && !active) {
      const remaining = await firstRow<{ total: number }>(
        "SELECT COUNT(*) total FROM warehouses WHERE active=1 AND id<>?",
        [id],
      );
      if (asNumber(remaining?.total) < 1) {
        throw new HttpError(409, "Debe quedar por lo menos un almacén activo.");
      }
    }
    await run(
      "UPDATE warehouses SET code=?,name=?,active=? WHERE id=?",
      [code, name, active ? 1 : 0, id],
    );
    await audit(user, "EDITAR", "ALMACENES", "ALMACÉN", code, {
      id,
      code,
      name,
      active,
    });
    return {
      message: active
        ? "Almacén actualizado correctamente."
        : "Almacén dado de baja correctamente.",
    };
  }

  const inserted = await firstRow<{ id: number }>(
    "INSERT INTO warehouses (code,name,active) VALUES (?,?,?) RETURNING id",
    [code, name, active ? 1 : 0],
  );
  await audit(user, "CREAR", "ALMACENES", "ALMACÉN", code, {
    id: inserted?.id,
    code,
    name,
    active,
  });
  return {
    message: "Almacén creado correctamente.",
    id: asNumber(inserted?.id),
  };
}

async function saveUser(user: AppUser, payload: DbRow) {
  const username = validateUsername(payload.username);
  const requestedEmail = asText(payload.email).toLowerCase();
  const existing = await firstRow<{
    email: string;
    username: string;
    password_hash: string | null;
  }>(
    "SELECT email,username,password_hash FROM app_users WHERE upper(username)=?",
    [username],
  );
  if (existing && (!requestedEmail || requestedEmail !== existing.email)) {
    throw new HttpError(409, "Ese nombre de usuario ya está registrado.");
  }
  const email =
    existing?.email || requestedEmail || username.toLowerCase() + "@jimdur.local";
  const displayName = asText(payload.displayName).toUpperCase();
  if (!displayName) {
    throw new HttpError(400, "Completa el nombre del usuario.");
  }
  const role =
    asText(payload.role).toUpperCase() === "ADMINISTRADOR"
      ? "ADMINISTRADOR"
      : "USUARIO";
  const permissions =
    role === "ADMINISTRADOR"
      ? [...ALL_PERMISSIONS]
      : Array.isArray(payload.permissions)
        ? payload.permissions
            .map(String)
            .filter((permission) =>
              (ALL_PERMISSIONS as readonly string[]).includes(permission),
            )
        : [];
  if (email === user.email && !asBoolean(payload.active)) {
    throw new HttpError(409, "No puedes desactivar tu propia cuenta.");
  }
  const temporaryPassword =
    typeof payload.temporaryPassword === "string"
      ? payload.temporaryPassword
      : "";
  if (!existing && !temporaryPassword) {
    throw new HttpError(400, "Asigna una contraseña temporal al nuevo usuario.");
  }
  const password = temporaryPassword
    ? await newPasswordRecord(temporaryPassword)
    : null;
  if (password) {
    await getRawDb().batch([
      statement(
        "INSERT INTO app_users (email,username,display_name,role,active,permissions,password_hash,password_salt,password_iterations,must_change_password,password_updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(email) DO UPDATE SET display_name=excluded.display_name,role=excluded.role,active=excluded.active,permissions=excluded.permissions,password_hash=excluded.password_hash,password_salt=excluded.password_salt,password_iterations=excluded.password_iterations,must_change_password=1,password_updated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP",
        [
          email,
          username,
          displayName,
          role,
          asBoolean(payload.active) ? 1 : 0,
          JSON.stringify(permissions),
          password.hash,
          password.salt,
          password.iterations,
        ],
      ),
      statement("DELETE FROM app_sessions WHERE user_email=?", [email]),
    ]);
  } else {
    await run(
      "UPDATE app_users SET display_name=?,role=?,active=?,permissions=?,updated_at=CURRENT_TIMESTAMP WHERE email=?",
      [
        displayName,
        role,
        asBoolean(payload.active) ? 1 : 0,
        JSON.stringify(permissions),
        email,
      ],
    );
  }
  await audit(user, "GUARDAR", "USUARIOS", "USUARIO", email, {
    displayName,
    role,
    active: asBoolean(payload.active),
    permissions,
  });
  return {
    message: password
      ? "Usuario guardado con contraseña temporal. Deberá cambiarla al ingresar."
      : "Usuario actualizado correctamente.",
  };
}

function normalizedRow(value: unknown) {
  const output: DbRow = {};
  if (!value || typeof value !== "object") return output;
  for (const [key, item] of Object.entries(value as DbRow)) {
    output[key.toUpperCase()] = item;
  }
  return output;
}

function pick(row: DbRow, names: string[]) {
  for (const name of names) {
    const value = row[name.toUpperCase()];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function tableFromExport(tables: DbRow, names: string[]) {
  for (const name of names) {
    const value = tables[name] ?? tables[name.toUpperCase()] ?? tables[name.toLowerCase()];
    if (Array.isArray(value)) return value.map(normalizedRow);
  }
  return [] as DbRow[];
}

async function batchInChunks(statements: ReturnType<typeof statement>[], size = 75) {
  for (let index = 0; index < statements.length; index += size) {
    await getRawDb().batch(statements.slice(index, index + size));
  }
}

async function importLegacy(user: AppUser, payload: DbRow) {
  const exported = (payload.export ?? payload.data) as DbRow;
  if (!exported || typeof exported !== "object") {
    throw new HttpError(400, "El archivo de migración no es válido.");
  }
  const tables = (exported.tables ?? {}) as DbRow;
  const metadata = (exported.metadata ?? {}) as DbRow;
  const warehouseRows = tableFromExport(tables, ["ALMACENES"]);
  const unitRows = tableFromExport(tables, ["UNIDADES"]);
  const productRows = tableFromExport(tables, ["PRODUCTOS"]);
  const stockRows = tableFromExport(tables, ["STOCK"]);
  if (!productRows.length) {
    throw new HttpError(400, "El archivo no contiene la tabla PRODUCTOS.");
  }

  if (warehouseRows.length) {
    const existingProducts = await firstRow<{ total: number }>(
      "SELECT COUNT(*) total FROM products",
    );
    if (asNumber(existingProducts?.total) === 0) {
      await run(
        "DELETE FROM warehouses WHERE legacy_id IS NULL AND code IN ('ALM-PRI','ALM-SEC')",
      );
    }
  }

  const unitMap = new Map<string, string>();
  for (const raw of unitRows) {
    const id = asText(pick(raw, ["ID_UNIDAD", "ID"]));
    const label = asText(
      pick(raw, [
        "SIGLAS",
        "ABREVIATURA",
        "CODIGO",
        "UNIDAD",
        "NOMBRE",
        "DESCRIPCION",
      ]),
      "UND",
    ).toUpperCase();
    if (id) unitMap.set(id, label);
  }

  const warehouseStatements = warehouseRows.map((raw, index) => {
    const legacyId = asNumber(pick(raw, ["ID_ALMACEN", "ALMACEN_ID", "ID"]), index + 1);
    const name = asText(
      pick(raw, ["NOMBRE", "ALMACEN", "DESCRIPCION", "NOMBRE_ALMACEN"]),
      "ALMACÉN " + (index + 1),
    ).toUpperCase();
    const code = asText(
      pick(raw, ["CODIGO", "COD_ALMACEN"]),
      "ALM-" + String(legacyId).padStart(3, "0"),
    ).toUpperCase();
    return statement(
      "INSERT INTO warehouses (legacy_id,code,name,active) VALUES (?,?,?,?) ON CONFLICT(code) DO UPDATE SET legacy_id=excluded.legacy_id,name=excluded.name,active=excluded.active",
      [legacyId, code, name, asBoolean(pick(raw, ["ACTIVO", "ESTADO", "ESTATUS"])) ? 1 : 0],
    );
  });
  if (warehouseStatements.length) await batchInChunks(warehouseStatements);

  const productStatements = productRows
    .map((raw) => {
      const code = asText(
        pick(raw, ["CODIGO", "COD_PRODUCTO", "CODIGO_PRODUCTO", "SKU"]),
      ).toUpperCase();
      const name = asText(
        pick(raw, ["NOMBRE", "PRODUCTO", "DESCRIPCION", "NOMBRE_PRODUCTO"]),
      ).toUpperCase();
      if (!code || !name) return null;
      const unitDirect = asText(pick(raw, ["UNIDAD", "ABREVIATURA"]));
      const unitId = asText(
        pick(raw, ["ID_UNIDAD", "ID_UNIDAD_MEDIDA", "UNIDAD_ID"]),
      );
      const unit = (unitDirect || unitMap.get(unitId) || "UND").toUpperCase();
      return statement(
        "INSERT INTO products (legacy_id,code,supplier_code,name,brand,application,unit,location,cost,minimum_stock,active) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET legacy_id=excluded.legacy_id,supplier_code=excluded.supplier_code,name=excluded.name,brand=excluded.brand,application=excluded.application,unit=excluded.unit,location=excluded.location,cost=excluded.cost,minimum_stock=excluded.minimum_stock,active=excluded.active,updated_at=CURRENT_TIMESTAMP",
        [
          asNumber(pick(raw, ["ID_PRODUCTO", "PRODUCTO_ID", "ID"])) || null,
          code,
          asText(pick(raw, ["CODIGO_PROVEEDOR", "COD_PROVEEDOR"])),
          name,
          asText(pick(raw, ["MARCA"])).toUpperCase(),
          asText(pick(raw, ["APLICACION"])).toUpperCase(),
          unit,
          asText(pick(raw, ["UBICACION"])).toUpperCase(),
          Math.max(0, asNumber(pick(raw, ["COSTO", "PRECIO_COMPRA", "PRECIO_COSTO", "COSTO_UNITARIO"]))),
          Math.max(0, asNumber(pick(raw, ["STOCK_MINIMO", "MINIMO", "STOCK_MIN"]))),
          asBoolean(pick(raw, ["ACTIVO", "ESTADO", "ESTATUS"])) ? 1 : 0,
        ],
      );
    })
    .filter(Boolean) as ReturnType<typeof statement>[];
  await batchInChunks(productStatements);

  const warehouseMapRows = await allRows<{
    id: number;
    legacy_id: number | null;
    code: string;
    name: string;
  }>("SELECT id,legacy_id,code,name FROM warehouses");
  const productMapRows = await allRows<{
    id: number;
    legacy_id: number | null;
    code: string;
  }>("SELECT id,legacy_id,code FROM products");
  const warehouseByLegacy = new Map(
    warehouseMapRows
      .filter((row) => row.legacy_id !== null)
      .map((row) => [String(row.legacy_id), row.id]),
  );
  const productByLegacy = new Map(
    productMapRows
      .filter((row) => row.legacy_id !== null)
      .map((row) => [String(row.legacy_id), row.id]),
  );
  const productByCode = new Map(
    productMapRows.map((row) => [row.code.toUpperCase(), row.id]),
  );
  const fallbackWarehouse = warehouseMapRows[0]?.id;
  const firstImport = asNumber(
    (await firstRow<{ total: number }>("SELECT COUNT(*) total FROM import_runs"))?.total,
  ) === 0;
  const stockStatements: ReturnType<typeof statement>[] = [];
  const openingMovementStatements: ReturnType<typeof statement>[] = [];
  let importedStocks = 0;

  for (const raw of stockRows) {
    const legacyProduct = asText(pick(raw, ["ID_PRODUCTO", "PRODUCTO_ID"]));
    const code = asText(
      pick(raw, ["CODIGO", "COD_PRODUCTO", "CODIGO_PRODUCTO"]),
    ).toUpperCase();
    const productId = productByLegacy.get(legacyProduct) ?? productByCode.get(code);
    const legacyWarehouse = asText(pick(raw, ["ID_ALMACEN", "ALMACEN_ID"]));
    const warehouseId = warehouseByLegacy.get(legacyWarehouse) ?? fallbackWarehouse;
    if (!productId || !warehouseId) continue;
    const physical = Math.max(
      0,
      asNumber(
        pick(raw, [
          "STOCK_ACTUAL",
          "STOCK_FISICO",
          "CANTIDAD",
          "STOCK",
          "EXISTENCIA",
        ]),
      ),
    );
    const reserved = Math.max(0, asNumber(pick(raw, ["STOCK_RESERVADO", "RESERVADO"])));
    const damaged = Math.max(0, asNumber(pick(raw, ["STOCK_DANADO", "DANADO"])));
    stockStatements.push(
      statement(
        "INSERT INTO stock (product_id,warehouse_id,physical,reserved,damaged) VALUES (?,?,?,?,?) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET physical=excluded.physical,reserved=excluded.reserved,damaged=excluded.damaged,updated_at=CURRENT_TIMESTAMP",
        [productId, warehouseId, physical, reserved, damaged],
      ),
    );
    if (firstImport && physical !== 0) {
      openingMovementStatements.push(
        statement(
          "INSERT INTO movements (type,document,product_id,warehouse_id,quantity,notes,user_email) VALUES ('MIGRACION_INICIAL','MIGRACION-SQL',?,?,?,?,?)",
          [productId, warehouseId, physical, "Saldo importado desde SQL Server", user.email],
        ),
      );
    }
    importedStocks += 1;
  }
  await batchInChunks(stockStatements);
  if (openingMovementStatements.length) {
    await batchInChunks(openingMovementStatements);
  }

  const summary = {
    warehouses: warehouseStatements.length,
    products: productStatements.length,
    stocks: importedStocks,
    historicalOperations: 0,
  };
  await run(
    "INSERT INTO import_runs (source_server,source_database,user_email,summary) VALUES (?,?,?,?)",
    [
      asText(metadata.server),
      asText(metadata.database, "CONTROL_INVENTARIO"),
      user.email,
      JSON.stringify(summary),
    ],
  );
  await audit(user, "IMPORTAR", "MIGRACION", "SQL_SERVER", "CONTROL_INVENTARIO", summary);
  return {
    message:
      "Migración completada: " +
      summary.products +
      " productos y " +
      summary.stocks +
      " registros de stock.",
    summary,
  };
}

export async function executeOperation(body: unknown) {
  const payload = (body ?? {}) as DbRow;
  const action = asText(payload.action);
  const requestedOrderStatus = normalizeOrderStatus(payload.targetStatus);
  let permission = "operations";
  if (action === "save_user") permission = "users";
  if (action === "save_warehouse") permission = "warehouses";
  if (action === "import_legacy") permission = "imports";
  if (action === "create_product" || action === "update_product") {
    permission = "products";
  }
  if (action === "adjust_stock") permission = "inventory";
  if (action === "delete_receipt") permission = "cancellations";
  if (action === "create_order") {
    permission =
      normalizeOrderFlow(payload.flowMode) === "DESPACHO DIRECTO"
        ? "operations"
        : "store_orders";
  }
  if (action === "update_order_draft") permission = "store_orders";
  if (action === "set_order_status") {
    permission =
      requestedOrderStatus === "ENVIADA"
        ? "store_orders"
        : ["CANCELADA", "ANULADA"].includes(requestedOrderStatus)
          ? "cancellations"
          : "operations";
  }
  const user = await requireAppUser(permission);
  switch (action) {
    case "create_product":
      return createProduct(user, payload);
    case "update_product":
      return updateProduct(user, payload);
    case "create_receipt":
      return createReceipt(user, payload);
    case "delete_receipt":
      return deleteReceipt(user, payload);
    case "create_proforma":
      return createProforma(user, payload);
    case "create_order":
      return createOrder(user, payload);
    case "update_order_draft":
      return updateOrderDraft(user, payload);
    case "advance_order":
    case "set_order_status":
      return setOrderStatus(user, payload);
    case "review_order_stock":
      return reviewOrderStock(user, payload);
    case "create_transfer":
      return createTransfer(user, payload);
    case "adjust_stock":
      return adjustStock(user, payload);
    case "save_warehouse":
      return saveWarehouse(user, payload);
    case "save_user":
      return saveUser(user, payload);
    case "import_legacy":
      return importLegacy(user, payload);
    case "save_order_product_alias":
      return saveOrderProductAlias(user, payload);
    case "delete_order_product_alias":
      return deleteOrderProductAlias(user, payload);
    default:
      throw new HttpError(400, "Operación no reconocida.");
  }
}

export function errorResponse(error: unknown) {
  const status = error instanceof HttpError ? error.status : 500;
  const message =
    error instanceof Error ? error.message : "No se pudo completar la operación.";
  return Response.json({ error: message }, { status });
}
