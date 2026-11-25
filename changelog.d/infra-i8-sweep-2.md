## Infrastructure (Track F)

- **`ir-i8-sweep.sh` names the port list and the sentinel fallbacks:** a kept function's call of `emitExpr`/`emitWidened` is tagged `i8 reentry <caller>`, so a run lists the re-entries I8 must port (`rcReadSource`, `arrLitDataElemEmit`, `emitListGetIdx`, `emitStrValue`, ...); a claim that falls back for a reason the seed does not show is reported by reason, with the static IR-to-stub edges, since a stubbed sentinel helper makes the IR decline with its own words. `keep.txt` moves to CENSUS's v2 (105 names, `ir-tail` and `ir-sentinel`).
