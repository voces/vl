# Step 7: the read rep carries its storage's type and mv slot; `nulVariantIdxOfExpr`'s reads switch, 2026-11-10

Group 6 of `2026-11-09-step7-classifiers-remaining.md`, under the ruling in DECISIONS.md §"How step 7's
classifier half finishes": a read's slot is an emitter rep record, kept where the read rep is computed,
in the numbering of the table the reader indexes. Base is master `00e672ba` (#7025), fixpoint seed
6,597,010 bytes. Counts are post-mono calls over the 23,816-program sweep population, from a scratch
compiler that wraps each classifier and tags each call with `SH6 <fn> <read kind> <rrStore>|<rrRead>`
and its answer (`classifier-census.vl --keep`).

## 1. What `readRepOf` covers today

`readStoreOf` already answers all four read kinds. A read it covers has a non-empty `rrStore`.

| classifier | Ident cov / not | Member | Index | Call | not a read |
| --- | --- | --- | --- | --- | --- |
| `exprIsLitAtom` | 542,507 / 5 | 21,853 / 30,838 | 26,769 / 10,396 | 22,509 / 141,196 | 447,800 |
| `exprNulLitUnion` | 608,650 / 0 | 14,655 / 27,459 | 29,264 / 11,917 | 36,481 / 125,024 | 367,302 |
| `exprIsNulNone` | 125,428 / 14 | 44,618 / 79,133 | 72,316 / 22,341 | 11,728 / 89,546 | 213,517 |
| `nulVariantIdxOfExpr` | 633,915 / 6 | 94,491 / 3,620 | 31,313 / 31 | 6,162 / 53,011 | 90,310 |
| `unionNameOfRead` | 617,624 / 26 | — | — | — | — |
| `mapReadMvSlot` (its receiver) | 38,615 / 0 | 7,272 / 42 | 262,356 / 117,172 | 8,229 / 5,720 | 9,785 |

An uncovered field or call read is one whose storage is none of the kinds `readStoreOf` names (a
struct's `i32` field, a call returning a record). For the boolean classifiers that is an answer: no
uncovered read answered true. "Not a read" is the `if`, `??`, `=` and `as` joins, which a read rep
does not answer.

## 2. The extension

`ReadRep` gains two fields, filled by `readRepGo` for every name, field, element and call read:

* `rrStoreTy`: the storage's type, the type the checker narrowed the read out of (`readNarrowedStoreAt`),
  else the read's own.
* `rrMv`: a map value read's mv slot (`mapReadMvSlot`, which `readIndexStoreKind` already asks to
  name the store).

`readNulVariantRow(rr)` translates it into the variant table's numbering: the mv slot's variant
(`mvValVariantOf`) for a map value read, else `repVariantShapeRowOf` of the nullable storage type's
inner type. The other two tables need no new field. The mv table's slot of a map read is
`repSlotOfKind("map", ty)` of the receiver's read type. The struct table's row is the structural
`structRowOfRecordTy`. No group-6 classifier indexes the struct table, so this PR adds no struct
translator.

## 3. Shadows

| classifier | typed twin | agree | disagree |
| --- | --- | --- | --- |
| `nulVariantIdxOfExpr` reads | `rrStoreTy`'s nullable inner row | 823,607 | 186 (Index 123, Member 50, Call 13) |
| `nulVariantIdxOfExpr` reads | the same, mv slot's variant first (shipped) | graded at consumers | 12 byte movers, 0 output |
| `mapReadMvSlot` | `repSlotOfKind("map", receiver's read type)` | 451,523, and 362 more equal under `mvCanonRepOf` | 1,511 (`0/-1` 1,466) |
| `unionNameOfRead` | `unNames[unRowOfCanonFolded(rrStoreTy)]` | 605,881 | 14,337 (10,687 where both name a union) |
| `exprIsNulNone` reads | `rrRead` in `READ_NUL_NONE_KINDS` | all but 2 | 2 (`Index mv3\|nulnone`, `linked-open-collections-take-one-pin.vl`) |
| `exprIsLitAtom` field, element, call reads | `rrStore` is `litatom` or `nullitatom` | all | 0 |
| `exprIsLitAtom` name reads | the read rep | — | 13,779 true at an `i32` cell |
| `exprNulLitUnion` reads | `rrRead` `nullitatom` | — | 7,202 true at an `i32` cell, 887 at a `litatom` map read |

**The first twin's Index misses are D15240/D15317's maps built wider than their type** (`const m =
Map()` filled with a wider record). Their value row is the mv slot's, and the type keys the canonical
row. Switched without the mv arm, 17 programs stop running (`cast failure`). The read's own table is
the map's, so `rrMv` is what the reader indexes.

**Graded at the consumers.** The shipped twin replaces every read arm. Compared to the base fixpoint
seed: 23,804 same, 12 bytes-only, 0 output movers, 0 `runs → not-runs`, 0 new traps. The 12 drop a
`ref.as_non_null` and the reads before it. Legacy `memberNulVariantRow` named a variant row for a
non-null variant field, and the consumer then cast a non-null value non-null. The 12 are D208,
`d001020`/`d001021`, `d005520`/`d005521`, four `d3204_r3_gm_m0016{8,71}_wr_isA_v_*`,
`for-in-arm-layout-nested-field-empty-reflist-table.vl`,
`anon-literal-adopted-by-a-declared-box-field.vl` and `struct-holding-self-recursive-arm.vl`.

## 4. Switched

`nulVariantIdxOfExpr`'s `Ident`, `Member`, `Index` and `Call` arms are one arm reading
`readNulVariantRow(readRepOf(·))`. Deleted: `nulVariantRowOfRead`, `memberNulVariantRow`,
`cloRetNulVariantRow` and `popArmElemVariantRow`. It stays probed for its `if`, `??`, `=` and
`as` arms.

## 5. What stands

* `mapReadMvSlot`: it is the producer of `rrMv`. Its 1,466 `0/-1` calls are mostly D15319's maps
  built by `set` (`built-map-read-unbound-join-default-runs.vl` has 254 of them), where the
  receiver's read type keys no mv slot. The missing fact is the slot the map's builder chose, which
  is the binding's, not the read's.
* `unionNameOfRead`: in 10,687 of the 14,337 calls both readers name a union, and the names
  differ. An alias against its registered name would differ this way. The next shadow compares rows
  (`unRowOfName`), not names.
* `exprIsNulNone`: ready to switch, with 2 calls to grade.
* `exprIsLitAtom`, `exprNulLitUnion`: their field, element and call arms are the read rep already.
  A name read's store is the `i32` cell, so the read rep cannot tell an atom id from an integer.
  The missing fact is the binding's atom rep (`RepDesc.rdAtom` of `letBindRep`), recorded on the
  name read's store as `litatom` or `nullitatom`.

## The `diamond record depth` cost row

CI's `ci-cost` failed `scaling shape: diamond record depth` at fuel ratio 4.463 against a bar of 4.45.
The change is not depth-dependent. Measured on a 12-level diamond and its chain (guest fuel):

| compiler | diamond | chain | ratio |
| --- | --- | --- | --- |
| master | 74,678,151 | 17,574,420 | 4.25 |
| this PR, read rep only | 73,614,747 | 16,494,756 | 4.46 |
| this PR, with the memo below | 71,747,758 | 16,438,485 | 4.36 |

The read rep saves about 1.07 M on both arms, so the chain's smaller fixed cost lifts the ratio.
The diamond's own excess predates it and grows with depth: 10.5 M at 8 levels, 57.1 M at 12 and
196 M at 16. A profile at 16 levels put a third of the samples in `boxTyKeeps`
(check_fit_rules.vl). It renders a union's whole emit name only to test whether the name is empty.
`tyToEmitName`'s record memo lasts one top-level render, and a 2^n-long spelling is built again
on every call. `boxTyNamesNothing` remembers the answer for the last type asked. The memo is keyed
on the compile generation, `T.tys.length`, `tyMutEpoch` and `cUserTypesVer`. At 16 levels it saves
27.7 M.

Every `tests/cases` program (7,681) compiles to the same module or refusal with the memo as without
it. The whole `vl_scaling_shape_test.ts` passes (90 of 90). Seed 6,596,653 bytes, fixpoint.

## Census (`classifier-census.vl`)

| tree | probed | calls |
| --- | --- | --- |
| base `00e672ba` | 42 | 13,113,645 |
| this PR | 42 | 10,992,074 |

`nulVariantIdxOfExpr` goes from 955,503 to 854,182. `structIndexOfExpr` goes from 3,497,140 to
1,322,471, because the deleted field arm asked `memberFieldCode` for every call. `mapReadMvSlot`
rises from 492,183 to 527,146, from the `rrMv` call.

**Proof.** Both sides are fixpoint seeds: base 6,597,010 bytes, this PR 6,596,460 (−550). The sweep
is as in §3. `rep-fuzz-check.sh`: exact, 0 failures.
