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

These tags mean the two sides agree on the parameter's rep, except `REAL`:

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
| `argrep` | a non-generic callee the elaboration keys no instance for: mono's pin is the argument's stored row (`recArgRepOf`), else the annotation, so no fact is missing |
| `REAL[i mono=… elab=…]` | a disagreement the rules do not explain |

When the walk-top instance gives no closed type, the tag is `<why>:xyz`. `<why>` is:

| why | meaning |
|---|---|
| `openhole` | the instance's parameter is a hole function type |
| `open` | the instance's parameter is open for another reason |
| `noframe` | the call has keys, but none from the instance being walked |
| `nokey-gen` | the call has no elaboration key, and its callee is generic |
| `nokey-plainhole` | no key, and the callee is a non-generic function with a hole parameter |
| `nokey-value` | no key, and the call goes through a value, not the declaration |
| `nokey-nonident` | no key, and the callee is not an identifier |
| `nokey-emptylist` | no key, and the argument is an empty list |

`xyz…` grades seven other elaboration sources against mono's pin, one letter each, in this order:
1. the instances the parameter itself carries (`elabCallParamTyOwn`);
2. the argument's own type (`elabNodeTyAgreed`);
3. the bundle signatures (`elabCallBundleSigs`), several compared as mono's bundle record;
4. the tagged set the argument carries (`monoArgTaggedSetTy`), spelled as the ids it is stored as;
5. the parameter's type with the shadow aliases a rename minted (`T__sh<d>`) bound as their names;
6. the parameter's open type, when mono's pin spells it the same;
7. the one signature the callee calls the parameter at, which `elabCallBundleSigs` drops as no bundle.

Each letter is `a` when that source agrees with mono, `d` when it disagrees and `n` when it gives
nothing. A non-generic callee whose annotated row does not match reads `no:argrep-dis`.

A call whose own pin is not closed is `monoopen`, and each of its parameters is tagged `eo:yes` or
`eo:no` by whether the elaboration closes it anyway. Mono declines those cells today. The switch
must keep each `eo:yes` cell declining, or show by the sweep that its output does not move.
