# Step 7, lane H: two armed traps at a generic instance's union annotation, 2026-11-13

Two programs go loud under the opaque-label instrument (`$VL_OPAQUE_SNAMES=1`). Both trap with
"the emitted module failed to validate inside `g`":

- D15042;
- `tests/cases/generics/union-of-records-arm-holding-type-param-built-at-instance.vl`.

## Trace

The witness is `const v: {f: i32} | {f: T} = if b { {f: 1} } else { {f: t} }`, at `T = f64`.

**The divergence: armed, the `let` skips the union box.** Unarmed, `emitLetIfInit` boxes each arm
into the box named by `boxTyName(nulTy)`. Armed, that name is "" and the init falls to
`emitIfExpr`, which lowers the join as one record.

**Why: the instance annotation has no type.** `nulTy` is the instance annotation's type,
`nodeTyIxOf(letType)`. Armed it is -1; unarmed it is `{f: f64} | {f: i32}`.

**The name-reading site is `monoSubstLetType` (`emit_mono`).**
- It spells the substituted union with `monoPinSpellNoAnon`. Armed, the concrete arm is spelled
  by its row label: `#row0|{f:f64}`, against `{f:f64}|{f:i32}` unarmed.
- The union branch types the new `TypeRef` by that spelling alone
  (`synthTypeRefFb(subC, pos, -1)`), and `nameToTy` of a label is -1.

## The change

The union branch takes the spelling's type only where the spelling names one. A spelling that
does not parse types the node at the substitution, `synthTypeRefTy(subC, pos, sty)`. Unarmed,
every such spelling parses, so nothing moves.

## Measurement

Sweep over 24,205 programs, `sweep.vl diff`, fixpoint seeds on both sides (master `99308160`
against this):

| comparison | result |
| --- | --- |
| unarmed | 24,205 same; 0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new traps |
| armed | 24,203 same. The 2 output movers are the two traps above, `compiler_trap → runs`, printing what the unarmed build prints |

What arming moves:

| | master | this |
| --- | --- | --- |
| `runs → not-runs` | 4 | 2 |
| new compiler traps | 3 | 1 |
| bytes-only movers (reorderings) | 256 | 256 |

The two left go to lane D:
- `d15296_bound_returned` (D16040);
- `closures/hole-fn-inline-list-record-stored`, traced to `retStructRowIndex`'s `#anon` rung.

The producer, `monoPinSpellNoAnon` rendering an arm by its label, is the arm render lane A is
taking; once that spelling is structural, this rung is a floor nothing reaches.
