import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("Falta DATABASE_URL. Configúrala en .env.local o en Vercel.");
}

const schemaUrl = new URL("../db/neon-schema.sql", import.meta.url);
const source = await readFile(schemaUrl, "utf8");
const statements = source
  .split(/;\s*(?=\n|$)/)
  .map((statement) => statement.trim())
  .filter(Boolean);
const sql = neon(databaseUrl);

for (const statement of statements) {
  await sql.query(statement, []);
}

console.log(`Esquema Neon listo: ${statements.length} sentencias ejecutadas.`);
