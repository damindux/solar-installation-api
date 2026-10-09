CREATE TABLE "districts" (
	"district_id" integer PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"province_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_readings" (
	"reading_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "generation_readings_reading_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"site_id" integer NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"instantaneous_power_kw" numeric(10, 3) NOT NULL,
	"cumulative_energy_kwh" numeric(14, 3) NOT NULL,
	"voltage" numeric(8, 2) NOT NULL,
	CONSTRAINT "readings_power_chk" CHECK ("generation_readings"."instantaneous_power_kw" >= 0),
	CONSTRAINT "readings_energy_chk" CHECK ("generation_readings"."cumulative_energy_kwh" >= 0),
	CONSTRAINT "readings_voltage_chk" CHECK ("generation_readings"."voltage" > 0)
);
--> statement-breakpoint
CREATE TABLE "grid_substations" (
	"station_id" integer PRIMARY KEY NOT NULL,
	"name" varchar(150) NOT NULL,
	"district_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provinces" (
	"province_id" integer PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solar_installations" (
	"site_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "solar_installations_site_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"address" varchar(255) NOT NULL,
	"device_id" varchar(100) NOT NULL,
	"device_token_hash" varchar(255) NOT NULL,
	"station_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "solar_installations_device_id_unique" UNIQUE("device_id"),
	CONSTRAINT "solar_installations_device_token_hash_unique" UNIQUE("device_token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"user_id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_user_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"username" varchar(100) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" varchar(50) NOT NULL,
	"province_id" integer,
	"district_id" integer,
	"station_id" integer,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_role_scope_chk" CHECK (
  ("users"."role" = 'national' AND "users"."province_id" IS NULL AND "users"."district_id" IS NULL AND "users"."station_id" IS NULL) OR
  ("users"."role" = 'provincial' AND "users"."province_id" IS NOT NULL AND "users"."district_id" IS NULL AND "users"."station_id" IS NULL) OR
  ("users"."role" = 'district' AND "users"."district_id" IS NOT NULL AND "users"."province_id" IS NULL AND "users"."station_id" IS NULL) OR
  ("users"."role" = 'station' AND "users"."station_id" IS NOT NULL AND "users"."province_id" IS NULL AND "users"."district_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "districts" ADD CONSTRAINT "districts_province_id_provinces_province_id_fk" FOREIGN KEY ("province_id") REFERENCES "public"."provinces"("province_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_readings" ADD CONSTRAINT "generation_readings_site_id_solar_installations_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."solar_installations"("site_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grid_substations" ADD CONSTRAINT "grid_substations_district_id_districts_district_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("district_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solar_installations" ADD CONSTRAINT "solar_installations_station_id_grid_substations_station_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."grid_substations"("station_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_province_id_provinces_province_id_fk" FOREIGN KEY ("province_id") REFERENCES "public"."provinces"("province_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_district_id_districts_district_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("district_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_station_id_grid_substations_station_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."grid_substations"("station_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "districts_province_idx" ON "districts" USING btree ("province_id");--> statement-breakpoint
CREATE UNIQUE INDEX "readings_site_ts_uq" ON "generation_readings" USING btree ("site_id","timestamp");--> statement-breakpoint
CREATE INDEX "stations_district_idx" ON "grid_substations" USING btree ("district_id");--> statement-breakpoint
CREATE INDEX "installations_station_idx" ON "solar_installations" USING btree ("station_id");