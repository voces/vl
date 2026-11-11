# Step 7 L2 §7: two ref-list mints classify by the element type, and `ensureRefElem` is deleted, 2026-11-11

`ensureRefElemTys(elemName, ty, kindTy)` classifies the element by `kindTy` and falls back to the
spelling (`refArrElemKind(refElemArrName(elemName))`) when it has none.
`2026-11-11-step7-l2-shape-rows-reflist-gate.md` measured 1,226 programs that reach that fallback
untyped. This PR passes a type at the callers that hold one. Base is master `f50936aa` (#7141),
with a fixpoint seed of 6,613,699 bytes. The population is the sweep's 23,885 programs.

## Who reached the fallback with no type

The probe was an `emitFail` in a compiler built into scratch. It was tagged by a module global that
each call site sets, so each program reports the first caller to reach the fallback. The control was
a program that runs on base and fails with the tagged marker on the probe build. Counts are
**programs**.

| caller | before | after |
| --- | --- | --- |
| `collectARefArrayAnn`: `ensureRefElemTy(ren, renTy)`, where `renTy` is -1 for a nominal key by design | 830 | 0: it passes its element type `raTy` as `kindTy` and keeps the key hint -1 |
| `collectAArrayLit`: `ensureRefElem(shapeElem)` (D1511) | 353 | 0: it passes `rlHintElemTy(i)` as `kindTy`, with the key unhinted |
| kind-9 inner recursion | 39 | 0: the inner `kindTy` is the element type past a `\| null` (`tyStepElem(tyPeelNul(kindTy))`). A nullable inner list stepped to -1 before |
| `mvShapeOf…`'s vals list (`ensureRefElemTy(bare, bareTy)`) | 3 | 3 (`D9715`, `hole-fn-list-map-value-tagged.vl`, `hole-fn-nested-list-map-value.vl`): `bareTy` is -1 there |
| `rlRowOfNameMinted`: the template field at a type parameter | 1 | 1: there is no type to pass |

A typed caller whose type the classifier declines still reaches the fallback. These are 10
programs, all unions of lists. The inner-name cut (`refArrElemName(elemName)` when the inner
element type names no row) is still reached in 24 programs from `collectAArrayLit`'s kind-9 arm.

## Changed

- `collectARefArrayAnn` calls `ensureRefElemTys(ren, renTy, raTy)`. The arm's own kind reads already
  used `raTy`, so the intern now classifies the same way the arm does.
- `collectAArrayLit`'s shape-element rescue calls `ensureRefElemTys(shapeElem, -1, rlHintElemTy(i))`.
- `ensureRefElemTys` steps the inner element type past a nullable.
- `ensureRefElem` has no callers left and is deleted.

The render-parse count does not move (`refElemArrName` is not one of the ten parsers). What moves is
how often the spelling decides: from 1,226 programs to 4.

## Proof

- Refresh ×2 is a fixpoint at 6,613,692 bytes (−7).
- `sweep.vl diff` from base to candidate: **23,884 same**, and 1 bytes-only mover. The mover is
  `generics/literal-read-in-place-and-bare-param-result.vl`, where the same 21 wasm types are
  assigned different indices: the inner row of `i32[][] | null` is now named from its type, so it
  is interned in a different order. The type multiset is identical and so is the output. There are
  0 output movers, 0 `runs → not-runs` and 0 new compiler traps.
- `scripts/gate.sh`: all 23 rows pass. These include lint-self and fmt, seed size, late demands,
  plumb-shape cost, the kind-ladder, dead-export and render-parse budgets (render-parse unchanged
  at 69), rep-fuzz, the filed witnesses, the capability probes and the distilled corpus.
