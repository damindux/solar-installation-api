# Solar Generation API

Real-Time Solar Generation Data API for the Sri Lanka Sustainable Energy
Authority (SLSEA).

## Development

Install Deno 2.x, copy `.env.example` to `.env`, set `DATABASE_URL` and a secure
`JWT_SECRET`, then run:

```sh
deno task dev
```

The service defaults to port 8000. Apply the schema and load the supplied data
with:

```sh
deno task db:migrate
deno task db:seed
```

The seeder reads `DATABASE_URL` directly. Set `SEED_DEMO_PASSWORD` to create the
five demo users. Device tokens are stored in the ignored file
`scripts/.out/device-tokens.json`; re-run with
`deno task db:seed --reset-tokens` only when you intend to invalidate existing
device tokens.
