# The set join at shape 3: two builds of one set (2026-11-08)

Lane "the set join at shape 3 (D15226/D15510), and D15554". It follows
[2026-11-08-held-list-rep-and-deep-set-join](2026-11-08-held-list-rep-and-deep-set-join.md) (#6801).
Parked: nothing in `compiler/` changes in this PR. This note records what blocks the join.

## The blocker is smaller than the three-return fold

Recursing `elabFnJoinDeepAt` past shape 2 as shape 3 is enough for D15226 (`6`/`4`), the
generic `pick<T>` (was invalid wasm) and a typed lambda member (`9`/`4`). It already breaks a
TWO-return function that runs on master:

    function pick(b: boolean) { if b { return [{ fs: [inc0] }] } return [{ fs: [inc0, dbl] }] }

`runs 4/6` goes to `the lists this function returns are built at different rows`. So does the
same program with the returns swapped. The three-return fold from the earlier note is this
case again, in any order.

## Mechanism: the literal's own set decides its build, not the join

Traced with emit probes and a `--names` trap on `nodeTySet`:

1. The checker joins the returns to a result whose leaf holds `{inc0, dbl}`.
2. mono's `monoRetFnListTy` asks `monoTyOpen` of each returned literal's OWN type. A literal of
   a one-member set is open, so it is pinned at `elabHeldValTy`. That is the return slot's closed
   type, and it carries no set (`(i32) => i32`), so the literal is built as closures.
3. A literal whose own set has two members is tagged. `monoTyOpen` says closed, so mono leaves
   it alone. It is built at its own type, as member ids (`i32[]` in a struct).
4. `fnRetRefListRowJoin` then sees two rows and returns -2.

D15226 runs only because both of its literals are one-member sets, so both take the closure
build. Their row is found by element name before the per-value loop runs.

## What was tried, measured on `two_sub` and the three orders

| change | outcome |
| --- | --- |
| `adoptRetLits` stamps every returned literal at the result once any widens | rows still differ (mono ignores the stamp) |
| join returns the side already holding the union (`tySame` and no widen) | rows still differ |
| mono builds a literal at its stamped rep when that rep is tagged-closed | rows agree; **invalid wasm** |
| plus `retListValueSig` reads the rep when stamped | same invalid wasm |

The invalid module (printed with `wasmprinter`, since `wasm-dis` refuses it): the outer list is
built at the tagged record's array, but the record and its `fs` list inside the singleton
literal are still the closure struct. mono's work loop re-types the list literals.
`monoRecordObjLitAt` and `monoRecordOpen` refuse a node whose type is closed, so the record
under it keeps its own build.

## The next step

Pick one build for every literal a joined result returns, and apply it all the way down:

- **Closures everywhere (smaller).** A returned literal stamped at a widened result is pinned at
  `elabHeldValTy` even when its own set is tagged. Its records, lists and function idents are
  re-recorded as well. This needs `monoRecordOpen` (or a sibling) to write a closed node, which
  is emit_mono.vl beyond a few lines.
- **Ids everywhere.** Each singleton literal is built at the tagged rep, with its record and
  ident leaves re-typed. This also lifts D15510's question to the climb: a tagged set whose
  members return `i32` and `f64` has no one signature to lower at.

Either one has to be order-independent by construction. A pairwise guard in `joinRetTys`
cannot see the other returns. The emit-side `inferredRetKindCore` refusal for D15510 stays
unbuilt until the build is decided.

D15554 was not reached.
