## Infrastructure (Track F)

- **land-check runs from copies:** `scripts/land-check.sh` copies the host and the seed when it starts and typechecks with the copies; if either original changed meanwhile (a ready-check rebuilding the main checkout's seed), it prints `LAND-RETRY` (rc 2) instead of a false `LAND-NO`.
