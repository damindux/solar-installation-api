import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export function createDb(url: string, options: { pooled: boolean }) {
  const client = postgres(url, {
    max: 5,
    prepare: !options.pooled,
  });
  const db = drizzle(client, { schema });

  return {
    db,
    close: () => client.end(),
  };
}

export type Db = ReturnType<typeof createDb>["db"];
