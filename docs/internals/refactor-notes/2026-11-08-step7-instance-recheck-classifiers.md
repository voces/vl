# Step 7: `exprIsStrConcat` and `forInElemKind` read typed facts, 2026-11-08

This follows [r14](2026-11-08-step7-classifier-r14.md), which kept both bodies for "the instance's
own re-check of a template node". Ablating the disagreeing cells showed that the missing fact was
not one fact. Neither half needed a new record.

## `exprIsStrConcat`: the node has no type, not the template's

A scratch probe printed, for each of r14's disagreeing `+`, its column, frozen and elaboration
types. All three were `-1`. The `+` is not a template node. The monomorphizer minted it after
check (`monoCloneGenericBinArm`, `monoPinBin`, `monoFoldLayoutBin` in `emit_mono.vl`), when it
re-made the parent of a cloned call: `"<" + x.toString()` over `<T>`, and `a + b.toString()` in a
hole-fn lambda. The node grows with code added after the function. It has no `nodeSrc`, and no
instance bank row. Its operands are typed: the `"<"` literal and the cloned call (`string`).

The typed body reads the `+`'s own type at the frame (`nodeTyInOf`) when that type is closed.
Otherwise it applies the checker's rule to the operands' types, and an untyped `+` operand asks its
own operands. "String" means `string`, a string literal, or a union of them. The `BC_STR` memo
went with the old body, because a type read does not recurse.

## `forInElemKind` `str/i32`: the instance re-checked the read and closed it

For r13's witness (`function w(a) { if a is K[] { for k in a { … } } }`, called with
`["x", "y"]`), the instance bank holds the read at `string[]`, and `elabNarrowedFromAt` answers
`-1` (read unnarrowed), not `-2`. The template's type `K[]` is closed, so `nodeTyInOf` never asks
the instance. The typed body binds the element of `forInIterTyAt`. That is the instance's own
closed type where the instance reads the iterable unnarrowed (`elabClosedTyAt`), and
`readContainerTyAt` otherwise.

**Why the overlay of #6753 was not used.** `nodeTyRecordIn` writes the column for the first frame
that records. With one instance, the column would turn from `K[]` to `string[]` for every reader,
including collect passes that run with no current frame. Both readers here take `fnIx`, and the
bank already holds the instance's answer, so a reader-side read changes nothing else.

## Shadows

Old body against typed body, over 17,687 programs (`tests/cases` with `@run`/`@log`, plus the
distilled `cells/` and `named/`), each built under `$VL_REP_SHADOW`:

| classifier | disagreements | outcome |
| --- | --- | --- |
| `exprIsStrConcat` | 0 (r14: 251 in 41 programs) | body typed |
| `forInElemKind` | 8 calls, 1 program, old `nulstr` / typed `str` | body typed |

The 8 are `is-narrower-map-tests-values.vl`: `for v in w.values()` with `w` narrowed to
`{[string]: string}`. The typed answer is the narrowed type's. The program prints the same and is
the sweep's single bytes-only mover. `mapValElemKind`, `mapKeyElemVKind`, `bcPutB` and `BC_STR`
lost their last readers and are deleted.

## Proof

Both seeds are fixpoints: base (master `55fd14c4`) 6,526,607 bytes, candidate 6,525,943 (−664).
Merged with master (merge `de098793`), the candidate is 6,525,616, also a fixpoint. The sweep over 23,679
programs: 23,678 same, 1 bytes-only, 0 output movers, 0 `runs → not-runs`, 0 new traps.
`plumb-shape-cost --check` against its committed baseline: fuel −3.1% (main), −4.2% (tail). RSS is not graded on this box, which
has no `/usr/bin/time`. No column was added.
