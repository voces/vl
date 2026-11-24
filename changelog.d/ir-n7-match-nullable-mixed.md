## Codegen, memory & runtime (Track B)

- **IR coverage (lane IR-N7):** a member equality over a box local narrowed by an earlier equality (a `match` over a mixed `N | null`) reads the box as legacy's union compare does (`narrowed read` 20 → 15 on tests/cases), byte-identical to legacy.
