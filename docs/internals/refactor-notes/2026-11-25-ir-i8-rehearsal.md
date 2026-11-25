# The I8 rehearsal: stage B minus a keep set, on every population (2026-11-25, lane CENSUS)

This note rehearses `ir-i8-cutover-2026-11.md` §5 on master 7eddff27, from a fixpoint seed, in a
scratch tree (nothing under `build/`). The plan it led to is that note's §7.

## Method

1. `stub-reach.sh`'s stage B, with each stub writing `emitFail("i8 stub <fn>")`, so a failure names
   its stub. Three stubs need a typed return to check; all three are now in the keep set.
2. Build that tree with the seed. Then run `VL_IR_SHADOW=5 vl check --codegen` over all 27,421
   programs (the census list plus the self-compile), in batches of 100.
3. Every `claim fell back: … i8 stub X` names an IR need: X joins the keep set, passed to the stage
   as `BAR`, which is neither emptied nor propagated through. Rebuild and repeat until no new need
   appears. The 14 entry points never join.
4. Inside a kept function, and in `emit_sections.vl`'s global init and const cell writers, each
   `emitExpr(` and `emitWidened(` call is rewritten to a stub that names the caller. A re-entry then
   reads `i8 reentry <caller>`.
5. A stub the IR calls through a sentinel makes the IR refuse with its own reason (`nullable record
   compare fields`, `listGetOr head`), not the stub's. A per-stub counter finds those. The stub body
   becomes `i8Hit("i8 hit X"); return emitFail(..)`, `emit_bytes.vl` holds the hits, and
   `ir_build`'s `count` drains them into `[ir]` rows.
6. `vl run --batch` every program with the seed and with B, comparing stdout and failure. The batch
   output is named by basename and every witness is `w.vl`, so a batch holds unique basenames.

## The keep set's growth

| rebuilds | keep set | functions emptied | lines deleted (outside `ir*.vl`) |
|---:|---:|---:|---:|
| 1 | 0 | 539 | 19,968 |
| 2 | 23 | 514 | 18,738 |
| 8 | 81 | 427 | 14,203 |
| 22 | 99 | 389 | 13,240 |
| 29 | 109 | 375 | 12,972 (9,142 emptied, 3,830 unreached) |

The last rounds add about one name each: the record copy and union coercion chains are deep.
Seeding the set from the static IR→stub edges would save rebuilds. The 19 names beyond the 90 in
`scripts/ir-i8-census/keep.txt` (since replaced by `keep/`, one file per function): emitChainRootElem emitCoerceAtomPayload emitEqIsNull
emitEqRootIsNull emitListGetRecv emitMapGetScalarBox emitMapPrep emitMapPrepFor emitMapRecvKey
emitNulIsNullTest emitUnionCoerceAtomBox emitUnionCoerceValueAtom emitUnionListLitViaRefArm
eqHelpFnBody listGetOrOpen nulStructEqGuardTail pushMapRecvRef refListReadAt structEqStage.

## The run, seed against B with 105 kept

| outcome | programs |
|---|---:|
| same output | 20,490 |
| output differs | 0 |
| fails under both | 4,867 |
| fails only under B | 2,064 |

The table in §7 splits the 2,064 by cause. The re-entries, by programs reaching each (the last
round's two included):

| kept tail | programs |
|---|---:|
| `rcReadSource` | 309 |
| `arrLitDataElemEmit` | 150 |
| `emitListGetIdx` | 58 |
| `emitChainRead` | 50 |
| `emitStrValue` (also the self-compile, in `litI64HeldTargetOf`) | 47 |
| `emitArmSiteAt` | 22 |
| `emitListGetRecv` | 17 |
| `emitDelivered` | 7 |
| `refListReadAt` | 4 |
| `emitCoerceAtomPayload` | 3 |
| `pushMapRecvRef` | 2 |
| `emitNulIsNullTest` | 2 |

`emitConstCellInit` reaches `emitExpr` in 8 programs whose functions and start bodies are all
claimed, among them the `d16121` cells: a map of functions pushed into a list. The global
initializer writers (`emitStartGlobalInit`, `emitStartGlobalInitValue`) reach it 796 times, always
in a program whose start body is unclaimed or falls back.

## Latent re-entries

A kept tail also calls these stubbed writers, and no population reaches them yet: emitAssign,
emitUnionBox, emitUnionBoxAs, emitUnionBoxArg, emitHoleBox, emitUnionIfValue,
emitNulNoneBoxPayload, emitUnionNestedListLit, emitUnionCoerceRefArray,
emitUnionCoerceMapElemList, emitNulMapArmBox, emitScalarValue, emitReturnPlainValue, emitArrAt,
emitChainRootElem, njStash. (`emitChainRootElem` was kept in the last round.)

## Still open

Four record compares still fall back under B: three `nullable record compare fields`, one `record
compare fields`.
