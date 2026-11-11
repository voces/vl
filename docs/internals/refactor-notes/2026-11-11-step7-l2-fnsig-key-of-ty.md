# Step 7 L2 §7: a function type's `$fnsig` key is read off the type before its spelling is cut, 2026-11-11

The spelling-predicates note (`2026-11-11-step7-l2-spelling-predicates.md`) listed the callers
of `annFnDecompose` as name producers. This note sorts the callers that are left after #7141
into keys and output, converts the key whose caller holds a type, and names the rest.

The base is master `f50936aa`, with a fixpoint seed on both sides. The population is the
sweep's `cases` population: 7,442 programs.

## Callers

| caller | what the parts become | verdict |
| --- | --- | --- |
| `annSigKeyTy` (`emit_sig_tokens`) | the `$fnsig` key, a key | **cut**: a `TyFunc` keys by `sigKeyOfTy` before any decomposition |
| `internFuncTypeShapesTy` (`emit_shape_intern`) | the names the shape walk recurses on, beside `tyStepParam`/`tyStepRet` | key floor: the walk's rows are keyed by spelling, untyped in 701 programs (P2 in the predicates note), so it moves when the walk is keyed by type |
| `monoSubstAnn` (`emit_base`), `emit_mono` ×5 | mono pin and instance spellings | key floor of lane w305 |
| `synthVoidTwins` (`emit_rewrite`) | — | deleted by #7141 |

No in-scope caller produces output, such as a diagnostic.

## Probed

The probe ran in a scratch compiler that was never refreshed into a seed, using the accumulator
of the predicates note. Each reach of `annSigKeyTy` was tagged. A typed reach was also tagged
in three cases: a `TyFunc` whose spelling the arrow split declines, a `TyFunc` whose arity
differs from the spelling's, and a spelled arrow whose type is not a `TyFunc`.

The probe reached `annSigKeyTy` in 27 programs; that reach is the positive control. One of the
27 is untyped. No typed reach was tagged in any of the three cases. So whenever the type is a
`TyFunc`, the key was already `sigKeyOfTy(fty)`, and the spelling decided nothing.

## Changed

- `annSigKeyTy` returns `sigKeyOfTy(fty)` for a `TyFunc` before it cuts the spelling. The
  spelling path now runs only without a function type, so its result kind is asked with no
  type (`annRetKindTy(retStr, -1)`). That is what it already did whenever the type was not a
  `TyFunc`.

## Proof

- **Byte sweep.** `sweep.vl record --population cases` was run with the master fixpoint and with
  the candidate fixpoint.
  All 7,442 programs are the same, with 0 bytes-only movers and 0 output movers.
- **Gate.** `scripts/gate.sh` passes all rows.
