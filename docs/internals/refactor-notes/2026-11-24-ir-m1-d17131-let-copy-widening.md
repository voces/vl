# D17131: a `let` copying a record binding counts its writes in the source's widening (2026-11-24, lane IR-M1)

```
const v = { r: { f: inc0 }, s: { f: dbl } }
let m = v
if k > 0 { m = { r: { f: dbl }, s: { f: dbl } } }
return m
```

This was check-clean, and the module failed to validate in `mk` on master, under both the IR and the
claimless compiler. `v`'s literal was built at row `$0`, with `r` holding `inc0` as a tag id.
`m = {…}` was built at its own row `$5`, both fields closures, and stored into `m`'s `(ref $0)`
local.

## Mechanism (measured)

The function-field widener (`elabFnFieldTy`, `check_elab_cap.vl`) runs for `v`. `v` has no writes,
so the widener exits at `u == s`. It never runs for `m`, the binding that is written. So
`recAsgFnWidenedTy` (`check_fit_rules.vl`) stamps neither literal at a widened record. With
`let m = <the literal>` directly, `m` is both the literal's binding and the written one, so it
widens and both literals build at one row.

Two earlier attempts changed no byte, and were measured and reverted:
- unioning the alias literal's set inside `m`'s widening, which never runs;
- having `recAsgFnWidenedTy` follow the sole-read chain to the `let`.

## Change

- `fnPathSetOf(bd, path)` also counts the path writes of every un-annotated `let` whose initialiser
  reads `bd`, transitively (`fnLetCopiesOf`). Past 16 copies it returns the `-1` the slot scan
  already refuses with, never a partial set.
- `recAsgFnWidenedTy` builds a literal written into such a copy where the copied binding's widening
  builds it. It walks `recLetCopySrcOf` at most 16 hops up to a widened source; past that it builds
  at its own row, as master does.

R8: the checker's own widening (`elabFnFieldTy`, `fnPathSetOf` over `cwPathFnTargets`) and
`recAsgFnWidenedTy` (`recBindDeclOf`, `elabFnFieldWidenedAny`, `fnTagHeldRepOf`). No IR change.
Per V3 on #9899: a wrong heap fill is caught by the builder, as a miss, before any claim, not by
the verifier.

## Witnesses (`tests/cases/records/let-copy-of-fn-record-*`; master: invalid module for each)

| case | head prints |
| --- | --- |
| minimal | 6 |
| V1's three calls | 6, 6, 10 |
| a field written through `m` shows in `v`, which keeps it once `m` is reassigned (`v.r.f(3)` before and after) | 4 6 6 6 4 4 / 4 6 6 6 6 6 |
| a second copy (`let w = m`) | 4 4 4 6 |
| `m` reassigned inside a closure | 4 6 |
| `m` reassigned a literal holding a lambda | 4 8 |
| the source a `let` | 4 6 |

A copy through a field read (`let m = holder.v`) or a call (`let m = id(v)`) is no copy here. Both
stay invalid on master and head, filed as D17360 and D17361.

## Readings

READINGS
