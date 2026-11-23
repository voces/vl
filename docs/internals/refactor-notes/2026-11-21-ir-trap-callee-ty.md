# IR coverage: the callee an operator-field rewrite mints is typed (2026-11-21, lane IR-N7)

`rep ?`, split on master 6716810b by a probe naming the node kind and its type, holds 149
`tests/cases` functions, all at an untyped node. 19 functions over 8 files (18 with no other
blocker) are an untyped `Member` with `pos` -1 over an `Ident`. That is the callee
`emit_rewrite.vl` mints when it desugars an operator on a closure field:
- `o[k]` becomes `o."[]"(k)`;
- `o[k] = v` becomes `o."[]="(k, v)`;
- `a * s` becomes `a."*"(s)`.

`drwOpCall` carries the operator node's type to the minted call, but the minted `Member` got no
type. The builder reads that callee as a closure-field read and missed at its rep.

## Change

`drwFieldCallee` mints the callee and records its type, `tyFieldTyOf` of the receiver's type at
the field, which is the check's own answer for that field. All three sites use it. Legacy reads
no type at these callees, so its bytes do not move. The 12 index-trap and operator-field files
build byte-identical on both seeds.

## Measured

Against master's seed, on the eight witness files: 8 start functions go from `rep ?` to covered =
matched, and so does the one other function. The row
`tests/ir-shadow-rows/operator-field-callee-typed.vl` has 7 functions; 2 are `rep ?` on master's
seed, and here all 7 are covered and matched. The full table is in the PR body.
