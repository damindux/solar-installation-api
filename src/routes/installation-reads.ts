import { createRoute, z } from "@hono/zod-openapi";
import type { Db } from "../../db/client.ts";
import { notFound } from "../lib/errors.ts";
import { pageCollectionSchema, PageQuery } from "../lib/pagination.ts";
import type { AppEnv } from "../app.ts";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { getStation } from "../repos/hierarchy.ts";
import {
  getInstallationComposite,
  getLastKnownReading,
  listInstallations,
  visibleInstallationOrThrow,
} from "../repos/installations.ts";

const SiteParam = z.object({ "site-id": z.coerce.number().int().positive() });
const StationParam = z.object({
  "station-id": z.coerce.number().int().positive(),
});
const InstallationQuery = PageQuery.extend({
  "province-id": z.coerce.number().int().positive().optional(),
  "district-id": z.coerce.number().int().positive().optional(),
  "station-id": z.coerce.number().int().positive().optional(),
});
const ReadingSchema = z.object({
  reading_id: z.number().int(),
  site_id: z.number().int(),
  timestamp: z.string(),
  instantaneous_power_kw: z.number(),
  cumulative_energy_kwh: z.number(),
  voltage: z.number(),
});
const InstallationItemSchema = z.object({
  site_id: z.number().int(),
  address: z.string(),
  device_id: z.string(),
  station_id: z.number().int(),
});
const CompositeSchema = z.object({
  site_id: z.number().int(),
  address: z.string(),
  device_id: z.string(),
  station: z.object({ station_id: z.number().int(), name: z.string() }),
  district: z.object({ district_id: z.number().int(), name: z.string() }),
  province: z.object({ province_id: z.number().int(), name: z.string() }),
  last_known_reading: ReadingSchema.omit({ site_id: true }).nullable(),
});
const success = { description: "Successful response" };

export function registerInstallationReadRoutes(
  app: OpenAPIHono<AppEnv>,
  db: Db,
): void {
  const listRoute = createRoute({
    method: "get",
    path: "/api/v1/solar-installations",
    tags: ["Solar installations"],
    request: { query: InstallationQuery },
    responses: {
      200: {
        ...success,
        content: {
          "application/json": {
            schema: pageCollectionSchema(InstallationItemSchema),
          },
        },
      },
    },
  });
  app.openapi(listRoute, async (context) => {
    const query = context.req.valid("query");
    return context.json(
      await listInstallations(
        db,
        context.get("scope"),
        query,
        new URL(context.req.url),
        {
          province_id: query["province-id"],
          district_id: query["district-id"],
          station_id: query["station-id"],
        },
      ),
      200,
    );
  });

  const nestedListRoute = createRoute({
    method: "get",
    path: "/api/v1/grid-substations/{station-id}/solar-installations",
    tags: ["Solar installations"],
    request: { params: StationParam, query: PageQuery },
    responses: {
      200: {
        ...success,
        content: {
          "application/json": {
            schema: pageCollectionSchema(InstallationItemSchema),
          },
        },
      },
    },
  });
  app.openapi(nestedListRoute, async (context) => {
    const stationId = context.req.valid("param")["station-id"];
    if (!await getStation(db, context.get("scope"), stationId)) {
      throw notFound();
    }
    const page = context.req.valid("query");
    return context.json(
      await listInstallations(
        db,
        context.get("scope"),
        page,
        new URL(context.req.url),
        { station_id: stationId },
      ),
      200,
    );
  });

  const compositeRoute = createRoute({
    method: "get",
    path: "/api/v1/solar-installations/{site-id}",
    tags: ["Solar installations"],
    request: { params: SiteParam },
    responses: {
      200: {
        ...success,
        content: { "application/json": { schema: CompositeSchema } },
      },
    },
  });
  app.openapi(compositeRoute, async (context) => {
    const siteId = context.req.valid("param")["site-id"];
    const installation = await visibleInstallationOrThrow(
      db,
      context.get("scope"),
      siteId,
    );
    const composite = await getInstallationComposite(
      db,
      context.get("scope"),
      siteId,
    );
    if (!composite) throw notFound();
    const readingTimestamp = composite.last_known_reading?.timestamp;
    const readingTime = readingTimestamp ? Date.parse(readingTimestamp) : 0;
    const modifiedTime = Math.max(
      installation.updated_at.getTime(),
      readingTime,
    );
    return context.json(composite, 200, {
      "Last-Modified": new Date(modifiedTime).toUTCString(),
    });
  });

  const lastReadingRoute = createRoute({
    method: "get",
    path: "/api/v1/solar-installations/{site-id}/last-known-reading",
    tags: ["Generation readings"],
    request: { params: SiteParam },
    responses: {
      200: {
        ...success,
        content: { "application/json": { schema: ReadingSchema } },
      },
    },
  });
  app.openapi(lastReadingRoute, async (context) => {
    const siteId = context.req.valid("param")["site-id"];
    await visibleInstallationOrThrow(db, context.get("scope"), siteId);
    return context.json(await getLastKnownReading(db, siteId), 200);
  });
}
