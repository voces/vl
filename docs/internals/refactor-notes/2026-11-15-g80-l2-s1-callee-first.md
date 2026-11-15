# L2 S1: callee-first order for un-annotated callees, measured, 2026-11-15

Lane G. This is step S1 of `l2-inferred-interfaces-design.md` §8. It was measured against master
`55151b05`, with fixpoint seeds on both sides.

## The change

`eagerCheckable` and `ownFactsStand` (check_top_level.vl) decide whether a top-level statement
checks a later-declared function before itself. Both refused any function with an un-annotated
parameter, because a call solved it. S1 drops that refusal except for a parameter its calls decide
(`callDecidesParam`):
- **a map:** a `get`, `set`, `has` or `delete` on it, or a store at a string key. `holeDemandOk`
  refuses to pin a map demand that a body checked earlier left open, because the body's node types
  would be stale. Pinning it is bidirectional, which is S3's solver.
- **a parameter written into a binding** (`b = a`). D15053's binding holds a function set's id only
  when every call hands it a member, so the body must follow the calls.

A call cycle still keeps source order (`c == d`, `path`). So S1 does not depend on choice 3 (§9),
which decides how a recursion group's members share variables.

## Grading

Three variants, each against the master seed:

| variant | `tests/cases` as written: differ / 6,436 | decl-order movers / 5,218 | clause-1 movers | new movers | `regress.vl` |
|---|---|---|---|---|---|
| master | — | 57 | 0 | — | — |
| exemption deleted outright | 2 (runs → check reject) | 13 | 1 (invalid module) | 1 | no cell changed |
| except a map parameter | 0 | 14 | 0 | 1 (emit reject) | no cell changed |
| **except a parameter its calls decide (this PR)** | **0** | **16** | **0** | **0** | **no cell changed** |

- The as-written column compares each `@run` file's output and exit code under both seeds.
- **41 programs no longer move**; the other 16 movers are all among master's 57.
  `scripts/decl-order-ab-baseline.txt` is rewritten from 57 lines to 16. All 16 move to a loud
  check or emit refusal.
- **Losses the exceptions avoid:**
  - Deleting the exemption outright refuses `closures/fn-map-get-through-hole-param.vl` and
    `closures/fn-list-pop-get-through-hole-param.vl` as written. Both fail with "parameter is used
    as a map but nothing in the body pins its key or value". It also builds an invalid module for
    `closures/hole-fn-generic-map-stored-through-parameter.vl` with its declarations last. That
    happens whenever either of its two map-storing callees is checked early (D16630).
  - The map exception alone refuses `closures/written-let-seeded-generic-written-hole-param-at-two-types.vl`
    with its declarations last ("a generic function taken as a value reaches no call that fixes its
    type").
- **`fnWritesHoleParam` is not subsumed.** With its trigger removed as well, movers rise from 16 to
  25 on this PR's variant (14 to 23 on the map-only one), so it stays.
- **D16301's witness runs** (`5.5`; master traps), and D16301 closes. D16368 is unchanged: it reads
  a module `let`, which is a separate exemption.

The capability matrices are §Matrices below.

## Matrices

`capability-matrix.vl --before <master> --after <this PR>` over the 456 templates under
`scripts/capability-probes/matrix/` whose names hold `hole`, `infer`, `record` or `empty`:
- 0 `runs → not-runs` in all 456;
- 0 of 31,214 graded cells change grade;
- 5 templates exit 1, each on SILENT or program-trap cells that grade the same on both seeds:
  - `generic-fn-record-result-bound-by-destination`
  - `generic-two-result-pins-inferred`
  - `hole-fn-bound-nested-list-returned-at-two-instances`
  - `hole-fn-lambda-relaying-i32-at-f64-fn-type`
  - `inferred-generic-list-union-complement`

## Commands

```
vl run scripts/decl-order-ab.vl -- --compiler <seed> [--write-baseline]
vl run scripts/silent-sweep/distilled/regress.vl -- <seed>
vl run scripts/capability-matrix.vl -- <template> --before <master seed> --after <seed>
```

The as-written comparison runs `vl run <case>` under both seeds and compares stdout, stderr and the
exit code.

## Lines

- `compiler/check_top_level.vl`: +57 −7. The predicate is 33 lines, its comment and the two
  predicates' comments the rest.
- The seed grows 6,375,036 → 6,377,118 bytes (+0.03%). Two refreshes are byte-identical.
- Three fixtures, one row (D16630), and the decl-order baseline: 57 → 16 lines.
