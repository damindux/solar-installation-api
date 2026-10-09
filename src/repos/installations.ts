import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client.ts";
import {
  districts,
  generationReadings,
  gridSubstations,
  solarInstallations,
} from "../../db/schema.ts";
import {
  conflict,
  notFound,
  postgresErrorCode,
  unprocessable,
} from "../lib/errors.ts";
import type { Page } from "../lib/pagination.ts";
import { envelope } from "../lib/pagination.ts";
import { numericToNumber, serializeTimestamp } from "../lib/serialize.ts";
import { type Scope, stationVisible } from "../lib/jurisdiction.ts";

export type InstallationFilters = {
  province_id?: number;
  district_id?: number;
  station_id?: number;
};

const countExpression = sql<number>`count(*)::int`;

export async function listInstallations(
  db: Db,
  scope: Scope,
  page: Page,
  url: URL,
  filters: InstallationFilters = {},
) {
  const predicate = and(
    stationVisible(scope),
    filters.province_id === undefined
      ? undefined
      : eq(districts.province_id, filters.province_id),
    filters.district_id === undefined
      ? undefined
      : eq(gridSubstations.district_id, filters.district_id),
    filters.station_id === undefined
      ? undefined
      : eq(solarInstallations.station_id, filters.station_id),
  );
  const baseQuery = () =>
    db.select({
      site_id: solarInstallations.site_id,
      address: solarInstallations.address,
      device_id: solarInstallations.device_id,
      station_id: solarInstallations.station_id,
    }).from(solarInstallations)
      .innerJoin(
        gridSubstations,
        eq(gridSubstations.station_id, solarInstallations.station_id),
      )
      .innerJoin(
        districts,
        eq(districts.district_id, gridSubstations.district_id),
      );
  const [rows, counts] = await Promise.all([
    baseQuery().where(predicate).orderBy(asc(solarInstallations.site_id)).limit(
      page.limit,
    ).offset(page.offset),
    db.select({ count: countExpression }).from(solarInstallations)
      .innerJoin(
        gridSubstations,
        eq(gridSubstations.station_id, solarInstallations.station_id),
      )
      .innerJoin(
        districts,
        eq(districts.district_id, gridSubstations.district_id),
      ).where(predicate),
  ]);
  return envelope(url, rows, Number(counts[0].count), page);
}

export async function loadVisibleInstallation(
  db: Db,
  scope: Scope,
  siteId: number,
) {
  const [row] = await db.select({
    site_id: solarInstallations.site_id,
    address: solarInstallations.address,
    device_id: solarInstallations.device_id,
    station_id: solarInstallations.station_id,
    updated_at: solarInstallations.updated_at,
  }).from(solarInstallations)
    .innerJoin(
      gridSubstations,
      eq(gridSubstations.station_id, solarInstallations.station_id),
    )
    .innerJoin(
      districts,
      eq(districts.district_id, gridSubstations.district_id),
    )
    .where(and(eq(solarInstallations.site_id, siteId), stationVisible(scope)))
    .limit(1);
  return row ?? null;
}

interface CompositeRaw extends Record<string, unknown> {
  site_id: number;
  address: string;
  device_id: string;
  station_id: number;
  station_name: string;
  district_id: number;
  district_name: string;
  province_id: number;
  province_name: string;
  reading_id: number | null;
  reading_timestamp: Date | null;
  instantaneous_power_kw: number | string | null;
  cumulative_energy_kwh: number | string | null;
  voltage: number | string | null;
}

