# Rep ADT stage 2, re-planned from a measurement, 2026-11-15 (lane E)

The design note's stage 2 ([design](2026-11-14-rep-adt-design.md) §3) was: "the 97
`VKind`-returning functions and the 138 re-classifiers read `vkindOf(repOfNode(x, k))`; retire
`RepDesc` and its 22 `rdCovered == 0` fallbacks", at about −2,500 to −3,500 lines. Measured on
master `68cf81051`, that premise is mostly already true.

## What is already derived from the tree

- `vtKindOfType`, the annotation ladder, is `annRepKindOf`, which is `repOfNode(tyIx).rdKind`
  (`emit_shape_rows.vl`).
- The `exprIs{I64,F32,F64,V128,Bool}` family is one function, `exprScalarWidth`. It reads the
  node's type (`nodeTyAt`, `elabNodeTyAt`), and only number literals, direct calls and `??` are
  special-cased.
- Stage 0's shadow agreed on 185,243 of 185,259 corpus kind-table entries. The 16 that differ
  are triaged in the stage-1a note.

So the flat kinds are, for the most part, projections of the tree already. What stage 2 can still
delete is the legacy code behind the fallbacks: about 70 sites test `rdCovered`, and take a
spelling or ladder path when the tree answers uncovered.

## When the tree answers uncovered

An armed count of every `repOfTy` query that answered uncovered during emit, by the tree's reason.
It was measured on a scratch seed; the instrument is not committed.
- **Self-build:** 2 queries, both `leaf:unnarrowable`.
- **Corpus:** 12,037 cells, 3,015 programs with at least one such query.

| reason | queries | programs | what it is |
|---|---|---|---|
| `leaf:unnarrowable` | 10,173 | 2,966 | the rep of an **open** type: a `TyVar` (or `TyErr`) asked during emit, a generic template's type rather than the instance's |
| `noFlatKind:noValue` | 469 | 14 | `never`, which has no flat kind (stage 1b's `RNoValue`) |
| `union:open` | 143 | 107 | a union with an open arm, the same as the first row |
| `nul:unclassified` | 16 | 15 | a nullable with no discipline (`nulDisciplineOfTy` 0) |
| `list:hole` / `map:val-hole` | 16 / 14 | 1 / 1 | an unfilled element or value |

**The finding:** 99% of the fallback traffic is emit asking for the rep of a type that is still
open, where the instance has a closed type. That is the owner's rule (mono and emit read facts,
never re-derive them) broken at the query, not in the tree.

## Stage 2, re-planned

| step | what | deletes |
|---|---|---|
| 2a | Attribute each open-type query to its call site with an armed per-site counter on the `rdCovered` sites. Each site then asks the instance's type (`nodeTyAt(x, fn)` / `elabNodeTyAt`) in place of the template's. | the legacy arm behind each converted site |
| 2b | `RNoValue` projects to a no-value kind at a result. `nul:unclassified` and the two holes get answers or a checker refusal. | the remaining fallbacks |
| 2c | Once `repOfTy` never answers uncovered during emit, `rdCovered` is constant: delete it, `repUncovered`, and every fallback arm. `RepDesc` reduces to the node. | `RepDesc`'s coverage protocol |

**The net-lines estimate is withdrawn until 2a's attribution.** The fallback arms are the
deletable code, and their size is a per-site count, not the 2,500–3,500 the design guessed from
whole-function line counts.

## 2a, step 1: where the open-type queries come from

**Method.** A throwaway debug seed, built with names and never committed or placed in `build/`,
traps on the first `repOfTy` query during emit whose tree reason is `leaf:unnarrowable`. The
engine's backtrace names the calling chain. It was run over the 2,987 corpus programs that make
such a query. It finds the *first* site in each program, so a site behind a converted one surfaces
only after that conversion. The tally is re-run after each batch.

| first site (past the rep plumbing) | chain | programs |
|---|---|---|
| `repSigTokOfTy` (`emit_rep_slot.vl`) | `sigKeyOfTy` ← `sigKeyOfTyGo` (`emit_sig_tokens.vl`) | 1,559 |
| `buildFnMapRowOfRetAnn` (`emit_collect.vl`) | `vtKindOfType` ← `annRepKindOf`, from `buildFnMap` in `runEmitPasses` | 873 |
| `forceCloListOfTy` (`emit_union_atoms.vl`) | `forceCloResultListTypes` ← `collectTyReachCloSigsArm` | 173 |
| `readMayBeString` (`emit_classify.vl`) | `exprString` ← `collectAArrayLit` | 166 |
| `tyRepsAsNulAtom` (`wasmEmit.vl`) | — | 70 |
| `repABDescWord` (`emit_ref_list_kinds.vl`) | the armed AB oracle itself (`scanPrintUse`); not a real site | 43 |
| `mvValKindOfTy` (`emit_shape_rows.vl`) | `mvShapeOfMapNodeTy` | 41 |
| `markInferredJoinAtoms` (`emit_collect.vl`) | `markInferredIfJoins` | 19 |
| `rowStoreRepIn`, `structIndexOfRep` | — | 1 each |

