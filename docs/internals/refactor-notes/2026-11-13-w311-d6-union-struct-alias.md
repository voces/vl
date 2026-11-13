# Step 7 D6: a union declaration's struct-alias test reads its members' types, 2026-11-13

Lane F. Measured at master `723db85a`.

## What changed

`unionDeclStructAlias` decides whether a union declaration lowers as one struct. It used to call
`unionStructAliasShape(s.udVariants)`: every member spelled alike (D446), with that spelling a
brace shape (`nameIsShapeSpanEnds`). At emit time `udVariants` holds canon's text, so a member
canon had folded, such as an intersection of records (D14794), reached that parse as a render.
Lane I's re-grade counted it as a render.

Now:
- every member resolves (`udMemberTyAt`) to one anonymous record type: no struct, brand or
  generic-application name, and all members `tySame`;
- the member is written as that record. Either canon rewrote it in place
  (`canonRewroteSlot(sx, 0)`, a new reader of canon's raw-slot bank), so its type decides, or its
  unrewritten source spelling is a brace shape (`nameWrittenAsShape`), graded source.

It returns a boolean; both callers only tested `!= ""`. The D5157 twin check is subsumed, since
`tySame` members cannot be distinct records.

`nameIsShapeSpanEnds`, `unionStructAliasShape` and `unionSoleDistinctVariant` have no caller
left and are deleted.

## Why not the type alone

"Every member is one anonymous record" disagreed with the old test in 6 programs, and treating
them as struct aliases lost all 6 runs. They are a recursive intersection, `type M = Node & {v:i32}`
(D14162 and its neighbours), which canon leaves unfolded. The struct path then has no row for
`Node`'s field. Canon's rewrite record is what separates a folded record from an unfolded
intersection, so the rule asks it.

## Decision table (probe, 24,224 programs)

| member 0 | programs | decided by |
| --- | --- | --- |
| canon rewrote it | 3,275 | its type; the parse is not reached |
| not rewritten, source written as a shape | 113 | source text, then its type |
| not rewritten, source not a shape | 3,350 | source text: not an alias |

**Control cell:** `tests/cases/unions/struct-alias-folded-intersection-and-literal-field.vl`, with
a folded intersection and a folded intersection carrying a literal-typed field. It runs the same
on master and on this branch.

**Gap found, not in this PR:** a union of two identical arms with a literal field,
`type KV = { k: "x", v: i32 } | { k: "x", v: i32 }`, is refused on master with "field access
receiver is not a struct" when a field is read. It is reported to the coordinator.

## Measurement

- **Sweep:** fixpoint seeds, master `723db85a` → this: all 24,224 the same (0 bytes-only movers,
  0 output movers, 0 runs → not-runs, 0 new traps).
- **Render-parse census:** ty-string-parse goes from 22 to 20, and ty-source-parse from 7 to 9.
  The brace test moves from a render-graded helper to a source-graded one, which only
  unrewritten source text reaches. `render-parse-origins.txt` grades the new site.
