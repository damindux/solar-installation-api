import { assertEquals, assertExists } from "@std/assert";
import { makeTestApp } from "./helpers.ts";

Deno.test("OpenAPI 3.1 publishes the API catalogue and bearer security", async () => {
  const { app } = makeTestApp();
  const response = await app.request("/openapi.json");
  const document = await response.json();

  assertEquals(response.status, 200);
  assertEquals((await app.request("/api/v1/openapi.json")).status, 200);
  assertEquals(document.openapi, "3.1.0");
  const expectedPaths = [
    "/api/v1",
    "/api/v1/auth/login",
    "/api/v1/provinces",
    "/api/v1/provinces/{province-id}",
    "/api/v1/provinces/{province-id}/districts",
    "/api/v1/districts",
    "/api/v1/districts/{district-id}",
    "/api/v1/districts/{district-id}/grid-substations",
    "/api/v1/districts/{district-id}/generation-summary",
    "/api/v1/grid-substations",
    "/api/v1/grid-substations/{station-id}",
    "/api/v1/grid-substations/{station-id}/solar-installations",
    "/api/v1/solar-installations",
    "/api/v1/solar-installations/{site-id}",
    "/api/v1/solar-installations/{site-id}/last-known-reading",
    "/api/v1/solar-installations/{site-id}/generation-readings",
    "/api/v1/solar-installations/{site-id}/generation-readings/{reading-id}",
  ];
  for (const path of expectedPaths) assertExists(document.paths[path], path);

  assertEquals(
    document.components.securitySchemes.bearerAuth.scheme,
    "bearer",
  );
  assertExists(
    document.paths["/api/v1/solar-installations/{site-id}"].get.security,
  );
  assertEquals(
    document.paths["/api/v1/auth/login"].post.security,
    undefined,
  );
  assertEquals(document.info.description.includes("## Errors"), true);
});

Deno.test("Swagger UI is served at /docs", async () => {
  const { app } = makeTestApp();
  const response = await app.request("/docs");
  assertEquals(response.status, 200);
  assertEquals((await response.text()).includes("swagger-ui"), true);
});
