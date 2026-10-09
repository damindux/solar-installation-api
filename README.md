# Solar Generation API

Real-Time Solar Generation Data API for the Sri Lanka Sustainable Energy
Authority (SLSEA).

## Development

Install Deno 2.x, copy `.env.example` to `.env`, set `DATABASE_URL` and a secure
`JWT_SECRET`, then run:

```sh
deno task dev
```

The service defaults to port 8000. Database setup and API routes are being
implemented in milestones documented in `.agents/IMPLEMENTATION.md`.
