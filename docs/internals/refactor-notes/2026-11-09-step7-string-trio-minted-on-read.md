# Step 7: the string trio is minted on first read

Measured 2026-11-09 on a 4-core box. The base is #6924's branch (`1714f357`). Both seeds are
fixpoints (two `refresh-compiler.sh` runs byte-identical). The population is the sweep's 23,746
programs. This box has no `/usr/bin/time`, so peak RSS is VmHWM, polled from `/proc` during an
unoptimised build of the plumb-shape main unit.

| | base (fixpoint) | candidate (fixpoint) |
| --- | --- | --- |
| sweep | | 22,849 same; 897 bytes-only, 0 output movers, 0 runs lost, 0 new traps |
| seed bytes | 6,567,779 | 6,563,899 (−3,880), +2.6% of the +3% bar |
| plumb-shape main / tail fuel | 8,975,636,030 / 6,579,647,243 (baseline) | 8,832,284,880 / 6,404,796,998 |
| main unit build, VmHWM (two runs) | 321.7 / 321.7 MB | 321.7 / 323.1 MB |

## What moved

`aUsed` is deleted. `aTy()`, `sBackTy()` and `sTy()` (`emit_state.vl`) mint the i32 array, the
string backing and the string header together on first ask. Each index reads −1 until then, and
`isATy`/`isSBackTy`/`isSTy` are the comparisons. `mResetTypeIntern` forgets the trio with the
other pairs. `lTy()` and `mkArrTy()` mint the trio first, since their backings name it.

* All 69 setters are gone, and so are the bodies' 31 `not collected` floors.
* `mAssignTypeIndices` mints the trio when `mUsed` is set, before the map struct's index is
  predicted from the counter. Every other reader mints on first ask.
* `fbEmitLocalsVec` types the coalesce, atom-stage and string-op slots by `strTrioMinted()`. The
  locals are written after the body, and a body that holds a string has minted the trio by
  then (a string reaching it through a call, field or global was minted by the dry type render).
  Otherwise the slot holds an i32.
* `heapIsPacked` asks `isSBackTy`.
* A list op whose descriptor started at the i32 array and was overwritten for every other kind
  would have minted a dead trio. That covers `for` (its backing and its map pair), indexed
  stores, `.push`, `.pop`/`.get`, `.map`/`.filter`, `.slice`, `__array_new__` and
  `__array_copy__`. These start at −1 and only the i32 arm asks. A ref-list `.pop` asks for the
  string header only when it has no ref-list slot.
* `collectStrPool` no longer skips the pool when no string was collected.

## The 897 bytes-only movers

Each was built alone under both seeds and the disassemblies compared after naming every type by
its structure, dropping types and globals nothing reaches, and sorting the type section.

* 856 lose the three trio types, unused, and are otherwise equal.
* 33 also type a dead frame slot as `i32` (the string-op, coalesce or atom-stage frame). In base
  that slot named the unminted trio's index, which aliased the next type in the counter. For
  example, `D1017` typed three string-op slots with its ref-list backing.
* `D9581` types a closure signature's `string | null` result as the string header. Base named
  the aliased index there, a closure struct. The signature has no caller, so both validate.
* 5 gain a dead pool entry and the trio (`D1380`, `D3024`, `D4056`, `D4613`,
  `record-literal-other-kinds-not-an-arm`). Each has a string literal type and no string. The
  pool pools every such text, and base skipped the pool when no string was collected.
* 2 (`D15441`, `null-only-list-own-type-variable`) are byte-identical built alone. They move
  only in the sweep's batch.

## What stands

* `mUsed` is next. The map struct's index is still predicted from the counter, and
  `gMapDeletes && mUsed` gates the delete family's helpers, which are fixed before the bodies.
* `collectStrPool` runs before the type section is assigned, so it cannot ask whether a string
  exists. Gating its literal-type texts on an arena scan (a string literal, a string-typed node,
  a `string` spelling) was tried and refused: `D2993` prints an atom with none of those, and
  lost its pooled members to a `struct.new` per use. A pool the bodies fill on demand would
  retire the 5 dead entries.
* `collectA`'s forcing helpers (`forceScalarListField`, `collectAArmFieldNeeds` and the empty
  arms beside them) now set nothing for the trio. Deleting collectA#2 removes them.
