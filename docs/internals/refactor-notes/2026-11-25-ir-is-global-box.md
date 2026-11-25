# IR: a module global's box tested by `is` (2026-11-25, lane COV-IS)

`is box not a local`: an `is` test whose arm tag reads the receiver's raw box (`identBox`), or a
stored box test, over a module global's union box. Legacy pushes the global's cell raw
(`emitUnionBoxPush`'s global arm, recovered non-null), whatever its narrowing. The builder now
reads it through `irBBoxLocal`'s global arm (`globalBoxSymOf`) at both sites.

This branch also carried `narrowed read niche kind` (map, list and closure niches). Master's #10010
landed the same mechanism first, so the merge took master's version.

## By receiver (tests/cases and witnesses, master 7eddff27)

| receiver | hits | here |
|---|---:|---|
| a module global | 14 | claimed; every one matches |
| a captured variable | 8 | forwarded to COV-CLOS (coordinator, 2026-11-25) |
| an element (`xs[i] is T` at its storage) | 4 | still `is box not a local` |

## Deferred, with the coordinator's agreement (2026-11-25)

- `is member storage rep`: relaxing `storedNullableOfValue` to take a boxed nullable over a union
  box reaches a verifier failure (`a field's rep is not its destination's`) and a start body
  mismatch. Its exclusion holds; the gain would be about 5 functions.
- `null test optChain`: it needs an IR form of `emitOptChainIsNull`'s recursive, receiver-staged
  chain test.
- `array null sentinel`: ruled option (a). A `null[]` list's element rep in the IR becomes
  legacy's i32-backed storage. That is its own PR.

## Q58

`tests/cases/unions/global-box-is-tag-positions.vl`, at module scope: an `if` chain, a `let`, a
call argument, a `&&` operand, a negation, an `if` arm, a record field, a list element and a
`while` condition. Base: `start uncovered is box not a local`. Head: start matched.
