# Type hash-cons stage 5c, the switch: a widened result keys its instance by its set id (lane H), 2026-11-17

`monoMakeInstanceGo` now keys a widened result with `tyCanonFoldKey(retWidenTy)` instead of
`tyToStr(retWidenTy)`. The fold key is the set id (`tyCanonSet`), the rep id (`CF_LAYOUT`) and the
function leaves' tagging. Mono's key now spells no type by its rendering. Two spellings of one type
that are stored alike, such as a record alias and its unrolling, share one instance. Two that are
stored apart keep two, so a fold never joins two storages (STORE's condition).

The set id alone would have folded the shadow's control,
`tests/cases/closures/generic-returned-union-alias-result.vl` (#8915): a union alias and the union it
names, with one set id and two rep ids. That program prints correctly either way today. The fold
key keeps it two instances by construction, so a later rep change cannot turn the fold into a trap.

## The shadow's verdict (s5c-retwiden-shadow)

Over 20,296 files on master 3f567259f, the shadow found 0 splits and 1 merge. That merge's two
types are equal under the ordered `tyEqSealed`, so the switch merges no two results whose reps
could differ (merge-ne 0).

## Measurements

| reading | value |
|---|---|
| seed | fixpoint, branch and base (master eb6a0664d; the base seed is #8915's, byte-identical to master's output with the shadow off) |
| identity, capability list | 3,223 / 3,223 byte-identical |
| identity, the 52 programs with a widened-result note | 51 byte-identical; 1 differs, the predicted merge |
| the control (`generic-returned-union-alias-result`) | byte-identical: not folded, its two storages differ |
| `closures/generic-returned-record-param.vl` | 29 → 28 functions, 1,773 → 1,760 bytes; output unchanged and matches its `@log` lines |
| `tests/vl_inst_key_shadow_test.ts` | the program moves from `MERGES` (two of mono's keys spell one instance) to `SETTLED` (mono spells it once; the shadow reports no merge) |
