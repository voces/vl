# inst-shadow: mono's instance choice against the elaboration's

`run.sh` measures how far `monoWalkIdentCall`'s instance of a generic call is from the answer
the elaboration already holds. For each call it compares the parameter types of the instance the
call made or hit (`monoInstParamPinTys`) with `callArgRepTy(ix, i, elabCallParamTy(ix, i))`.
This is the instrument the switch to the elaboration's answer is graded with
(architecture-target-2026-10.md §3.4): the switch lands once it reports no `REAL` tag, and every
`no:` bucket left is a named fallback.

```sh
scripts/inst-shadow/run.sh [--seed S] [--jobs N] [--out F] [FILE...]
```

`probe.patch` is applied to a copy of `compiler/`, uncommitted edits included, and never to the
tree. Each line the probe prints reaches stdout through `$VL_LATE_DEMANDS`, so the probe adds no
host import. When the patch stops applying, re-anchor it on the five sites it names:
- the `monoInstantiate` call in `monoWalkIdentCall`;
- the `monoMakeInstance` call in `monoInstantiateCallIn`;
- the registry hit and register in `monoMakeInstanceHit` and `monoMakeInstanceRegister`;
- `elabLateCount` in `emit_elab.vl`.

## Parameter tags

A tag that is not `REAL` and not `no:` means the two sides agree on the parameter's rep:

| tag | the two sides |
|---|---|
| `ok` | the same type |
| `repeq` | the same `repCanonKey`: a `Set` and its boolean map |
| `litrep` | the same once each union member's literals are softened: `1 \| 2` and `i32` |
| `nulfn` | mono's `F` against the elaboration's `F \| null`, one closure reference either way |
| `bundle` | mono's closure bundle record, whose fields are exactly `elabCallBundleSigs` |
| `monoopenrec` | mono's record of generic functions left open, closed by the elaboration |
| `colstub` | mono's pin column reads a non-function where the emitted parameter is the closure the elaboration names (`via(app)` in `generics/hole-call-generic-lambda-arg.vl`) |
| `annrow` | a concrete annotation, which is the emitted parameter type whatever row mono's column records (D4300) |
| `REAL[i mono=… elab=…]` | a disagreement the rules above do not explain |

A `no:` tag means the elaboration gives no closed type:

| tag | why |
|---|---|
| `no:nokey` | the call has no elaboration key (`elabCallKeys`) |
| `no:noframe` | it has keys, none from the instance being walked |
| `no:openhole` | the instance's parameter is a hole function type |
| `no:open` | the instance's parameter is open for another reason |

A call whose own pin is not closed is `monoopen` and compares nothing.
