# Lane F: the map-value facts and the slot-type write-backs

Four `emit_mono` functions were parked on "lane F's map-value facts" (Status, §3.4). This note
grades each one against the elaboration reader that could answer it. It is measured on master
`744dfc40` over the sweep population of 23,610 programs.

## What each one derives

| function | fact | the elaboration's reader | verdict |
|---|---|---|---|
| `monoFlowMapReadVals` | the values a read of a `Map()` can give: the roots of what each map stores | `mfrLitsMapStored` (over `cwSlotWrittenValues(owner, ["[]"])`) | switched, deleted |
| `monoFlowAliasMaps` | the `Map()` roots a candidate alias holds, when it holds nothing else | `mfrLitsOf(d)` for the roots | roots switched; the rest is (c) |
| `monoReachSlotTy` | the one call type of a literal's open function slot, written on each callee it reaches | `monoLitSlotCallTy` over `elabLitSlotCallTys` for the type; nothing for the calls | blocked |
| `monoReachLitTys` | the literal's own type, closed at that call type | the same climb | write-back deleted; blocked with `monoReachSlotTy` |

## Shadow (counted per decision, with programs in brackets)

| function | agree | both decline | differ | old only | new only |
|---|---|---|---|---|---|
| `monoFlowMapReadVals` against `mfrLitsMapStored` alone | 438 (295) | 36 (21) | 0 | 0 | 0 |
| `monoFlowAliasMaps`, roots from `mfrLitsOf` | 444 (47) | 1,650 (228) | 0 | 0 | 0 |

- **`monoFlowMapReadVals`.** Its own part was the `monoFlowMapOwner` test on each root. Both callers
  already require every root to be a map (`monoFlowMapCount(cv) == cv.length`), and
  `mfrLitsMapStored` refuses a root with no map binding. The two callers now read
  `mfrLitsMapStored` directly, and the function is deleted. Expanding the roots (`monoFlowValsOf`) is
  the read rewrite's own work, (c), as before.
- **`monoFlowAliasMaps`.** The roots now come from `mfrLitsOf` instead of the planner's memo
  (`monoFlowDeclVals`). What is left is **(c)**: the candidate gate, `const`-ness, and the rule that
  every root is a `Map()` some *other* binding owns. That rule is the read rewrite's soundness test,
  not a type decision. A write through the alias must land in the owner map's slots, which the
  rewrite then reads by name (D9480). It retires with `monoFlowReadSet`, not with an elaboration
  fact.
- **`monoFlowMapVals`** was already (c), with 384 programs. It reads `cwSlotWrittenValues`. Its
  hand-on walk is the same soundness test, so it is unchanged.

## The slot-type write-backs

The census label "13 decisions for lane F, 2 for reach" is stale. The 2026-11-06 slot-type note
closed all 15 on the climb, so `monoReachSlotTy`'s answer is already the elaboration's. What mono
still owns is two write-backs of that answer:

| write-back | site-hits (programs) | deleted alone |
|---|---|---|
| callee: `nodeTyRecord(callFn, ct)` at each call `vrCalls` reaches | 367 (207) | **70 runs lost, 32 new compiler traps** |
| literal: `nodeTyRecord(a, ...)` in `monoReachLitTys` | 755 (~300) | 0 runs lost, 0 output movers, 30 bytes only |

- **The literal write-back is deleted.** Of its 30 byte movers, 29 are the same size with the same
  code once type indices are erased: only the type section's order moves. One,
  `closures/generic-list-held-or-returned-written-lambda-called-where-it-fits.vl`, defines one
  function type twice. It is 6 bytes larger, with the same code and output.
- **The callee write-back stays, blocked on a named fact:** the call nodes a literal slot's climb
  reaches. `elabValueCallTysOpenFns` gathers the agreed tuple but not the calls it read it from, so
  nothing gives the callee read its per-node closed type. The witnesses are D15113, D15115 and
  D15206 named cells, `closures/fn-same-shape-records-different-fns-called.vl` and
  `closures/record-of-named-fn-in-generic-field-written-with-*.vl`. Once the climb records the
  calls, `vrCalls` leaves mono, and `monoReachLitTys`, now only a driver, goes too.

## Proof

Fixpoint seeds of master `744dfc40` and of the candidate, swept in full:

| | |
|---|---|
| runs → not-runs | 0 |
| new compiler traps | 0 |
| output movers | 0 |
| bytes-only movers | 30, all from the literal write-back (above) |
| seed | 6,444,894 → 6,444,681 bytes (−213) |
| pin-helper budget (`emit_mono.vl`) | 944 → 943 |
