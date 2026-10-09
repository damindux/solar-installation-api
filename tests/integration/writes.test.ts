import { assertEquals, assertExists } from "@std/assert";
import { createDb } from "../../db/client.ts";
import { createApp } from "../../src/app.ts";
import type { AppConfig } from "../../src/config.ts";
import { authorizedRequest, testConfig } from "../helpers.ts";

const databaseUrl = Deno.env.get("TEST_DATABASE_URL");

Deno.test({
  name:
    "installation writes and device reading ingestion enforce their actor and data rules",
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
    let siteId: number | undefined;

    try {
      const deviceId = "TEST-" + crypto.randomUUID();
      const createdResponse = await authorizedRequest(
        app,
        "/api/v1/solar-installations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: "Integration test site",
            device_id: deviceId,
            station_id: 1,
          }),
        },
      );
      const created = await createdResponse.json();
      siteId = created.site_id;
      assertEquals(createdResponse.status, 201);
      assertEquals(created.device_id, deviceId);
      assertExists(created.device_token);
      assertEquals("created_at" in created, false);
      assertEquals(
        createdResponse.headers.get("location"),
        "/api/v1/solar-installations/" + siteId,
      );
      assertExists(createdResponse.headers.get("etag"));

      const readBack = await authorizedRequest(
        app,
        "/api/v1/solar-installations/" + siteId,
      );
      const readBackBody = await readBack.json();
      assertEquals("device_token" in readBackBody, false);
      const initialEtag = readBack.headers.get("etag");
      assertExists(initialEtag);
      const notModified = await authorizedRequest(
        app,
        "/api/v1/solar-installations/" + siteId,
        { headers: { "If-None-Match": initialEtag } },
      );
      assertEquals(notModified.status, 304);
      assertEquals(await notModified.text(), "");

      const duplicateDevice = await authorizedRequest(
        app,
        "/api/v1/solar-installations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: "Duplicate site",
            device_id: deviceId,
            station_id: 1,
          }),
        },
      );
      assertEquals(duplicateDevice.status, 409);
      assertEquals((await duplicateDevice.json()).code, 40901);

      const invalidStation = await authorizedRequest(
        app,
        "/api/v1/solar-installations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: "Bad station",
            device_id: "TEST-BAD-" + crypto.randomUUID(),
            station_id: 99999,
          }),
        },
      );
      assertEquals(invalidStation.status, 422);

      const deviceToken = created.device_token as string;
      const noDeviceCredential = await app.request(
        "/api/v1/solar-installations/" + siteId + "/generation-readings",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            timestamp: new Date().toISOString(),
            instantaneous_power_kw: 1,
            cumulative_energy_kwh: 1,
            voltage: 230,
          }),
        },
      );
      assertEquals(noDeviceCredential.status, 401);

      const userReadWithDevice = await app.request(
        "/api/v1/solar-installations/1",
        {
          headers: { Authorization: "Bearer " + deviceToken },
        },
      );
      assertEquals(userReadWithDevice.status, 403);

      const pathMismatch = await app.request(
        "/api/v1/solar-installations/" + (siteId! + 1) + "/generation-readings",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + deviceToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            timestamp: new Date().toISOString(),
            instantaneous_power_kw: 1,
            cumulative_energy_kwh: 1,
            voltage: 230,
          }),
        },
      );
      assertEquals(pathMismatch.status, 403);
      assertEquals((await pathMismatch.json()).code, 40302);

      const userIngest = await authorizedRequest(
        app,
        "/api/v1/solar-installations/" + siteId + "/generation-readings",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            timestamp: new Date().toISOString(),
            instantaneous_power_kw: 1,
            cumulative_energy_kwh: 1,
            voltage: 230,
          }),
        },
      );
      assertEquals(userIngest.status, 403);
      assertEquals((await userIngest.json()).code, 40301);

      const timestamp = new Date(Math.floor(Date.now() / 1000) * 1000)
        .toISOString();
      const validBody = {
        timestamp,
        instantaneous_power_kw: 2.5,
        cumulative_energy_kwh: 2000.25,
        voltage: 231.4,
      };
      const invalidReading = await app.request(
        "/api/v1/solar-installations/" + siteId + "/generation-readings",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + deviceToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...validBody, instantaneous_power_kw: -1 }),
        },
      );
      assertEquals(invalidReading.status, 400);

      const accepted = await app.request(
        "/api/v1/solar-installations/" + siteId + "/generation-readings",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + deviceToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(validBody),
        },
      );
      const reading = await accepted.json();
      assertEquals(accepted.status, 201);
      assertEquals(
        accepted.headers.get("location"),
        "/api/v1/solar-installations/" + siteId + "/generation-readings/" +
          reading.reading_id,
      );
      const changedSinceReading = await authorizedRequest(
        app,
        "/api/v1/solar-installations/" + siteId,
        { headers: { "If-None-Match": initialEtag } },
      );
      assertEquals(changedSinceReading.status, 200);

      const staleDateWrite = await authorizedRequest(
        app,
        "/api/v1/solar-installations/" + siteId,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "If-Unmodified-Since": "Wed, 21 Oct 2015 07:28:00 GMT",
          },
          body: JSON.stringify({
            address: "Updated integration site",
            device_id: deviceId,
            station_id: 1,
          }),
        },
      );
      assertEquals(staleDateWrite.status, 412);

      const duplicateReading = await app.request(
        "/api/v1/solar-installations/" + siteId + "/generation-readings",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + deviceToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(validBody),
        },
      );
      assertEquals(duplicateReading.status, 409);
      assertEquals(
        (await duplicateReading.json()).message,
        "A reading for this site and timestamp already exists.",
      );

      const replaceBody = {
        address: "Updated integration site",
        device_id: deviceId,
        station_id: 1,
      };
      const replaceFirst = await authorizedRequest(
        app,
        "/api/v1/solar-installations/" + siteId,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "If-Match": changedSinceReading.headers.get("etag")!,
          },
          body: JSON.stringify(replaceBody),
        },
      );
      const replaceSecond = await authorizedRequest(
        app,
        "/api/v1/solar-installations/" + siteId,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(replaceBody),
        },
      );
      assertEquals(replaceFirst.status, 200);
      assertEquals(await replaceFirst.json(), await replaceSecond.json());

      const staleReplace = await authorizedRequest(
        app,
        "/api/v1/solar-installations/" + siteId,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "If-Match": initialEtag,
          },
          body: JSON.stringify(replaceBody),
        },
      );
      assertEquals(staleReplace.status, 412);
      assertEquals((await staleReplace.json()).code, 41201);

      const deleteResponse = await authorizedRequest(
        app,
        "/api/v1/solar-installations/" + siteId,
        { method: "DELETE" },
      );
      assertEquals(deleteResponse.status, 200);
      assertEquals((await deleteResponse.json()).deleted, true);
      siteId = undefined;
      assertEquals(
        (await authorizedRequest(
          app,
          "/api/v1/solar-installations/" + created.site_id,
          { method: "DELETE" },
        )).status,
        404,
      );
    } finally {
      if (siteId !== undefined) {
        await authorizedRequest(app, "/api/v1/solar-installations/" + siteId, {
          method: "DELETE",
        });
      }
      await connection.close();
    }
  },
});
