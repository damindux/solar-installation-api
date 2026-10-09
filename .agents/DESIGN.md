# DESIGN.md — Real-Time Solar Generation Data API (SLSEA)

> **Audience:** an AI coding agent implementing NB6007CEM Coursework 1.
> **Companion file:** `IMPLEMENTATION.md` (ordered build plan). This file is the **source of truth for _what_ to build and _why_**.
> **Design authority:** the WSO2 REST API Design Guidelines (cited below as `G§x`). Brief = `NB6007CEM_Coursework_Brief.pdf` (cited `B§x`).
> **Stack:** Deno 2.x · TypeScript (strict) · Hono (+ `@hono/zod-openapi`) · Zod · Drizzle ORM · postgres.js · PostgreSQL on Neon.
> **Maturity target:** Richardson Level 2 (resources + HTTP verbs + status codes). No hypermedia controls (Level 3 is out of scope, B§Header).

---

## 0. Source precedence & resolved conflicts

The uploaded inputs disagree in several places. The agent MUST follow this precedence and MUST NOT silently re-litigate it:

1. **Brief** (hard constraints, marks) →
2. **WSO2 Guidelines** (design authority, B§Header) →
3. **`ResourceModel.txt`** (the author's resource/URI model; already guideline-compliant) →
4. **`DomainModel.png`** (entity/column model) →
5. **`requirements.md`** (behavioural acceptance criteria) — used wherever 1–4 are silent.

| # | Topic | requirements.md says | **Decision (this design)** | Why |
|---|-------|----------------------|----------------------------|-----|
| C1 | Readings URI | `/solar-installations/{id}/readings` | `/solar-installations/{site-id}/generation-readings` | `ResourceModel.txt`; plural noun of the entity; G§5.1 |
| C2 | Query-param names | `province_id` | `province-id`, `district-id`, `station-id` (kebab-case) | `ResourceModel.txt`; G§5.1 forbids underscores in names |
| C3 | Path-param names in OpenAPI | `:site_id` | `{site-id}`, `{station-id}`, … | `ResourceModel.txt` |
| C4 | Composite resource | separate `/solar-installations/{id}/composite` | **The atomic `GET /solar-installations/{site-id}` _is_ the composite** (installation + station/district/province + `last_known_reading`) | `ResourceModel.txt` shows it inline; a `/composite` suffix is a non-noun, redundant URI (G§5.1). List items stay flat. |
| C5 | Latest reading | `/readings/latest` (Req 18) vs `/last-known-reading` (Req 22) | `/solar-installations/{site-id}/last-known-reading` only | `ResourceModel.txt`, B§5 |
| C6 | Pagination | `page` / `pageSize`, `total` | **`offset` / `limit`**; envelope fields `count`, `next`, `previous` (+ `data`, `offset`, `limit`) | G§10.3 is explicit. Default `limit=20`, max `100` (keeps requirements D8). |
| C7 | Error body | `code` string + `details[]` | **G§11 shape**: `code` (integer), `message`, `description`, `moreInfo`, `error[]` (+ `field` on items) | B§5 "one consistent error schema" is judged against G§11 |
| C8 | PUT semantics | "update whichever fields are present" | **PUT = full replacement**; all fields required | G§7.2: PUT must not be a partial update |
| C9 | DELETE success | 204 No Content | **200 OK** with a small JSON body | G§7.4 states 200 OK, then 404 on repeat |
| C10 | Device-token hash | bcrypt | **SHA-256 (hex)** of a 256-bit random token | High-entropy secret ⇒ slow hash adds latency for every 15-min device POST without security gain. Passwords (users) still use bcrypt. |
| C11 | Seed batch size | ≤100 rows/statement | **1000** rows/statement | 134,400 rows over a network hop to Neon; 1000×6 params is far below the 65,534 limit |
| C12 | `voltage` precision | `decimal(6,2)` | **`decimal(8,2)`** | `DomainModel.png` |
| C13 | Duplicate-timestamp seed anomaly (Req 9.5) | assumed to exist | **None exists** in the provided `seed.json` (verified: 134,400 rows, 0 duplicate `(site_id, timestamp)`). Keep the importer's duplicate-warning logic, but README must state "none found". | Verified by inspection |
| C14 | Seed scale (Req 26) | 20+ substations | seed has **30** substations, 200 installations, 134,400 readings (2026-10-01T00:00:00Z → 2026-10-07T23:45:00Z, 672/site) | Verified by inspection |

Everything not listed above follows `requirements.md` as written.

---

## 1. Domain model (implementation-independent) — B§3, G§3

```
Province 1──* District 1──* GridSubstation 1──* SolarInstallation 1──* GenerationReading
User *──0..1 Province | District | GridSubstation   (jurisdiction scope)
```

| Entity | Columns (type) |
|--------|----------------|
| **provinces** | `province_id` int PK · `name` varchar(100) NN |
| **districts** | `district_id` int PK · `name` varchar(100) NN · `province_id` int NN FK |
| **grid_substations** | `station_id` int PK · `name` varchar(150) NN · `district_id` int NN FK |
| **solar_installations** | `site_id` int PK `GENERATED ALWAYS AS IDENTITY` · `address` varchar(255) NN · `device_id` varchar(100) NN **UNIQUE** · `station_id` int NN FK · `device_token_hash` varchar(255) NN **UNIQUE** · `created_at` / `updated_at` timestamptz NN default now() |
| **generation_readings** | `reading_id` bigint PK `GENERATED ALWAYS AS IDENTITY` · `site_id` int NN FK **ON DELETE CASCADE** · `timestamp` timestamptz NN · `instantaneous_power_kw` numeric(10,3) NN · `cumulative_energy_kwh` numeric(14,3) NN · `voltage` numeric(8,2) NN · **UNIQUE(site_id, timestamp)** |
| **users** | `user_id` int PK identity · `username` varchar(100) UNIQUE NN · `password_hash` varchar(255) NN · `role` varchar(50) NN · `province_id` / `district_id` / `station_id` int NULL FKs |

### The two marked modelling decisions (B§3) — never violate
1. **No `Device` entity.** The metering identifier is the attribute `solar_installations.device_id`.
2. **`generation_readings` is its own append-only time series.** No `last_power`-style columns on the installation. "Last known reading" is _derived_ at query time.

### Justified additions beyond `DomainModel.png` (must be defended in the report)
| Addition | Justification |
|----------|---------------|
| `users.username`, `users.password_hash` | Login is required to issue a JWT (requirements D5) |
| `solar_installations.device_token_hash` | Device authentication secret — only the hash is stored (G§12) |
| `solar_installations.created_at/updated_at` | `Last-Modified` and `If-Unmodified-Since` need a modification time for a mutable resource; reference entities are static and use ETag only |
| `UNIQUE(device_id)`, `UNIQUE(device_token_hash)` | Integrity + O(1) token→installation lookup |
| `UNIQUE(site_id, timestamp)` | Enforces "append-only, one reading per instant" and doubles as the range/sort index |
| CHECK constraints | `power ≥ 0`, `energy ≥ 0`, `voltage > 0`; `users.role` ↔ scope-column consistency |

### Users & jurisdiction (requirements D10)
| role | scope columns | sees |
|------|---------------|------|
| `national` | all NULL | everything |
| `provincial` | `province_id` only | that province's subtree |
| `district` | `district_id` only | that district's subtree |
| `station` | `station_id` only | that substation's subtree |

At **login** the server resolves the user's full lineage (a station user → its district → its province) and stores `province_id`, `district_id`, `station_id` (whichever apply) as JWT claims, so per-request authorization needs no extra lookup.

---

## 2. Resource model — B§5, G§4

| Kind (G§4) | Resource | Notes |
|------------|----------|-------|
| Collection + atomic | `provinces`, `districts`, `grid-substations`, `solar-installations` | first-class collections (queries across all) |
| Scoped collection | `provinces/{id}/districts`, `districts/{id}/grid-substations`, `grid-substations/{id}/solar-installations`, `solar-installations/{id}/generation-readings` | only meaningful under a parent (G§5.6) |
| Composite | `solar-installations/{site-id}` | installation + ancestors + last known reading |
| Derived / processing | `solar-installations/{site-id}/last-known-reading` | operational real-time view (B§6) |
| Processing (stretch) | `districts/{district-id}/generation-summary` | aggregate across many assets (B§5 stretch) |
| Controller-style | `auth/login` | issues a token; verb-like name is acceptable for action resources (G§5.1) |

### 2.1 URI catalogue (base path `/api/v1`, all JSON)

| Method | URI | Purpose | Success | Auth |
|--------|-----|---------|---------|------|
| GET | `/api/v1` | API info `{name, version, docs}` | 200 | none |
| GET | `/health` | liveness + DB probe | 200 | none |
| GET | `/docs`, `/openapi.json` | Swagger UI / OpenAPI 3.1 | 200 | none |
| POST | `/api/v1/auth/login` | `{username,password}` → JWT | 200 | none |
| GET | `/api/v1/provinces` · `/{province-id}` | list / one | 200 | user |
| GET | `/api/v1/provinces/{province-id}/districts` | scoped list | 200 | user |
| GET | `/api/v1/districts?province-id=` · `/{district-id}` | list / one | 200 | user |
| GET | `/api/v1/districts/{district-id}/grid-substations` | scoped list | 200 | user |
| GET | `/api/v1/grid-substations?district-id=` · `/{station-id}` | list / one | 200 | user |
| GET | `/api/v1/grid-substations/{station-id}/solar-installations` | scoped list | 200 | user |
| GET | `/api/v1/solar-installations?province-id=&district-id=&station-id=` | filtered list | 200 | user |
| GET | `/api/v1/solar-installations/{site-id}` | **composite** | 200 / 304 | user |
| POST | `/api/v1/solar-installations` | create (returns one-time `device_token`) | **201** | user (national, or in-scope) |
| PUT | `/api/v1/solar-installations/{site-id}` | full replace | 200 | user (national, or in-scope) |
| DELETE | `/api/v1/solar-installations/{site-id}` | delete (+cascade readings) | **200** | user (national, or in-scope) |
| GET | `/api/v1/solar-installations/{site-id}/generation-readings?from=&to=&sort=&offset=&limit=` | history | 200 | user |
| GET | `/api/v1/solar-installations/{site-id}/generation-readings/{reading-id}` | one reading | 200 / 304 | user |
| POST | `/api/v1/solar-installations/{site-id}/generation-readings` | **ingest** | **201** | **device token only** |
| GET | `/api/v1/solar-installations/{site-id}/last-known-reading` | latest reading | 200 / 304 | user |
| GET | `/api/v1/districts/{district-id}/generation-summary?date=` | stretch | 200 | user |

Collection endpoints also accept `offset`, `limit`. Nested scoped collections return **exactly** what the equivalent filtered flat collection returns (but 404 if the parent is missing/out of scope).

### 2.2 Naming rules applied (G§5.1)
lower-case · kebab-case path segments · plural nouns for collections · no verbs except action resources · no trailing slashes · forward slash = hierarchy · identifiers as `{template-vars}`. **JSON property names are `snake_case`** (matches `ResourceModel.txt` and the DB); URL/query names are kebab-case. Justify this split in the report.

### 2.3 Representations — G§6, `ResourceModel.txt`
Numbers are JSON numbers (never strings — convert Postgres `numeric`). Timestamps are ISO-8601 UTC `YYYY-MM-DDTHH:mm:ssZ`.

```jsonc
// GET /api/v1/solar-installations/1   (composite)
{
  "site_id": 1, "address": "1 Solar Park Road, Colombo, Sri Lanka", "device_id": "INV-COL-0001",
  "station":  { "station_id": 1, "name": "Colombo Grid Substation" },
  "district": { "district_id": 1, "name": "Colombo" },
  "province": { "province_id": 1, "name": "Western" },
  "last_known_reading": {              // null when the site has no readings
    "reading_id": 134400, "timestamp": "2026-10-07T23:45:00Z",
    "instantaneous_power_kw": 0, "cumulative_energy_kwh": 1250.73, "voltage": 231.4
  }
}
// List item (flat): { "site_id", "address", "device_id", "station_id" }
// Reading:          { "reading_id", "site_id", "timestamp", "instantaneous_power_kw", "cumulative_energy_kwh", "voltage" }
// POST installation 201 adds a ONE-TIME "device_token": "slsea_dev_…" (never returned again)
// Summary: { "district_id", "district_name", "generated_at", "date", "installation_count",
//            "current_total_power_kw", "today_total_energy_kwh" }
```

### 2.4 Collection envelope — G§10.3
```json
{ "count": 672, "offset": 0, "limit": 20,
  "next": "/api/v1/solar-installations/1/generation-readings?offset=20&limit=20",
  "previous": null, "data": [ … ] }
```
`count` = total qualifying rows ignoring pagination. `next`/`previous` are **relative URLs preserving all other query params**, or `null`. `offset` beyond the end → 200 with empty `data`. Invalid `offset`/`limit` → 400.

### 2.5 Filtering & sorting — G§10.2
| Where | Params |
|-------|--------|
| `districts` | `province-id` |
| `grid-substations` | `district-id` (and optionally `province-id`) |
| `solar-installations` | `province-id`, `district-id`, `station-id` (combinable — AND) |
| `generation-readings` | `from` (inclusive), `to` (**exclusive**), `sort=timestamp_asc|timestamp_desc` (default `timestamp_desc`) |

Unknown `sort` value, malformed ISO date, `from >= to`, or non-positive-integer id → **400**.
Jurisdiction filtering on the _history_ is achieved by composing the filtered installation list (province/district/station) with the per-installation readings sub-collection; document this reading of B§5 in the report.

---

## 3. HTTP semantics — G§7–§9

| Concern | Rule |
|---------|------|
| GET | safe & idempotent, no side effects |
| POST installation | non-idempotent create. **201** + `Location: /api/v1/solar-installations/{id}` + `Content-Location` (same) + `ETag` + `Last-Modified` + body (G§7.3) |
| POST reading | **201** + `Location: …/generation-readings/{reading-id}` + `Content-Location` + `ETag` + `Last-Modified` (= reading timestamp) + body |
| PUT | full replacement, idempotent: same body twice ⇒ same state, 200 both times |
| DELETE | 200 first time; 404 afterwards (G§7.4 note) |
| Content negotiation | `Accept` not satisfiable by `application/json` (allowing `*/*`, `application/*`) → **406**. Body-bearing requests with non-JSON `Content-Type` → **415** |
| Conditional GET | every 200 GET carries a strong content-hash **`ETag`**. `If-None-Match` match → **304**, empty body, ETag retained. `If-Modified-Since` honoured only when `If-None-Match` absent (G§10.4) |
| `Last-Modified` | single reading & last-known-reading = reading `timestamp`; installation = `max(updated_at, last reading timestamp)`; collections = newest member timestamp where one exists; reference entities: ETag only |
| Optimistic concurrency | `PUT`/`DELETE` installation honour optional `If-Match` (ETag of the current composite) and `If-Unmodified-Since` → **412** on mismatch (G§10.5). Header absent ⇒ proceed. |
| Caching | responses carry `Cache-Control: private, no-cache` and `Vary: Authorization, Accept` (data is jurisdiction-scoped; clients must revalidate) |
| Security headers | 401 includes `WWW-Authenticate: Bearer realm="slsea-api"` |

**Status codes used:** 200, 201, 304, 400, 401, 403, 404, 406, 409, 412, 415, 422, 500. (Brief appendix lists 201/200/404/400/406/412 — all covered.)

| Situation | Code |
|-----------|------|
| malformed id / body / query / JSON | 400 |
| missing/invalid/expired credentials | 401 |
| valid credentials, wrong actor (device token on user route; user JWT on ingest; device token for another site) | 403 |
| not found **or out of jurisdiction** | 404 (never 403 — existence is not revealed) |
| duplicate `device_id` / duplicate `(site_id, timestamp)` | 409 |
| well-formed body referencing non-existent `station_id` | 422 |
| precondition failed | 412 |

---

## 4. Error contract — G§11, B§5

One schema, one code path (a single `AppError` class + a single `app.onError` + `app.notFound`), returned for **every** 4xx/5xx. Content-Type `application/json`.

```json
{
  "code": 40001,
  "message": "Validation failed",
  "description": "One or more request fields are invalid.",
  "moreInfo": "/docs#section/Errors",
  "error": [ { "code": 40001, "field": "voltage", "message": "Must be greater than 0" } ]
}
```

| `code` | HTTP | Meaning |
|--------|------|---------|
| 40001 | 400 | validation / malformed input (list each field in `error[]`) |
| 40101 | 401 | missing credentials |
| 40102 | 401 | invalid / expired / tampered token |
| 40103 | 401 | bad username or password (never says which) |
| 40301 | 403 | wrong credential type for this route |
| 40302 | 403 | device token does not belong to this site |
| 40401 | 404 | resource not found (also used for out-of-jurisdiction) |
| 40601 | 406 | not acceptable |
| 40901 | 409 | duplicate `device_id` |
| 40902 | 409 | duplicate reading — message exactly `A reading for this site and timestamp already exists.` |
| 41201 | 412 | precondition failed |
| 41501 | 415 | unsupported media type |
| 42201 | 422 | referenced entity does not exist |
| 50000 | 500 | `message: "Internal Server Error"` — **no** stack/SQL/driver text ever leaves the server; log it server-side only |

---

## 5. Security model — B§2, B§5, G§12

**The write–read split is the core of the design:**

| Actor | Credential | May do | May NOT do |
|-------|-----------|--------|-----------|
| **Device** (write-client) | `Authorization: Bearer slsea_dev_<256-bit random>` issued once at installation creation | `POST …/{site-id}/generation-readings` for **its own** site | read anything; write anything else |
| **SLSEA user** (read-client) | `Authorization: Bearer <JWT HS256, 24 h>` from `POST /auth/login` | read data within jurisdiction; manage installations (national, or station within scope) | ever write readings |

* **Device token**: server stores only `sha256(token)` (hex) in `device_token_hash` (UNIQUE). Verification: hash the presented token → look it up. No match ⇒ 401. Match but `site_id` ≠ path ⇒ **403 (40302)**. Constant-time compare on the hash.
* **User JWT**: `jose`, HS256, `JWT_SECRET` (required at startup, never committed). Claims: `sub` (user_id), `role`, `province_id?`, `district_id?`, `station_id?`, `exp`. A JWT presented to the ingest route ⇒ 403 (40301). A device token presented anywhere else ⇒ 403 (40301).
* **Passwords**: bcrypt (`bcryptjs`, cost 10). Login performs a dummy hash compare for unknown usernames (no user enumeration, no timing oracle). Same 401/40103 message for both failure cases.
* **Middleware, not inline checks** (R17.8): `requireUser`, `requireDevice`, applied per route group.
* **Public**: `GET /health`, `GET /docs`, `GET /openapi.json`, `GET /api/v1`, `POST /api/v1/auth/login`.

### Jurisdiction rules (R18)
Visibility predicate per resource level, given scope claims `P` (province), `D` (district), `S` (station):

| Resource | national | provincial | district | station |
|----------|----------|-----------|----------|---------|
| province | all | `province_id = P` | `province_id = P` | `province_id = P` |
| district | all | `province_id = P` | `district_id = D` | `district_id = D` |
| substation | all | its district ∈ province P | `district_id = D` | `station_id = S` |
| installation / reading / last-known / composite | all | via substation→district→province = P | via substation→district = D | `station_id = S` |

(Provincial/district/station users see the single ancestor chain that contains them at upper levels.)

* Single-resource out of scope ⇒ **404**. List endpoints silently filter. Query filters are **intersected** with scope (asking for another district yields an empty list, 200).
* Implemented as one reusable module `jurisdiction.ts` that returns a Drizzle `SQL` predicate per level — no per-route hand-written scope logic.
* `POST/PUT/DELETE solar-installations`: allowed for `national`, or for a role whose scope contains the target `station_id`. (For PUT that includes both the old and the new station.)

---

## 6. Special behaviours

### 6.1 Last-known-reading (derived resource)
`SELECT … FROM generation_readings WHERE site_id=$1 ORDER BY timestamp DESC, reading_id DESC LIMIT 1` (served by the `(site_id, timestamp)` unique index). 404 if installation missing/out of scope **or** has zero readings (message differentiates). Never stored on the installation.

### 6.2 Composite installation (R14)
**One SQL statement**: `solar_installations ⨝ grid_substations ⨝ districts ⨝ provinces` plus `LEFT JOIN LATERAL (latest reading)`. No N+1.

### 6.3 District generation summary (stretch, R24)
* `installation_count` = installations in district.
* `current_total_power_kw` = Σ over installations of the **latest** reading's `instantaneous_power_kw` (none ⇒ 0).
* `today_total_energy_kwh` = Σ over installations of `energy_at_end_of_window − baseline`, where the window is the **Asia/Colombo calendar day** `[00:00+05:30, next 00:00+05:30)` and `baseline` = `cumulative_energy_kwh` of the last reading **before** the window, else the first reading **inside** it (installations with no readings in the window contribute 0).
* **`date=YYYY-MM-DD` (optional, Colombo-local, default = today)**. ⚠ The provided seed ends on **2026-10-07 UTC**, so with the default "today" the energy figure is legitimately `0`. The `date` param lets the API (and the viva) demonstrate real values (`?date=2026-10-05`) and is defended as "report an arbitrary operating day". `generated_at` is always the real query time.
* Optional nicety (see IMPLEMENTATION M11): `db:seed -- --rebase-to-today` shifts seed timestamps by whole days so the last seed day equals today.

### 6.4 Ingestion edge cases
`timestamp` must be ISO-8601 UTC and **not more than 5 minutes in the future** (400). `instantaneous_power_kw ≥ 0`, `cumulative_energy_kwh ≥ 0`, `voltage > 0`. Duplicate `(site_id, timestamp)` ⇒ 409/40902 (catch the unique-violation `23505`, don't pre-check). `cumulative_energy_kwh` is stored as supplied (D6).

### 6.5 Versioning (G§5.5)
Base path `/api/v1` is fixed by `ResourceModel.txt`. State in the report that the guideline's `v1.0` form was simplified to `v1` as the project's chosen pragmatic variant. (Optional: `/api/v0/*` → 301 to `/api/v1/*`.)

---

## 7. Cross-cutting engineering design

* **App factory** `createApp({ db, config })` — pure, no module-level singletons used by routes, so tests inject a fake DB (R8.6/8.7). `main.ts` is the only place that binds a port.
* **Layering:** `routes/*` (HTTP + validation + OpenAPI) → `repos/*` (Drizzle queries, returns plain typed objects) → `db/*`. Serialization (`numeric`→number, `Date`→ISO) happens in one `serialize.ts`.
* **Validation:** Zod schemas are the single source for runtime validation _and_ the OpenAPI document (`@hono/zod-openapi`) so R23.5 ("new route appears automatically") holds. Zod failures are mapped to the G§11 error body by a shared `defaultHook`.
* **Config:** `config.ts` validates env once at startup (`DATABASE_URL`, `JWT_SECRET` required; `PORT` 1–65535 default 8000; `DATABASE_URL_POOLED` optional). Invalid ⇒ stderr message naming the variable + `Deno.exit(1)`.
* **DB:** one postgres.js pool, one Drizzle instance. Runtime uses `DATABASE_URL_POOLED ?? DATABASE_URL`; when pooled, pass `prepare: false`. `drizzle-kit` always uses `DATABASE_URL` (direct). Neon requires TLS (`sslmode=require`).
* **Performance:** all hot paths indexed (§1). Count + page run in parallel. Never `SELECT *` from readings without `LIMIT`.
* **Logging:** one line per request (method, path, status, ms); never log tokens or password hashes.
* **Deployment:** Deno Deploy (or any platform that terminates TLS), Neon for Postgres. TLS is terminated by the platform, not the app (R25.3). Env vars set in the platform dashboard.
* **Testing:** (a) unit tests for pure modules — pagination, ETag/conditional logic, jurisdiction predicates, error mapping, summary window maths; (b) route tests with an injected fake DB (health); (c) integration tests against a real Postgres (Neon branch or local) enabled only when `TEST_DATABASE_URL` is set.

---

## 8. Coursework evidence map (for the human's report — agent must NOT write the report)

| Report section (B§8) | Evidence in this design |
|----------------------|-------------------------|
| Architecture & data model | §1 (no Device entity; readings time series; justified additions) |
| API design justification | §2 (taxonomy, URIs, naming), §3 (methods/status/headers), §4 (errors), conflict table §0 |
| Security justification | §5 (write–read split, device vs user tokens, jurisdiction predicates, 404-not-403) |
| Deployment | §7 + IMPLEMENTATION M12 (HTTPS URL, `/health`, seed counts, Swagger) |
| Richardson evaluation | Level 2: resources (L1) + correct verbs/status codes/headers (L2). Responses carry **no** hypermedia controls — `next`/`previous` are pagination hints (G§10.3), not HATEOAS; clients must know URIs a priori. |
| Critical evaluation | no token rotation/revocation; ETag computed after the query (saves bandwidth, not DB work); HS256 shared secret; no rate limiting; summary computed on read (could be a materialised view); `date` param exists because seed data is static |

> **Academic-integrity rule (Brief "Academic integrity"):** report prose must be the student's own. The agent writes **code and docs for the repo only**, and must log every significant prompt/AI-aid in `docs/ai-prompt-log.md` for the mandatory AI-disclosure appendix. Anything the student cannot explain at viva forfeits its marks — prefer simple, readable code with short "why" comments over clever abstractions.
