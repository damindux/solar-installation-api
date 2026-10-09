import { jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import type { AppConfig } from "../config.ts";
import { forbidden, unauthorized } from "../lib/errors.ts";
import type { Scope } from "../lib/jurisdiction.ts";

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function scopeFromClaims(claims: Record<string, unknown>): Scope | null {
  if (claims.role === "national") return { role: "national" };
  if (claims.role === "provincial" && positiveInteger(claims.province_id)) {
    return { role: "provincial", province_id: claims.province_id };
  }
  if (
    claims.role === "district" && positiveInteger(claims.province_id) &&
    positiveInteger(claims.district_id)
  ) {
    return {
      role: "district",
      province_id: claims.province_id,
      district_id: claims.district_id,
    };
  }
  if (
    claims.role === "station" && positiveInteger(claims.province_id) &&
    positiveInteger(claims.district_id) && positiveInteger(claims.station_id)
  ) {
    return {
      role: "station",
      province_id: claims.province_id,
      district_id: claims.district_id,
      station_id: claims.station_id,
    };
  }
  return null;
}

function isDeviceIngestRequest(path: string, method: string): boolean {
  return method === "POST" &&
    /^\/api\/v1\/solar-installations\/\d+\/generation-readings$/.test(path);
}

export function requireUser(config: AppConfig): MiddlewareHandler {
  const key = new TextEncoder().encode(config.jwtSecret);
  return async (context, next) => {
    const path = context.req.path;
    if (
      path === "/api/v1" || path === "/api/v1/auth/login" ||
      isDeviceIngestRequest(path, context.req.method)
    ) {
      await next();
      return;
    }

    const authorization = context.req.header("Authorization");
    if (!authorization) throw unauthorized(40101, "Missing bearer credentials");
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    if (!match) throw unauthorized(40102, "Invalid bearer credentials");
    const token = match[1];
    if (token.startsWith("slsea_dev_")) {
      throw forbidden(40301, "Device credentials cannot access this resource");
    }

    try {
      const { payload } = await jwtVerify(token, key, {
        algorithms: ["HS256"],
      });
      if (
        typeof payload.sub !== "string" || !positiveInteger(Number(payload.sub))
      ) {
        throw new Error("Token subject is invalid");
      }
      const scope = scopeFromClaims(payload);
      if (!scope) throw new Error("Token scope is invalid");
      context.set("scope", scope);
    } catch {
      throw unauthorized(40102, "Invalid or expired bearer token");
    }
    await next();
  };
}
