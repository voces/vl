## Codegen, memory & runtime (Track B)

- **IR claims gate, refusals compared:** `scripts/ir-identity.sh --cases` now also compares the
  first error line of each program that fails under both the claims-on and the claimless seed.
  It also builds and compares every `@error` program in tests/cases. A claim that turns a legacy
  refusal into a build, or into a different refusal, now fails the gate. Two new modes,
  `--compare` and `--compare-errors`, run the comparisons alone, and a test checks that both red
  on an injected bypass.
