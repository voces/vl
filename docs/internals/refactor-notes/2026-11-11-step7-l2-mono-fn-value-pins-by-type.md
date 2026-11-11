# Step 7 L2 §7: a generic function value is pinned from its slot's type, not its spelling (render-parse 62 → 61), 2026-11-11

`monoCoerceFnValueTys` delivers a generic function value at an expected function type. The
caller hands it both the spelling `tname` and the type `tnameTy`. Three readers took their
answer from the spelling, and this PR moves them to the type (group 2 of the mono handoff):

- **the Ident arm**: the instance's parameter pins, parsed out of `tname`
  (`monoFnTypeAnnParamsName`), and a widened result's spelling (`annRetNameOf(tname)`);
- **`monoCellLamTake`**: the same parameter parse, for a hole lambda a capture cell or written
  `let` holds;
- **`monoCoerceWrittenCell`**: the gate "`tname` spells a function type" (`annArrowAt`).

The base is master `94b382ce`, with a fixpoint seed on both sides. The population is the whole
sweep: 23,894 programs.

## Probed

The probes ran in a scratch compiler that was never refreshed into a seed. It used #7119's
accumulator: a program that fires a probe fails at the end of `emitProgram` with the ids it
fired, so a program that fails for another reason first hides its probes. The channel was
checked on `generics/generic-function-into-nullable-function-slot.vl`, which fires the Ident-arm
reach probe.

| site | reached in | type missing | type answer differs |
| --- | --- | --- | --- |
| Ident arm, pins from `tnameTy` (`monoPinAnnSpelling` per parameter) vs the parse | 1,308 | 5 | 30 in the final `pinned` |
| Ident arm, widened result, `monoPinAnnSpelling` vs `annRetNameOf` | 80 | 0 | 32 |
| `monoCellLamTake` | 105 | 0 after this PR | 0 |
| `monoCoerceWrittenCell` gate, `tyAt(tnameTy) is TyFunc` vs `annArrowAt` | 913 (36 pass) | 3 | 0 |

- **The 30 spelling differences** are the producers' conventions: `((i32)=>i32)` against
  `(i32)=>i32`, a sig pin `=>i>i`, a record alias (`A`, `In`, `P`) against its shape, a union
  alias `M` against `string|i32`, and `string` against the literal-union alias `K`. None of them
  changes a byte: the instance key and the parameters read the pin's type.
- **The untyped reaches** were all capture-cell paths. `monoCellValueTake` passed no type on, and
  `monoCellCall` coerced the cell at `monoSigFnTyName(monoSlotSig(...))`, a spelling with no type.
  That signature is now typed from the seed's instance: its recorded type, else its pin types
  (`monoInstParamPinTys`) and `elabRetOf`. With it, no program reaches the Ident arm or
  `monoCellLamTake` without a type, which a candidate that failed loudly there showed.

## Changed

- `monoFnTyPinNames` (new) gives the parameter pins of a function type or of a nullable one's
  function arm. The Ident arm and `monoCellLamTake` call it in place of the parse. The widened
  result is `monoPinAnnSpelling(monoFnTyRet(tnameTy))`.
- `monoCoerceWrittenCell`, `monoCoerceAliasOfCell` and `monoCellValueTakeAt` take `tnameTy`. The
  cell gate asks it. `monoCellValueTakeAt` hands it to `monoCoerceNamedGenericTys`,
  `monoCellLamTake` and `monoCoerceFnValueTys`, which were given -1 before.
- `monoPinHoleParam` hands `monoCoerceFnValueName` the type its pin `an` is spelled from.
- `monoCellLamTake`, `monoLamLitTakeTys` and `monoPinWrittenLam` lose their spelling parameter.
  The thin wrappers `monoLamLitTake` and `monoCellValueTake` are folded into their callers.

## Not cut

- **`monoCoerceWrittenLetTys`' gate** (`annArrowAt(tname0)`). A candidate asking the type
  disagreed in 28 programs. In 24, `tname` is an open spelling (`(T) => T`) with no type. In 4,
  the type is a function but the spelling is a nullable union or a sig pin (`=>i>i`), which the
  spelling gate refuses. The gate stays until its callers hand a type for the open case.
- **The spelling `tname` itself** still reaches `monoCellSigOne`, `monoFnNameSig`,
  `monoCellConcreteTake` and `monoChoiceBindNote`, which key a cell's or a choice binding's one
  signature by its normalised parameter text. The next cut keys them by type.

## Proof

- **Byte sweep.** The master fixpoint against the candidate fixpoint: 23,894 of 23,894 are the
  same, with 0 bytes-only movers, 0 output movers and 0 runs → not-runs. Each intermediate
  candidate measured the same.
- **Budgets:** render-parse goes from 38 / 62 to 38 / 61, and the pin helpers in `emit_mono.vl`
  from 913 to 912, both baselines lowered here. Seed size is +0.5%, late demands 6 (baseline 6),
  dead exports 0.
- **Locally:** refresh to a fixpoint, lint-self, `mono-tyaram-grid.sh` (252 OK, 9 REJECT, no BAD),
  distilled `regress.vl` (no runs lost; its 2 other movements are the same on master), and the
  pin-helper test. The comment-only edit after the last code change left the seed byte-identical.
