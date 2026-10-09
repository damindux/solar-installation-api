import { authorizedRequest } from "./helpers.ts";
import { assertEquals } from "@std/assert";
import { makeTestApp } from "./helpers.ts";
import { etagOf } from "../src/lib/hash.ts";
import { HTTPException } from "hono/http-exception";

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

Deno.test("thrown not-found exceptions use the resource not-found response", async () => {
  const { app } = makeTestApp();
  app.get("/throws-not-found", () => {
    throw new HTTPException(404, { message: "Route resource is missing" });
  });
  const response = await authorizedRequest(app, "/throws-not-found");
  const body = await response.json();

  assertEquals(response.status, 404);
  assertEquals(body.code, 40401);
  assertEquals(body.message, "Resource not found");
});

Deno.test("HTTP exceptions map to standard request error responses", async () => {
  const { app } = makeTestApp();
  const cases = [
    { status: 400, code: 40001, message: "Invalid request" },
    { status: 403, code: 40301, message: "Access denied" },
    { status: 405, code: 40501, message: "Invalid HTTP method" },
    { status: 406, code: 40601, message: "Not acceptable" },
    { status: 415, code: 41501, message: "Unsupported media type" },
  ] as const;

  for (const item of cases) {
    app.get(`/throws-${item.status}`, () => {
      throw new HTTPException(item.status);
    });
  }

  for (const item of cases) {
    const response = await authorizedRequest(app, `/throws-${item.status}`);
    const body = await response.json();

    assertEquals(response.status, item.status);
    assertEquals(body.code, item.code);
    assertEquals(body.message, item.message);
  }
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

Deno.test("conditional GET uses strong entity tags and honors precedence", async () => {
  const { app } = makeTestApp();
  app.get("/api/v1/conditional", (context) =>
    context.json({ value: 1 }, 200, {
      "Last-Modified": "Wed, 21 Oct 2015 07:28:00 GMT",
    }));
  const first = await authorizedRequest(app, "/api/v1/conditional");
  const etag = first.headers.get("etag");
  assertEquals(etag, await etagOf('{"value":1}'));

  const matched = await authorizedRequest(app, "/api/v1/conditional", {
    headers: { "If-None-Match": `W/${etag}` },
  });
  assertEquals(matched.status, 304);
  assertEquals(await matched.text(), "");
  assertEquals(matched.headers.get("etag"), etag);

  const wildcard = await authorizedRequest(app, "/api/v1/conditional", {
    headers: { "If-None-Match": "*" },
  });
  assertEquals(wildcard.status, 304);

  const precedence = await authorizedRequest(app, "/api/v1/conditional", {
    headers: {
      "If-None-Match": '"different"',
      "If-Modified-Since": new Date(Date.now() + 60_000).toUTCString(),
    },
  });
  assertEquals(precedence.status, 200);

  const dateMatch = await authorizedRequest(app, "/api/v1/conditional", {
    headers: { "If-Modified-Since": "Wed, 21 Oct 2015 07:28:00 GMT" },
  });
  assertEquals(dateMatch.status, 304);
});
