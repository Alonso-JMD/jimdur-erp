import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getRawDb() {
  if (!env.DB) {
    throw new Error("La base de datos de JIMDUR no está disponible.");
  }

  return env.DB;
}

export function getDb() {
  return drizzle(getRawDb(), { schema });
}
