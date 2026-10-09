import { createRoute, z } from "@hono/zod-openapi";
import type { Db } from "../../db/client.ts";
import type { AppEnv } from "../app.ts";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { pageCollectionSchema, PageQuery } from "../lib/pagination.ts";
import { getReading, listReadings } from "../repos/readings.ts";

const SiteParam = z.object({ "site-id": z.coerce.number().int().positive() });
const ReadingParam = SiteParam.extend({
  "reading-id": z.coerce.number().int().positive(),
});
const ReadingQuery = PageQuery.extend({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  sort: z.enum(["timestamp_asc", "timestamp_desc"]).default("timestamp_desc"),
}).superRefine((query, context) => {
  if (
    query.from && query.to && Date.parse(query.from) >= Date.parse(query.to)
  ) {
    context.addIssue({
      code: "custom",
      path: ["from"],
      message: "from must be earlier than to",
    });
  }
});
const ReadingSchema = z.object({
  reading_id: z.number().int(),
  site_id: z.number().int(),
  timestamp: z.string(),
  instantaneous_power_kw: z.number(),
  cumulative_energy_kwh: z.number(),
  voltage: z.number(),
});
const success = { description: "Successful response" };

export function registerReadingReadRoutes(
  app: OpenAPIHono<AppEnv>,
  db: Db,
): void {
  const listRoute = createRoute({
    method: "get",
    path: "/api/v1/solar-installations/{site-id}/generation-readings",
    tags: ["Generation readings"],
    request: { params: SiteParam, query: ReadingQuery },
    responses: {
      200: {
        ...success,
        content: {
          "application/json": { schema: pageCollectionSchema(ReadingSchema) },
        },
      },
    },
  });
  app.openapi(listRoute, async (context) => {
    const siteId = context.req.valid("param")["site-id"];
    const query = context.req.valid("query");
    return context.json(
      await listReadings(
        db,
        context.get("scope"),
        siteId,
        query,
        new URL(context.req.url),
        {
          from: query.from,
          to: query.to,
          sort: query.sort,
        },
      ),
      200,
    );
  });

  const singleRoute = createRoute({
    method: "get",
    path:
      "/api/v1/solar-installations/{site-id}/generation-readings/{reading-id}",
    tags: ["Generation readings"],
    request: { params: ReadingParam },
    responses: {
      200: {
        ...success,
        content: { "application/json": { schema: ReadingSchema } },
      },
    },
  });
  app.openapi(singleRoute, async (context) => {
    const params = context.req.valid("param");
    return context.json(
      await getReading(
        db,
        context.get("scope"),
        params["site-id"],
        params["reading-id"],
      ),
      200,
    );
  });
}
