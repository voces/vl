# IR coverage: `start: global initializer coercion`, a function value at an annotated global (2026-11-23, lane IR-N8)

The IR-only census on master e6cb8541 ranks `start: global initializer coercion` at 21 start
bodies, 16 of them the program's sole blocker (22 programs by a shadow sweep). Tagging each of the
four miss sites sorted them:

| site and shape | programs | here |
|---|---:|---|
| `cloInit`: a hole or generic function's name or literal at an annotated closure cell | 9 | **covered** |
| `globalInitValue`: a list or record built at another row than the cell's (`{r: null}[]`, `J[]`, …) | 8 | M1's field-storage family |
| `globalInitValue`: a nullable bundle record read out of a map into a `((_) => _) \| null` cell | 2 | open (elab holder) |
| `globalInitValue`: a narrower map, a `null` into a `boolean \| null` niche | 2 | open |
| `globalInitValue`: a record holding a literal-built record | 1 | open |

- **`cloInit`** refused any initializer whose node type's rep is not the cell's. A hole or generic
  function's name (or a lambda) delivered to an annotated cell has an open node type; legacy writes
  the instance its arm picks (`cloValueFeOf`). Where that instance's own closure rep is the cell's
  (`instanceAt`, `instanceClosureRep`), the IR builds the same closure, typed at the cell's type.

## Measured

On the 22 programs, master e6cb8541's fixpoint seed against this branch: `start matched` 2 → 11,
`start uncovered global initializer coercion` 22 → 13, no fail or mismatch.

Row: `tests/ir-shadow-rows/global-init-generic-fn-value.vl` (master: uncovered; branch: matched,
the same output).

## Legacy tails the IR calls

None new.
