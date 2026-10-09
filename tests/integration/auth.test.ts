import { assertEquals } from "@std/assert";
import { createDb } from "../../db/client.ts";
import { createApp } from "../../src/app.ts";
import type { AppConfig } from "../../src/config.ts";
import { testConfig } from "../helpers.ts";

const databaseUrl = Deno.env.get("TEST_DATABASE_URL");

Deno.test({
  name:
    "login returns the same generic response for unknown and incorrect credentials",
  ignore: !databaseUrl,
  fn: async () => {
    const connection = createDb(databaseUrl!, { pooled: false });
    const config: AppConfig = {
      port: 8000,
      databaseUrl: databaseUrl!,
      runtimeDatabaseUrl: databaseUrl!,
      jwtSecret: testConfig.jwtSecret,
    };
    const app = createApp({ db: connection.db, config });

    try {
      const unknown = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "unknown-" + crypto.randomUUID(),
          password: "wrong",
        }),
      });
      const knownOrUnknown = await app.request("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "national", password: "wrong" }),
      });
      const firstBody = await unknown.json();
      const secondBody = await knownOrUnknown.json();

      assertEquals(unknown.status, 401);
      assertEquals(knownOrUnknown.status, 401);
      assertEquals(firstBody.code, 40103);
      assertEquals(firstBody.message, "Invalid username or password");
      assertEquals(secondBody.code, firstBody.code);
      assertEquals(secondBody.message, firstBody.message);
    } finally {
      await connection.close();
    }
  },
});
