## Codegen, memory & runtime (Track B)

- **One registration step:** `registerReachRows`, a pass after `scanPrintUse`, registers the unions, nullable-number boxes and pinned-record rows that the nodes `monomorphize` made reach, forces every held rep, and mints every variant arm's field rows. It ends in the new `rowsFinal` phase. Mono's per-site pin registrations (`monoRegisterPinUnion` at 13 of its 14 sites, `monoRegisterValuePin`, the box-only helpers, `monoPinMintedUnion`'s registrations) are deleted, along with the hole-pin readers they left dead.
- **`scripts/registration-census.vl`:** counts, on a scratch compiler built from edits held as data, every row registered once the rows are final; `--check` fails on any. It reads 0 on the distilled corpus and `tests/cases`.
