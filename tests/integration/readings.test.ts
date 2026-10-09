import { authorizedRequest, testConfig } from "../helpers.ts";
import { assertEquals } from "@std/assert";
import { createDb } from "../../db/client.ts";
import { createApp } from "../../src/app.ts";
import type { AppConfig } from "../../src/config.ts";

const databaseUrl = Deno.env.get("TEST_DATABASE_URL");

Deno.test({
  name:
    "generation-reading history filters, sorts, paginates, and scopes IDs to the site",
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
      const pageResponse = await authorizedRequest(
        app,
        "/api/v1/solar-installations/1/generation-readings?limit=96",
      );
      const page = await pageResponse.json();
      assertEquals(pageResponse.status, 200);
      assertEquals(page.count, 672);
      assertEquals(page.data.length, 96);
      assertEquals(page.next !== null, true);
      assertEquals(page.previous, null);
      assertEquals(page.data[0].timestamp, "2026-10-07T23:45:00Z");

      const ascending = await authorizedRequest(
        app,
        "/api/v1/solar-installations/1/generation-readings?limit=1&sort=timestamp_asc",
      );
      assertEquals(
        (await ascending.json()).data[0].timestamp,
        "2026-10-01T00:00:00Z",
      );

      const day = await authorizedRequest(
        app,
        "/api/v1/solar-installations/1/generation-readings?from=2026-10-03T00%3A00%3A00Z&to=2026-10-04T00%3A00%3A00Z&limit=100",
      );
      assertEquals((await day.json()).count, 96);

      const exclusiveEnd = await authorizedRequest(
        app,
        "/api/v1/solar-installations/1/generation-readings?from=2026-10-03T00%3A00%3A00Z&to=2026-10-03T00%3A15%3A00Z",
      );
      assertEquals((await exclusiveEnd.json()).count, 1);

      assertEquals(
        (await authorizedRequest(
          app,
          "/api/v1/solar-installations/1/generation-readings/1",
        )).status,
        200,
      );
      assertEquals(
        (await authorizedRequest(
          app,
          "/api/v1/solar-installations/1/generation-readings/673",
        )).status,
        404,
      );
    } finally {
      await connection.close();
    }
  },
});
