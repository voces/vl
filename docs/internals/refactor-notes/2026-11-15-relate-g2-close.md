# L2 S2 group 2 closed: no flow-and-binding judge needs a stored row, 2026-11-15

Group 2 (flow and bindings) of the L2 S2 prerequisites. `2026-11-15-relate-g2-fit-census.md` listed
25 judges whose reads are broad enough that they might need a `(decl, param)` row. This note splits
each family into a body part and a call part. The body part is answered once the body check closes.
The call part is asked at the call, and is the solver's at S3. Docs only.

## 1. The split

| family | body part | where it lives | call part |
|---|---|---|---|
| `holeChoice*` (7) | `holeChoiceArms`, `holeChoiceArmDecl` | a pure decode of the syntax and the write-scan memo (#8453) | `holeChoiceJudge`, `holeChoiceWaits`, `holeChoiceArmCstrsAt`, `holeChoiceDisagreeMsg` |
| `holeBind*` instance/forward (13) | the walk's edges: calls through the hole, forwards | a query over the body's node types, stable once the body closes (§2) | the instance at the bound types |
| `holeDecl*Cstrs*` (4) | the constraints the body deferred | the existing demand rows (`argCstr`, `retCstr`, …), written by the body check | `declCstrsAtBinding` judging them at the instance |
| `holeAssignOk` (1) | none | — | a delivery through `checkerForceFn` |

These go to lane G (group 1), which owns the function-set rows:
- `holeSetMembers` and `holeSetJudge`;
- `holeLetReadsOf`'s join-of-functions arm;
- `holeBindForward`'s joined-callee arm (`elabFnSetOf`).

## 2. The `holeBind` walk is stable once the body closes

A scratch probe (never pushed) builds the walk's edge signature at each `holeBindAt`: the calls
through the hole, and each forward's argument position and target. It ran over the 20,478 programs
of `tests/fixtures`, `tests/cases` and the distilled `cells/` and `named/`. That is 12,824 asks over
2,026 distinct (owner, hole) keys.

| keyed by | repeat asks | asks that differ |
|---|---:|---:|
| owner, hole | 10,798 | 43 (7 programs) |
| owner, hole, frame | 10,381 | 31 (6 programs), all in the generic frame |
| owner, hole, frame, body closed | 10,265 | 0 |

The frame is *inst* under a pinned re-check (`monoRecheckDepth > 0`) or a per-frame node-type key,
and *gen* otherwise. *Body closed* is `bodyChecked[name]`, set when the owner's loud body check
ends; a nested owner has no such signal.

Every difference is an ask made while the owner's body was open, compared with one made after it
closed. An open ask sees node types that are not written yet. The S2 scheme is built at body
close, so it reads one stable answer. The open asks are a forward-reference order effect. The
callee-first order (S1, #8444) targets it; that merged after this measurement (master `ee1427a8`),
and the open asks are not re-measured on it.

Syntactic edges alone (the argument is the parameter, by declaration identity) equal the full set
in 11,570 asks. Matching by type (a value typed as the hole's variable) adds edges in 1,254. A
syntax-only row would therefore still need the typed scan beside it, so none is stored.

## 3. Left as found

- `substNestMode`, `substNestDecl` and `cstrOwnedStrict` are set around `declCstrsAtBinding` as
  ambient modes. They are the substitution's and the constraint owner's modes, read deep in
  `substTyDeep`, and its memo is keyed on them. Making them arguments belongs to the substitution,
  not to group 2.
- `holeBindHeld` stays an input register, set by the caller for a re-pointed `let`.

## Measurements

- Net compiler lines: 0. `emit_mono.vl` functions: 908.
- Witnesses for the open-body asks: `tests/cases/closures/forwarded-hole-fn-const-list-two-keys.vl`,
  `tests/cases/closures/forwarded-hole-fn-lists-sharing-element.vl`,
  `tests/cases/closures/list-of-hole-param-slot-written-forwarded-literal-param-differs-per-call.vl`,
  `tests/cases/functions/generic-fn-value-two-type-param-params-split-param-returned.vl`,
  `tests/cases/functions/generic-fn-value-two-type-param-params-read-elsewhere.vl`.
