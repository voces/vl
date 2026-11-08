# Reads of a container no write fixes check at the default (2026-11-08)

Round 2 of `2026-11-08-unfixed-container-default.md`. Orchestrator ruling: a read of a
`[]`, `Map()` or `Set()` whose type nothing fixes behaves as if the container were annotated at
the unbound default (`unboundDefaultTy()`, `i32`). A shape-free read runs; a read that demands a
shape type-checks or refuses as the annotated twin does, and is never a compiler trap.

## What changed

* `cwBindingOnlyRead` (`check_write_scan.vl`): a syntax-only scan of a `let`'s occurrences. True
  when every use is a `length`/`size`, a `get`/`has`/`keys`/`values`/`includes`/`indexOf` call,
  an index read that is no store target and no method or field-store receiver, or a `for … in`
  iterable. Any write, re-point, argument, return, alias or other use is false.
* `letDeclInferredBound` gives such a binding's open element or map value the default at the
  DECLARATION (`defaultReadOnlyContainer`, `check_narrow_flow.vl`), with the round-1 warning.
  Every later read is then checked at `i32`, so no read sees the `-1` hole.
* An open map or set key stays open until its first key read (`pinReadKey` at `m[k]`,
  `get`/`has`/`delete`), which fixes it to the read key's widened type, as round 1's flush did. A
  `for … in` over the map or `m.keys()` before any key read gives the default (`pinIterKey`).
* A `__array_new_default__(n)` list holds values and keeps its own default (`arrDefHoleToI32`).

## Grid (each against its twin annotated `i32[]` / `{[string]: i32}` / `Set<string>`)

| program | before | after = twin |
| --- | --- | --- |
| `for x in xs { print(x) }` | `undeclared identifier 'x'` | runs |
| `for x in xs { print(x + 1) }` | `undeclared identifier 'x'` | runs |
| `for x in xs { print(x.r) }` | `undeclared identifier 'x'` | `member access '.r' on non-object i32` |
| `for k in m`, `m.keys()`, `m.values()`, `for e in s` | `undeclared identifier` | runs |
| `m.get("a") ?? 7`, `?? "none"`, `== null` | `cannot infer a type for 'm'` | runs |
| `xs[0] + 1` (D1462) | `cannot infer a type for 'xs'` | check rc 0; run: `out of bounds` |
| `xs[0].r` | `cannot infer a type for 'xs'` | `member access '.r' on non-object i32` |
| `const y = xs[0]` | refused | check rc 0; run: `out of bounds` |

Letting the round-1 flush default read containers instead (no declaration-time default) was
tried first and rejected: `m.get("a") ?? "none"` became check-clean INVALID WASM and `xs[0].r`
an emit refusal, because both nodes had been typed against the open hole and nothing re-checks
them after the flush.

## Parked

* A container with a write AND a read before it (`for x in xs { … }` then `xs.push("a")`) keeps
  the old refusal: the write decides the type, and the loop variable is declared before it.
* `for k in m { … }` then `m.has("a")`: the loop fixes the key at `i32` first, so `has("a")`
  refuses, as the annotated twin would. Choosing the later read's key needs a look-ahead.
* `print(xs)` and any other argument position is not a read-only use, so it keeps round 1's
  flush path.
