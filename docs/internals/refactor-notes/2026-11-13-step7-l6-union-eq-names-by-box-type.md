# Step 7 L6: union `==` names its operands from their box types, 2026-11-13

`emitUnionUnionEq` (`wasmEmit.vl`) had two `unionNameOfExpr` calls, which name each operand
from the expression's spelling. Lane G released them to lane D. Lane A's probe had found six
programs where the box type and the name disagree.

Each operand is now named by `unionEqNameOf`, from its type alone:

- the union its box type is built into (`boxTyName`, `boxDstName`'s typed rungs: the type-keyed
  row's registered name, else the value union's key text);
- else the declared alias its type is (`unionAliasDeclNameOfTy`), which names a struct union
  keyed by its declaration, such as D15058's `U`.

A union-typed operand that neither rung names is refused with `emitFail`.

The arm intersection's last rung, `unionHasAtomAB(25, rname, …)`, asked the right operand's name
for an atom when neither its member set nor its box type gave its arms. That rung is now refused
loudly too. `unionHasAtomAB` has no caller left in `wasmEmit.vl`; lane G deletes it.

## Measured

**Decision table.** A probe compared, at entry, each operand's name's row against the row of
each typed candidate, over 24,070 programs. The box type agreed on 331 of 360 operand decisions.

| class | decisions | programs |
| --- | --- | --- |
| `diff` | 6 | the two alias-arm fixtures |
| `nameless`: the name is a value spelling with no row | 14 | D989, `value-union-eq-both-sides` |
| `norow` | 5 | D5310, D15058, `generic-union-param-litunion-alias-arm` |
| `none` | 4 | — |

Widening the type changed nothing. The row `unionNameOfExpr` records was worse, with 121
`norow`.

**Byte comparison.** 187 programs reach `emitUnionUnionEq`. Each was built with a base compiler
and with this cut's:

| outcome | programs |
| --- | --- |
| byte-identical | 157 |
| same refusal | 28 |
| bytes-only movers, same output | 2 |

The two movers:

- **`unions/union-eq-litunion-alias-arm.vl`** goes from 3,729 to 2,727 bytes.
  - Before, `string|i32` and `K|i32` named different unions, so `lname == rname` failed. The
    value-union lowering then re-read both operands for every arm: the disassembly shows 21
    scratch locals of the list and box types.
  - Named from the box type, both operands name one row, so the gate passes and the operands
    are evaluated once each: the disassembly shows one slot per operand, set from a block, in
    place of the per-arm re-reads.
  - It prints the same 19 lines.
- **`generics/generic-union-param-litunion-alias-arm.vl`** goes from 1,890 to 1,869 bytes, by the
  same mechanism. It prints the same.

**The two floors.**

- No program among the 187 falls back to the expression name once the alias rung is in place.
  Before that rung, only D15058 did.
- No program reaches the `unionHasAtomAB` rung.
- **Controls:**
  - with the two typed rungs disabled, the operand floor fires on D15058;
  - with `rOk` forced false, the arms floor fires on `operators/union-eq.vl`.

## Counts

- `unionNameOfExpr` calls in `wasmEmit.vl`: 2 → 0.
- `unionHasAtomAB` callers in `wasmEmit.vl`: 1 → 0.

## Proof

- **Locally:**
  - refresh to a fixpoint;
  - `lint-self.sh` clean;
  - `scripts/gate.sh`;
  - `mono-tyaram-grid.sh`.
- **CI's sweep** should report the two bytes-only movers above, and nothing else.
