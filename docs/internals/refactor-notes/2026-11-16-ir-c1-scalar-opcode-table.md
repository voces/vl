# IR cutover C1: the shared scalar opcode table, 2026-11-16

Lane IR-C. This is the first op-seam slice of `ir-design-2026-11.md` §10: the scalar-arithmetic family.
Every legacy site that chose a binary operator's opcode now asks the IR's table, and the legacy
ladders are deleted in the same PR. `CLAIMED` stays empty. Measured on fixpoint seeds of this
branch and of its master base (`26f7a8fb`).

## What the family is

The measurement put two of the three candidate groups named for step I1 outside this family:

- **In the family.** `binOpcode`, `binOpcodeI64`, `binOpcodeF64` and `binOpcodeF32` in `emit_base.vl`.
  Three more copies of the `eq` column also belong: `numEqOpOfKind`, `atomEqOpcodeOfKind`, and the
  kind-to-scalar map that `scalarAtomNameOfKind` spelled out.
- **`emitExprAs{I64,F64,F32}` are not in it.** Each is a widening delivery. Its arms read
  `widenClassifyExpr`, `njBoxWidens`, `njWidensOut`, the assignment-literal and radix paths and
  `numNote`, none of which the IR builder reproduces. They are the coercion family (I3). They wait
  until those decisions are shared, and they do not count as matched.
- **The `ret*Flag` family is already gone**, except for `retVoidAnnFlag`. That one is a `void`/`never`
  annotation test, a control decision rather than arithmetic.

## The one shared function

`ir.vl` now holds three pure functions:

- `binPrimOp(lexeme, unsigned)`: the builder's lexeme-to-`PrimOp` map, moved from `ir_build.vl`;
- `primOpcode(PrimOp, RpPrim)`: the lowering's table, moved from `ir_lower.vl`;
- `lexOpcode(lexeme, RpPrim)`: the signed form both legacy sites and the builder agree on.

The builder and the lowering import the first two, so legacy and the IR now decide an opcode with
the same code. The numeric-union pair dispatch, the shift-mask fold (`srOpcode`) and the four
width arms of `emitBinNumeric` call `lexOpcode`. The three `eq` copies call `primOpcode("eq", _)`
through `numPrimOfKind`. `emit_rep.vl` cannot import `ir.vl`, because `ir.vl` imports it. So
`atomEqOpcodeOfKind` moved beside its only callers in `wasmEmit.vl`.

## Occurrence count, before the cutover

A throwaway instrument, built only into a scratch seed and never committed, did one thing at each
of the ten legacy `binOpcode*` call sites. It compared the ladder's answer with `lexOpcode` and
counted a row when the shadow was armed.

| population | occurrences | mismatches |
|---|---:|---:|
| self-compile (`compiler/entry.vl`, armed) | 76,054 | 0 |
| distilled `cells/` + `named/` (12,172 cells) | 151,394 | 0 |

The corpus figure splits by site: `emitBinNumeric` 151,097 (i32 118,161, i64 30,423, f64 2,467,
f32 46) and the numeric-union pair 297. The shift-mask fold site was reached by neither population.
Its equality is the static argument below.

**Failing control.** A copy of the instrument that compared `^` against the `|` row reported
19 mismatches on the self-compile (17 at i32, 2 at i64). The matched count fell by the same 19,
from 76,054 to 76,035.

**Static equivalence.** Over the 17 lexemes `binOpcode` knew, at each of the four widths, the
old answer and `lexOpcode`'s answer are equal. That includes the -1 rows: float `%`, and the float
bitwise and shift operators. Every other lexeme is -1 on both sides. The `eq` copies agree at
kinds 0, 1, 3, 4 and 5, and give -1 elsewhere.

## Bars

| bar | reading |
|---|---|
| self-build byte-identical | the master fixpoint seed and this branch's seed build identical bytes from this source (fixpoint at the second compile) |
| seed fixpoint | `refresh-compiler.sh --prove-fixpoint`: holds, 6,346,440 bytes |
| corpus identity, master seed against this seed over all 12,172 distilled cells | 8,893 byte-identical; 3,279 fail to build under both; 0 differ |
| L2 self-compile fuel (`self-compile-time.sh`) | 89,769,710,045 to 89,761,729,911 (−0.009%) |
| seed size | 6,349,140 to 6,346,440 bytes (−2,700) |
| compiler lines | +166 / −376 over six files, net −210 (ladders deleted: 193 in `emit_base.vl`, 20 in `emit_rep.vl`; the table's 134 lines moved, not added) |
| `emit_mono.vl` pin helpers | untouched |
| `ir-shadow.vl` (armed, in the gate) | 12,267 of 12,267 covered functions matched |

## Left for later slices

Many `fbI32Bin(<literal>)` sites write a fixed opcode, such as `i32.eq` on a tag. Each picks no
opcode by operator or width, so none of them is a ladder this family owns. Unary `-` and `!`
decide nothing by width in legacy, so they stay with the lowering's byte shapes (I1b-1).
