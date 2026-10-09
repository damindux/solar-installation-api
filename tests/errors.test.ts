import { authorizedRequest } from "./helpers.ts";
import { assertEquals } from "@std/assert";
import { makeTestApp } from "./helpers.ts";

Deno.test("unknown routes return the standard not-found error body", async () => {
  const { app } = makeTestApp();
  const response = await authorizedRequest(app, "/unknown");
  const body = await response.json();

  assertEquals(response.status, 404);
  assertEquals(body.code, 40401);
  assertEquals(body.message, "Resource not found");
  assertEquals(Array.isArray(body.error), true);
});

Deno.test("unexpected errors return a generic body without leaking details", async () => {
  const { app } = makeTestApp();
  app.get("/explode", () => {
    throw new Error("private database detail");
  });
  const response = await authorizedRequest(app, "/explode");
  const body = await response.json();

  assertEquals(response.status, 500);
  assertEquals(body.code, 50000);
  assertEquals(body.message, "Internal Server Error");
  assertEquals(JSON.stringify(body).includes("private database detail"), false);
});

Deno.test("API rejects an unacceptable response format", async () => {
  const { app } = makeTestApp();
  const response = await authorizedRequest(app, "/api/v1", {
    headers: { Accept: "text/html" },
  });
  const body = await response.json();

  assertEquals(response.status, 406);
  assertEquals(body.code, 40601);
});

Deno.test("API rejects a non-JSON request body", async () => {
  const { app } = makeTestApp();
  const response = await authorizedRequest(app, "/api/v1/unknown", {
    method: "POST",
  });
  const body = await response.json();

  assertEquals(response.status, 415);
  assertEquals(body.code, 41501);
});

Deno.test("invalid hierarchy ids and page limits return validation errors", async () => {
  const { app } = makeTestApp();
  const badId = await authorizedRequest(app, "/api/v1/provinces/0");
  const badLimit = await authorizedRequest(app, "/api/v1/provinces?limit=101");

  assertEquals(badId.status, 400);
  assertEquals((await badId.json()).code, 40001);
  assertEquals(badLimit.status, 400);
  assertEquals((await badLimit.json()).code, 40001);
});

Deno.test("reading history rejects invalid sort and time windows", async () => {
  const { app } = makeTestApp();
  const badSort = await authorizedRequest(
    app,
    "/api/v1/solar-installations/1/generation-readings?sort=oldest",
  );
  const badWindow = await authorizedRequest(
    app,
    "/api/v1/solar-installations/1/generation-readings?from=2026-10-04T00%3A00%3A00Z&to=2026-10-03T00%3A00%3A00Z",
  );

  assertEquals(badSort.status, 400);
  assertEquals((await badSort.json()).code, 40001);
  assertEquals(badWindow.status, 400);
  assertEquals((await badWindow.json()).code, 40001);
});
