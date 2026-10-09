import { createRoute, z } from "@hono/zod-openapi";
import type { Db } from "../../db/client.ts";
import type { AppEnv } from "../app.ts";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { etagOf, randomToken, sha256Hex } from "../lib/hash.ts";
import { preconditionFailed, unprocessable } from "../lib/errors.ts";
import { getStation } from "../repos/hierarchy.ts";
import type { Scope } from "../lib/jurisdiction.ts";
import {
  createInstallation,
  deleteInstallation,
  getInstallationComposite,
  replaceInstallation,
  visibleInstallationOrThrow,
} from "../repos/installations.ts";

const SiteParam = z.object({ "site-id": z.coerce.number().int().positive() });
const InstallationBody = z.object({
  address: z.string().trim().min(1).max(255),
  device_id: z.string().trim().min(1).max(100),
  station_id: z.coerce.number().int().positive(),
});
const InstallationSchema = z.object({
  site_id: z.number().int(),
  address: z.string(),
  device_id: z.string(),
  station_id: z.number().int(),
});
const CreatedInstallationSchema = InstallationSchema.extend({
  device_token: z.string(),
});
const success = { description: "Successful response" };

async function checkWritePreconditions(
  context: {
    req: { header: (name: string) => string | undefined };
    get: (key: "scope") => Scope;
  },
  db: Db,
  siteId: number,
  updatedAt: Date,
): Promise<void> {
  const ifMatch = context.req.header("If-Match");
  if (ifMatch !== undefined) {
    const current = await getInstallationComposite(
      db,
      context.get("scope"),
      siteId,
    );
    if (!current) throw preconditionFailed();
    const currentTag = await etagOf(JSON.stringify(current));
    const matches = ifMatch.split(",").some((tag) =>
      tag.trim() === "*" || tag.trim() === currentTag
    );
    if (!matches) throw preconditionFailed();
  } else {
    const ifUnmodifiedSince = context.req.header("If-Unmodified-Since");
    if (ifUnmodifiedSince) {
      const requestedAt = Date.parse(ifUnmodifiedSince);
      if (
        !Number.isNaN(requestedAt) &&
        Math.floor(updatedAt.getTime() / 1000) * 1000 > requestedAt
      ) {
        throw preconditionFailed();
      }
    }
  }
}

export function registerInstallationWriteRoutes(
  app: OpenAPIHono<AppEnv>,
  db: Db,
): void {
  const createRouteDefinition = createRoute({
    method: "post",
    path: "/api/v1/solar-installations",
    tags: ["Solar installations"],
    request: {
      body: { content: { "application/json": { schema: InstallationBody } } },
    },
    responses: {
      201: {
        ...success,
        content: { "application/json": { schema: CreatedInstallationSchema } },
      },
    },
  });
  app.openapi(createRouteDefinition, async (context) => {
    const body = context.req.valid("json");
    if (!await getStation(db, context.get("scope"), body.station_id)) {
      throw unprocessable(
        "Referenced substation does not exist or is outside your jurisdiction",
      );
    }
    const deviceToken = randomToken();
    const created = await createInstallation(db, {
      ...body,
      device_token_hash: await sha256Hex(deviceToken),
    });
    const responseBody = {
      site_id: created.site_id,
      address: created.address,
      device_id: created.device_id,
      station_id: created.station_id,
      device_token: deviceToken,
    };
    const location = "/api/v1/solar-installations/" + created.site_id;
    const headers = {
      Location: location,
      "Content-Location": location,
      ETag: await etagOf(JSON.stringify(responseBody)),
      "Last-Modified": created.updated_at.toUTCString(),
    };
    return context.json(responseBody, 201, headers);
  });

  const replaceRoute = createRoute({
    method: "put",
    path: "/api/v1/solar-installations/{site-id}",
    tags: ["Solar installations"],
    request: {
      params: SiteParam,
      body: { content: { "application/json": { schema: InstallationBody } } },
    },
    responses: {
      200: {
        ...success,
        content: { "application/json": { schema: InstallationSchema } },
      },
    },
  });
  app.openapi(replaceRoute, async (context) => {
    const siteId = context.req.valid("param")["site-id"];
    const current = await visibleInstallationOrThrow(
      db,
      context.get("scope"),
      siteId,
    );
    await checkWritePreconditions(context, db, siteId, current.updated_at);
    const body = context.req.valid("json");
    if (!await getStation(db, context.get("scope"), body.station_id)) {
      throw unprocessable(
        "Referenced substation does not exist or is outside your jurisdiction",
      );
    }
    const updated = await replaceInstallation(db, siteId, body);
    if (!updated) throw unprocessable();
    const representation = await getInstallationComposite(
      db,
      context.get("scope"),
      siteId,
    );
    return context.json(
      updated,
      200,
      representation
        ? {
          ETag: await etagOf(JSON.stringify(representation)),
          "Last-Modified": new Date().toUTCString(),
        }
        : {},
    );
  });

  const deleteRoute = createRoute({
    method: "delete",
    path: "/api/v1/solar-installations/{site-id}",
    tags: ["Solar installations"],
    request: { params: SiteParam },
    responses: {
      200: {
        ...success,
        content: {
          "application/json": {
            schema: z.object({
              site_id: z.number().int(),
              deleted: z.literal(true),
            }),
          },
        },
      },
    },
  });
  app.openapi(deleteRoute, async (context) => {
    const siteId = context.req.valid("param")["site-id"];
    const current = await visibleInstallationOrThrow(
      db,
      context.get("scope"),
      siteId,
    );
    await checkWritePreconditions(context, db, siteId, current.updated_at);
    if (!await deleteInstallation(db, siteId)) throw unprocessable();
    return context.json({ site_id: siteId, deleted: true as const }, 200);
  });
}
