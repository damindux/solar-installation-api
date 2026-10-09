import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "../../db/client.ts";
import { districts, gridSubstations, provinces } from "../../db/schema.ts";
import type { Page } from "../lib/pagination.ts";
import { envelope } from "../lib/pagination.ts";
import {
  districtVisible,
  provinceVisible,
  type Scope,
  stationVisible,
} from "../lib/jurisdiction.ts";

export type HierarchyFilters = {
  province_id?: number;
  district_id?: number;
};

const countExpression = sql<number>`count(*)::int`;

export async function listProvinces(
  db: Db,
  scope: Scope,
  page: Page,
  url: URL,
) {
  const predicate = provinceVisible(scope);
  const [rows, counts] = await Promise.all([
    db.select().from(provinces).where(predicate).orderBy(
      asc(provinces.province_id),
    )
      .limit(page.limit).offset(page.offset),
    db.select({ count: countExpression }).from(provinces).where(predicate),
  ]);
  return envelope(url, rows, Number(counts[0].count), page);
}

export async function getProvince(db: Db, scope: Scope, id: number) {
  const predicate = provinceVisible(scope);
  const [row] = await db.select().from(provinces)
    .where(and(eq(provinces.province_id, id), predicate)).limit(1);
  return row ?? null;
}

export async function listDistricts(
  db: Db,
  scope: Scope,
  page: Page,
  url: URL,
  filters: HierarchyFilters = {},
) {
  const predicate = and(
    districtVisible(scope),
    filters.province_id === undefined
      ? undefined
      : eq(districts.province_id, filters.province_id),
  );
  const [rows, counts] = await Promise.all([
    db.select().from(districts).where(predicate).orderBy(
      asc(districts.district_id),
    )
      .limit(page.limit).offset(page.offset),
    db.select({ count: countExpression }).from(districts).where(predicate),
  ]);
  return envelope(url, rows, Number(counts[0].count), page);
}

export async function getDistrict(db: Db, scope: Scope, id: number) {
  const predicate = districtVisible(scope);
  const [row] = await db.select().from(districts)
    .where(and(eq(districts.district_id, id), predicate)).limit(1);
  return row ?? null;
}

export async function listStations(
  db: Db,
  scope: Scope,
  page: Page,
  url: URL,
  filters: HierarchyFilters = {},
) {
  const predicate = and(
    stationVisible(scope),
    filters.district_id === undefined
      ? undefined
      : eq(gridSubstations.district_id, filters.district_id),
    filters.province_id === undefined
      ? undefined
      : eq(districts.province_id, filters.province_id),
  );
  const [rows, counts] = await Promise.all([
    db.select({
      station_id: gridSubstations.station_id,
      name: gridSubstations.name,
      district_id: gridSubstations.district_id,
    }).from(gridSubstations).innerJoin(
      districts,
      eq(districts.district_id, gridSubstations.district_id),
    )
      .where(predicate).orderBy(asc(gridSubstations.station_id)).limit(
        page.limit,
      ).offset(page.offset),
    db.select({ count: countExpression }).from(gridSubstations)
      .innerJoin(
        districts,
        eq(districts.district_id, gridSubstations.district_id),
      ).where(predicate),
  ]);
  return envelope(url, rows, Number(counts[0].count), page);
}

export async function getStation(db: Db, scope: Scope, id: number) {
  const [row] = await db.select({
    station_id: gridSubstations.station_id,
    name: gridSubstations.name,
    district_id: gridSubstations.district_id,
  }).from(gridSubstations)
    .innerJoin(
      districts,
      eq(districts.district_id, gridSubstations.district_id),
    )
    .where(and(eq(gridSubstations.station_id, id), stationVisible(scope)))
    .limit(1);
  return row ?? null;
}

export async function getDistrictGenerationSummary(
  db: Db,
  districtId: number,
  date: string,
  start: Date,
  end: Date,
) {
  const [row] = await db.execute<{
    installation_count: number | string;
    current_total_power_kw: number | string;
    today_total_energy_kwh: number | string;
  }>(sql`
    WITH inst AS (
      SELECT si.site_id FROM solar_installations si
      JOIN grid_substations gs ON gs.station_id = si.station_id
      WHERE gs.district_id = ${districtId}
    ), latest AS (
      SELECT DISTINCT ON (r.site_id) r.site_id, r.instantaneous_power_kw AS p
      FROM generation_readings r JOIN inst USING (site_id)
      ORDER BY r.site_id, r."timestamp" DESC, r.reading_id DESC
    ), day_end AS (
      SELECT DISTINCT ON (r.site_id) r.site_id, r.cumulative_energy_kwh AS e
      FROM generation_readings r JOIN inst USING (site_id)
      WHERE r."timestamp" >= ${start.toISOString()}::timestamptz
        AND r."timestamp" < ${end.toISOString()}::timestamptz
      ORDER BY r.site_id, r."timestamp" DESC, r.reading_id DESC
    ), before AS (
      SELECT DISTINCT ON (r.site_id) r.site_id, r.cumulative_energy_kwh AS e
      FROM generation_readings r JOIN inst USING (site_id)
      WHERE r."timestamp" < ${start.toISOString()}::timestamptz
      ORDER BY r.site_id, r."timestamp" DESC, r.reading_id DESC
    ), day_first AS (
      SELECT DISTINCT ON (r.site_id) r.site_id, r.cumulative_energy_kwh AS e
      FROM generation_readings r JOIN inst USING (site_id)
      WHERE r."timestamp" >= ${start.toISOString()}::timestamptz
        AND r."timestamp" < ${end.toISOString()}::timestamptz
      ORDER BY r.site_id, r."timestamp" ASC, r.reading_id ASC
    )
    SELECT (SELECT count(*) FROM inst)::int AS installation_count,
      COALESCE((SELECT sum(p) FROM latest), 0) AS current_total_power_kw,
      COALESCE((SELECT sum(GREATEST(de.e - COALESCE(b.e, df.e), 0))
        FROM day_end de JOIN day_first df USING (site_id)
        LEFT JOIN before b USING (site_id)), 0) AS today_total_energy_kwh
  `);
  return {
    date,
    installation_count: Number(row?.installation_count ?? 0),
    current_total_power_kw: Number(row?.current_total_power_kw ?? 0),
    today_total_energy_kwh: Number(row?.today_total_energy_kwh ?? 0),
  };
}
