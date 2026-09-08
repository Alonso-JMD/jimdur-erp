import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("Falta DATABASE_URL. Configúrala en .env.local o en Vercel.");
}

const tableOrder = [
  "app_users",
  "warehouses",
  "products",
  "stock",
  "movements",
  "receipts",
  "receipt_lines",
  "proformas",
  "proforma_lines",
  "orders",
  "order_lines",
  "transfers",
  "transfer_lines",
  "order_product_aliases",
  "audit_logs",
  "import_runs",
  "app_sessions",
  "auth_rate_limits",
];
const identityTables = new Set([
  "warehouses",
  "products",
  "order_product_aliases",
  "stock",
  "movements",
  "receipts",
  "receipt_lines",
  "proformas",
  "proforma_lines",
  "orders",
  "order_lines",
  "transfers",
  "transfer_lines",
  "audit_logs",
  "import_runs",
]);
const identifier = /^[a-z_][a-z0-9_]*$/;
const sql = neon(databaseUrl);
let savedRows = 0;

function quoteIdentifier(value) {
  if (!identifier.test(value)) {
    throw new Error(`Identificador no permitido en la instantánea: ${value}`);
  }
  return `"${value}"`;
}

async function loadSnapshot(table) {
  const source = await readFile(
    new URL(`../data/live-db/${table}.json`, import.meta.url),
    "utf8",
  );
  const snapshot = JSON.parse(source);
  if (snapshot.table !== table || !Array.isArray(snapshot.columns) || !Array.isArray(snapshot.rows)) {
    throw new Error(`Instantánea inválida: ${table}.json`);
  }
  for (const column of snapshot.columns) quoteIdentifier(column);
  return snapshot;
}

for (const table of tableOrder) {
  const snapshot = await loadSnapshot(table);
  const columns = snapshot.columns;
  if (!snapshot.rows.length) continue;

  const quotedTable = quoteIdentifier(table);
  const quotedColumns = columns.map(quoteIdentifier).join(",");
  for (let offset = 0; offset < snapshot.rows.length; offset += 100) {
    const rows = snapshot.rows.slice(offset, offset + 100);
    const values = [];
    const tuples = rows.map((row, rowIndex) => {
      const placeholders = columns.map((column, columnIndex) => {
        values.push(row[column] ?? null);
        return `$${rowIndex * columns.length + columnIndex + 1}`;
      });
      return `(${placeholders.join(",")})`;
    });
    await sql.query(
      `INSERT INTO ${quotedTable} (${quotedColumns}) VALUES ${tuples.join(",")} ON CONFLICT DO NOTHING`,
      values,
    );
    savedRows += rows.length;
  }
  console.log(`${table}: ${snapshot.rows.length} filas procesadas.`);
}

for (const table of identityTables) {
  const quotedTable = quoteIdentifier(table);
  await sql.query(
    `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${quotedTable}), 1), (SELECT MAX(id) IS NOT NULL FROM ${quotedTable}))`,
    [],
  );
}

console.log(`Importación Neon completada: ${savedRows} filas procesadas.`);
console.log("Nota: sesiones, límites de autenticación y campos criptográficos fueron excluidos de la copia por seguridad.");
