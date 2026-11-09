# Step 2: the keyless reads, the two late demands, the key segment, and what mono still decides

Base: #6927's branch (`504cb542`, master `4b08f750` with #6923 and #6927), built to a fixpoint
(6,569,456 bytes). The probes were built by scratch seeds that were never committed. Population for
items 3 and 4: the 7,646 `tests/cases/**/*.vl` files, each built once with the base seed. Counts
are instance builds or registry hits, not programs. This PR changes no compiler source.

## 1. The 6 `_` reads: no lambda clone is missing its key

A clone's slot already resolves to its key. `monoMakeInstanceInstall` re-parents every slot minted
for the instance to `instFe`, and `elabKeyAtPos` resolves an unkeyed slot through its in-place
declarations (`elabKidsAt`). The probe printed the frame, its parent's key and every instance the
frame could be read under. The 6 `_` reads are:

| reads | program | frame | why the elaboration has no closed answer |
|---|---|---|---|
| 2 | `mono-lambda-forwarder-uninstantiated` | key −1, `_never`'s lambda | nothing calls the lambda, so it has no instance |
| 2 | the same, `_nested` | key 3 (`outer`'s instance) | as above, nested |
| 2 | `hole-fn-param-handed-on-from-lambda-at-two-types` | key −3: `run` has instances 3 and 4 | `h` is `(_, _) => _` under both |

The first 4 are hole lambdas that nothing instances. The elaboration mints a default instance
(each hole at `i32`) only for a hole function whose value is read (`elabStoredHoleDefaults`). To
answer here, it would have to guess for a lambda nothing reads either. The other 2 are a hole
function forwarded whole: under each of the frame's two instances its type stays open, so the pin is
the set it is handed (a rep, step 7). The instance no-answers stay at 14.

## 2. Late demands stay at 6

Both of #6920's cases demand `show` at `__W0 = {f: (i32) => i32, g: i32}`, from
`monoMakeInstanceGo` → `elabDemand`. Mono reads `r.f(1)` as fixing `k` at `i32`. In these two
programs, the elaboration declines exactly that reading, because a name shadows `k` or the field is
written, so the call through the field is not `k`'s direct call. Minting the key in `elabRun` would
record a type the program does not have, and both programs are refused anyway. The baseline is not
written.

## 3. `monoKeyPinSeg`: the call half is already on the call key

A build with a call key is registered under `instKeyCanon(origFe, callKey, reps, frame, callbacks)`,
and the lambda (`L`) and value (`V`) halves are too. `monoKeyPinSeg` reaches the registry in only
two places:

| path (`ckey` shadow) | builds | hits | key |
|---|---|---|---|
| call / value / lam | 13,383 | 7,080 | the elaboration's |
| `pins` (`elabHoleKeyAtPins`): verdict agree / noinst | 12 / 8 | 2 / 1 | mono's spelled key |
| `spelled`, no elaboration key at all | 124 (71 files) | 70 | mono's spelled key |
| typed dedup (`monoTypedInstKey`) | — | 359 typedhits | mono's typed key |

`instKeyNote`'s comparison: the call-time key agrees with the key mono demanded at 13,053 builds,
differs at 274 and is absent at 156. Keyed by the elaboration key alone, 32 pairs of mono keys merge
in 25 files. They differ only in a parameter's rep (a tagged set or a record row), which is why the
registry key carries the reps. `vl_inst_key_shadow_test`'s default list grades 2 of those 25 files.

- **The `pins` path can switch.** 12 builds agree, and an `instKeyCanon` over the pin-matched key
  would key them. The 8 `noinst` builds have no instance at that binding (`elabDemand` returns −1).
  Not switched here: switching changes the registry partition, so it needs the full sweep.
- **`spelled` cannot.** The elaboration has no instance for those 124 builds, so there is no key
  to switch onto.
- **The typed dedup is a rep merge.** Two keys name one instance only where their pinned reps are
  the same. It is step 7's.

## 4. What mono still decides

| family | count | decision | owner |
|---|---|---|---|
| argument row arms (`monoArgRowArmTy`) | 1 site; 180 / 223 spelling differs | rep: the row a literal is built at | step 7 |
| closed-type spelling, union registration (`monoPinOfClosedTy`, `monoClosedTyName`) | 7 + 4 sites | rep: a spelling of a type the elaboration already gives | step 7 |
| `monoElabPin` spelling and delivery | 5 sites | type is `elabCallParamTy`; the spelling is rep | step 7 |
| body retyping (`monoPinnedOperandTy`) | 5 sites | type: an operand narrowed against its declared type | step 2, not measured here |
| `monoKeyPinSeg`, `pins` path | 20 builds | type: a key the elaboration has | step 2 (switchable) |
| `monoKeyPinSeg`, `spelled` path | 124 builds | type: no elaboration key | step 2, named: no key exists |
| `monoKeyPinSeg`, typed dedup | 359 hits | rep: same reps, one instance | step 7 |
| instance no-answers | 14 | type: 8 are root rows read again, 4 are uncalled hole lambdas | named in #6927 and §1 |
| | | rep: 2 are a forwarded hole function's set | step 7 |
| late demands on refused programs | 2 | type: a reading the elaboration declines | named in §2 |

The step 2 work still owed, with a key the elaboration can already give: the `pins` switch (20
builds) and body retyping, which this PR does not grade. Everything else in the table is a rep
(step 7), or a pin the elaboration has no answer for, named with its reason.
