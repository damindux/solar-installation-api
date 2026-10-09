# Solar Generation API

Real-Time Solar Generation Data API for the Sri Lanka Sustainable Energy
Authority (SLSEA). The API uses Deno 2.x and PostgreSQL 16 or later. It was
implemented and integration-checked against the PostgreSQL database configured
for this project.

## Run locally

Install Deno 2.x and PostgreSQL 16+, copy `.env.example` to `.env`, and set:

- `DATABASE_URL`: direct PostgreSQL connection used for migrations and seeding.
- `JWT_SECRET`: a long, random secret used to sign user JWTs.
- `DATABASE_URL_POOLED` (optional): pooled URL for runtime queries.
- `PORT` (optional): listening port, default `8000`.
- `SEED_DEMO_PASSWORD` (optional): password used when creating demo users.

Then migrate, seed, and start the development server:

```sh
deno task db:migrate
deno task db:seed
deno task dev
```

The seed importer loads 9 provinces, 25 districts, 30 substations, 200 solar
installations, and 134,400 readings. The supplied seed has no duplicate
`(site_id, timestamp)` pairs. If duplicates are encountered in another input,
the importer warns and continues past those rows.

Set `SEED_DEMO_PASSWORD` before seeding to create these accounts: `national`,
`prov-western`, `dist-colombo`, `dist-matara`, and `station-colombo`. When set,
the seeder creates or updates these users with that password. A seed run writes
device tokens to the ignored file `scripts/.out/device-tokens.json`. Keep that
file private. To see a token again after seeding, read the file locally; do not
commit or share it. `deno task db:seed --reset-tokens` invalidates and replaces
existing device tokens.

### Public demo credentials

All five demo accounts use the shared password `SLSEA-Demo-2026!`:

| Username | Scope |
| --- | --- |
| `national` | All provinces and districts |
| `prov-western` | Western Province |
| `dist-colombo` | Colombo District |
| `dist-matara` | Matara District |
| `station-colombo` | Colombo Grid Substation |

These credentials are public. The national account can create, replace, and
delete solar installations. Use them for demonstrations only.

## Tasks

| Task                    | Purpose                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `deno task dev`         | Start with file watching and `.env` loading                                        |
| `deno task start`       | Start without file watching                                                        |
| `deno task check`       | Format, lint, and type-check                                                       |
| `deno task test`        | Run unit tests; DB integration tests are skipped unless `TEST_DATABASE_URL` is set |
| `deno task db:generate` | Generate a migration from the Drizzle schema                                       |
| `deno task db:migrate`  | Apply migrations using `DATABASE_URL`                                              |
| `deno task db:seed`     | Import the supplied seed and optionally create demo users                          |

For database integration tests, set `TEST_DATABASE_URL` to a disposable
PostgreSQL database before running `deno task test`.

## Routes

Protected routes require a user bearer token from `POST /api/v1/auth/login`,
except generation-reading ingestion, which requires the installation's device
token. The implemented resources include:

- `GET /health` and `GET /api/v1` for health and API information.
- `GET /openapi.json` and `GET /docs` for the OpenAPI 3.1 specification and
  Swagger UI.
- Province, district, and grid-substation collections, individual resources, and
  nested collections.
- Solar-installation collection, composite resource, create, full replacement,
  and delete operations.
- Generation-reading history, individual readings, latest reading, and
  device-authenticated ingestion.
- District generation summary with optional Colombo-local `date=YYYY-MM-DD`.

Collections use `offset` and `limit` pagination. Read routes return content
ETags and support conditional requests. Installation replacement and deletion
accept `If-Match` and `If-Unmodified-Since` preconditions.

Check liveness and database connectivity with:

```sh
curl -i http://localhost:8000/health
```

The response has `status: "ok"` while the process is live and `db: "ok"` when
the database probe succeeds. If the probe fails, liveness remains 200 and the
body reports `db: "error"` with a diagnostic `db_message`.

## Deployment

The application entry point is `main.ts`. A host must provide `DATABASE_URL`
(and optionally `DATABASE_URL_POOLED`) and `JWT_SECRET`. Configure the host to
terminate TLS and set `PORT` if required. No deployment URL is configured in
this repository yet; after deployment, record the HTTPS base URL here and use
the checklist in [docs/SMOKE.md](docs/SMOKE.md).

## Project notes

The implementation milestones and AI assistance are recorded in
[`docs/ai-prompt-log.md`](docs/ai-prompt-log.md). The coursework report is not
part of this repository work; the student should write it and share the
repository with the module leader as required by the brief.
