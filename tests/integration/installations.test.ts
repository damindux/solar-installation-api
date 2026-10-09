import { assertEquals, assertExists } from "@std/assert";
import { createDb } from "../../db/client.ts";
import { createApp } from "../../src/app.ts";
import type { AppConfig } from "../../src/config.ts";

const databaseUrl = Deno.env.get("TEST_DATABASE_URL");

Deno.test({
  name:
    "installation collections and composite resources match the seeded model",
  ignore: !databaseUrl,
  fn: async () => {
    const connection = createDb(databaseUrl!, { pooled: false });
    const config: AppConfig = {
      port: 8000,
      databaseUrl: databaseUrl!,
      runtimeDatabaseUrl: databaseUrl!,
      jwtSecret: "integration-test",
    };
    const app = createApp({ db: connection.db, config });

    try {
      const collectionResponse = await app.request(
        "/api/v1/solar-installations?limit=100",
      );
      const collection = await collectionResponse.json();
      assertEquals(collectionResponse.status, 200);
      assertEquals(collection.count, 200);
      assertEquals(collection.data.length, 100);

      const nested = await app.request(
        "/api/v1/grid-substations/1/solar-installations?limit=100",
      );
      const filtered = await app.request(
        "/api/v1/solar-installations?station-id=1&limit=100",
      );
      assertEquals(await nested.json(), await filtered.json());

      const stationFiltered = await app.request(
        "/api/v1/solar-installations?station-id=1",
      );
      const combinedFiltered = await app.request(
        "/api/v1/solar-installations?province-id=1&district-id=1&station-id=1",
      );
      assertEquals(
        (await combinedFiltered.json()).count,
        (await stationFiltered.json()).count,
      );

      const compositeResponse = await app.request(
        "/api/v1/solar-installations/1",
      );
      const composite = await compositeResponse.json();
      assertEquals(compositeResponse.status, 200);
      assertExists(composite.station.station_id);
      assertExists(composite.district.district_id);
      assertExists(composite.province.province_id);
      assertEquals(
        composite.last_known_reading.timestamp,
        "2026-10-07T23:45:00Z",
      );

      const lastResponse = await app.request(
        "/api/v1/solar-installations/1/last-known-reading",
      );
      const lastReading = await lastResponse.json();
      assertEquals(lastResponse.status, 200);
      assertEquals(
        lastReading.timestamp,
        composite.last_known_reading.timestamp,
      );
      assertEquals(
        lastReading.reading_id,
        composite.last_known_reading.reading_id,
      );

      assertEquals(
        (await app.request("/api/v1/solar-installations/99999")).status,
        404,
      );
      assertEquals(
        (await app.request(
          "/api/v1/solar-installations/99999/last-known-reading",
        )).status,
        404,
      );
    } finally {
      await connection.close();
    }
  },
});
