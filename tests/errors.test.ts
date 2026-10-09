import { assertEquals } from "@std/assert";
import { makeTestApp } from "./helpers.ts";

Deno.test("unknown routes return the standard not-found error body", async () => {
  const { app } = makeTestApp();
  const response = await app.request("/unknown");
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
  const response = await app.request("/explode");
  const body = await response.json();

  assertEquals(response.status, 500);
  assertEquals(body.code, 50000);
  assertEquals(body.message, "Internal Server Error");
  assertEquals(JSON.stringify(body).includes("private database detail"), false);
});

Deno.test("API rejects an unacceptable response format", async () => {
  const { app } = makeTestApp();
  const response = await app.request("/api/v1", {
    headers: { Accept: "text/html" },
  });
  const body = await response.json();

  assertEquals(response.status, 406);
  assertEquals(body.code, 40601);
});

Deno.test("API rejects a non-JSON request body", async () => {
  const { app } = makeTestApp();
  const response = await app.request("/api/v1/unknown", { method: "POST" });
  const body = await response.json();

  assertEquals(response.status, 415);
  assertEquals(body.code, 41501);
});
