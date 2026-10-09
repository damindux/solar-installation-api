import { assertEquals, assertGreater } from "@std/assert";
import { createDb } from "../../db/client.ts";
import { createApp } from "../../src/app.ts";
import type { AppConfig } from "../../src/config.ts";
import {
  authorizedRequest,
  authorizedRequestWithScope,
  testConfig,
} from "../helpers.ts";

const databaseUrl = Deno.env.get("TEST_DATABASE_URL");

Deno.test({
  name: "district generation summary aggregates Colombo-day readings",
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
      const response = await authorizedRequest(
        app,
        "/api/v1/districts/1/generation-summary?date=2026-10-05",
      );
      const summary = await response.json();
      assertEquals(response.status, 200);
      assertEquals(summary.district_id, 1);
      assertEquals(summary.date, "2026-10-05");
      assertGreater(summary.installation_count, 0);
      assertEquals(typeof summary.current_total_power_kw, "number");
      assertEquals(summary.current_total_power_kw >= 0, true);
      assertGreater(summary.today_total_energy_kwh, 0);

      const defaultSummaryResponse = await authorizedRequest(
        app,
        "/api/v1/districts/1/generation-summary",
      );
      const defaultSummary = await defaultSummaryResponse.json();
      assertEquals(defaultSummaryResponse.status, 200);
      assertEquals(defaultSummary.date, "2026-10-09");
      assertEquals(defaultSummary.today_total_energy_kwh, 0);
      assertEquals(typeof defaultSummary.current_total_power_kw, "number");
      assertEquals(defaultSummary.current_total_power_kw >= 0, true);

      const missing = await authorizedRequest(
        app,
        "/api/v1/districts/99999/generation-summary",
      );
      assertEquals(missing.status, 404);
      const outsideScope = await authorizedRequestWithScope(
        app,
        "/api/v1/districts/1/generation-summary",
        { role: "district", province_id: 1, district_id: 2 },
      );
      assertEquals(outsideScope.status, 404);
    } finally {
      await connection.close();
    }
  },
});
