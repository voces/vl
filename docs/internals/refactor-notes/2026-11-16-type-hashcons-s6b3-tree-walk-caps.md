# Type hash-cons stage 6b, batch 3: nine AST walkers lose their depth caps (lane H), 2026-11-16

This batch continues 6b-1 (`2026-11-16-type-hashcons-s6b1-literal-tree-caps.md`) over the rest of
the 238 exhaustion caps that never fired in the 6a census.

## Selection

From the 92 never-firing caps that sit in walkers reading only the AST, a mechanical filter keeps a
walker when all four of these hold:
- its depth is the last parameter;
- the depth is used only in the guard and as `depth ± k` in its own recursive calls;
- it follows no declaration, symbol or binding;
- its name names no flow, alias chain, root, path or hand-off.

20 passed. Reading each body then left the nine whose recursion is visibly a node's own children
(`nodeChildren`, `Paren`/`Unary`/`BinExpr` operands, list elements, field values, a block's last
statement):

| walker | file | old cap |
|---|---|---|
| `ftWholeRecListLit` | `check_fn_tag.vl` | `depth > 8` |
| `exitFirstOnSpine` | `check_null_holes.vl` | `depth > 64` |
| `rcwAllFresh` | `check_record_writes.vl` | `depth > 64` |
| `rcwExprText` | `check_record_writes.vl` | `depth > 6` |
| `objLitSigCountIn` | `emit_collect.vl` | `depth > 256` |
| `nameInListLit` | `emit_collect.vl` | `depth > 256` |
| `monoSubtreeNamesIdent` | `emit_mono.vl` | `depth > 400` |
| `monoIdentAtPosIn` | `emit_mono.vl` | `depth > 400` |
| `upeScalarOperand` | `lint.vl` | `depth > 64` |

Left out of this batch:
- `cexWideDecAt`, `cexTreeText` and `argIsLitOnly`: they read a constant by name.
- `recHeldInside`: it goes through `cwPeelValue`.
- `mintedAnchorTok`: it goes through a declaration anchor.
- `retLitAdoptUnion` and `elabCallBundleRetAt`.
- The three `MONO_ALIAS_CHAIN_MAX` walks: they follow bindings, so each needs a visited set first.

## Measurements

| reading | value |
|---|---|
| seed | fixpoint, branch and base (master c144bf3f1); both refreshes exit 0 |
| identity | 2,000 of 2,000 files byte-identical (the random sample, with `compiler/entry.vl`) |
| guest fuel, fixed input | 92,067,177,376, unchanged: none of the nine runs in the self-compile |
| net compiler lines | −8 over 8 files |
