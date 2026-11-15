## Infrastructure (Track F)

- `scripts/oracle/fuzz.sh` runs its cases through `vl run --batch` in chunks of 2,000, so a 50-seed sweep (30,000 cases) no longer overflows the argument list.
