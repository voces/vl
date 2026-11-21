# IR: the bundle guard narrowed, and inert function values, 2026-11-21

Lane IR-N6, stacked on the bundle call (`2026-11-21-ir-bundle-call.md`). The coordinator gave the
narrowing of #9373's guard to IR-N6.

## The guard

#9373 holds an open function type at the uniform closure rep, but only in a build that makes no
record of closures (`closureHeld`: `!elabMakesClosureRecords() && !bundleAnyParam()`). Without the
guard, a scratch build (not committed) read 48 armed mismatches in 23 `tests/cases` files, all
`bytes: prefix or locals`. In each, a bundle parameter (D14841) is a record of closures in wasm
while the IR typed it at the closure rep. The guard's whole cost was +104 covered, +56 matched.

- `closureHeld` keeps the build-wide test only for a holder's, a returned or a member record of
  closures (`elabMakesHeldClosureRecords`, which drops `erBundles`); a bundle no longer turns it off.
- In its place, the builder refuses a bundle parameter's read anywhere but at a member pick
  (`bundle parameter read`), and an argument delivered into a callee's bundle parameter, which
  legacy builds as a record (`bundle argument`, at a direct and a captured call). The pick reads the
  parameter's local itself (`bundle callee` where it is a capture).
- `bundleAnyNoted` (`emit_bundle.vl`) is a per-build flag that spares every parameter read the
  bundle lookup in a build with none; without it the self-compile paid +0.13% fuel for no change.
- Each new miss leaves its function legacy's: no file loses a function that matched on master's
  seed, in `tests/cases` or the corpus (per-file armed comparison against master `248ff912`).

Compiler lines for the narrowing +41 / −18 (`ir_build.vl` +23 −3, `emit_bundle.vl` +10 −6,
`emit_elab.vl` +4 −5, `emit_classify.vl` +4 −4).

## Inert function values

`fnValueArmOf`'s `inert` and `aliasCore` arms write a function value by `emitClosureValueCore`, the
writer without the generic-value refusal. `cloValueFeOf` takes them; `cloValue` holds each to the
refusal its arm owes (`closureValueCoreWhy` on those arms), and `makeClo` writes the capture-free
value by the core writer, which is legacy's bytes on either arm. Compiler lines +23 / −5
(`ir_build.vl` +19 −3, `ir_lower.vl` +4 −2).

## Readings (base: the bundle call and the inert step merged with master `248ff912`, fixpoint;
candidate fixpoint)

| reading | base | this change |
| --- | ---: | ---: |
| `tests/cases` functions with no blocker | 61,166 | 61,265 (+99) |
| armed `tests/cases` covered / matched | 61,166 / 61,159 | 61,265 / 61,258 |
| `tests/cases` open-type classes (any) | 864 | 644 |
| corpus functions with no blocker | 43,955 | 43,959 |
| self-compile functions with no blocker | 19,391 | 19,391 |
| L2 self-compile fuel | 105,519,719,702 | 105,559,751,204 (+0.038%) |

The bundle misses now name 345 `tests/cases` rows: `bundle parameter read` 180, `bundle
argument` 135, `bundle callee` 22, `bundle call` 8. Building a bundle record as an argument, and
holding a bundle parameter at its record's rep, are the next steps there. The inert step alone,
measured before the merge: +6 functions over the bundle call.
