import { createDb } from "./db/client.ts";
import { ConfigError, loadConfig } from "./src/config.ts";
import { createApp } from "./src/app.ts";

if (import.meta.main) {
  try {
    const config = loadConfig();
    const { db } = createDb(config.runtimeDatabaseUrl, {
      pooled: config.runtimeDatabaseUrl !== config.databaseUrl,
    });
    const app = createApp({ db, config });
    Deno.serve({ port: config.port }, app.fetch);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      Deno.exit(1);
    }
    throw error;
  }
}
