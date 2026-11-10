# Step 7: `unionNameOfRead` names its storage type's row, 2026-11-10

Group 6 of `2026-11-09-step7-classifiers-remaining.md`, the third PR after
`2026-11-10-step7-read-rep-slots.md` (#7029) and `2026-11-10-step7-nulnone-read-store.md` (#7032),
under the ruling in DECISIONS.md §"How step 7's classifier half finishes". Base is master
`9c5f881e` (#7048), whose seed is 6,599,395 bytes. Counts are post-mono calls over the
23,826-program sweep population (`classifier-census.vl --keep`). The sweep grades are
`sweep.vl diff` against that seed.

## 1. The shadow

`unionNameOfRead` was asked only of name reads: no field, element or call read reached it. A
scratch compiler compared the legacy name's row (`unionRowOf`) with the rows of the read rep's
`rrStoreTy` (`unRowOfTyKey`, then `unRowOfKeyOrMembers`, then `unRowOfCanonFolded`):

| verdict | calls |
| --- | --- |
| same row by type key | 695,610 |
| same row by key or members | 2,812 |
| same row by folded canon | 14 |
| legacy names a spelling bound to no row | 6,785 |
| legacy names a row, the type keys none | 1,472 |
| both name rows, different ones | 842 |
| legacy names none, the type keys a row | 631 |

Comparing rows is not enough, since the name is a key the consumer reads. The 6,785 unbound
spellings are atom unions named by their key's own text (`i32|i64` for `i64 | i32`), the name the
box is interned under. The 1,472 rows the type keys none of are rows registered under the softened
spelling (`i32|null` for `1 | 2 | null`, `i32|string|null` for `M | null`). They are also
nullable list unions whose box is registered without its `null` (`P[]|i32[]` for
`P[] | i32[] | null`), and reads whose type is a hole.

## 2. Graded at the consumers

Each candidate is a one-level compiler built by the base seed, swept whole.

| candidate | `runs → not-runs` | new traps |
| --- | --- | --- |
| row by type key, then key or members, then canon | 32 | 16 |
| `anonUnionFieldName`'s type rungs (key text for atom unions, soft key last) | 9 | 8 |
| the same, store type read without the read rep's kinds | 6 | 5 |
| the same, a nullable union box with no row of its own at its inner union's | 3 | 2 |
| the same, a hole the instance does not bind asks the legacy walk | 0 | 0 |

The second row's three extra traps were unbounded recursion. `readRepOf(x)` asks
`identReadContainerAt`, which reaches `asgReadNarrowTy` and asks `unionNameOfRead(x)` again. The
store type needs none of the read rep's kinds, so it is its own reader, `readStoreTyAt`, which
`readRepGo` now asks too.

The inner-union rung is gated on the nullable's rep being `union`. Without the gate, `K | null`
over a literal union `K` named `K`'s row, and `types/is-null-guard-niche-reps.vl` printed
differently.

## 3. Switched

`unionNameOfRead` answers a name read with `regUnionNameOfTy` of its storage type. That function
is `anonUnionFieldName`'s type half, split out in emit_anon_fields.vl. A type that is neither a
union nor a nullable, and a nullable record, answer "" before anything renders. It does not ask the read rep, so the memo and its cost
are unchanged. A non-name read answers "", as it already did.

The by-name walk stays, renamed `unionNameOfHoleRead` and probed, for a name read whose type keeps
an inference hole that `holeOperandTyOf` does not bind. Its families:

* `const x = a.h` in an un-annotated parameter's instance, boxed at the instance's join (D15628,
  `unions/shared-mixed-field-read-through-hole-param.vl`).
* `m.get("b")` over a `Map()` of hole functions, typed `((_) => _) | null` and boxed at
  `i32 | null` (`maps/fn-set-map-get-binding-in-function.vl`).

The box the binding was stored as is the missing fact, which is group 2's.

**Graded on the fixpoint seed** (6,599,824 bytes, +429) against the base seed:

* 23,824 same, 0 `runs → not-runs`, 0 new traps.
* 1 output mover: D4203 goes from `emit_reject` to runs, correctly. The walk named the template's
  `T | 1`, which no row holds, and the storage type is the instance's `string | 1`. Both of its
  grading-list spellings run too. The row is closed, with fixture
  `generics/literal-test-on-param-joined-with-a-literal.vl`.
* 1 bytes-only mover: `generics/match-join-of-nullable-param-keeps-concrete-arm.vl`. In `h<f64>`,
  `match k { 0 => a0, 1 => null, _ => 5 }` is typed `f64 | null`, and the walk named
  `f64|i32|null`. The `5` is boxed as `f64`, so the print's `i32` arm could never run. It is
  dropped.

## The `diamond record depth in an un-annotated map` cost row

A first fixpoint failed it at 3.161 against a bar of 2.5. `v`, typed `A12 | null`, rendered its
type's key, a spelling that doubles per level. The record guard brings it back. Guest fuel, 12
levels:

| compiler | diamond | chain | ratio |
| --- | --- | --- | --- |
| base | 23,291,446 | 9,895,916 | 2.35 |
| without the record guard | 31,298,622 | 9,902,800 | 3.16 |
| this PR | 23,304,480 | 9,843,970 | 2.37 |

`vl_scaling_shape_test.ts` passes, 90 of 90.

## The plumb-shape peak RSS row

CI's `ci-cost` failed main peak RSS at 458.6 MB against 318.0 MB, with fuel +2.1%. Nothing is
retained: `$VL_GC_STATS` reads the same peak live heap after a collection (120,338 KiB on the
base seed, 119,961 KiB). The unit has no unions, and every `i32` or `i64` name read rendered its
type's key text (`regUnionNameOfTy`) and threw it away. The garbage between collections grew the
heap. The gate on a union or a nullable stops the renders. `plumb-shape-cost.vl -- --check`
under `VL_ISA=x86-64-v3`, with GNU `time`:

| seed | main fuel | main peak RSS |
| --- | --- | --- |
| baseline | 8,975,636,030 | 318.0 MB |
| without the gate | 9,169,428,690 (+2.2%) | 454.0 MB (+42.8%) |
| this PR | 9,049,572,166 (+0.8%) | 319.4 MB (+0.4%) |

The sweep is unchanged by the gate (23,824 same, 0 `runs → not-runs`).

## Census (`classifier-census.vl`)

| tree | probed | calls |
| --- | --- | --- |
| base `9c5f881e` | 25 | 8,021,095 |
| this PR | 25 | 7,356,403 |

`unionNameOfRead` (708,166) leaves the probe set. `unionNameOfHoleRead` enters with 72,498 calls
in 877 files. The walk's own askers fall:

* `mapReadMvSlot`: 598,949 → 590,805
* `nulVariantIdxOfExpr`: 757,010 → 751,081
* `refListSlotOfExpr`: 120,140 → 114,403
* `structIndexOfExpr`: 1,196,539 → 1,187,692

**Proof.** The seed is a fixpoint (two `refresh-compiler.sh` runs, byte-identical).

* `rep-fuzz-check.sh`: exact.
* `lint-self.sh`: clean.
* `seed-size --check`: +0.2%.
* `late-demands --check`: 6, the baseline.
* `plumb-shape-cost --check`: ok, RSS graded (above).
* `cases_wasm` shards 0–3: 7,396 passed.
* The inventory rows and refs tests pass.
* `check-filed-witnesses --strict`: 4,683 as filed, 0 output mismatches.
