# IR: a union compare box behind parentheses or a narrowed global (2026-11-24, lane N10)

The `union compare box` tail. A union compare reads its box twice, which needs a read the
lowering can write again (`recvReadsAgain` in the builder, `irHoistRecv` in the lowering). Two
reads missed that, by two mechanisms:

- **A parenthesized field receiver** (`(lv1[0]).r == 7`, corpus `f64nul_eqlit_list_bind`). A
  field read is re-readable when its receiver is, but both walks recursed on `m.memObj` without
  `unwrapParen`, so the `Paren` node had no recorded read. `lv1[0].r == 7` already matched; only
  the parentheses differ. Both recursions now unwrap.
- **A global narrowed to a smaller union** (`inferred-nullable-mixed-litunion-return` `@init`).
  `identRead`'s global path stages a union cell narrowed to a smaller union as the same box (`sgV`)
  and recorded no `irReadAgain`, while the global read paths beside it record their
  `global.get`. It now records `globalBoxAt`'s own read (`ggSym`, `irBGlobalBoxRecovers`), which
  legacy re-emits.

A call receiver (`(mk()).r == 7`) stays out: it is no recorded read, so the compare stashes it and
calls it once, as on master. `opt-chain-scalar-unbound-box::f` (an optional-chain box) is left to
the optChain family.

## Legacy tails the IR calls

None new.

## Witnesses

- `tests/cases/unions/paren-receiver-and-narrowed-global-reread.vl`: a parenthesized receiver
  at each consumer of the walk (a compare box, a null-leg operand, an `is` test, a `??`, an index),
  nested parentheses, a parenthesized call (one call), and a narrowed global beside a call that
  reassigns it, in both orders. `g == bump()` reads `g` first and `bump() == g` after, as
  legacy does.
- `tests/ir-shadow-rows/paren-receiver-narrowed-global-reread.vl`: covered = matched.

## Readings (base b2f70589, fixpoint seeds on both sides; master merged after, mechanically)

| reading | result |
| --- | --- |
| census provenance | base arm: `compiler/ir_build.vl` and `compiler/ir_lower.vl` (the PR's compiler files) at b2f70589's copies |
| tests/cases (IR-only census), every class that moves | `union compare box` 4 → 0 and `union compare operand` 1 → 0 (this PR's witness); `start: union compare box` 1 → 0 (`inferred-nullable-mixed-litunion-return` `@init`, now `start: box of a valued if` 0 → 1, already listed beside it); no other class, no other consumer of the walk moved; self-compile 0 missed; fully IR-only 6,522 → 6,523 |
| distilled corpus, mode 4 | `start uncovered union compare box` 1 → 0 (`f64nul_eqlit_list_bind`), start covered = matched 9,700 → 9,701; nothing else moved |
| `ir-identity.sh <base> <head> --names` | identical 9433, differ 0, built under one only 0; self-compile identical |
| `ir-identity.sh --cases` | identical 8027, differ 0 (8035 after the master merge), expected divergence 2 (master's baselined arm-site rows) |
| `ir-identity.sh --claimless` | identical 14474, differ 0 |
| claimless, the two witnesses | identical 2 of 2; claimless compiler sha256 `8167a7ae74b5f2bb4629b65c227b30534871b076091192088309744ed8606eca`, built in adebe651, `compiler/` clean |
| legacy A/B (tests/cases + probes) | 8,097 programs, 0 moved |
| L2 self-compile fuel per PR | +0.01% on 127,618,857,538 |
| late demands / late tag rows | 10 (baseline 10) / 315 (baseline 315, 0 gone) |
| `self ir misses` | 0 (baseline 0) |
| `lint-self`, `gate.sh --fast` | clean, passed (after the merge, which brought master's D17280 `claims-fallbacks.txt` row) |
| IR tests, door guard, emitter audit (`SELFHOST_NATIVE_ALIGN=1`) / `vl_deep_nesting_test.ts` | 587 passed / 8 passed, 0 failed |
