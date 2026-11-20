# IR: a `for` walk over a list of boxes, records or `i32` lists, 2026-11-20

The builder took a `for` walk only over a list of `i32` or of strings: `forInPlainWhy` named any
other element kind as a miss, `for in element <kind>`. The lowering already wrote the walk with
legacy's own loop helpers (`forInLoopAt`, `forInListStore`, the cursor and header writers), which
take the element kind as an argument.

## The change

`forInElemPlain` (wasmEmit.vl) is an exhaustive `match` over `VKind`, so the kinds it excludes
are named. It admits a value union's box (`union`), a record (`struct`) and an `i32` list (`list`)
beside `i32` and `str`. Each element is read whole into the loop variable, as legacy reads it. The
builder's existing checks still hold the walk's operand and variable at the element's rep.

Compiler lines are +14 −5, 9 net, all in `wasmEmit.vl`. No legacy line is deleted or moved.

## Readings (base master `f2616bad8`, fixpoint seeds on both sides)

| reading | master | this change |
| --- | ---: | ---: |
| self-compile functions claimed (mode 5) | 15,980 | 16,028 (+48) |
| corpus covered = verified = matched (shadow) | 35,613 of 45,678 | 35,633 (+20) |
| L2 self-compile fuel | 100,733,775,613 | 100,735,094,265 (+0.001%) |

The census has no `for in element union`, `element struct` or `element list` row left.
