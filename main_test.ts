import { assertEquals } from "@std/assert";
import { makeTestApp } from "./tests/helpers.ts";

Deno.test("root links to the API documentation", async () => {
  const { app } = makeTestApp();
  const response = await app.request("/");
  assertEquals(
    response.headers.get("content-type")?.includes("text/html"),
    true,
  );
  const body = await response.text();
  assertEquals(body.includes("SLSEA Solar Generation API"), true);
  assertEquals(body.includes('href="/docs"'), true);
  assertEquals(body.includes("OpenAPI documentation"), true);
});

Deno.test("versioned API info is public JSON", async () => {
  const { app } = makeTestApp();
  const response = await app.request("/api/v1");
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("cache-control"), "private, no-cache");
  assertEquals(response.headers.get("vary"), "Authorization, Accept");
  assertEquals(await response.json(), {
    name: "Solar Generation API",
    version: "1.0.0",
    docs: "/docs",
  });
});
