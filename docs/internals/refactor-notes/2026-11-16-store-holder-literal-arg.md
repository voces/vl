# Holder rule: a literal handed to a hole parameter is read at the call's binding, 2026-11-16

Lane STORE, after N3 (coordinator ruling 2026-11-16: take the holder rule now, under the retry,
with probe and control).

## The refusal

N3 moved the `for`-over-a-list shape (`for x in xs { x(3) }`, `direct([inc0, half])`) from N to T:
the producer finds the set, and the check refuses it in `ftScan` at `ftHoldCtxOk`'s call arm. That
arm admits a holder handed to a hole parameter through `ftDstTakes(ftArgDstTy(...))`, and
`ftArgDstTy` read the callee's declared parameter type, which is the hole at check (and the
instance's after the elaboration).

## What changes

- `ftArgDstTy`: a list or record literal handed straight to a hole parameter is read at the call's
  binding of that parameter, which is the literal's own type. That type holds the set, so it keys the
  callee's instance.
- It applies in the check's retry, so every decision the check made before is unchanged by
  construction. It also applies after the elaboration, because there the instance's parameter type
  is the type the retry assumed. A first draft without the late half let the late decision drop five
  sets the retry had tagged (late drops 2 → 7). With both halves reading the same fact, drops are the
  pre-existing pair again.
- A first draft that read every argument this way, not only literals, also dropped sets late; the
  rule is the literal's.
- A parameter the callee hands back is excluded. A draft without the exclusion built an invalid
  module (a tagged list where the hand-back's instance keeps closures) on the error fixture
  `closures/error-set-in-record-handed-to-hole-param-two-orders.vl`, which master refuses at emit.
  The `@run` A/B could not see it: it is an `@emit-error` cell. Ablation, holder draft / with the
  exclusion / master:

| `id2` | holder draft | with exclusion | master |
|---|---|---|---|
| `return x` (hands back) | invalid module | emit refusal | emit refusal |
| `const y = x; return y` (hands back) | invalid module | emit refusal | emit refusal |
| `return 0` | builds | builds | builds |
| `return x.length` | builds | builds | builds |

- The exclusion covers the retry's refusal too. A second draft excluded hand-backs from the reading
  but still counted the holder refusal at that call as the facts refusing. The late decision then
  tagged the set through the hand-back, and the probe failed a program master runs. The capability
  matrix caught it (`hole-fn-list-of-two-results-below-generic-arg-top`, `handed_and_called`, both
  faces). It is now pinned as `closures/hole-fn-record-list-handed-back-then-called-two-orders.vl`,
  which prints `4` then `1.5`.

## Narrowing

In the retry, a literal handed to a hole parameter that the holder test still refuses counts as the
facts refusing (`ftFactRefusal`), so the late decision tagging such a set fails the probe (#8729).

| build | programs the probe fires on |
|---|---|
| a control that reads the literal at the call's binding only after the elaboration | 19 |
| this build | 0 |

## Measurement

ftlate probe, all `@run` programs, fixpoint seeds, against N3 on master (before the hand-back
exclusion; the guard PR's `late-tags-baseline.txt` is the current count):

| | N3 | holder rule |
|---|---|---|
| programs whose decision the late pass changes | 262 | 248 |
| T sets / programs | 158 / 86 | 119 / 72 |
| late drops | 2 | 2 (the same pair) |

## Grading

A/B, fixpoint against master's fixpoint: output byte-identical on all `@run` programs. Three
named wasm movers, each smaller, where a set the late decision built as closures is now tagged:

| program | wasm bytes |
|---|---|
| `closures/hole-fn-list-map-callback-generic-call-loop-alias.vl` | 1,891 → 1,779 |
| `closures/hole-fn-list-unbound-and-returned.vl` | 4,083 → 4,023 |
| `closures/hole-fn-nested-list-handed-open.vl` | 1,684 → 1,666 |
