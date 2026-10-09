import { createRoute, z } from "@hono/zod-openapi";
import type { Db } from "../../db/client.ts";
import type { AppEnv } from "../app.ts";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { colomboDayWindow } from "../lib/dates.ts";
import { notFound, validation } from "../lib/errors.ts";
import { errorResponses } from "../schemas/errors.ts";
import {
  getDistrict,
  getDistrictGenerationSummary,
} from "../repos/hierarchy.ts";

const DistrictParam = z.object({
  "district-id": z.coerce.number().int().positive(),
});
const SummaryQuery = z.object({
  date: z.string().optional().refine((value) => {
    if (value === undefined) return true;
    try {
      colomboDayWindow(value);
      return true;
    } catch {
      return false;
    }
  }, "Must be a real calendar date in YYYY-MM-DD format"),
});
const SummarySchema = z.object({
  district_id: z.number().int(),
  district_name: z.string(),
  generated_at: z.string(),
  date: z.string(),
  installation_count: z.number().int(),
  current_total_power_kw: z.number(),
  today_total_energy_kwh: z.number(),
});

export function registerGenerationSummaryRoute(
  app: OpenAPIHono<AppEnv>,
  db: Db,
): void {
  const route = createRoute({
    method: "get",
    path: "/api/v1/districts/{district-id}/generation-summary",
    tags: ["Generation summary"],
    security: [{ bearerAuth: [] }],
    request: { params: DistrictParam, query: SummaryQuery },
    responses: {
      ...errorResponses,
      200: {
        description: "District generation summary",
        content: { "application/json": { schema: SummarySchema } },
      },
    },
  });
  app.openapi(route, async (context) => {
    const districtId = context.req.valid("param")["district-id"];
    const district = await getDistrict(db, context.get("scope"), districtId);
    if (!district) throw notFound();
    let window;
    try {
      window = colomboDayWindow(context.req.valid("query").date);
    } catch {
      throw validation([{
        field: "date",
        message: "Must be a real calendar date in YYYY-MM-DD format",
      }]);
    }
    const summary = await getDistrictGenerationSummary(
      db,
      districtId,
      window.date,
      window.start,
      window.end,
    );
    return context.json({
      district_id: district.district_id,
      district_name: district.name,
      generated_at: new Date().toISOString(),
      ...summary,
    }, 200);
  });
}
