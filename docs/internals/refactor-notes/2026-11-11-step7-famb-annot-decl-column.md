# Step 7 slot layer, family B, PR 1: the annotation's declaration, recorded by the checker, 2026-11-11

This is item 1 of the series in `2026-11-11-step7-famb-decl-identity-census.md` (#7135). It adds
the checker node column that records which declared record an annotation names. It then converts
the census's three annotation sites to read that column. Base is master `98b73ba7` (#7132). Its
fixpoint seed is 6,614,018 bytes.

## The column

`annDeclPos` (`check_node_tys.vl`) maps an annotation node to the struct-sidecar position
(`cStructNames`) of the record it names, or -1. It is sparse and reset with `nodeTyIx`.

- **Writers.** It is written where an annotation resolves with a node in hand: `resolveAnnotAt`
  (parameters and returns) and `nameToTyAnn` (`let` annotations, casts, type arguments and
  struct fields). Each writes the declaration of the spelled name at the resolved type, or -1.
- **A plain alias** (`type C2 = Circle`) names its target's declaration. The probe found
  that case: an alias's notes otherwise left -1 on a node the emitter reads as `Circle`.
- **No row is minted.** The column selects among existing declarations. A node with no
  recorded declaration keeps the answer it has today.

It is an `i32[]`, not a `Map`, so `scripts/probe-map-classes.tsv` gains no row. A quiet probe
that writes it writes the answer the standing pass writes again: the same name at the same type.

## The three sites

| site | before | after |
| --- | --- | --- |
| `annVariantRowOf` (`emit_nullable_rets`) | `variantIndexOf(n.tyName)` | `annDeclVariantRow(tyIx, n.tyName)` |
| `fnRetVariantIndexSid` (`emit_sig_tokens`) | `variantIndexOf(rt.tyName)` | `annDeclVariantRow(fn.fnRet, rt.tyName)` |
| `exprVariantIndex`, the `AsExpr` arm (`emit_classify`) | `variantIndexOf(nominalStructNameOfTy(ty))`, the type's first name | `annDeclVariantRow(exprIx, …)`, the declaration the cast names |

`annDeclVariantRow(ann, spelled)` (`emit_local_slots`) answers the recorded declaration's
variant row. Where the checker recorded no declaration, it answers `spelled`'s row.

## Measurement

A probe compiler was built from the candidate by the base seed and never refreshed into
`build/`. At each site it computed the old and the new answer. It noted `diff` when they
differed at a node with a recorded declaration, and `nodecl` when they differed at a node
without one. It reported once per program at the end of `emitProgram`, overriding any earlier
emit error, so an earlier failure masks nothing. The control fired as expected:
- `Circle` is an arm and `CircleC = {r: i32}` is standalone, declared first.
- `s as! Circle` noted `C.diff:CircleC`.
- Before the alias rule, `type C2 = Circle` noted `A.nodecl`/`B.nodecl`.

The sweep covered 23,877 programs (`scripts/sweep.vl record`). Counts are **programs**:

| site | `diff` | `nodecl` | what the `nodecl` nodes are |
| --- | --- | --- | --- |
| A `annVariantRowOf` | 0 | 218 | an instance's pinned spelling: `{r:i32}` 142, a type parameter's pin (`J`, `O`, `C`, …) and a pinned arm name (`Circle` 19, …) |
| B `fnRetVariantIndexSid` | 0 | 46 | the same: `J` 18, `{shape}` 12, `Circle` 8, … |
| C the `AsExpr` arm | 1 | 0 | — |

- **A and B are byte-identical by construction.** Every node the checker resolved names
  the declaration its spelling already named. The name read survives only at the `nodecl`
  nodes. Those are TypeRefs the monomorphizer spells for an instance, and the checker never
  resolved them by declaration. A type parameter has a type and no declaration, so the
  spelling's row there is the type's answer, as the ruling requires. Carrying a declaration
  through an instance's pin belongs to the emit_mono lane.
- **C moved one program, `tests/cases/unions/as-struct-arm.vl`.** It is ARM2:
  - `A1` and `A2 = {v: f64}` are arms of two unions, and `m2(n) as A2` read `A1`'s row.
  - The cast now reads `A2`'s row, the arm the box holds.
  - The program printed its full `@log` before and after the change.

## Found: D15670

The control still refuses after this PR, at another site. The cast's tag lookup
(`unionArmTagsOfTy`, `wasmEmit.vl`) reads each arm's variant row through
`nominalStructNameOfTy`. With `CircleC` declared before the arm `Circle`, `s as! Circle` is a
loud emit reject. Declare `CircleC` second, or drop it, and the program runs. That is filed as
D15670, the next PR's target. It reads the same column on the cast node.

## Proof

- Refresh ×2 is a fixpoint at 6,615,113 bytes on base `98b73ba7` (+1,095). Merged with master
  `ada32709`, it is a fixpoint at 6,616,574 bytes.
- The `sweep` label re-proves the whole population on CI.
