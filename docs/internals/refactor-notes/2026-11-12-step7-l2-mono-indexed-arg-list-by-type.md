# Step 7 L2 §7: an indexed argument's list is a list by its type, 2026-11-12

`monoArgTyNameProjected` names an indexed argument (`id(xs[i])`) from its list's pin. It decided
the list was a list by parsing the pin's spelling (`nameIsArray`). It now asks the list's type:
the one `monoArgTyName` returned, else the indexed node's own (`elabNodeTyOrChecked`). The
element type and the pinned element type come from the same type. `emit_mono` no longer imports
`nameIsArray`.

The base is master `716a74a45`.

## Measured before the cut

A probe build marked every reach of the site, and every reach where spelling and type disagree.
It ran over `tests/cases/generics` and `tests/cases/functions`, and over the compiler itself
(`vl check --codegen compiler/entry.vl`).

- One program reaches the site: `un-annotated-inline-record-callback-beside-box-list.vl`.
- It disagrees there: the pin `{x:i32}[]` carries no type (`-1`), but the indexed node's own type
  is the list. That is why the fallback is the node's type.
- With the change, that program's output is identical to master's.

## Graded

- Seed: fixpoint. Removing the import was byte-identical. `lint-self`: clean.
- `regress.vl`: no runs lost, 0 → silent.
- Render-parse budget: ok, one parse below baseline. The baseline is re-written centrally.
- Late demands: at baseline.
- `check-filed-witnesses --strict`: 4824 as filed, 0 MOVED, 0 output mismatches.
