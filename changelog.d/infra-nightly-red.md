## Infrastructure (Track F)

- **I8 burn-down measured nightly:** `.github/workflows/i8-red-nightly.yml` runs CENSUS's recipe on master each night and on dispatch (`census.sh`, `ir-i8-sweep.sh keep`, `red.sh`). It uploads `red.tsv` as artifact `i8-red` and puts red.sh's line in the job summary: programs, units and classes, each with its delta from the previous run. It is off the PR path.
