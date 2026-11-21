# I8a: the IR writes a const cell's constant initializer (2026-11-21, lane IR-D1)

The I8 cutover plan (`ir-i8-cutover-2026-11.md` §2) found the one legacy path a fully claimed
program still takes. `emitConstCellInit` writes the global section's constant initializers through
`emitExpr`, so `const a = 1; const b = a + 2` needs the legacy emitter. The coordinator ruled it
its own step, I8a, a prerequisite of I8.

## The choice: the door, not a constant-expression writer

A dedicated constant writer over the literal tree would restate the decisions the builder already
makes for literals, at every rep:
- list element reps;
- record field reps;
- union boxes;
- atoms.

The door already accepts a constant-cell host. `lowerNodeIn` admits `gConstExprEmit` and refuses
any variable that is not a temp, so the fragment holds nothing a constant expression cannot hold.
The cell is built as the start body builds a global's initializer: `globalInitValue`, which is
`deliver` at the cell's rep, with a named miss where a coercion would be owed. So I8a adds no
writer. It adds:
- `irLowerConstCell(gi, gst, probe)`: the door rooted at the cell, delivered at `globalRep`;
- `irClaimConstCell(gi, gst)`: the claim seam. Unarmed, and only when every node is in a claimed
  family (`claimable()`, the rule functions and start bodies follow), the IR writes the
  initializer and legacy does not run;
- `irConstCellShadow`: armed, legacy runs and the fragment is compared with legacy's bytes. It
  counts `const cell <arm> <kind>: matched` or `miss <why>`. A differ is
  `mismatch bytes: const cell <arm> <kind>`, the class `ir-shadow.vl` never baselines in either
  population and the bytes veto reads.

The plain and union arms take the seam. The fold arm writes a `*.const` itself, and the
generic-alias arm writes a closure core; neither reaches `emitExpr`. A miss falls back to legacy
until I8 deletes the fallback.

## Measured

On the merge-base c24668e8 and this branch, both seeds fixpoints:

| bar | result |
|---|---|
| armed shadow, all 26,216 programs and the self-compile | 36,152 occurrences matched, 0 differ |
| `ir-identity.sh --names` | identical 9,037, differ 0; self-compile identical |
| `ir-identity.sh --cases` | see the PR |

The misses are 954 occurrences in 340 programs. Each is a builder class the
coverage lanes already name:

| miss | programs | occurrences |
|---|---:|---:|
| `string atom` | 132 | 349 |
| `array ref` | 101 | 311 |
| `global initializer coercion` | 40 | 108 |
| `box ladder` | 30 | 90 |
| `progress cell` | 12 | 13 |
| `array element coercion` | 9 | 20 |
| `object layout` | 7 | 39 |
| `object field coercion` | 7 | 14 |
| `array v128` | 3 | 6 |
| `operand coercion` | 2 | 2 |
| `array null sentinel` | 1 | 2 |

## The differ is gated

A seed whose fragment always differs (a byte added after lowering) reds `ir-shadow.vl` on both
populations, exit 1 with `a byte difference: … mismatch bytes: const cell plain array` and the
other kinds. The real seed is `ir-shadow: ok` on both, with no const cell mismatch row. The
shadow's control 3 adds the same byte under `irShadowCorrupt(3)`, and
`tests/vl_ir_shadow_test.ts` holds that each cell then reads as a bytes mismatch.

## Cost, and the change that pays it back

The claim alone cost +0.41% of L2 self-compile fuel (105,163,681,785 against the base's
104,735,850,403). A fuel profile of the L2 build put the seam at 0.78% of samples. Half of it was
the list literal's lowering asking `arrLitArmOf` again, the same plan the builder had already
asked, mostly `emptyArrHoleBuildKind` over the compiler's own `[]` cells. One change pays it back. **`RMakeList` carries the builder's arm (`mlArm`)**, and the lowering
reads it rather than re-deriving it. This holds for every claimed list literal, not only the cells.
The arm is the one the builder already built the elements by, and `arrLitPrologue` between the two
calls only mints types and notes spreads, so the answer cannot differ.

A second candidate was refused: skipping `captureFoldedConsts`'s scratch write of a list or record
cell, which can never fold. It moved the self-compile's bytes (a global's `i32.const 50` became
`0`): the scratch write mints ids that later cells number after. A pass that looks read-only is
not.

L2 fuel is 103,975,263,508: **−0.73%** against the base, and under the committed baseline.

## The stub witness

Legacy's 14 expression and statement entry points were emptied in a throwaway copy of this tree
(`stub-reach.sh`'s stage A, built):
- `const a = 1` and `const a = 1; const b = a + 2` build.
- Of the 2,787 programs the plan found broken only by the constant cells, 2,715 now build.
- 61 still break, each on a miss in the table above.
- 11 break where, on this newer master, their start body or a function is no longer claimed.
  That has nothing to do with the constant cells.