What the top two ask:
- **`buildFnMapRowOfRetAnn`** builds a function's result row from its annotation in the
  `passes` phase. For a generic template that annotation is its own `T`, and no instance exists
  yet. The default `i32` it banks is overwritten when mono writes the instance into the slot.
  Its conversion is not "ask the instance type". It is "a template has no row until it is
  instanced", which needs every reader of a template row before mono found first.
- **`sigKeyOfTy`** renders a signature key, and keys a template's signature at its open
  parameter types. Its conversion is the same question. With stage 6 (signatures as `RSig` ids)
  ahead, a key for an open signature should not be minted.

**Batches**, by owning file and in this order: `emit_collect.vl` (`buildFnMapRowOfRetAnn`,
`markInferredJoinAtoms`), `emit_sig_tokens.vl` / `emit_rep_slot.vl` (`sigKeyOfTy`),
`emit_union_atoms.vl` (`forceCloListOfTy`), `emit_classify.vl` (`readMayBeString`),
`emit_shape_rows.vl` (`mvValKindOfTy`), `wasmEmit.vl` (`tyRepsAsNulAtom`). Each batch is
byte-identical over the corpus, or names its movers, and re-runs this tally.

## 2a, batch 1: three sites stop asking a template's open type

These are the first conversions. Each one makes a site decline a template's open type itself,
instead of asking the tree and taking the uncovered answer.

| site | change | equivalence |
|---|---|---|
| `annRepKindOf` (`emit_shape_rows.vl`), and so `vtKindOfType`'s 27 callers | an annotation that is a bare type parameter answers `null` without a tree query | by construction: a bare `TyVar`'s tree is the `leaf:unnarrowable` leaf, which answered `null` |
| `repSigKindOfTy` (`emit_rep.vl`), and so `sigKeyOfTy` | a bare type parameter crosses no signature, so it answers `null` | by construction, as above |
| `buildFnMapRowOfRetAnn` (`emit_collect.vl`) | a declared generic's result annotation that is still open banks the default `i32` row without a tree query, since the instance's row replaces it | **not** by construction: a covered open type such as `() => T` could have answered otherwise. Graded on the corpus. |

**Measured.** Both seeds are fixpoints of master `7de76595`, one with this batch and one without.

| | before | after |
|---|---|---|
| open-type `repOfTy` queries during emit (corpus) | 10,831 in 3,015 programs | **4,259** in 1,113 programs (−61%) |
| — `leaf:unnarrowable` | 10,173 | 3,697 |
| — `union:open` | 143 | 58 |
| corpus exit codes / module bytes changed (12,037 cells) | — | **0 / 0** |
| self-build | — | fixpoint |
| L2 self-compile fuel | 87,265,518,896 | 87,324,478,167 (+0.068%) |
| plumb-shape fuel, main / tail | 9,099,863,950 / 6,592,754,323 | 9,106,737,320 / 6,597,369,261 (+0.076% / +0.070%) |

**About the fuel.** The first version cost +0.14% (L2). The annotation check repeated the
node-type lookup `repOfNode` makes. The self-build asks the tree only 2 open queries, so there the
check is pure overhead. Reusing the one lookup, and walking for open types only in a declared
generic, halved it. On the self-build the batch is a small cost; on the corpus it is the removal
of 6,572 queries the rule forbids.

`self-compile time` (+1% per-PR tier) currently fails on master's own drift: a master fixpoint
reads +0.98% over its baseline before this batch. Lane P owns the re-baseline, per the coordinator.

**Next sites**, from the re-run trap tally:
- `buildFnMapRowOfRetAnn`'s remaining nested opens, now reached only through non-generic paths;
- `forceCloListOfTy` (236 programs);
- `readMayBeString` (187);
- `tyRepsAsNulAtom` (73);
- `mvValKindOfTy` (51);
- `markInferredJoinAtoms` (17).
