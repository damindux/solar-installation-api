import { authorizedRequest, testConfig } from "../helpers.ts";
import { assertEquals } from "@std/assert";
import { createDb } from "../../db/client.ts";
import { createApp } from "../../src/app.ts";
import type { AppConfig } from "../../src/config.ts";

const databaseUrl = Deno.env.get("TEST_DATABASE_URL");

Deno.test({
  name: "nested hierarchy collections match their filtered flat collections",
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
      const nestedDistricts = await authorizedRequest(
        app,
        "/api/v1/provinces/1/districts?limit=100",
      );
      const flatDistricts = await authorizedRequest(
        app,
        "/api/v1/districts?province-id=1&limit=100",
      );
      assertEquals(nestedDistricts.status, 200);
      assertEquals(await nestedDistricts.json(), await flatDistricts.json());

      const nestedStations = await authorizedRequest(
        app,
        "/api/v1/districts/1/grid-substations?limit=100",
      );
      const flatStations = await authorizedRequest(
        app,
        "/api/v1/grid-substations?district-id=1&limit=100",
      );
      assertEquals(nestedStations.status, 200);
      assertEquals(await nestedStations.json(), await flatStations.json());
    } finally {
      await connection.close();
    }
  },
});
