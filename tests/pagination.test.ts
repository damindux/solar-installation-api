import { assertEquals } from "@std/assert";
import { envelope, PageQuery } from "../src/lib/pagination.ts";

Deno.test("pagination links preserve filters and other query values", () => {
  const url = new URL(
    "https://example.test/api/v1/districts?province-id=2&sort=name",
  );
  const first = envelope(url, ["a"], 45, { offset: 0, limit: 20 });
  assertEquals(
    first.next,
    "/api/v1/districts?province-id=2&sort=name&offset=20&limit=20",
  );
  assertEquals(first.previous, null);

  const middle = envelope(url, ["b"], 45, { offset: 20, limit: 20 });
  assertEquals(
    middle.next,
    "/api/v1/districts?province-id=2&sort=name&offset=40&limit=20",
  );
  assertEquals(
    middle.previous,
    "/api/v1/districts?province-id=2&sort=name&offset=0&limit=20",
  );

  const last = envelope(url, ["c"], 45, { offset: 40, limit: 20 });
  assertEquals(last.next, null);
  assertEquals(
    last.previous,
    "/api/v1/districts?province-id=2&sort=name&offset=20&limit=20",
  );
});

Deno.test("pagination supports offsets beyond the last item", () => {
  const result = envelope(
    new URL("https://example.test/api/v1/provinces"),
    [],
    9,
    { offset: 100, limit: 20 },
  );
  assertEquals(result.data, []);
  assertEquals(result.count, 9);
  assertEquals(result.next, null);
  assertEquals(result.previous, "/api/v1/provinces?offset=80&limit=20");
});

Deno.test("pagination query validates offset and limit bounds", () => {
  assertEquals(PageQuery.safeParse({}).success, true);
  assertEquals(
    PageQuery.safeParse({ offset: "0", limit: "100" }).success,
    true,
  );
  assertEquals(PageQuery.safeParse({ offset: "-1" }).success, false);
  assertEquals(PageQuery.safeParse({ limit: "0" }).success, false);
  assertEquals(PageQuery.safeParse({ limit: "101" }).success, false);
});
