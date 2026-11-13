# Step 7 L2, mono, P6 cut 5: the last pin-list and element-name parses (2026-11-13)

Lane D. Base `origin/master` at this branch's cut. Three items from lane H's regenerated census
and lane E's handover.

## Cut

1. **`monoPinAnnotatedParam`'s `T[]` fallback.** A `T` bound only by an explicit type argument's
   spelling (D5001's `lenG<V>(a)`) has no element type. Its argument's own type is closed,
   though (`i32[]`), and the pin now spells it. `arrElemSuffixed(bind)` is gone. A loud floor
   fires where neither type closes.
2. **`monoArgTyNameRep`'s spread rung** (`arrElemSuffixed(spreadLitSrcRowName(...))`) is
   unreached. Master floored it loudly in parallel; the merge keeps master's floor.
3. **`annSplitParams` / `monoSigPinsTop`** are deleted.
   - `monoSlotPinAnn` spells each parameter from the closed type `monoPinFnParamTys` hands back,
     not from the pin list's text.
   - A non-empty pin list with no closed types is a loud floor.
   - `monoPinFnParamTys`' count check was implied by `pinSigOf(tys) == sig`, so it goes too.

## Decision tables

From `MPROBE` builds over the 24,070-record population.
- **Bare-name `T[]` fallback:** reached in 2 programs (D5001, and
  `closure-calls-generic-at-enclosing-explicit-type-arg.vl`). In both, the argument's type is
  closed (`i32[]`).
- **`monoSlotPinAnn`'s text branch:** reached in 958 programs (2,380 decisions). Closed types are
  held in every one. The type's spelling equals the text in 957 programs (2,379 decisions); one
  decision differs (`closure-value-map-param.vl`) and builds identically.
- **The spread rung:** unreached (census).

Each new floor has a forced control build that fires its message:
- the `T[]` floor on D5001;
- the spread floor on D9647;
- the slot floor on `closure-value-map-param.vl`.

## Byte comparison

Master vs PR over every program reaching any of the three sites, plus the spread tests: **1,627
of 1,627 identical** (1,603 SAME, 24 SAME refusal).

## Census

Entries leaving the baseline, all lane D's:
- `annSplitParams`' `tyTopLevelSplit`;
- the `T[]` fallback's `arrElemSuffixed(bind)`.

The `T[]` pin's render changes text only. Renders hold: the slot pin's inline-record branch
merges into the new by-type spelling.
