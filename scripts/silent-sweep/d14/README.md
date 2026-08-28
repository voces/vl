# d14 — `.length` vs `x[i]` on an unbounded type parameter

`lengrid.py`: **45 cells**. 15 argument reps × {`.length` through a generic `T`, `.length` on
the concrete twin, `x[0]` through a generic `T`}.

```sh
python3 scripts/silent-sweep/d14/lengrid.py build/vl-compiler.wasm > /tmp/l.json
```

`silent-class-inventory-2.md` **D14**'s actionable claim was an ASYMMETRY, not a defect:
*"`gtake<T>` is arguably by design (an unbounded `T` has no members) — but note that
`x[0][1]` **is** admitted on an unbounded `T`… The two decisions disagree with each other,
and that disagreement is the actionable part."* This grid grades both operations at the
same reps so the disagreement can be priced instead of argued.

## The two decisions, located

* `checkMemberNode`'s `TyVar` arm was gated on `ot.tvName[0] == '?'` — the INFERENCE HOLE
  only. A declared type parameter fell through to `member access '.length' on non-object T`.
* `checkIndexNode`'s `TyVar` arm has **no such gate**: every type variable gets
  `noteArrayDemand` and a derived `HD_ELEM` hole.

## What it measured, on master `777f7848`

| leg | runs | loud | check-clean INVALID WASM |
|---|---|---|---|
| `.length` through `T` | 0 | 15 | 0 |
| `.length` concrete twin | 8 | 7 | 0 |
| `x[0]` through `T` | 3 | 9 | **3** |

The permissive side is not free. `d14idx_arr_nest`, `d14idx_arr_arr_s` and `d14idx_arr_rec`
are check-clean invalid wasm — `function g<T>(x: T) { print(x[0]) }` at a LIST-of-list
argument builds a module the engine refuses, while its concrete twin
`function g(x: i32[][]) { print(x[0]) }` is a clean `print of i32[] … not yet supported by
codegen`. Off the disassembly: `(call $fimport$0 (ref.as_non_null (array.get $4 …)))` —
`__print_i32__` handed the inner list wrapper. Filed as **D401**; NOT closed here.

## What the landing does

Admitting `.length` on every type variable (the symmetric decision) moves **8 of the 15
`.length` cells to `runs`, each landing exactly on its concrete twin's printed value**, with
**0 `runs` lost and 0 → silent**. The price is the other 7 — a rep with no length at all
(`i32`, `f64`, `boolean`, a record, a function, a nullable, a union) — where a positioned
CHECK reject becomes a positioned EMIT reject.

A second rung pays most of that price back: `memFloorMsg` gives `emitMem`'s three
field-access floors a `.length` message, so those 7 read

```
emitProgram: '.length' on a receiver the emitter cannot classify as a list, string, map or set
```

instead of `unknown struct field in field access` — a message about a struct field, for a
program whose author wrote `.length` and declared no struct. It also improves **360 census
cells across three distilled classes** that already read the struct message.

**The message rung scores 0 on all three of this PR's grids** and is invisible to a
grade-class comparison; only the distilled corpus and the corpus `cmp` see it. Its FIRST
form — the same arm at the HEAD of the floor block rather than at the floors — reads
identically on this grid and takes **33 corpus modules** with it, `std/buffer.vl` first,
because `Buf.length` is a real declared field. Nothing but
`scripts/silent-sweep/corpuscmp.py` saw that.
