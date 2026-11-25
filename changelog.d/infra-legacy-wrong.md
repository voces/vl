## Infrastructure (Track F)

- **A `legacy-wrong` divergence kind (ruling O3):** a `scripts/ir-divergence-baseline.txt` line whose mechanism starts `legacy-wrong:` lets the IR differ from IR-off where legacy is wrong. `ir-parity.vl` proves it by the IR-on run meeting the program's `// @log` / `// @trap` / `// @run` lines or the inventory row's `Want:`; `ir-identity.sh` also passes it when only the claims seed builds it; the armed shadow treats it as any listed divergence (merge-queue.md, Q57).
