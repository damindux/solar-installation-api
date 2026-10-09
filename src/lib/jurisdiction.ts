import { eq } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { districts, gridSubstations, provinces } from "../../db/schema.ts";

export type Scope =
  | { role: "national" }
  | { role: "provincial"; province_id: number }
  | { role: "district"; province_id: number; district_id: number }
  | {
    role: "station";
    province_id: number;
    district_id: number;
    station_id: number;
  };

export function provinceVisible(scope: Scope): SQL | undefined {
  return scope.role === "national"
    ? undefined
    : eq(provinces.province_id, scope.province_id);
}

export function districtVisible(scope: Scope): SQL | undefined {
  if (scope.role === "national") return undefined;
  if (scope.role === "provincial") {
    return eq(districts.province_id, scope.province_id);
  }
  return eq(districts.district_id, scope.district_id);
}

export function stationVisible(scope: Scope): SQL | undefined {
  if (scope.role === "national") return undefined;
  if (scope.role === "provincial") {
    return eq(districts.province_id, scope.province_id);
  }
  if (scope.role === "district") {
    return eq(gridSubstations.district_id, scope.district_id);
  }
  return eq(gridSubstations.station_id, scope.station_id);
}
