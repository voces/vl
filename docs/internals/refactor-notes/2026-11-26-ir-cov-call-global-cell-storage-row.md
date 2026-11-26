# A record global's cell at its storage row (2026-11-26, COV-CALL)

This is the records part of the "place reads at storage" series: COV-UNION's two `put` rows
(`map read default rep`) and D17680. The coordinator ruled that the fix goes at the source, where
`globalRep` notes the cell, not at the reads.

**Mechanism.** `const d = { f: 1 }` read as `m.get(k) ?? d` over a `J`-valued map is stored by
legacy at `J`'s row (`letBindTy`). When `{ f: i32 }` has a struct row of its own (here `w3`'s `x`
lays one out), `cellAtStorageRow` kept the IR's cell at the type's row: it moved a cell only for a
type with no struct heap (D17087's case). The map read is held at `J` and the default at the type's
row, so the read missed `map read default rep`. `cellAtStorageRow` now notes the cell at the
storage row whenever that row is a record rep with a heap. The global-read arms already read a cell
whose binding type differs (`stored`, `globalCellRowReadTy`).

A function returning that global was declared at the type's row (`frsValuesStampRow` reads the
read's stamp), so legacy built an invalid module and the IR missed `convert record -> record`
(D17680). `frsGlobalCellTy` gives a returned module-global read its storage record, in
`frsValuesBuiltRow` and `frsValuesStampRow` alike. A row copy would break aliasing (START-2's
withdrawn row copy), so the result follows the storage instead.

**Witnesses.**

| program | branch | merge-base probe |
| --- | --- | --- |
| built-record-join-binding-read `put` | claimed | `map read default rep` |
| built-record-stored-into-nullable-field `put` | claimed | `map read default rep` |
| D17680's repro | prints `1`, `asReturn` claimed | legacy invalid module, `convert record -> record` |
| the Q58 test | prints its 11 lines, every function claimed | 4 functions miss, legacy invalid module |

**Q58.** `tests/cases/records/record-global-held-at-storage-row-read-positions.vl`: the global read
as a map default (bound and stored into a record field), a binding, a field, an argument, a
returned value and a call through it, a list element, and a record field.

CENSUS_PLACEHOLDER

**Not covered.** The two tests' `@start` still misses `global initializer coercion` at
`const m = Map()`, on master too; that's regen-11's class, next in the series.
