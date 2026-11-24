# IR: a standalone `?.` over a global or field-read base, 2026-11-24

Lane IR-N4. Base: master 334f6958. Class `optional read base`.

## Change

- Legacy's `emitOptMemberValueGo` writes `emitOptChainIsNull`, then `emitOptChainValue`. An
  unstaged base is `emitExpr`'d at each read (`emitOptRecvBase`, `emitOptChainValue`), and a third
  time where the leaf field has its own null test (`emitOptLinkNullOpen`). So a global base is
  `global.get` again, and a field base is its object and `struct.get` again.
- `optRead` took only a non-temp variable base. It now also takes a temp where
  `recvReadsAgain(base)` holds, meaning the builder recorded the read (`irReadVar`, `irReadAgain`,
  `irReadField` over one).
- The lowering writes the first read with `irLOpnd`, and every later one through
  `opndAgain(orV, omObj)` (`irHoistRecv`). A variable's `opndAgain` is its `irLOpnd`, so existing
  claims don't move. The `nonNull` arm reads once, as before.

## Predicates and their legacy callers (R8)

| predicate | callers |
| --- | --- |
| `recvReadsAgain` (existing, new use) | `emitOptRecvBase` and `emitOptChainValue`, which `emitExpr` an unstaged base at each read |

## Legacy tails the IR calls

- None new.

## Witnesses and readings

READINGS
