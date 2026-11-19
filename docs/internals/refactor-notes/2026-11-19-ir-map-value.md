# IR: a map as a value, 2026-11-19

The builder admitted a map only as a global (`RMapHas`, `RMapGetOr`, `RMapSet`). Any expression
whose type is a map missed as `rep map`, and so did a function whose parameter, local or result is
one.

## Sizing (census on master `d32521247`)

An instrumented scratch build named the node at each `rep map` miss in the self-compile. The first
miss in each function was:
- a `Map()` or `Set()` call, 226;
- a map parameter, 161;
- a map local, 146;
- a map result, 63;
- one of a few reads and calls, 10.

## The change

- `refRepOk` admits an `RMap` as a variable, parameter or result. A map is a reference, so the
  lowering takes the local slot legacy declares for it, as it already does for a list or a `str`.
- `mapNewCall` (wasmEmit.vl) is the `Map()`/`Set()` test legacy's `emitCallNode` dispatches on.
  It answers false for a user function named `Map` or `Set` (D975). The builder builds `RMapNew` for
  the same calls. The lowering of `RMapNew` already existed: legacy's `emitMapNew`.

A method on a map value (`m.set`, `m.has`, `m[k]`, `.length`) is still a named miss: `map store
receiver`, `map has receiver`, `map read receiver`, `member map`. That is the next layer.

Compiler lines are +23 −15, 8 net (`ir_build.vl` +5, `ir_build_ref.vl` +6 −5 of which 5 are header,
`wasmEmit.vl` +12 −10). No legacy line is deleted; legacy's `Map()` test moved into the shared
`mapNewCall`.

## Readings

| reading | master `d32521247` | this change |
| --- | ---: | ---: |
| self-compile functions claimed (mode 5) | 15,550 | 15,888 (+338) |
| self-compile functions with no blocker (census) | | 15,888 |
| `rep map` misses in the self-compile census | 203 rows | 0 |
