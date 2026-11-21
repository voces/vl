# IR: a record copy of a pure source, written whole by legacy (RRecCopyPure), 2026-11-21

Lane IR-N4. This is case (ii) of `recCopy`, stacked on #9431 (`2026-11-21-ir-coerce-rec.md`).
The coordinator ruled it after (C) was refused.

## Why a legacy-written leaf, and not (C)

For a pure source, or a copy of one flat field, legacy's `emitRecCopyFields` re-emits the source
expression at each field read (`rcReadSource` → `emitExpr`). The coordinator first asked for (C):
the builder builds the source once per read, as N operands of `RCoerce`.

(C) needs N, and N is not the field count. `emitRecCopyLevel` skips the read for a null-typed
destination field and for a `null` source field into a union box. It recurses into a nested row
for each record field stored at another row (`rcNestedRow`), and copies union members through
`emitRecCopyIntoMember`. To build N operands, the builder would have to walk that whole level
again to count them. That is a parallel predicate mirror of the walk, which is a veto. The other
route is a dry run of the emitter, which writes into the current buffer and mints rows as it
goes. So (C) was refused, and the fallback (A) is a separate node that legacy writes whole. It
retires at I8, with `RMapNew` and the other migration leaves, once the copy walk itself is IR.

## The change

- **`RRecCopyPure { rpAt }`** (`ir.vl`): a record copy at node `rpAt` of a source the copy
  re-reads. It has no operands. It is lowered as `recCopyPureEmit` (`wasmEmit.vl`): legacy's
  `emitRecCopyInto(…, false)`, with the node held as `emitCoerced` holds it. The verifier
  requires a record destination. It is registered in each Rhs list (category `record`,
  `klSets`).
- **One decision.** `recCopied` (`ir_build.vl`) asks `recCopyReReads`, #9431's legacy
  `rcReReadable` over `recCopyShapeOf`. Re-read gives `RRecCopyPure`, and read once gives
  `RCoerce`. The source of an `RRecCopyPure` is not built: it is pure by legacy's own predicate,
  so nothing in it is effectful.
- **Shadow row:** `tests/ir-shadow-rows/record-copy-pure-source.vl`.

## Readings (base: #9431's head `2900de12`, fixpoint; candidate fixpoint)

| reading | base | this PR |
| --- | ---: | ---: |
| self-compile covered = matched / claimed | 19,552 / 19,439 | 19,552 / 19,439 (seed hash identical) |
| corpus functions with no blocker (covered = matched) | 44,589 | 44,593 (+4) |
| corpus claims | 44,443 | 44,447 |
| `tests/cases` armed shadow covered / matched | 65,121 / 65,120 | 65,123 / 65,122 |
| `tests/cases` start covered / matched | 5,032 / 5,031 | 5,063 / 5,062 |
| `tests/cases` fail or mismatch rows | 3 | 3, the same list |
| L2 self-compile fuel against master `7781e9bd` | +0.01% | +0.10% |

Byte identity:
- Mode 3 and mode 5 self-builds equal the plain build.
- `ir-identity.sh --names`: 9037 identical, 0 differ, 0 timeout.
- `--cases`: 7593 identical, 0 differ, 0 timeout.
- `--claimless`: 14016 identical, 0 differ, 0 timeout.
- tests/cases A/B: 7307 identical, 0 differ.

Late tag rows: 307. `ir-shadow.vl -- --claims`: ok. `gate.sh --fast`: passed.

After the proof, the queue's nit from #9431 was fixed: the D1152 comment is attached to
`guardVariantFieldSpan` again. It is comment only, and the seed is byte-identical (`cmp`).

Compiler lines against #9431: +41 / −8. Legacy lines deleted: 0.
