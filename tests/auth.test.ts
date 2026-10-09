import { assertEquals } from "@std/assert";
import { makeTestApp, makeTestToken } from "./helpers.ts";

Deno.test("protected API requests require a bearer token", async () => {
  const { app } = makeTestApp();
  const response = await app.request("/api/v1/private-resource");
  const body = await response.json();

  assertEquals(response.status, 401);
  assertEquals(
    response.headers.get("www-authenticate"),
    'Bearer realm="slsea-api"',
  );
  assertEquals(body.code, 40101);
});

Deno.test("device and invalid credentials are rejected on user routes", async () => {
  const { app } = makeTestApp();
  const device = await app.request("/api/v1/private-resource", {
    headers: { Authorization: "Bearer slsea_dev_example" },
  });
  const invalid = await app.request("/api/v1/private-resource", {
    headers: { Authorization: "Bearer not-a-jwt" },
  });

  assertEquals(device.status, 403);
  assertEquals((await device.json()).code, 40301);
  assertEquals(invalid.status, 401);
  assertEquals((await invalid.json()).code, 40102);
});

Deno.test("valid tokens provide their jurisdiction scope to routes", async () => {
  const { app } = makeTestApp();
  app.get(
    "/api/v1/test-scope",
    (context) => context.json(context.get("scope")),
  );
  const token = await makeTestToken({
    role: "district",
    province_id: 1,
    district_id: 1,
  });
  const response = await app.request("/api/v1/test-scope", {
    headers: { Authorization: "Bearer " + token },
  });

  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    role: "district",
    province_id: 1,
    district_id: 1,
  });
});

Deno.test("login validates its body before looking up a user", async () => {
  const { app } = makeTestApp();
  const response = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "", password: "" }),
  });

  assertEquals(response.status, 400);
  assertEquals((await response.json()).code, 40001);
});
