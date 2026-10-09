# Implementation decisions

- 2026-10-09: Keep the supplied `references/` directory available to Git; the
  existing local ignore change is preserved for now and is not included in the
  M0 commit.
- 2026-10-09: Installation composite ETags cover `last_known_reading`, so a new
  reading between GET and PUT/DELETE makes the client's validator stale.
