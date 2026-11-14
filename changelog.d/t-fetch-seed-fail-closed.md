## Infrastructure (Track F)

- **`fetch-seed.sh` fails closed:** a release with no `.sha256`, an unparseable one, or a mismatch exits non-zero and installs nothing (a missing checksum used to warn and install). `seed-v0` is also held to the hash committed in `scripts/seed-v0.sha256`. `$VL_SEED_BASE` points the fetch at a mirror or a `file://` directory; `tests/fetch_seed_test.ts` covers each refusal offline.
