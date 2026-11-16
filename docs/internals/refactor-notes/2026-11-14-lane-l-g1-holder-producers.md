# Producers of a function-widened holder, built at its row — 2026-11-14

Lane L, group G1 of lane B's census of the un-annotated-function-in-a-container family:
D15274, D15302, D15308. D15306 built one producer of a widened holder at the holder's row, the
literal written whole into it. This change makes the other producers reach the same rule.

## What moved

- **A bound source.** `cwSoleReadInit` (check_write_scan.vl) answers the initialiser of a binding
  whose one occurrence besides its declaration is the read in hand. Two consumers:
  `recSoleReadOfInit` (check_fit_rules.vl) lets `recAsgFnWidenedTy` find the place for that
  initialiser's literal through the read, so D15306's stamp (`recLitFnFieldsAt`) and fn-tag's
  written-literal join see it unchanged; and fn-tag's whole-record write loop follows the read
  to the initialiser, re-typing the read and the binding to the holder (`ftWrittenSourceAt`).
  The bare function spelling is `ftWrittenNamedSource`, at a written function binding: only a
  source naming a top-level function, outside a generic or open function. Both sides read in one
  function only (`cwSoleReadInit`), so no capture sees the re-typed binding.
- **Tried and narrowed.** Following every sole-read source inside `ftJoinAt` (a `let`'s
  initialiser and every join, not only a write) turned four filed `runs` rows (D3847, D3849,
  D3854, D15434) and eleven `tests/cases/closures` fixtures into check-clean invalid wasm: a
  lambda `const` read once by a `let`, or a write inside a closure or a generic, re-typed a
  binding no instance or capture agreed with. The gate's filed-witness row caught it.
- **A value `if` initialiser.** The `let` field widener (check_statements.vl) ran for a literal
  or call initialiser only; `letInitArmLits` widens each arm literal of a value `if` or `match`
  at the binding's type and grows the joins.
- **A sibling record.** `holeFieldCallAdopt` (check_calls.vl) declines the closed-row build for a
  record whose field set a widening copied into a wider one (`elabFnSetWidenSource`), the
  decline a widened binding already took, so the set decided with the wider one keeps ids.

## Evidence

- Seed fixpoint: a second `refresh-compiler.sh` is `cmp`-identical.
- `regress.vl` on the fixpoint seed: 0 runs → not-runs, 0 → silent of 260,455 census cells; the
  29 other movements are loud → runs cells that master's seed already runs (a stale baseline).
- `capability-matrix.vl --before master --after this`, three new templates, each 0 runs → not-runs
  and 0 silent: `record-bound-source-written-into-fn-widened-binding` 7 of 46 graded cells run
  (6 moved emit refuses → runs, all un-annotated), `if-arm-record-fn-field-written-two-types`
  30 of 46 (13 moved), `sibling-maker-record-beside-fn-widened-binding` 18 of 46 (12 moved).
  The slot positions (`struct_field_assign`, `array_*`, `map_*`) stay refused: D15307's family.
  The bound source's capture positions stay refused: D16241.
- `rep-fuzz-check.sh`: exact, 0 new, 0 stale.
- Witnesses and ablations with distinct functions (`a + 1`, `a * 10`, `a + 100`), so a wrong
  member's dispatch prints a wrong value.

## Residue

D16240: a bare `const` source read again after the write keeps its own value. D16241: a
source declared in another function than its read keeps its own row.
