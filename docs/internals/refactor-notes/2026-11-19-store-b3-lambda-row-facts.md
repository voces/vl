# STORE B3.10b step 1: a lambda set through a hand-back call (2026-11-19)

Site 9's row `closures/hole-fn-or-lambda-through-hole-handed-on` T {<lambda>} moves to the check
(326 → 325 late tag rows, 0 new).

## Ingredients (each removal keeps the row late)
The minimal witness that stays late without all three:
```
function fw(f) { return f }
function ap(f, x) { return f(x) }
const lam = (x) => x
const q = fw(lam)
print(q(3))
print(fw(lam)(3))
print(ap(fw(lam), 3))
```
1. **`sbThroughNote`:** a callee that is a call of a hand-back function (`fw(lam)(3)`) puts the
   handed set in `sbHandedCalls`, as a `const` bound to the call already did, so `ftTry`
   retries it. A set with a generic member is skipped. Without that guard,
   `generics/generic-fn-handed-to-param-delivered-where-a-function-fits.vl` (`back(id)(6)`) fails
   validation in `toFn`.
2. **`arrowRowStray`:** a callee that is a call's result is as owner-less as a bound name, so its
   solve's rows for hole calls in unrelated declarations (`ap`'s `f(x)` at `fw(lam)(3)`) are
   dropped too. A method callee still stands.
3. **`arrowRowFacts`:** a row's per-call facts are built for a lambda set where its body types at
   the call's arguments (`setMemberRetsQuiet`), as the main loop does (B3.2a); before, they were
   built for named members only.

## Measured (master de44e8985 fixpoint vs this branch's fixpoint)
- Late tag rows: 1 gone, 0 new.
- `VL_LATE_DEMANDS=1 vl check --codegen tests`: diagnostics byte-identical.
- Full @run A/B: see the PR.

## Still open on site 9
`closures/hole-lambda-inferred-return-in-generic-at-two-pins` N {<lambda>}:
`deliver() { return fw(lam) }` has no parameter to hand back, so this is a function returning a set
value it closes over, called in a generic body. That is a different producer from the hand-back.
