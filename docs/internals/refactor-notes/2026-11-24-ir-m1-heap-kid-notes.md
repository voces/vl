# IR heap identity 4c: `recHeapsNote` walks the kids of a rep already noted (2026-11-24, lane IR-M1, D17083)

`function mk2(f) { return { r: { f: f } } }`, called as `mk2(inc0).r.f(3)` (the D17083 pin,
`closures/hole-fn-param-into-returned-record.vl`), missed with `return coercion`. Here:

| | outer | `r` kid |
|---|---|---|
| value | `rep53` @ h1 | `rep12` @ h0, noted |
| result | `rep16` @ h1, noted | `rep15`: `recHeapOf` h0, never noted |

`recRowRetag` notes both reps' heaps through `recHeapsNote`, and that returned at once on a rep
already noted. The result rep is noted before the retag asks, so its kids never were, and
`repsLowerAlike` read no heap for `rep15`. `recHeapsNote` now walks a noted rep's kids too. It still
fills only unnoted entries (a -1), so no note it finds is overwritten.

## How the pre-review's mechanism was refuted

The pre-review proposed noting the result's kid at its field's code-15 target row
(`sFieldTgtStructIdx`). That code was built and covered `mk2`. Three control seeds then showed it
was not doing the work:

- the note turned into an `emitFail`: never fired, and `mk2` stayed covered;
- the note at a wrong heap (`t + 1`): `mk2` stayed covered and verified;
- the function only asking `recRetagNoted` again: `mk2` covered.

4b's `recValRetagNoted` notes the result's kids as a side effect, so a second ask passes. The kid's
heap was `recHeapOf`'s all along: the diagnostic printed `15[h=0,n=-1]`, and `n=-1` meant unnoted,
not heapless.

## Legacy answers the IR calls (R8)

`recHeapOf` (`recordHeapOfTy`, else `askRecordHeap`), unchanged. No new admission predicate, IR fact
or verifier rule: the verifier reads `irRecHeap` as before.

## Position sweep (Q58), base 341b3bc73 (4b) → head, `VL_IR_SHADOW=2`

Committed as `tests/cases/closures/heap-kid-row-*`:

| position | base | head |
|---|---|---|
| returned and bound (`ret`), one record deeper (`field`), either branch of an `if` (`ifarm`) | `return coercion` | covered |
| an annotated parameter (`arg`), a `const` then returned (`const`), beside a sibling holding another function (`twokid-mixed`) | covered | covered |

Every program prints the same on both seeds. Two neighbours are loud rejects on both seeds and are
not sweep cases:
- `{ r: { f: f }, s: { g: f } }` and `{ r: { f: f }, s: { f: f } }` (`ref valtype with no interned shape`);
- `mk2(inc0)` called from both branches of an `if` (`cannot take the generic function … as a value`).

The sweep also found D17127, which is check-clean invalid wasm under the claimless compiler too, so
legacy's: `inc0` forwarded through a second un-annotated parameter into the record.

## Not closed here

`d15293_bound_returned`: the result's kid sits behind a list element (`list#6{rep7}`), and the
cell also misses `narrowed read`.

## Readings

READINGS
