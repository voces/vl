# IR: a `u8`-typed value held at i32 (2026-11-20, lane IR-N2)

A value `if` pushed onto a `u8[]`, `out.push(if d < 10 { 48 + d } else { 87 + d })`, is typed
`u8` by its context, and so are its arms. `u8` has no rep: only a packed list's storage is a
byte. So `exprAt` missed at `rep u8`. This was 6 self-compile functions on their own, the byte
writers of `opt_inline_scan.vl` and `opt_multivalue.vl`. Legacy writes such a value as it writes
any i32: an `i32` blocktype and i32 arms. The packed store truncates it, which is the rule
`pushRhs` and `arrayLit` already apply to the value they deliver (#9202's u8 push).

## The change

`byteHeld` (`ir_build.vl`) reads a type whose rep is the packed `u8` as `i32`. It asks the rep
(behind a cheap `tyScalarBasePrim` gate), not the checker's `TY_U8`, so the builder imports no
further checker symbol (phase-state). It applies at three places, each off the common path:
- `exprRepOf`, only where the node's own type has no rep;
- `irBLetTempTy`, only for a temp at the i32 rep;
- the value `if`'s out variable, at the head's type. Its open-type miss is unchanged.

Every node's rep and every temp's type then agree at i32, as the verifier's rule 3 requires. A
first cut applied it inside `heldTy`, which every temp asks, and cost +0.45% L2 fuel.

## Witness

`tests/cases/arrays/u8-push-value-if.vl`: a digit chain, a literal flag, and an `else if` chain
whose computed value is past a byte (300, read back as 44). Under the merge-base seed all three
functions stop at `rep u8`; after, all are covered and matched. Shadow row `U8_VALUE_IF`.
