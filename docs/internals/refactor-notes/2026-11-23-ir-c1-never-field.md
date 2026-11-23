# `rep novalue`, step 8: a field read typed `never` (IR-C1)

The coordinator extended the step-7 ruling (DECISIONS.md) to this shape. A field that is `never` in
one instance never held a value, and its slot stores the default i32 (D15530). `exprAtPre` builds a
Member read typed `never` at that i32. `fieldStoresRead` (`emit_plan_union.vl`, which only the IR
reads) admits it as a plain struct field read only where the row stores the field as i32. Legacy
writes `struct.get` and `__print_i32__`, and the IR writes the same.

Verifier rule 3 admits the temp only where its defining Rhs is an RGetField whose rep is its
record row's field kid (`neverCallTemp`). New self-tests: `never-field-read-at-its-storage` holds
(0), and `never-field-read-off-its-storage` at bool breaks rule 3. A wrong expectation turned the
suite red.

## Legacy tails the IR calls

None.

## Readings (base 88df143ea, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| `ir-identity.sh --cases` | identical 7704, fail under both 68, differ 0; witnesses same 61, differ 0 |
| `ir-identity.sh --claimless` | identical 14034, differ 0 |
| `ir-identity.sh <base> <head> --names` | identical 9037, differ 0, built under one only 0; self-compile identical |
| armed shadow, corpus / `--claims` | 45428 covered = verified = matched; no fallback |
| order check (`ir-shadow.vl --prepost`, corpus and `--cases`) | 0 order rows, base and head |
| R7, deep nesting, margin | 366 ok; 5 ok; fail 903 KB / pass 906 KB on both |
| `gate.sh --fast`, `lint-self.sh`, `deno lint` | passed; clean; clean |
| L2 self-compile fuel per PR | +0.03% on 118,858,236,064 |
| legacy A/B (tests/cases + probes) | 0 moved programs |
| tests/cases `rep novalue` (mode 4 blockers) | 1 → 0 functions |
| tests/cases claimed functions | 78,517 → 78,518 (0 lost) |

Shadow row: `tests/ir-shadow-rows/never-field-read-at-its-storage.vl` (4 functions covered = matched).
