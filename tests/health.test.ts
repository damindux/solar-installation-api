import { assertEquals, assertStringIncludes } from "@std/assert";
import { makeTestApp } from "./helpers.ts";

Deno.test("health endpoint reports a successful database probe", async () => {
  const { app } = makeTestApp(() => Promise.resolve([{ result: 1 }]));
  const response = await app.request("/health");

  assertEquals(response.status, 200);
  assertEquals(
    response.headers.get("content-type")?.includes("application/json"),
    true,
  );
  assertEquals(await response.json(), { status: "ok", db: "ok" });
});

Deno.test("health endpoint keeps liveness status when the database probe fails", async () => {
  const { app } = makeTestApp(() =>
    Promise.reject(new Error("database offline"))
  );
  const response = await app.request("/health");
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.status, "ok");
  assertEquals(body.db, "error");
  assertEquals(body.db_message, "database offline");
});

Deno.test("health endpoint times out a slow database probe", async () => {
  const { app } = makeTestApp(() => new Promise(() => {}));
  const response = await app.request("/health");
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.db, "error");
  assertStringIncludes(body.db_message, "timed out");
});
