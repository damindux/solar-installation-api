import { createRoute, z } from "@hono/zod-openapi";
import type { Db } from "../../db/client.ts";
import type { AppEnv } from "../app.ts";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { errorResponses } from "../schemas/errors.ts";
import { etagOf } from "../lib/hash.ts";
import { createReading } from "../repos/readings.ts";

const SiteParam = z.object({ "site-id": z.coerce.number().int().positive() });
const ReadingBody = z.object({
  timestamp: z.iso.datetime().refine(
    (value) => Date.parse(value) <= Date.now() + 5 * 60 * 1000,
    "Timestamp must not be more than five minutes in the future",
  ),
  instantaneous_power_kw: z.number().nonnegative(),
  cumulative_energy_kwh: z.number().nonnegative(),
  voltage: z.number().positive(),
});
const ReadingSchema = z.object({
  reading_id: z.number().int(),
  site_id: z.number().int(),
  timestamp: z.string(),
  instantaneous_power_kw: z.number(),
  cumulative_energy_kwh: z.number(),
  voltage: z.number(),
});

export function registerGenerationWriteRoute(
  app: OpenAPIHono<AppEnv>,
  db: Db,
): void {
  const route = createRoute({
    method: "post",
    path: "/api/v1/solar-installations/{site-id}/generation-readings",
    tags: ["Generation readings"],
    security: [{ bearerAuth: [] }],
    request: {
      params: SiteParam,
      body: { content: { "application/json": { schema: ReadingBody } } },
    },
    responses: {
      ...errorResponses,
      201: {
        description: "Reading accepted",
        content: { "application/json": { schema: ReadingSchema } },
      },
    },
  });

  app.openapi(route, async (context) => {
    const siteId = context.req.valid("param")["site-id"];
    const body = context.req.valid("json");
    const reading = await createReading(db, siteId, {
      ...body,
      timestamp: new Date(body.timestamp),
    });
    const location = "/api/v1/solar-installations/" + siteId +
      "/generation-readings/" + reading.reading_id;
    return context.json(reading, 201, {
      Location: location,
      "Content-Location": location,
      ETag: await etagOf(JSON.stringify(reading)),
      "Last-Modified": new Date(reading.timestamp).toUTCString(),
    });
  });
}
