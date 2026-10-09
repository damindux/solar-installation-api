import { createRoute, z } from "@hono/zod-openapi";
import type { Db } from "../../db/client.ts";
import { notFound } from "../lib/errors.ts";
import { pageCollectionSchema, PageQuery } from "../lib/pagination.ts";
import {
  getDistrict,
  getProvince,
  getStation,
  listDistricts,
  listProvinces,
  listStations,
} from "../repos/hierarchy.ts";
import type { AppEnv } from "../app.ts";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { errorResponses } from "../schemas/errors.ts";

const ProvinceSchema = z.object({
  province_id: z.number().int(),
  name: z.string(),
});
const DistrictSchema = z.object({
  district_id: z.number().int(),
  name: z.string(),
  province_id: z.number().int(),
});
const StationSchema = z.object({
  station_id: z.number().int(),
  name: z.string(),
  district_id: z.number().int(),
});
const ProvinceParam = z.object({
  "province-id": z.coerce.number().int().positive(),
});
const DistrictParam = z.object({
  "district-id": z.coerce.number().int().positive(),
});
const StationParam = z.object({
  "station-id": z.coerce.number().int().positive(),
});
const CollectionQuery = PageQuery.extend({
  "province-id": z.coerce.number().int().positive().optional(),
  "district-id": z.coerce.number().int().positive().optional(),
});
const okDescription = { description: "Successful response" };

function routeOptions(method: "get", path: string) {
  return {
    method,
    path,
    tags: ["Geography"],
    security: [{ bearerAuth: [] }],
  };
}

export function registerHierarchyRoutes(
  app: OpenAPIHono<AppEnv>,
  db: Db,
): void {
  const provincesRoute = createRoute({
    ...routeOptions("get", "/api/v1/provinces"),
    request: { query: PageQuery },
    responses: {
      ...errorResponses,
      200: {
        ...okDescription,
        content: {
          "application/json": { schema: pageCollectionSchema(ProvinceSchema) },
        },
      },
    },
  });
  app.openapi(provincesRoute, async (context) => {
    const page = context.req.valid("query");
    return context.json(
      await listProvinces(
        db,
        context.get("scope"),
        page,
        new URL(context.req.url),
      ),
      200,
    );
  });

  const provinceRoute = createRoute({
    ...routeOptions("get", "/api/v1/provinces/{province-id}"),
    request: { params: ProvinceParam },
    responses: {
      ...errorResponses,
      200: {
        ...okDescription,
        content: { "application/json": { schema: ProvinceSchema } },
      },
    },
  });
  app.openapi(provinceRoute, async (context) => {
    const id = context.req.valid("param")["province-id"];
    const row = await getProvince(db, context.get("scope"), id);
    if (!row) throw notFound();
    return context.json(row, 200);
  });

  const provinceDistrictsRoute = createRoute({
    ...routeOptions("get", "/api/v1/provinces/{province-id}/districts"),
    request: { params: ProvinceParam, query: PageQuery },
    responses: {
      ...errorResponses,
      200: {
        ...okDescription,
        content: {
          "application/json": { schema: pageCollectionSchema(DistrictSchema) },
        },
      },
    },
  });
  app.openapi(provinceDistrictsRoute, async (context) => {
    const provinceId = context.req.valid("param")["province-id"];
    if (!await getProvince(db, context.get("scope"), provinceId)) {
      throw notFound();
    }
    const page = context.req.valid("query");
    return context.json(
      await listDistricts(
        db,
        context.get("scope"),
        page,
        new URL(context.req.url),
        { province_id: provinceId },
      ),
      200,
    );
  });

  const districtsRoute = createRoute({
    ...routeOptions("get", "/api/v1/districts"),
    request: { query: CollectionQuery },
    responses: {
      ...errorResponses,
      200: {
        ...okDescription,
        content: {
          "application/json": { schema: pageCollectionSchema(DistrictSchema) },
        },
      },
    },
  });
  app.openapi(districtsRoute, async (context) => {
    const query = context.req.valid("query");
    return context.json(
      await listDistricts(
        db,
        context.get("scope"),
        query,
        new URL(context.req.url),
        {
          province_id: query["province-id"],
        },
      ),
      200,
    );
  });

  const districtRoute = createRoute({
    ...routeOptions("get", "/api/v1/districts/{district-id}"),
    request: { params: DistrictParam },
    responses: {
      ...errorResponses,
      200: {
        ...okDescription,
        content: { "application/json": { schema: DistrictSchema } },
      },
    },
  });
  app.openapi(districtRoute, async (context) => {
    const id = context.req.valid("param")["district-id"];
    const row = await getDistrict(db, context.get("scope"), id);
    if (!row) throw notFound();
    return context.json(row, 200);
  });

  const districtStationsRoute = createRoute({
    ...routeOptions("get", "/api/v1/districts/{district-id}/grid-substations"),
    request: { params: DistrictParam, query: PageQuery },
    responses: {
      ...errorResponses,
      200: {
        ...okDescription,
        content: {
          "application/json": { schema: pageCollectionSchema(StationSchema) },
        },
      },
    },
  });
  app.openapi(districtStationsRoute, async (context) => {
    const districtId = context.req.valid("param")["district-id"];
    if (!await getDistrict(db, context.get("scope"), districtId)) {
      throw notFound();
    }
    const page = context.req.valid("query");
    return context.json(
      await listStations(
        db,
        context.get("scope"),
        page,
        new URL(context.req.url),
        { district_id: districtId },
      ),
      200,
    );
  });

  const stationsRoute = createRoute({
    ...routeOptions("get", "/api/v1/grid-substations"),
    request: { query: CollectionQuery },
    responses: {
      ...errorResponses,
      200: {
        ...okDescription,
        content: {
          "application/json": { schema: pageCollectionSchema(StationSchema) },
        },
      },
    },
  });
  app.openapi(stationsRoute, async (context) => {
    const query = context.req.valid("query");
    return context.json(
      await listStations(
        db,
        context.get("scope"),
        query,
        new URL(context.req.url),
        {
          district_id: query["district-id"],
          province_id: query["province-id"],
        },
      ),
      200,
    );
  });

  const stationRoute = createRoute({
    ...routeOptions("get", "/api/v1/grid-substations/{station-id}"),
    request: { params: StationParam },
    responses: {
      ...errorResponses,
      200: {
        ...okDescription,
        content: { "application/json": { schema: StationSchema } },
      },
    },
  });
  app.openapi(stationRoute, async (context) => {
    const id = context.req.valid("param")["station-id"];
    const row = await getStation(db, context.get("scope"), id);
    if (!row) throw notFound();
    return context.json(row, 200);
  });
}
