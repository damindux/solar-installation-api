import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "../../db/client.ts";
import { generationReadings } from "../../db/schema.ts";
import { notFound } from "../lib/errors.ts";
import { serializeTimestamp } from "../lib/serialize.ts";
import { loadVisibleInstallation } from "./installations.ts";
import type { Page } from "../lib/pagination.ts";
import { envelope } from "../lib/pagination.ts";
import type { Scope } from "../lib/jurisdiction.ts";

export interface ReadingFilters {
  from?: string;
  to?: string;
  sort: "timestamp_asc" | "timestamp_desc";
}

function serializeReading(reading: typeof generationReadings.$inferSelect) {
  return {
    ...reading,
    timestamp: serializeTimestamp(reading.timestamp),
  };
}

export async function listReadings(
  db: Db,
  scope: Scope,
  siteId: number,
  page: Page,
  url: URL,
  filters: ReadingFilters,
) {
  const installation = await loadVisibleInstallation(db, scope, siteId);
  if (!installation) throw notFound();

  const predicate = and(
    eq(generationReadings.site_id, siteId),
    filters.from
      ? gte(generationReadings.timestamp, new Date(filters.from))
      : undefined,
    filters.to
      ? lt(generationReadings.timestamp, new Date(filters.to))
      : undefined,
  );
  const order = filters.sort === "timestamp_asc"
    ? [asc(generationReadings.timestamp), asc(generationReadings.reading_id)]
    : [desc(generationReadings.timestamp), desc(generationReadings.reading_id)];
  const [rows, counts] = await Promise.all([
    db.select().from(generationReadings).where(predicate).orderBy(...order)
      .limit(page.limit).offset(page.offset),
    db.select({ count: sql<number>`count(*)::int` }).from(generationReadings)
      .where(predicate),
  ]);
  return envelope(
    url,
    rows.map(serializeReading),
    Number(counts[0].count),
    page,
  );
}

export async function getReading(
  db: Db,
  scope: Scope,
  siteId: number,
  readingId: number,
) {
  const installation = await loadVisibleInstallation(db, scope, siteId);
  if (!installation) throw notFound();
  const [row] = await db.select().from(generationReadings).where(and(
    eq(generationReadings.site_id, siteId),
    eq(generationReadings.reading_id, readingId),
  )).limit(1);
  if (!row) throw notFound();
  return serializeReading(row);
}
