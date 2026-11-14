# The global section arms the declaration cursor, 2026-11-14

Lane J: emit refusals with the wrong position or none.

## Rows re-run

On a master fixpoint seed (`f11a79cb7cc6f5b7`), `check-filed-witnesses.vl --strict` grades all
five as filed (emit reject). By position:

| row | position today | state |
| --- | --- | --- |
| D15154 | `w.vl:4:7` | fixed, holds |
| D15155 | `lib.vl:7:21` | fixed, holds |
| D15157 | `lib.vl:7:21` | fixed, holds |
| D1519 | `lib.vl:7:16` | fixed, holds |
| D15158 | `w.vl` (no line) | live, fixed here |

D1519's named remaining gap, the type section, has no witness: its program
(`type A = { f: { g: B } }` beside `type Z = B | E`) runs today.

## The producer

`emitFail` anchors at `emitCurStmtIx`, else `emitCurFnIx`. Every phase that runs before or
outside a body arms one for its own span: `collectU`/`collectS` the declaration, `monoInstantiate`
the call, the start function the top-level statement. `emitGlobalSection`'s cell loop armed
neither, so D15158's `fbValtypeNullable` guard printed the file alone. The loop now arms the
cell's declaration and clears it after. `emitCurStmtIx` is read only by the diagnostic path, so
no output byte moves; the seed grows by 53 bytes.
