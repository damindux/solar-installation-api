import type { Db } from "../db/client.ts";
import type { AppConfig } from "../src/config.ts";
import { createApp } from "../src/app.ts";

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
