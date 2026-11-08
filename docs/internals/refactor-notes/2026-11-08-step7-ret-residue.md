# Step 7: what was left of `computeRetInference`

Measured 2026-11-08, 4-core box, on top of #6791. Every candidate seed is a fixpoint (two
`refresh-compiler.sh` runs byte-identical). The sweep population is 23,650 programs.

## Ablations, in order

| step | change | sweep against the step before |
| --- | --- | --- |
| A | delete the three `!criFromRec`-gated parts: `criNulCloByRecorded`, `criSettleNonNullRecordRet`, the literal-atom flag | 23,650 same |
| B | fold the record-row check and the ref-list row join into the recorded read's one loop | 23,650 same |
| C | a lambda's recorded result carries the literal union its context adopted; `synthRetAnnots` deleted | 23,643 same, 7 bytes-only |
| D | an un-annotated record returned through a `const` literal is recorded at the literal's row | 23,650 same |
| E | `computeRetInference#2` leaves the pass table; `fnRetColsFromRecorded` runs inside `recordedVoidFns#2` | 23,650 same |

`criFromRec` had no reader left after A. The row join could not move into `buildFnMap`,
which runs before mono. It reads callee rows that only exist after mono. The row join stays.
It now runs in the same loop that writes each function's columns.

## C: the literal-union lambda

`fnRecordedRetTy` read `(q0) => ("lbbzv")` (inside a field of type `((i32) => K0) | f64`) as
`string`. The emitted lambda is node 101, the elaboration's rebuild. The `#<node>` inferred-return
row that records `K0` is on node 84, the declaration it copies (`elabSrcDecl`). That is why the
pin had to run before mono. `frsLitUnionRet` now reads the source declaration's row. If the
recorded result is `string` or a string literal and that row is a literal union, the union is
the result. `srrNamesShape` keeps `synthRecordedRetAnnots` from pinning it, so the columns come
from the recorded read (`i32`, atom).

The 7 bytes-only movers print what they printed before. They fall into two groups, and every
module was diffed:

* 3 programs with a literal-union lambda gain two unused scratch locals (`i32`, `anyref`).
  The un-annotated return path reserves them. The 3 are `fn-value-lambda-adopts-string-litunion`,
  `inferred-return-joins-one-literal-types` and `call-arg-rep-belongs-to-the-callee`.
* 4 programs compare a lambda's result with a one-character string literal (`h() == "a"`). They
  now call `__str_eq__` against the interned literal where they had an inline one-byte compare.
  The 4 are `closure-generic-call-narrowed-literal`, `two-litunion-join-unannotated-tail`,
  D2219 and D3160.

## D: b000378 `mkcall`

`const cc = { r: 7 }; return cc` next to `Circle = { r: i64 }`. The recorded type was `Circle`
(the kept delivery destination). The function builds `struct.new` of `{(mut i32)}`, which is
the literal's own row (disassembly). `frsValuesBuiltRow` declined because a plain `const` read
carries no store stamp. `frsConstLitRead` now reads the `ObjLit` initializer of an
un-annotated `const`, and the probe reads `{r: i32}`. No program moved, because the columns
already took the stamp row (`frsValuesStampSlot`). The fix is for the typed `cloRet*` reader
(`84e735f5`), which reads the type itself. That shadow has not been re-run here.

## Proof on the merged tree (master `266e085f`)

| check | master | this branch |
| --- | --- | --- |
| fixpoint seed | 6,501,408 | 6,498,828 (−2,580) |
| L2 self-compile guest fuel | 76,188,663,293 | 76,160,977,045 (−0.04%) |
| sweep, 23,656 programs | | 23,649 same, 7 bytes-only (the C movers), 0 output movers |
| `scripts/gate.sh` | | 23 rows pass. `lint-self` failed at first (unused imports, a scan outside a listed pass) and was fixed. It and the ladder sets were re-run alone and pass. |
