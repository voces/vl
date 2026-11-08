# Step 7: a closure bundle is a type fact (2026-11-08)

The question this note answers: what decides "this value is a bundle"? A bundle is the record
of one closure per signature, built where a hole parameter is called at two or more
signatures (D14841, D15142, D15146). The answer is a TYPE, and the elaboration owns it before
mono runs. Each reach row delivers an argument at a rep type (`erArgRep`). A record whose fields
are `c0..c<n>` is a bundle, and `elabReachBundles` collects these into `erBundles`. Mono's two
bundle ledgers were each a re-derivation of that fact, so both now read the type.

**Shadow** (scratch compiler, `clsCensusEnter("SH …")`, `classifier-census.vl --keep`, over
the 23,615-program census population; counts are calls):

| ledger read | typed reader | agree | disagree |
| --- | --- | --- | --- |
| `monoIsBundleTy(t)`: `t`'s struct row is a delivered bundle's row | `tySame(t, b)` for some `b` in `erBundles` | 7,731 | 0 |
| (same, identity only: `elabDeliveredBundleSigs(t)` non-empty) | n/a | 7,477 | 254 |
| `bundleRetParamOf(fn)`: mono's `bundleRetParams` map | the instance's result annotation type is a delivered bundle, and the template's `elabRetParamOf` | 193,306 (141 positive, 48 programs) | 0 |

Identity alone is not enough: a pin is spelled afresh, so 254 calls ask about a type that is
`tySame` with a delivered bundle but is a different arena index. Structural equality closes
all of them. Matching by row added nothing.

**Change.**

* `elabIsBundleTy(t)` (emit_elab) replaces `monoIsBundleTy` at its three callers, and
  `monoIsBundleTy` is deleted.
* `bundleRetParamOf` keeps its name and signature, but its body now reads the type.
  `bundleRetParams`, `bundleRetParamNote` and the note in mono's instance build are deleted.
  The emitter and `fn_ret_shadow` callers are unchanged.

`elabKeyDeclOf(k)` is new: it is the declaration an elaboration key instances.

**`cloRetValSlot`: what the type is missing.** Of the classifier's 820 disagreements with
`repOfTy(fnRecordedRetTy(fe))`, 570 are `struct:N` against `closure`. In every one of the 570,
`N` is a delivered bundle's row:

* 453 are instances that return their bundle parameter (mono wrote the result annotation as
  the record).
* 117 are un-annotated functions that return such a call's record (`mk` in D15146).

The classifier is right on all 570. The missing fact is at `fnRecordedRetTy`: for a key whose
returned parameter is delivered as a bundle, it records the parameter's checker type, one
member's `TyFunc`, through `elabResultOf`. It should record the delivered record, which is
`elabCallArgRep` at `elabRetParamOf`, or `elabCallBundleRet` for the call-through case. Both
producers are pre-mono, in emit_elab. `fn_ret_shadow` already patches its columns at this spot
(`frsBundleRetRow`), but the recorded TYPE is still the function's. Moving that belongs to the
lane that owns `fnRecordedRetTy`.

The other 250 disagreements are not bundles: 130 are record and variant rows that differ, and
114 are ref-list and map slots in another vocabulary (r5). Until those close, the classifier
family stays.

**Proof.** Both seeds are fixpoints: master `dc29cbb8` is 6,504,349 bytes, and this change
6,504,214 (−135). The sweep over 23,618 programs read 23,618 same, 0 bytes-only, 0 output
movers, 0 `runs → not-runs` and 0 new traps. `rep-fuzz-check.sh` is exact (0 new, 0 stale).
