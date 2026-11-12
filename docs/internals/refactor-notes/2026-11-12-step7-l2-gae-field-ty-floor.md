# Step 7 L2 §7: `gaeApplyFieldTy` is a floor, an instance key spelled by design, 2026-11-12

`gaeApplyFieldTy` (`emit_base.vl`) substitutes a generic alias's parameters into a field
annotation's text through `monoSubstAnn`. It and lane w317's `is` arm (#7439) are
`monoSubstAnn`'s last two callers. Both of its callers hold the application's type: `appTy` in
`emit_collect.vl`, and `gaeTy` in `emit_shape_intern.vl`. So the substituted field type is
`tyFieldTyOf(appTy, field)`, and the naming rule could spell it (`monoPinSpellNoAnon`), as w317
did for `monoSubstLetType`.

## Probe

A scratch compiler, never refreshed into a seed, compared the text substitution against the
rule's spelling of the field type at both callers, over the whole sweep.

| caller | reach | text unchanged | the rule spells it otherwise | no type |
| --- | --- | --- | --- | --- |
| `emit_collect.vl` | 249 | 49 | 15 | 0 |
| `emit_shape_intern.vl` | 301 | 52 | 8 | 9 (`C<T>`) |

The rule drops a generic application's name: `Box<i32>` becomes `{v:i32}`, `(GB<i32>|null)[]`
becomes `({v:i32}|null)[]`, and `I<string>[]` becomes `{g:string}[]`. It also sorts union members
and spells a record by its row (`{q:B<string>,r:i32}` becomes `N`).

## Ruling

The returned spelling is the instance key that generic-alias rows are found by. The shape
interner's `gaeEnsure` and `structIndexByName` read it, which is lane w324's graded floor N13
(26 hit, 18 miss). Switching would rename keys in about 20 programs. A naming mode that keeps the
application name would only preserve a key the refactor is removing, so the orchestrator ruled it
out. `gaeApplyFieldTy` is a floor. It goes when generic-alias rows key by type, and
`monoSubstAnn` and its two `nameIsMap` parses go with it. The function's comment now says it
produces that key.

## Proof

- The comment-only change builds a byte-identical seed (`cmp` of two builds with one seed).
- The comment budget is ok.
