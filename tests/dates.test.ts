import { assertEquals, assertThrows } from "@std/assert";
import { colomboDayWindow } from "../src/lib/dates.ts";

Deno.test("Colombo day window handles UTC midnight boundaries", () => {
  const beforeMidnight = colomboDayWindow(
    undefined,
    new Date("2026-10-05T18:29:59Z"),
  );
  const atMidnight = colomboDayWindow(
    undefined,
    new Date("2026-10-05T18:30:00Z"),
  );
  assertEquals(beforeMidnight.date, "2026-10-05");
  assertEquals(beforeMidnight.start.toISOString(), "2026-10-04T18:30:00.000Z");
  assertEquals(beforeMidnight.end.toISOString(), "2026-10-05T18:30:00.000Z");
  assertEquals(atMidnight.date, "2026-10-06");
});

Deno.test("Colombo day window rejects impossible calendar dates", () => {
  assertThrows(() => colomboDayWindow("2026-02-30"), RangeError);
  assertThrows(() => colomboDayWindow("06-10-2026"), RangeError);
});
