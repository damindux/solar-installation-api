# Deployment smoke checklist

Set `API_BASE` to the deployed HTTPS origin. These commands use `curl` and `jq`.
The write checks create one temporary installation and a reading; the final step
deletes that installation and its readings. Run them against a disposable or
approved deployment database.

```sh
export API_BASE="https://your-deployment-host"
export DEMO_PASSWORD="the password configured through SEED_DEMO_PASSWORD"

# Login and keep the user JWT in the current shell only.
USER_TOKEN=$(curl -fsS "$API_BASE/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"national\",\"password\":\"$DEMO_PASSWORD\"}" \
  | jq -r .token)

# Health, API info, documentation, and OpenAPI.
curl -i "$API_BASE/health"
curl -fsS "$API_BASE/api/v1"
curl -fsS "$API_BASE/openapi.json" | jq -r .openapi
curl -I "$API_BASE/docs"

# The seeded reference collections and reading history.
curl -fsS "$API_BASE/api/v1/provinces" -H "Authorization: Bearer $USER_TOKEN" \
  | jq '{count, items: (.data | length)}' # expected count 9 and items 9
curl -fsS "$API_BASE/api/v1/solar-installations?limit=5" \
  -H "Authorization: Bearer $USER_TOKEN" | jq '{count, next}' # count 200; next is set
curl -fsS "$API_BASE/api/v1/solar-installations/1" \
  -H "Authorization: Bearer $USER_TOKEN" | jq 'has("last_known_reading")'
curl -fsS "$API_BASE/api/v1/solar-installations/1/generation-readings?limit=96&sort=timestamp_asc" \
  -H "Authorization: Bearer $USER_TOKEN" | jq .count # expected 672

# Conditional GET: save and replay the representation's ETag; expect 304 and no body.
ETAG=$(curl -fsS -D - -o /dev/null "$API_BASE/api/v1/solar-installations/1" \
  -H "Authorization: Bearer $USER_TOKEN" | awk 'tolower($1)=="etag:" {print $2}' | tr -d '\r')
curl -i "$API_BASE/api/v1/solar-installations/1" \
  -H "Authorization: Bearer $USER_TOKEN" -H "If-None-Match: $ETAG"

# The seeded date demonstrates nonzero district energy; default today is later
# than the supplied readings and should therefore report zero energy.
curl -fsS "$API_BASE/api/v1/districts/1/generation-summary?date=2026-10-05" \
  -H "Authorization: Bearer $USER_TOKEN" | jq '{date, today_total_energy_kwh}'

# Create a temporary installation; retain the one-time device token only in memory.
CREATED=$(curl -fsS "$API_BASE/api/v1/solar-installations" \
  -H "Authorization: Bearer $USER_TOKEN" -H 'Content-Type: application/json' \
  -d '{"address":"Smoke test site","device_id":"SMOKE-REPLACE-ME","station_id":1}')
SITE_ID=$(printf '%s' "$CREATED" | jq -r .site_id)
DEVICE_TOKEN=$(printf '%s' "$CREATED" | jq -r .device_token)
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
READING=$(printf '{"timestamp":"%s","instantaneous_power_kw":1,"cumulative_energy_kwh":1,"voltage":230}' "$TIMESTAMP")

# First ingest expects 201 plus Location. Repeating the same timestamp expects 409.
curl -i "$API_BASE/api/v1/solar-installations/$SITE_ID/generation-readings" \
  -H "Authorization: Bearer $DEVICE_TOKEN" -H 'Content-Type: application/json' -d "$READING"
curl -i "$API_BASE/api/v1/solar-installations/$SITE_ID/generation-readings" \
  -H "Authorization: Bearer $DEVICE_TOKEN" -H 'Content-Type: application/json' -d "$READING"

# A valid user JWT cannot ingest (403). A district user should get 404 for a
# district outside that user's jurisdiction; substitute a configured account.
curl -i "$API_BASE/api/v1/solar-installations/$SITE_ID/generation-readings" \
  -H "Authorization: Bearer $USER_TOKEN" -H 'Content-Type: application/json' -d "$READING"
curl -i "$API_BASE/api/v1/districts/8" \
  -H "Authorization: Bearer $DISTRICT_TOKEN"

# Negotiation and unknown-route errors.
curl -i "$API_BASE/api/v1" -H 'Accept: text/html' # expected 406
curl -i "$API_BASE/not-a-route" # expected standard 404 body

# Always clean up the temporary installation (cascades to readings).
curl -i -X DELETE "$API_BASE/api/v1/solar-installations/$SITE_ID" \
  -H "Authorization: Bearer $USER_TOKEN"
unset USER_TOKEN DEVICE_TOKEN CREATED READING
```

The create command's `device_id` must be unique on the deployment; replace
`SMOKE-REPLACE-ME` with a fresh identifier each run. Configure `DISTRICT_TOKEN`
for an account whose jurisdiction excludes district 8 before running that check.
Do not save or paste token values into logs or issue trackers.
