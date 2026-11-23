# `member box` / `method has`: batch 2 on the arm-site writer (IR-C1)

These are batch 2 of the coordinator's ruling (b), on batch 1's `armSiteWrite` (#9768). Legacy's
`emitArmSite` also takes a `.length` through a box of lists or maps (`memberLengthArmOf` is
`armSite`) and a map's `.has` / `.get` (first thing in `emitCall`). The IR sent those to `member box`
and `method has`.

- **`RArmSite` generalised**: `asOps` is the box, then at most one index or key (none for a
  `.length`). `asStash` covers a box no name holds, such as `a[i].length`: the lowering takes
  legacy's receiver stash (`sharedFieldRecvSlot`) before it writes the box, as legacy does, so the
  box's own scratch locals number alike. It then sets the box into it.
- **Writer**: the operand stands for the read's index or its call's one argument, the key
  (`armSiteOpndNode`, an exhaustive match). The map key is written through `emitArmIdx` in
  `emitMapRecvKey` as before.
- **Builder**: `buildMember` routes an `armSite` `.length`. The value-position call builder routes
  an `armSiteReads` call through `irArmSiteHook`, installed by `ir_build_ref.vl` beside
  `irMemberHook`.
- **Rows**: inside a `.length` arm, legacy's own read of an element receiver banks an element-read
  row into legacy's tables while the IR lowers. `adoptBankedRows` takes the rows banked during the
  writer as the lowering's own, and `fragmentRows` banks them again. The marks are dropped with
  `bankedRowsDrop` (`emit_state.vl`). Only an element-read site banks its own outer row.

## What stays (named misses)

- `last` (`a[a.length - 1]`): the index is no atom (`arm site operand`).
- `list-union-length-through-hole` `__lambda_0`: its receiver is a narrowed read held in a temp,
  not a named variable (`arm site operand`).
- Global receivers stay for later, per the coordinator's condition: only a `global.get` operand
  qualifies, and the IR reads a global through a temp
  (`is-list-arm-read-at-numeric-literal-set` `@start`).

## Batch 1's census, reconciled

V8 counted 9 functions carrying `index none` on master; batch 1's note counted 7. The IR-only
census files each function under one class. `is-list-arm-write-at-numeric-literal-set`'s `go_f64`,
`go_i64` and `go_u8` carried `index none` beside `store arm write` and filed under the latter, so
mode 4's blocker keys name 6 alone plus those 3, all now 0. The `start: arm site operand` row of
that note is the forced IR-only census's (`ir-only-census.vl`) and has no mode-4 counterpart.

## Legacy tails the IR calls

The per-arm read named in batch 1's note (`armSiteWrite` → `emitArmSiteAt` → `emitExpr` under
`luOvEnter` / `luOvLocalEnter` / `armIdx*` / `idxSpanNode`) now also serves `.length` and
`.has` / `.get` sites. There are no new tails.

## Readings (base 706daa5f3 = batch 1's head, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| `ir-identity.sh --cases` | identical 7741, fail under both 68, differ 0; witnesses same 61, differ 0 |
| `ir-identity.sh --claimless` | identical 14051, differ 0 |
| `ir-identity.sh <base> <head> --names` | identical 9037, differ 0, built under one only 0; self-compile identical |
| armed shadow, corpus / `--claims` | covered = verified = matched; no fallback |
| order check (`ir-shadow.vl --prepost`) | 0 order rows, base and head |
| R7, margin | 450 ok; fail 903 KB / pass 906 KB on both |
| L2 self-compile fuel per PR | +0.40% on 122,133,863,287 |
| legacy A/B (tests/cases + probes) | 0 moved programs |
| emitter-state audit | 0 never-cleared, 0 unguarded |
| `self ir misses` | ok, 0 missed (baseline 0) |
| `tests/vl_deep_nesting_test.ts` (host linked) | 8 passed, 0 failed |
| tests/cases `member box` / `method has` (IR-only census) | 7 → 0 / 2 → 0 |
| tests/cases claimed | functions 79,205 → 79,212, starts 6,924 → 6,924 (0 lost) |
| shadow row `arm-site-length-and-has.vl` | 6 covered = matched (master: 2, 3 `member box`, 1 `method has`) |

The proof's `gate.sh --fast` failed once on `kind-ladder-incomplete` (`armSiteOpndNode`), now an
exhaustive match.
