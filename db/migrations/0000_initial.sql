CREATE TABLE provinces (
  province_id integer PRIMARY KEY,
  name varchar(100) NOT NULL
);

CREATE TABLE districts (
  district_id integer PRIMARY KEY,
  name varchar(100) NOT NULL,
  province_id integer NOT NULL REFERENCES provinces(province_id)
);
CREATE INDEX districts_province_idx ON districts(province_id);

CREATE TABLE grid_substations (
  station_id integer PRIMARY KEY,
  name varchar(150) NOT NULL,
  district_id integer NOT NULL REFERENCES districts(district_id)
);
CREATE INDEX stations_district_idx ON grid_substations(district_id);

CREATE TABLE solar_installations (
  site_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  address varchar(255) NOT NULL,
  device_id varchar(100) NOT NULL UNIQUE,
  device_token_hash varchar(255) NOT NULL UNIQUE,
  station_id integer NOT NULL REFERENCES grid_substations(station_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX installations_station_idx ON solar_installations(station_id);

CREATE TABLE generation_readings (
  reading_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site_id integer NOT NULL REFERENCES solar_installations(site_id) ON DELETE CASCADE,
  "timestamp" timestamptz NOT NULL,
  instantaneous_power_kw numeric(10,3) NOT NULL CHECK (instantaneous_power_kw >= 0),
  cumulative_energy_kwh numeric(14,3) NOT NULL CHECK (cumulative_energy_kwh >= 0),
  voltage numeric(8,2) NOT NULL CHECK (voltage > 0),
  CONSTRAINT readings_site_ts_uq UNIQUE (site_id, "timestamp")
);

CREATE TABLE users (
  user_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username varchar(100) NOT NULL UNIQUE,
  password_hash varchar(255) NOT NULL,
  role varchar(50) NOT NULL,
  province_id integer REFERENCES provinces(province_id),
  district_id integer REFERENCES districts(district_id),
  station_id integer REFERENCES grid_substations(station_id),
  CONSTRAINT users_role_scope_chk CHECK (
    (role = 'national' AND province_id IS NULL AND district_id IS NULL AND station_id IS NULL) OR
    (role = 'provincial' AND province_id IS NOT NULL AND district_id IS NULL AND station_id IS NULL) OR
    (role = 'district' AND district_id IS NOT NULL AND province_id IS NULL AND station_id IS NULL) OR
    (role = 'station' AND station_id IS NOT NULL AND province_id IS NULL AND district_id IS NULL)
  )
);
