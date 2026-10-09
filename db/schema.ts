import { type InferInsertModel, type InferSelectModel, sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const provinces = pgTable("provinces", {
  province_id: integer("province_id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
});

export const districts = pgTable("districts", {
  district_id: integer("district_id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  province_id: integer("province_id").notNull().references(() =>
    provinces.province_id
  ),
}, (table) => [index("districts_province_idx").on(table.province_id)]);

export const gridSubstations = pgTable("grid_substations", {
  station_id: integer("station_id").primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  district_id: integer("district_id").notNull().references(() =>
    districts.district_id
  ),
}, (table) => [index("stations_district_idx").on(table.district_id)]);

export const solarInstallations = pgTable("solar_installations", {
  site_id: integer("site_id").primaryKey().generatedAlwaysAsIdentity(),
  address: varchar("address", { length: 255 }).notNull(),
  device_id: varchar("device_id", { length: 100 }).notNull().unique(),
  device_token_hash: varchar("device_token_hash", { length: 255 }).notNull()
    .unique(),
  station_id: integer("station_id").notNull().references(() =>
    gridSubstations.station_id
  ),
  created_at: timestamp("created_at", { withTimezone: true }).notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull()
    .defaultNow(),
}, (table) => [index("installations_station_idx").on(table.station_id)]);

export const generationReadings = pgTable("generation_readings", {
  reading_id: bigint("reading_id", { mode: "number" }).primaryKey()
    .generatedAlwaysAsIdentity(),
  site_id: integer("site_id").notNull().references(
    () => solarInstallations.site_id,
    { onDelete: "cascade" },
  ),
  timestamp: timestamp("timestamp", { withTimezone: true, mode: "date" })
    .notNull(),
  instantaneous_power_kw: numeric("instantaneous_power_kw", {
    precision: 10,
    scale: 3,
    mode: "number",
  }).notNull(),
  cumulative_energy_kwh: numeric("cumulative_energy_kwh", {
    precision: 14,
    scale: 3,
    mode: "number",
  }).notNull(),
  voltage: numeric("voltage", { precision: 8, scale: 2, mode: "number" })
    .notNull(),
}, (table) => [
  uniqueIndex("readings_site_ts_uq").on(table.site_id, table.timestamp),
  check("readings_power_chk", sql`${table.instantaneous_power_kw} >= 0`),
  check("readings_energy_chk", sql`${table.cumulative_energy_kwh} >= 0`),
  check("readings_voltage_chk", sql`${table.voltage} > 0`),
]);

export const users = pgTable("users", {
  user_id: integer("user_id").primaryKey().generatedAlwaysAsIdentity(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  password_hash: varchar("password_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull(),
  province_id: integer("province_id").references(() => provinces.province_id),
  district_id: integer("district_id").references(() => districts.district_id),
  station_id: integer("station_id").references(() =>
    gridSubstations.station_id
  ),
}, (table) => [check(
  "users_role_scope_chk",
  sql`
  (${table.role} = 'national' AND ${table.province_id} IS NULL AND ${table.district_id} IS NULL AND ${table.station_id} IS NULL) OR
  (${table.role} = 'provincial' AND ${table.province_id} IS NOT NULL AND ${table.district_id} IS NULL AND ${table.station_id} IS NULL) OR
  (${table.role} = 'district' AND ${table.district_id} IS NOT NULL AND ${table.province_id} IS NULL AND ${table.station_id} IS NULL) OR
  (${table.role} = 'station' AND ${table.station_id} IS NOT NULL AND ${table.province_id} IS NULL AND ${table.district_id} IS NULL)`,
)]);

export type SelectProvince = InferSelectModel<typeof provinces>;
export type InsertProvince = InferInsertModel<typeof provinces>;
export type SelectDistrict = InferSelectModel<typeof districts>;
export type InsertDistrict = InferInsertModel<typeof districts>;
export type SelectGridSubstation = InferSelectModel<typeof gridSubstations>;
export type InsertGridSubstation = InferInsertModel<typeof gridSubstations>;
export type SelectSolarInstallation = InferSelectModel<
  typeof solarInstallations
>;
export type InsertSolarInstallation = InferInsertModel<
  typeof solarInstallations
>;
export type SelectGenerationReading = InferSelectModel<
  typeof generationReadings
>;
export type InsertGenerationReading = InferInsertModel<
  typeof generationReadings
>;
export type SelectUser = InferSelectModel<typeof users>;
export type InsertUser = InferInsertModel<typeof users>;
