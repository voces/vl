# Slot store, stage 2b part 2b(iii) C: the uncalled family reads the classes (lane SLOT, 2026-11-16)

Part B2 ([`2026-11-16-slot-store-stage-2b-part3b2.md`](2026-11-16-slot-store-stage-2b-part3b2.md))
switched the literal-callee family. This PR switches the uncalled family.
- **Elab:** `elabSlotUncalled` and `elabSlotUncalledOmitting`, and through them
  `elabValueSlotUncalled`.
- **Mono:** `monoPinListElems`, `monoPinNestedListElems` and `monoStoredSlotFnTy`. Their
  7 sites call the two elab functions, so they move with no mono edit.

## What changed

- **`eplSlotDelivered(holder, path, omit)`**: whether a slot is delivered at a closed function
  type. That holds when a class its value reaches has a bound, or when a call through it or a
  copy is one `omit` does not list. It replaces `elabSlotDeliveries(…).length > 0` and its
  omitting twin.
  - A call made through another fresh `const` holder, unified with this one, is not this slot's
    (`callRoot`, the rule 2b(i) applied to `eplSlotSig`'s own-calls reading). Two `Map()`s
    handed to one parameter unify; only the map the call reads out of has the call.
- **Flow edges carry the read they were drawn from** (`flowVal`, `fwdVal`). `eplReachOmit` and
  `eplCallsStarOmit` follow only edges whose read `omit` does not list.
  - The flow rewrite passes `omit` as the reads it re-points to the generic (`mfrRepointed`).
    What such a read hands on is no longer delivered there, so neither its calls nor a bound it
    reaches count. In `map-read-field-store-repointed-let-listed-at-two-types`, the bound came
    from `run`'s annotated parameter, through the re-pointed read of `m["k"]`.
  - 2b(ii) said the classes kept no edge per read. They keep one now, so the omit is by read.
- `eplSlotCallRecs` takes the omit and passes it to the reach. The other readers pass none.

## Parity

A scratch build answered both the walk and the classes at both readers, over `tests/` and the
distilled corpus, logging through a list each compile resets. 0 calls differ:

| reader | calls compared | differing |
|---|---|---|
| `elabSlotUncalled` | 73 | 0 |
| `elabSlotUncalledOmitting` | 336 | 0 |

The first class version differed at 11 calls, all where the classes saw a delivery the walk did
not. They are the witnesses for the two rules above:

| program | slot | rule |
|---|---|---|
| `closures/hole-fn-generic-map-handed-two-maps` | `m2` values, line 20 | another fresh holder |
| `closures/map-read-field-store-repointed-let-listed-at-two-types` | `m` values, line 8 | omit by read (a bound) |
| `generics/fn-value-generic-container-read-listed-or-stored` | the map values at lines 37, 44, 49, 54, 62 | omit by read |
| `generics/fn-value-generic-copied-returned-or-aliased-handed` | lines 30 (`e`), 33 (`v`) | omit by read |
| `generics/fn-value-generic-handed-from-call-map-or-repointed-let` | lines 36 (`v`), 43 (`v`,`e`) | omit by read |

The 2b(ii) note counted 16 differing calls at `elabSlotUncalledOmitting`. That probe logged
cumulatively across a batch (part B2's note), so 16 was not a per-program count. These 11 are.

## Readings

READINGS

## Next

Part D: the remaining mono readers. Part E: delete the walk.
