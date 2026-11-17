# Type hash-cons stage 5c, the switch: a widened result keys its instance by its set id (lane H), 2026-11-17

`monoMakeInstanceGo` now keys a widened result with `tyCanonKey(retWidenTy)` (`"#" +
tyCanonSet`) instead of `tyToStr(retWidenTy)`. Mono's key now spells no type by its rendering. Two
spellings of one type, for example an alias and its unrolling, share one instance.

## The shadow's verdict (s5c-retwiden-shadow)

Over 20,296 files on master 3f567259f, the shadow found 0 splits and 1 merge. That merge's two
types are equal under the ordered `tyEqSealed`, so the switch merges no two results whose reps
could differ (merge-ne 0).

## Measurements

| reading | value |
|---|---|
| seed | fixpoint, branch and base (master 3f567259f) |
| identity, capability list | 3,223 / 3,223 byte-identical |
| identity, the 52 programs with a widened-result note | 51 byte-identical; 1 differs, the predicted merge |
| `closures/generic-returned-record-param.vl` | 29 → 28 functions, 1,773 → 1,760 bytes; output unchanged and matches its `@log` lines |
