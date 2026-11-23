# IR-N3: `global read coercion`, part 2 — an atom global's re-read, a rowless record global (2026-11-23, lane IR-N3)

Two arms of `identRead`'s global path, each the twin of a local arm the builder already has.

## An assignment's re-read of an atom global (`assignValue`)

An assignment used as a value re-reads its target. A literal-union global's cell holds the atom,
and the value is typed at `string`, so the read at `string` missed. The re-read of a module global
is now seated (`cell`, `globalTarget`): the `atomId` arm reads the cell's id, and `assignValue`'s
`widenTo` decodes it, as legacy's `emitAsgValue` widens it. A local's re-read is unchanged.

## A global whose record type has no struct row (`globalRowlessTy`, `globalStoreTy`)

A global typed at a record no struct row records is declared at the row its initializer stores
(legacy declares `(ref null $row)`), as a local is (`rowlessLetTy`). The read at the checked
type reads the cell at that row, typed at the row's record. The storage-row type noted for the
verifier is now that row too, where the binding's own type is rowless: it was the rowless
record, which no global is declared at.

## Grading (tests/cases, mode 4, fixpoint seeds)

| family | starts | functions | after |
|---|---|---|---|
| atom global re-read at `string` | 1 | 3 | covered, matched; 1 start → `global initializer coercion` |
| `K \| null` global re-read at `string` | 1 | — | → `assignment value re-read rep` (no decode into a non-null string; the local spelling misses too) |
| rowless record global | 6 | — | 3 covered, matched; 2 → `coalesce field place` (N2); 1 → a later `global read coercion` arm |

Left in the class, for a later PR: an assignment's re-read of a union-box global at its member
(`narrowedBoxVariantPlain` does not see the re-read pin), box → nullable, nullable → nullable
union cells, an i32 tag cell at a closure, and N5's four unmasked starts after #9765.

## Legacy tails the IR calls

None new: `globalStoredRead`, `widenTo` and the existing `atomId` arm.
