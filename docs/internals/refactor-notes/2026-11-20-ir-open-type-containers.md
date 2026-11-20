# IR: containers of a tagged function set's members, 2026-11-20

The open-type family after the tag dispatch (#9165), which held an open local or parameter only
when its own type was a function type at rep `i32`.

## Sizing (census on master `7a7482cef` + #9211, by originating grid)

| row (alone unless paired) | functions | grids |
| --- | ---: | --- |
| `open local type` | 256 | d15117 86, d15119 73, d15116 48, d15068 12 |
| `open temp type` | 183 | d15221 24, d15209 18, d15208 17, d15203 15, d15549 13, slot2b3 13 |
| `null test boxTag + open local type` | 72 | d15116 70 |
| `method f + open temp type` | 40 | d15113 38 |
| `open parameter type` | 28 | t3p 19 |

The mechanism of the leading grids: a record, map or list holds a generic function used as a
value. Its type is open, since the function's own type variables are in it, but legacy holds that
function as its tagged set's `i32` id. The container's rep is therefore closed.

## The change

- `tyOpenOutsideFns(ty, depth)` (`emit_classify.vl`, which already imports the type accessors):
  whether a type variable occurs anywhere but under a function type. A cycle deeper than `depth`
  answers true.
- `irTyHeldOpen(ty, rep)` (`ir_verify.vl`), the one rule-1 test the builder and the verifier read:
  - a function type keeps its rule (held at `i32`);
  - any other open type is held only when no type variable sits outside a function type, and its
    rep holds no closure (`repHoldsClosure`, over `repNodeKids`).
  A closure-rep function stays STORE's, as agreed.

Compiler lines: +43 −3, 40 net (`emit_classify.vl` +29, `ir_verify.vl` +11), about 6.7 corpus
functions per net line.

## Readings (fixpoint seeds, master `7a7482cef` against this change)

| reading | master | this change |
| --- | ---: | ---: |
| corpus functions with no blocker (census) | 38,985 | 39,252 (+267) |
| `open local type` alone | 256 | 22 |
| `open temp type` alone | 183 | 40 |
| `open parameter type` alone | 28 | 1 |
| corpus covered = verified = matched (shadow) | | 39,252 |

Remaining: `method f + open temp type` 40 (d15113, `{ f: g }.f(true)`), a method call through a
record field holding a set.
