# IR: a `u8`-typed value held at i32 (2026-11-20, lane IR-N2)

A value `if` pushed onto a `u8[]`, `out.push(if d < 10 { 48 + d } else { 87 + d })`, is typed
`u8` by its context, and so are its arms. `u8` has no rep: only a packed list's storage is a
byte. So `exprAt` missed at `rep u8`. This was 6 self-compile functions on their own, the byte
writers of `opt_inline_scan.vl` and `opt_multivalue.vl`. Legacy writes such a value as it writes
any i32: an `i32` blocktype and i32 arms. The packed store truncates it, which is the rule
`pushRhs` and `arrayLit` already apply to the value they deliver (#9202's u8 push).

## The change

`byteHeld` (`ir_build.vl`) reads `u8` as `i32`. `heldTy` applies it, and so does `exprRepOf`,
through `heldTy`. Every temp's type and rep and every node's rep then agree at i32, as the
verifier's rule 3 requires. The value `if`'s out variable takes the head's type through
`byteHeld` alone. Its open-type miss is unchanged.

## Witness

`tests/cases/arrays/u8-push-value-if.vl`: a digit chain, a literal flag, and an `else if` chain
whose computed value is past a byte (300, read back as 44). Under the merge-base seed all three
functions stop at `rep u8`; after, all are covered and matched. Shadow row `U8_VALUE_IF`.
