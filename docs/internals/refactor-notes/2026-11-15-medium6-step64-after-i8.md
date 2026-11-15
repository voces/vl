# Medium 6 step 6.4: the between-pass pins wait for L1's I8 (2026-11-15)

Step 6.4 of `2026-11-15-medium6-lowering-design.md`. It is measured here and scheduled after L1's
I8 (`ir-design-2026-11.md` §5.3).

## What the pins write

The between-pass pin phases are `lamRet`, `expParam`, `width`, `slot` and `literal` (`lbi*` and
`recAd*`). They are 13 functions, run by `pinRun` in `check_pins.vl`, and every one has the same
shape:

1. **Mint a `TypeRef`** from a solved type's name, `mkTypeRef(tsToName(root), pos)`. This is an
   append, which a freeze allows.
2. **Overwrite the declaration's slot** with a copy whose `letType`, `parType` or `fnRet` points at
   that `TypeRef`, `arenaSetNode(d, nn)`. This write is the one the freeze forbids.
3. **The re-walk reads it back.** `checkProgramAgain` re-walks the program, and the walk, the
   emitter and the redundancy lint all read the pin as an ordinary annotation. `recAdUndo` and
   `wsUndoInstErr` restore the original node the same way.

## Why "pins as CheckRun facts" does not pay now

A fact table (`decl → TypeRef`) means every annotation reader consults the table first. The readers,
measured by `grep -nE '\.<field>\b'` with assignments excluded:

| field | reads | emitter (`emit_*`, `wasmEmit`, shadows) | checker (`check_*`, `typecheck`, `symbols`, `bind`) |
|---|---:|---:|---:|
| `letType` | 488 | 347 | 122 |
| `parType` | 440 | 246 | 166 |

The node field `fnRet` has several hundred reads more, and `TyFunc` shares the name. So the change
is about 1,000 read sites, or one `declAnnOf(d)` accessor threaded through every one of them. That
is line-neutral at best, and all it removes is 13 overwrite sites and 2 undo restores.

## After I8

At I8 the legacy emitter deletes, and about 600 of those reads (roughly 70%) go with it. L1's
builder reads `ty(k, node)`, not annotations. What remains is about 290 checker reads, which one
`declAnnOf` covers. The pins then become an override table that the re-walk and the lint read. The
13 overwrites and the 2 restores delete, and 15 fewer writes reach
`scripts/arena-write-budget-baseline.json`.

Until then the pin writes are entries in that ratchet, inside its 259.
