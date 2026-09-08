import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type BoundValue = string | number | null;

type NeonSqlClient = import("@neondatabase/serverless").NeonQueryFunction<
  false,
  false
>;

type NeonPreparedResult<T> = {
  results: T[];
  success: true;
};

/**
 * The original application used the small D1 prepare/bind/all/first/run API.
 * This adapter keeps that application boundary intact while executing the same
 * business queries against Neon PostgreSQL from Vercel Functions.
 */
export class NeonPreparedStatement {
  constructor(
    private readonly queryText: string,
    private readonly values: BoundValue[] = [],
  ) {}

  bind(...values: BoundValue[]) {
    return new NeonPreparedStatement(this.queryText, values);
  }

  async all<T extends Record<string, unknown>>() {
    const rows = await executeQuery<T>(this.queryText, this.values);
    return { results: rows, success: true } satisfies NeonPreparedResult<T>;
  }

  async first<T extends Record<string, unknown>>() {
    const rows = await executeQuery<T>(this.queryText, this.values);
    return rows[0] ?? null;
  }

  async run() {
    await executeQuery(this.queryText, this.values);
    return { results: [], success: true as const };
  }

  toTransactionQuery() {
    const translated = translateSql(this.queryText);
    const segments = translated.split("?");
    if (segments.length !== this.values.length + 1) {
      throw new Error("La consulta preparada tiene parámetros incompatibles.");
    }
    const template = segments as unknown as TemplateStringsArray;
    Object.defineProperty(template, "raw", { value: segments });
    return getSql()(template, ...this.values);
  }
}

class NeonDatabaseAdapter {
  prepare(queryText: string) {
    return new NeonPreparedStatement(queryText);
  }

  async batch(statements: NeonPreparedStatement[]) {
    if (!statements.length) return [];
    const queries = statements.map((statement) => statement.toTransactionQuery());
    return getSql().transaction(queries);
  }
}

let sqlClient: NeonSqlClient | null = null;

function getSql() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      "Falta DATABASE_URL. Crea una conexión a Neon y configúrala en Vercel o en .env.local.",
    );
  }
  if (!sqlClient) {
    sqlClient = neon(databaseUrl);
  }
  return sqlClient;
}

function translateSql(queryText: string) {
  const hasInsertOrIgnore = /\bINSERT\s+OR\s+IGNORE\s+INTO\b/i.test(queryText);
  let translated = queryText.replace(
    /\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi,
    "INSERT INTO",
  );

  // D1 stores these values as ISO-like text. Neon stores them as timestamp
  // columns, so PostgreSQL can compare the columns directly with CURRENT_TIMESTAMP.
  translated = translated.replace(/\bdatetime\(([^()]+)\)/gi, "$1");

  // SQLite accepts MAX(a,b) as a scalar function; PostgreSQL uses GREATEST.
  translated = translated
    .replace(/\bMAX\(0\s*,\s*physical-reserved\)/gi, "GREATEST(0, physical-reserved)")
    .replace(/\bMAX\(0\s*,\s*physical-\?\)/gi, "GREATEST(0, physical-?)")
    .replace(/\bMAX\(0\s*,\s*reserved-\?\)/gi, "GREATEST(0, reserved-?)");

  // PostgreSQL's SUBSTR with a negative start is not portable across drivers.
  translated = translated.replace(
    /\bSUBSTR\((number|document),\s*-6\)/gi,
    "RIGHT($1, 6)",
  );

  if (hasInsertOrIgnore && !/\bON\s+CONFLICT\b/i.test(translated)) {
    translated += " ON CONFLICT DO NOTHING";
  }
  return translated;
}

function numberedPlaceholders(queryText: string) {
  let index = 0;
  return queryText.replace(/\?/g, () => "$" + ++index);
}

async function executeQuery<T extends Record<string, unknown>>(
  queryText: string,
  values: BoundValue[],
): Promise<T[]> {
  const rows = await getSql().query(
    numberedPlaceholders(translateSql(queryText)),
    values,
  );
  return rows as unknown as T[];
}

export function getRawDb() {
  return new NeonDatabaseAdapter();
}

export function getDb() {
  return drizzle(getSql(), { schema });
}
