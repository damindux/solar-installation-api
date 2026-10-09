import { createDb } from "./db/client.ts";
import { ConfigError, loadConfig } from "./src/config.ts";

export function handler(req: Request): Response {
  const url = new URL(req.url);

  if (url.pathname === "/api") {
    return Response.json({
      message: "Hello, world!",
      time: new Date().toISOString(),
    });
  }

  return new Response("<h1>Welcome to Deno!</h1>", {
    headers: { "content-type": "text/html" },
  });
}

if (import.meta.main) {
  try {
    const config = loadConfig();
    const database = createDb(config.runtimeDatabaseUrl, {
      pooled: config.runtimeDatabaseUrl !== config.databaseUrl,
    });
    void database;
    Deno.serve({ port: config.port }, handler);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      Deno.exit(1);
    }
    throw error;
  }
}
