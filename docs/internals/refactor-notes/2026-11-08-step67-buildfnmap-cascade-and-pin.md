# Steps 6/7: `buildFnMap`'s un-annotated cascade and `synthRecordedRetAnnots`' pin

Measured 2026-11-08 on a 4-core box. Every seed is a fixpoint (two `refresh-compiler.sh` runs
byte-identical). The sweep population is 23,664 programs before the master merge and 23,671
after. Sweeps compare each candidate with the step before it.

## The cascade (#6824)

`buildFnMap` read the checker's inferred-return name and type into an un-annotated function's
five return columns, in round 1, in mono's resume rounds and in `buildFnMap#2`.

| ablation | sweep |
| --- | --- |
| A: `#2` skips the cascade, except the empty-object lambda (`fnRetRowLowersAsAnn`) | same |
| B: A, and that lambda reads the recorded columns too | 1 runs → compiler_trap |
| E: B, and `criColsFromRecorded` takes the struct row of the lambda's own inferred-return row | same |
| F: E, with no cascade in any round | same |

B's mover is `empty-object-all-nullable-runs.vl`. The `fnRecordedRetCols` columns are the same
as the annotation's except the slot, which is 4 against 1. The slot is the values' stamp row.
The closure's signature `() => Cfg` takes Cfg's row, and the record shape is shared by both rows.
`criLambdaRecordRow` reads the struct row (`repSlotOfTy`) of the type banked in the lambda's
inferred-return row. The other two exception classes had no reader: a `fnRecordedRetCols`
failure and a void row. In F the pre-mono passes and the `fmSeed*` bank see only annotated
columns, and nothing moved.

## The pin (this PR)

`synthRecordedRetAnnots` wrote `fn.fnRet` for an un-annotated function whose recorded result is
keyed with no slot.

| ablation | sweep |
| --- | --- |
| no pin | 7 runs → compiler_trap, 1 bytes-only |
| pin only kind `union` | same |
| no pin; `retFlagsSeedResult` boxes at the recorded union when the checker's name names none | same, 3 bytes-only |

The 7 are lambdas whose recorded result is a value union. An example is `() => null` handed to
`() => T | null`. The checker's inferred name there is `null` or `4`, not the instance's union.
So the return was never boxed, and the result was `expected (ref $box), found nullref`.
Reading the recorded union in place of the name in every case broke `pick` in
`inferred-return-self-union-nullable.vl`, because the name arm already served it. So the
recorded union is a fallback, read only where the name arm gives nothing.

The 3 bytes-only movers print what they printed before, and each module was diffed:

* D3159 and `niche-pin-sibling-closes`: the pinned lambda stored both arms into locals and built
  one box. Now each `return` builds its own box, with the same tags and payloads.
* `join-of-two-map-types`: `nullJoin`'s fall-through after an `if` whose two arms both branch
  out was a null box. It is now `unreachable`.

`synthAnnOfTy` and `srrNamesShape` go with the pin. The `fRecRetTy` fill stays, as `recordRetTys`.
`synthNulListRetAnns` is the one `synth*Ann*` function left.

## Proof on the merged tree (master `2a9d12a1`)

| check | master | #6824 | this PR |
| --- | --- | --- | --- |
| fixpoint seed | 6,524,947 | 6,521,871 | 6,521,544 |
| L2 guest fuel | 76,733,094,650 | 76,621,978,576 | 76,715,862,544 |

## Left

* `buildFnMap` classifies annotations only. Its remaining parts are the resume bank
  (`fmSeed*`), which now re-seeds annotation columns, and the name and sid maps.
* `inferRetRung` is written by the checker and read by nothing except the rollback.
* The cloRet* remnants were not started: `mfStructResultRowName` and `cloRetKeySuffix`.
