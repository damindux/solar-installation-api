import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { createDb } from "../db/client.ts";
import { randomToken, sha256Hex } from "../src/lib/hash.ts";
import {
  districts,
  generationReadings,
  gridSubstations,
  type InsertDistrict,
  type InsertGridSubstation,
  type InsertProvince,
  provinces,
  solarInstallations,
  users,
} from "../db/schema.ts";

interface SeedData {
  provinces: InsertProvince[];
  districts: InsertDistrict[];
  grid_substations: InsertGridSubstation[];
  solar_installations: Array<{
    site_id: number;
    address: string;
    device_id: string;
    station_id: number;
  }>;
  generation_readings: Array<{
    reading_id: number;
    site_id: number;
    timestamp: string;
    instantaneous_power_kw: number;
    cumulative_energy_kwh: number;
    voltage: number;
  }>;
}

const tokenFile = "scripts/.out/device-tokens.json";
const demoUsers = [
  { username: "national", role: "national" },
  { username: "prov-western", role: "provincial", province_id: 1 },
  { username: "dist-colombo", role: "district", district_id: 1 },
  { username: "dist-matara", role: "district", district_id: 8 },
  { username: "station-colombo", role: "station", station_id: 1 },
] as const;

function validateSeed(data: SeedData): void {
  const provinceIds = new Set(data.provinces.map((row) => row.province_id));
  const districtIds = new Set(data.districts.map((row) => row.district_id));
  const stationIds = new Set(
    data.grid_substations.map((row) => row.station_id),
  );
  const siteIds = new Set(data.solar_installations.map((row) => row.site_id));
  const readingPairs = new Set<string>();
  for (const row of data.districts) {
    if (!provinceIds.has(row.province_id)) {
      throw new Error(
        "District " + row.district_id + " references missing province",
      );
    }
  }
  for (const row of data.grid_substations) {
    if (!districtIds.has(row.district_id)) {
      throw new Error(
        "Substation " + row.station_id + " references missing district",
      );
    }
  }
  for (const row of data.solar_installations) {
    if (!stationIds.has(row.station_id)) {
      throw new Error(
        "Installation " + row.site_id + " references missing substation",
      );
    }
  }
  for (const row of data.generation_readings) {
    if (!siteIds.has(row.site_id)) {
      throw new Error(
        "Reading " + row.reading_id + " references missing installation",
      );
    }
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(row.timestamp) ||
      new Date(row.timestamp).toISOString().replace(".000Z", "Z") !==
        row.timestamp
    ) {
      throw new Error(
        "Reading " + row.reading_id + " has invalid UTC timestamp " +
          row.timestamp,
      );
    }
    const pair = row.site_id + ":" + row.timestamp;
    if (readingPairs.has(pair)) {
      console.warn(
        "Duplicate site/timestamp pair " + pair + "; it will be skipped.",
      );
    }
    readingPairs.add(pair);
  }
}

async function readKnownTokens(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await Deno.readTextFile(tokenFile)) as Record<
      string,
      string
    >;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return {};
    throw error;
  }
}

