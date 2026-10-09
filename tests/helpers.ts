import type { Db } from "../db/client.ts";
import type { AppConfig } from "../src/config.ts";
import { createApp } from "../src/app.ts";
import type { AppEnv } from "../src/app.ts";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import type { Scope } from "../src/lib/jurisdiction.ts";

export const testConfig: AppConfig = {
  port: 8000,
  databaseUrl: "postgres://test",
  runtimeDatabaseUrl: "postgres://test",
  jwtSecret: "test-secret",
};

export function makeTestApp(
  execute: () => Promise<unknown> = () => Promise.resolve([]),
) {
  const db = { execute } as unknown as Db;
  return { app: createApp({ db, config: testConfig }), db };
}

export async function makeTestToken(
  scope: Scope = { role: "national" },
  expiresAt = Math.floor(Date.now() / 1000) + 3600,
): Promise<string> {
  return await new SignJWT({ ...scope })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("1")
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(new TextEncoder().encode(testConfig.jwtSecret));
}

export async function authorizedRequest(
  app: OpenAPIHono<AppEnv>,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return await authorizedRequestWithScope(
    app,
    path,
    { role: "national" },
    init,
  );
}

export async function authorizedRequestWithScope(
  app: OpenAPIHono<AppEnv>,
  path: string,
  scope: Scope,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", "Bearer " + await makeTestToken(scope));
  return await app.request(path, { ...init, headers });
}
