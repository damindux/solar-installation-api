import { eq } from "drizzle-orm";
import type { Db } from "../../db/client.ts";
import { districts, gridSubstations, users } from "../../db/schema.ts";
import type { Scope } from "../lib/jurisdiction.ts";

export async function getUserByUsername(db: Db, username: string) {
  const [user] = await db.select().from(users).where(
    eq(users.username, username),
  ).limit(1);
  return user ?? null;
}

export async function getUserScope(
  db: Db,
  user: typeof users.$inferSelect,
): Promise<Scope> {
  if (user.role === "national") return { role: "national" };
  if (user.role === "provincial" && user.province_id !== null) {
    return { role: "provincial", province_id: user.province_id };
  }
  if (user.role === "district" && user.district_id !== null) {
    const [district] = await db.select({ province_id: districts.province_id })
      .from(districts).where(eq(districts.district_id, user.district_id)).limit(
        1,
      );
    if (district) {
      return {
        role: "district",
        province_id: district.province_id,
        district_id: user.district_id,
      };
    }
  }
  if (user.role === "station" && user.station_id !== null) {
    const [station] = await db.select({
      district_id: gridSubstations.district_id,
      province_id: districts.province_id,
    }).from(gridSubstations)
      .innerJoin(
        districts,
        eq(districts.district_id, gridSubstations.district_id),
      )
      .where(eq(gridSubstations.station_id, user.station_id)).limit(1);
    if (station) {
      return {
        role: "station",
        province_id: station.province_id,
        district_id: station.district_id,
        station_id: user.station_id,
      };
    }
  }
  throw new Error("User role or jurisdiction scope is inconsistent");
}