async function runSeed(): Promise<void> {
  let raw: string;
  try {
    raw = await Deno.readTextFile("seed.json");
  } catch (error) {
    throw new Error(
      "Could not read seed.json: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      "Could not parse seed.json: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("seed.json must contain an object");
  }

  const data = parsed as SeedData;
  for (
    const key of [
      "provinces",
      "districts",
      "grid_substations",
      "solar_installations",
      "generation_readings",
    ] as const
  ) {
    if (!Array.isArray(data[key])) {
      throw new Error("seed.json is missing the " + key + " array");
    }
  }
  validateSeed(data);

  const databaseUrl = Deno.env.get("DATABASE_URL");
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed the database");
  }
  const database = createDb(databaseUrl, { pooled: false });
  const resetTokens = Deno.args.includes("--reset-tokens");
  const knownTokens = resetTokens ? {} : await readKnownTokens();
  const tokens = new Map<number, string>();
  for (const row of data.solar_installations) {
    tokens.set(
      row.site_id,
      resetTokens
        ? randomToken()
        : knownTokens[String(row.site_id)] ?? randomToken(),
    );
  }

  try {
    const insertedSiteIds: number[] = [];
    await database.db.transaction(async (tx) => {
      await tx.insert(provinces).values(data.provinces).onConflictDoNothing();
      await tx.insert(districts).values(data.districts).onConflictDoNothing();
      await tx.insert(gridSubstations).values(data.grid_substations)
        .onConflictDoNothing();
      const installationRows = await Promise.all(
        data.solar_installations.map(async (row) => ({
          ...row,
          device_token_hash: await sha256Hex(tokens.get(row.site_id)!),
        })),
      );
      const inserted = await tx.insert(solarInstallations)
        .overridingSystemValue().values(installationRows)
        .onConflictDoNothing().returning({
          site_id: solarInstallations.site_id,
        });
      insertedSiteIds.push(...inserted.map((item) => item.site_id));
      if (resetTokens) {
        for (const row of data.solar_installations) {
          await tx.update(solarInstallations)
            .set({
              device_token_hash: await sha256Hex(tokens.get(row.site_id)!),
            })
            .where(eq(solarInstallations.site_id, row.site_id));
        }
      }
      for (
        let index = 0;
        index < data.generation_readings.length;
        index += 1000
      ) {
        const batch = data.generation_readings.slice(index, index + 1000).map((
          row,
        ) => ({
          ...row,
          timestamp: new Date(row.timestamp),
        }));
        await tx.insert(generationReadings).overridingSystemValue().values(
          batch,
        )
          .onConflictDoNothing();
      }
      await tx.execute(
        sql.raw(
          "SELECT setval(pg_get_serial_sequence('solar_installations', 'site_id'), COALESCE((SELECT max(site_id) FROM solar_installations), 1))",
        ),
      );
      await tx.execute(
        sql.raw(
          "SELECT setval(pg_get_serial_sequence('generation_readings', 'reading_id'), COALESCE((SELECT max(reading_id) FROM generation_readings), 1))",
        ),
      );

      const password = Deno.env.get("SEED_DEMO_PASSWORD");
      if (password) {
        const passwordHash = await bcrypt.hash(password, 10);
        for (const user of demoUsers) {
          await tx.insert(users).values({
            ...user,
            password_hash: passwordHash,
          }).onConflictDoNothing();
        }
      }

      const countExpression = sql.raw("count(*)::int");
      const counts = await Promise.all([
        tx.select({ count: countExpression }).from(provinces),
        tx.select({ count: countExpression }).from(districts),
        tx.select({ count: countExpression }).from(gridSubstations),
        tx.select({ count: countExpression }).from(solarInstallations),
        tx.select({ count: countExpression }).from(generationReadings),
      ]);
      const actual = counts.map((rows) => Number(rows[0].count));
      const expected = [
        data.provinces.length,
        data.districts.length,
        data.grid_substations.length,
        data.solar_installations.length,
        data.generation_readings.length,
      ];
      const names = [
        "provinces",
        "districts",
        "grid_substations",
        "solar_installations",
        "generation_readings",
      ];
      names.forEach((name, index) =>
        console.log(
          name + ": " + actual[index] + " rows (seed: " + expected[index] + ")",
        )
      );

      const outputTokens: Record<string, string> = resetTokens
        ? {}
        : { ...knownTokens };
      for (const siteId of insertedSiteIds) {
        outputTokens[String(siteId)] = tokens.get(siteId)!;
      }
      if (resetTokens) {
        for (const row of data.solar_installations) {
          outputTokens[String(row.site_id)] = tokens.get(row.site_id)!;
        }
      }
      await Deno.mkdir("scripts/.out", { recursive: true });
      await Deno.writeTextFile(
        tokenFile,
        JSON.stringify(outputTokens, null, 2) + "\n",
      );
      if (insertedSiteIds.includes(1) || resetTokens) {
        console.log("Device token for site 1: " + tokens.get(1));
      }
    });
  } finally {
    await database.close();
  }
}

if (import.meta.main) {
  try {
    await runSeed();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  }
}
