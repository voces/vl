# Layout family stage 2: an object literal and its function's result at the row (2026-11-26, lane COV-START)

Stage 2 of the row-rep-versus-legacy-layout family (DECISIONS.md, "A value's IR rep follows its
storage"). It deletes stage 1's two exclusions:
- an object literal no longer stays at its own rep;
- a value whose rep retags into the row no longer keeps its rep.

A built record is now held at its storage row's rep. A function's result is held at the row legacy
declares it at. This is the production half. The read conversions (irConvert case (e),
record → record) build on COV-CALL's irConvert slice 2 and follow in their own PR.

## What deleting the exclusions cost, and the fix

With both exclusions gone and nothing else changed, the armed census over tests/cases lost 5
functions to verifier rule 2 (97,525 verified → 97,520) and none to coverage. The 5 functions:
- `mk2`, `heap-kid-row-field.vl`;
- `mk3` and `mk5`, `hole-fn-field-called-off-a-maker-call.vl`;
- `mk5`, `hole-fn-in-nested-maker-record-read-inline.vl`;
- `deep`, `hole-maker-nested-literal-rows-positions.vl`.

Each is a maker returning record literals nested around a function parameter. The inner literals
moved to their rows, which hold the function as the row's closure. The outermost literal and the
function's result stayed at the result type's rep, which nests the type-level records. The retag
between them crosses rows laid out apart.

Legacy returns the outer row (`(ref $1)` in `heap-kid-row-field.vl`, fields reordered `n` first).
Two places refused that row:
- `retDeclRowTy` declined whenever the result type's struct row is the declared row. It now
  declines there only where the result type's rep is a twin of the row's (`recTwinRep`: the same
  records with at most some fields widened to their nullable), which a retag carries as it stands.
- These makers carry an elaborated result annotation, so `resultTy` took the annotated arm, which
  never asked for the row. Both arms now ask `retDeclRowTy`.

A row whose recorded type is open only where it stores closed (`rowTyBuildsAt`, the test `objLit`
already builds by) now counts as a storage row, both in `builtStoredTy` and for the result.

## Tried and dropped

- **The result at the row whenever the reps differ** (no twin rule). It newly lost 4 start bodies:
  - `functions/return-literal-twin-record.vl` and `-generic.vl`;
  - `structs/inline-record-nullable-field-twins.vl`;
  - `functions/return-literal-twin-nested.vl` moved class.

  Each holds a result at a row whose field is nullable while the inferred type's is not. A read of
  the binding then owes a conversion, which is stage 2b's. The twin rule keeps that result at its
  own rep, as master did.
- **Deleting the literal exclusion alone.** It lost
  `types/intersection-elem-permuted-arm-field-alias.vl`'s start: an element literal of `AB[]` moved
  to the row spelled `{b, a}`, and a field read off that stored row missed (`field read of a stored
  row`) because the row's slot differed from the type's. A read off a receiver held at its stored row
  now reads the row's own slot (`ir_build_ref.vl`); the start is covered, matches legacy's bytes and
  prints `1 2 1 2`.

## Measured

Master `47cbeeef6`'s seed against this tree's, both built by the same seed.
- **Armed census, tests/cases** (the head adds this PR's sweep: one program, 5 functions):
  - functions covered: 97,525 → 97,532 (97,527 without the sweep);
  - verified: 97,525 → 97,532;
  - matched: 97,256 → 97,263 (97,258 without the sweep);
  - no verifier failure and no mismatch class rose.
- **tests/cases, per program** (armed shadow, every uncovered, failing or mismatched row, program by
  program, master's seed against the head's): only gains, nothing newly missed.
  - Start bodies newly covered:
    - `closures/if-arm-records-written-into-fn-widened-place-runs.vl` (`ref if arm rep`);
    - `generics/declared-return-holds-inline-litunion-beside-type-param.vl`;
    - `generics/join-mixed-param-union-beside-concrete.vl`;
    - `unions/litunion-nested-union-arm-module-global.vl` (the last three `field read of a stored row's box`);
    - `generics/generic-application-struct-field.vl` (`object field explicitNull typed null`).
  - `records/intersection-recursive-twin-row-retag-positions.vl`: two functions newly covered
    (`ref if arm rep`, one `declaration coercion`).

  Each prints the same on master's seed and on the head under `$VL_IR_STRICT=1`.
- **Family programs** (the 33 of this lane's and regen-9's lists still in tests/cases): the two
  `ref if arm rep` gains above, nothing newly missed.
- **Claims mode (`--claims`, shipped):** no claim falls back.
- **`distilled/regress.vl`:** no runs lost.
- **Capability probes:** 281 of 282 run on both seeds; `--live-sites` 0 on both.
- **D17131, D17361, D17362:** print `6` on both seeds and still miss `object field coercion`. That
  is the record → record read conversion, case (e), which is the follow-up.
- **Sweep:** `tests/cases/records/maker-nested-literals-at-their-rows-positions.vl`. A maker's
  nested literals at their rows, read off a binding, an argument, a list element, an `if` arm,
  another literal's field, a relayed call, and a four-deep nest. It is covered on both seeds and
  prints the same; it guards the positions the exclusions used to keep.
- **Sweep:** `tests/cases/records/stored-row-permuted-twin-read-positions.vl`. A list stored at a
  row spelled `{b, a}`, held whole in a field spelled `{a, b}` and read by name: through the
  field, off the list, a second element, a bound element, a function over the field, and a loop.
  It is covered on master and on the head and prints the same. The control is this tree with the
  literal exclusion deleted but the read at the row's own slot (`sk`) not yet added: there its
  start misses `field read of a stored row`.
