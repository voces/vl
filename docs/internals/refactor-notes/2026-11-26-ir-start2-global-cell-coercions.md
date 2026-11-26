# START-2: global cell coercions (2026-11-26)

Re-graded on master 77168e9b with a probe-patched compiler.

| class | program | before | after |
|---|---|---|---|
| global read coercion | `std/array-litunion-remedies.vl` | 1 | 0 (fully claimed) |
| global store coercion | D17076 | 1 | 0 (fully claimed) |
| global store coercion | `d16132_let_list_{push,index_write}_unann.vl` | 1 each | 0; next miss `box field of a let list's element` |

`ir-parity --run-all` is byte-identical on every witness and on both new sweeps.

Two mechanisms:
- `strHeld` in the global read: a `string` cell narrowed to a literal set, where legacy decodes
  no atom (`exprIsLitAtom`), reads as the string it holds, as `narrowedLocalRead` reads a local.
  A `string | null` cell stays out: its local spelling misses on `print operand rep`.
- `storeValue`: an empty list literal is built at its cell's list rep. Its own type's row can be
  none (`{f: null}[]` where a binding fixed the record at `J`'s row), so it has no valtype to store
  as. The local spelling's `assignment coercion` clears with it.

Left in the class, and why:
- `closures/producers-of-fn-widened-holder-built-at-its-row-runs.vl`: a record of closures read at
  another tagged row (cell rep and read rep both `{f: (_) => _}`). Its local spelling misses on
  `declaration coercion`.
- D17385 / `functions/return-literal-twin-nested.vl`: the holed retag (`global read coercion H`).
  Its local spelling fails the verifier, and `mk` misses on `return coercion nested twin`.
