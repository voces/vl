# Top-level statements checked callee-first: four arms, none shipped, 2026-11-15

Lane J. A measured negative result, kept so the next attempt starts from it. No code lands with
this note; the arms are scratch seeds.

## The question

D16301's declaration-order movers, ablated cell by cell, split into two kinds. 14 of the 21 cells
with no slot fact run when their top-level statements are moved into a `main()` declared before
the functions; 6 others fail even there. That points at pass 2's `progCheckCalleeFirst`
(`compiler/check_top_level.vl`). Before checking a FuncDecl statement, it checks a callee
declared after it whose result is pending or whose write summary is unsettled. A plain top-level
statement gets no such treatment, and at top level the pre-passes have usually settled the
callee, so the trigger would not fire anyway.

The hypothesis: check top-level statements the way an early-declared function body is checked,
so one rule replaces the per-family fixes.

## The arms

Every arm widens `weFnRefs` to a non-function statement and changes `progCheckCalleeFirst`'s
trigger for one:

- **h:** a top-level statement checks every later-declared function it names first.
- **r1:** h, minus callees with an un-annotated parameter, but with the pending/unsettled triggers
  still live for top-level statements. That last part was a bug, so r1 is not a clean arm.
- **r2:** for a top-level statement, the only trigger is "callee has no un-annotated parameter"
  (`fnHasHoleParam`). Function statements keep the source-order trigger.
- **r3:** r2, also skipping callees with type parameters.
- **r4 (transitive):** r2, and a function checked eagerly checks its own unchecked callees eagerly
  too, with the same skip, wherever they are declared.

## Results

Base: master `8c18c4a16` + #8165 + `g66-tag-decide-order`, 5139 `decl-order-ab` cases. Arm h
alone was measured on an earlier master without either fix, so it is listed apart.

| arm | movers | clause-1 | new functions-last losses | corpus oracle |
| --- | --- | --- | --- | --- |
| base | 165 | 17 | — | 7794 / 0 |
| r2 | 123 | 6 | 28 (1 clause-1) | 7794 / 0 |
| r3 | 170 | 14 | 20 | not run |
| r4 | **81** | **4** | **2** | 7793 / 1 (a diagnostic) |
| h, on master alone | 133 (from 313) | 13 (from 39) | 52 (4 clause-1) | 7782 / 2 |

`regress.vl` showed 0 runs → not-runs and 0 → silent on every arm graded with it (h, r2, r4).
D16413 runs under r2 and r4. D16410 and D16411 do not move on any arm, because they are
instance keying, not order.

## What each arm lost, by mechanism

- **h:** a callee with an un-annotated parameter, checked before the statement that pins it. The
  corpus witnesses are `closures/fn-map-get-through-hole-param.vl` and
  `closures/fn-list-pop-get-through-hole-param.vl`: "parameter is used as a map but nothing in the
  body pins its key or value".
- **r2:** the eager check is not transitive. A callee checked early has its own callees checked
  only by the source-order trigger, so its body meets callees whose facts it reads before they
  exist.
  - Ablation, `soundness/guard-function-post-guard-sound`: `readX` is checked early, and
    `isNull`, declared between the statement and `readX` and not pending, is not. So
    `if isNull(p) { return }` has no guard fact (type error).
  - Declaring the helpers above the statement makes it run. Moving `isNull` below `readX` still
    fails, so the trigger matters, not only the position.
  - Most of r2's 28 losses are generic function values and makers ("a function-value call has no
    interned signature").
- **r3:** generics are not the shared factor. Skipping them removes 8 of r2's 28 losses and gives
  back most of the gains.
- **r4** loses 2 functions-last cells and 1 corpus diagnostic. The third new line in its table,
  `closures/generic-list-written-fixed-fn-called-in-generic-body-widens`, moves trap → check, a
  gain.
  - `closures/bundle-parameter-handed-to-a-one-closure-parameter`: "cannot infer a type for
    parameter `x`".
  - `functions/infer-return-through-cycle`: "cannot infer a return type for 'fexpr'".
  - `soundness/capture-assignment-narrowing-rejected` still refuses, but its last refusal loses the
    "`s` is not narrowed inside the function on line 43" note. That note is written only when the
    function is checked after the write.
  - All three are an inference or a note that depends on the caller's statement having been
    checked before the callee: a parameter solved from a call, a return through a cycle, a capture
    narrowing seen from a later write.

## Where this leaves it

r4 is the systematic rule and is two cells and one note short of the bar (0 corpus runs → not-runs,
0 new functions-last losses). A next attempt would exempt the three dependences above from eager
checking, or make each one order-free on its own. Each is a narrower question than declaration
order.