export async function getInstallationComposite(
  db: Db,
  scope: Scope,
  siteId: number,
) {
  const visible = stationVisible(scope) ?? sql`TRUE`;
  const result = await db.execute<CompositeRaw>(sql`
    SELECT solar_installations.site_id, solar_installations.address, solar_installations.device_id,
           grid_substations.station_id, grid_substations.name AS station_name,
           districts.district_id, districts.name AS district_name,
           provinces.province_id, provinces.name AS province_name,
           latest.reading_id, latest."timestamp" AS reading_timestamp,
           latest.instantaneous_power_kw, latest.cumulative_energy_kwh, latest.voltage
    FROM solar_installations
    JOIN grid_substations ON grid_substations.station_id = solar_installations.station_id
    JOIN districts ON districts.district_id = grid_substations.district_id
    JOIN provinces ON provinces.province_id = districts.province_id
    LEFT JOIN LATERAL (
      SELECT r.reading_id, r."timestamp", r.instantaneous_power_kw, r.cumulative_energy_kwh, r.voltage
      FROM generation_readings r
      WHERE r.site_id = solar_installations.site_id
      ORDER BY r."timestamp" DESC, r.reading_id DESC
      LIMIT 1
    ) AS latest ON TRUE
    WHERE solar_installations.site_id = ${siteId} AND ${visible}
  `);
  const row = result[0];
  if (!row) return null;
  return {
    site_id: row.site_id,
    address: row.address,
    device_id: row.device_id,
    station: { station_id: row.station_id, name: row.station_name },
    district: { district_id: row.district_id, name: row.district_name },
    province: { province_id: row.province_id, name: row.province_name },
    last_known_reading: row.reading_id === null ? null : {
      reading_id: Number(row.reading_id),
      timestamp: serializeTimestamp(row.reading_timestamp!),
      instantaneous_power_kw: numericToNumber(row.instantaneous_power_kw!),
      cumulative_energy_kwh: numericToNumber(row.cumulative_energy_kwh!),
      voltage: numericToNumber(row.voltage!),
    },
  };
}

export async function getLastKnownReading(db: Db, siteId: number) {
  const [row] = await db.select().from(generationReadings)
    .where(eq(generationReadings.site_id, siteId))
    .orderBy(
      sql`${generationReadings.timestamp} DESC`,
      sql`${generationReadings.reading_id} DESC`,
    )
    .limit(1);
  if (!row) {
    throw notFound("No generation readings were found for this installation");
  }
  return {
    ...row,
    timestamp: serializeTimestamp(row.timestamp),
  };
}

export async function visibleInstallationOrThrow(
  db: Db,
  scope: Scope,
  siteId: number,
) {
  const installation = await loadVisibleInstallation(db, scope, siteId);
  if (!installation) throw notFound();
  return installation;
}

export async function createInstallation(
  db: Db,
  values: {
    address: string;
    device_id: string;
    station_id: number;
    device_token_hash: string;
  },
) {
  try {
    const [row] = await db.insert(solarInstallations).values(values).returning({
      site_id: solarInstallations.site_id,
      address: solarInstallations.address,
      device_id: solarInstallations.device_id,
      station_id: solarInstallations.station_id,
      created_at: solarInstallations.created_at,
      updated_at: solarInstallations.updated_at,
    });
    return row;
  } catch (error) {
    const code = postgresErrorCode(error);
    if (code === "23505") {
      throw conflict(
        40901,
        "An installation with this device_id already exists.",
      );
    }
    if (code === "23503") throw unprocessable();
    throw error;
  }
}

export async function replaceInstallation(
  db: Db,
  siteId: number,
  values: { address: string; device_id: string; station_id: number },
) {
  try {
    const [row] = await db.update(solarInstallations).set({
      ...values,
      updated_at: new Date(),
    }).where(eq(solarInstallations.site_id, siteId)).returning({
      site_id: solarInstallations.site_id,
      address: solarInstallations.address,
      device_id: solarInstallations.device_id,
      station_id: solarInstallations.station_id,
    });
    return row ?? null;
  } catch (error) {
    const code = postgresErrorCode(error);
    if (code === "23505") {
      throw conflict(
        40901,
        "An installation with this device_id already exists.",
      );
    }
    if (code === "23503") throw unprocessable();
    throw error;
  }
}

export async function deleteInstallation(
  db: Db,
  siteId: number,
): Promise<boolean> {
  const [row] = await db.delete(solarInstallations)
    .where(eq(solarInstallations.site_id, siteId))
    .returning({ site_id: solarInstallations.site_id });
  return row !== undefined;
}
