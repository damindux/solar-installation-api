import { assertEquals } from "@std/assert";
import { makeTestApp } from "./tests/helpers.ts";

Deno.test("root returns the welcome page", async () => {
  const { app } = makeTestApp();
  const response = await app.request("/");
  assertEquals(
    response.headers.get("content-type")?.includes("text/html"),
    true,
  );
  assertEquals((await response.text()).includes("Welcome to Deno"), true);
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
