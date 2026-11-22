# RCallHost is a call, and is claimed (IR-C1)

`RCallHost` moves from the `other` family to `call`: `RCall | RCallHost | RPrint => "call"`. Its
plan, `hostCallPlanOf`, reads the import slot the use scan reserved before any function is emitted
(`fsIdxAt`, `externLinkOf`). Its lowering is legacy's `hostCallTail`, so neither reads state that
legacy fills while it emits. There is no new admission predicate. It was in `other` only so its
coverage PR moved no shipped byte.

## Readings (fixpoint seeds on both sides)

The stack top was proved once (R4): this change (d46c311b) over RNumUnionBin (ab7aecca), against
the `mem` split's head (cabfada8). The released count is this layer's own.

| reading | result |
| --- | --- |
| `ir-identity.sh --cases` | identical 7619, fail under both 68, differ 0, timeout 0; witnesses same 61, differ 0 |
| `ir-identity.sh --claimless` | identical 14019, fail under both 3267, differ 0, timeout 0 |
| `ir-identity.sh <base> <head> --names` | identical 9037, differ 0, built under one only 0; self-compile identical |
| armed shadow, corpus | 45678 functions, 45099 covered = verified = matched |
| armed shadow, `--cases` | no class above baseline |
| `ir-shadow.vl --claims` | 45056 corpus functions emitted by the IR, 19301 over 4982 filed witnesses; no fallback |
| deep-nesting margin | base fail 921 / pass 925 KB; head fail 921 / pass 925 KB |
| `gate.sh --fast` (host with mode 6) | FAST TIER PASSED, `ir prepost` included |
| L2 self-compile fuel per PR | +0.01% on 111337549921 (both layers) |
| tests/cases claimed, this layer (`fnc` rows) | +113, 0 lost |

## The functions released (tests/cases, file and function)

```
tests/cases/extern/call-in-function-beside-closure.vl  g
tests/cases/extern/exported-from-host-module/clock.vl  elapsed$m1692808117
tests/cases/extern/exported-from-host-module/clock.vl  twice$m1655701887
tests/cases/extern/exported-from-host-module/echo.vl  twice$m1655701887
tests/cases/extern/exported-from-host-module/echo.vl  twiceEcho$m557583442
tests/cases/extern/exported-from-host-module/entry.vl  elapsed$m1692808117
tests/cases/extern/exported-from-host-module/entry.vl  twice$m1655701887
tests/cases/extern/exported-from-host-module/entry.vl  twiceEcho$m557583442
tests/cases/extern/exported-from-host-module/host.vl  twice
tests/cases/extern/function-loop-var-named-like-extern.vl  __lambda_1
tests/cases/extern/function-loop-var-named-like-extern.vl  nowMillis$extv
tests/cases/extern/module-loop-var-named-like-extern.vl  __lambda_0
tests/cases/extern/never-result.vl  f
tests/cases/extern/two-modules-disagree/clock.vl  tick
tests/cases/extern/two-modules/clock.vl  tick
tests/cases/extern/two-modules/entry.vl  tick$m126617869
tests/cases/extern/value-beside-local-function.vl  nowMillis$extv
tests/cases/extern/value-forwarder-not-user-nameable.vl  nowMillis$extv
tests/cases/extern/void-result.vl  __lambda_0
tests/cases/extern/void-result.vl  __lambda_1
tests/cases/extern/void-result.vl  __lambda_2
tests/cases/extern/void-result.vl  early
tests/cases/extern/void-result.vl  tail
tests/cases/extern/void-result.vl  twice
tests/cases/intrinsics/fs-intrinsic-as-value.vl  __lambda_0
tests/cases/intrinsics/fs-intrinsic-as-value.vl  __lambda_1
tests/cases/intrinsics/fs-intrinsic-as-value.vl  __lambda_2
tests/cases/intrinsics/fs-intrinsic-as-value.vl  __lambda_3
tests/cases/literal-unions/litunion-order-cross-module-alias.vl  fileSize$m278167723
tests/cases/literal-unions/litunion-order-cross-module-alias.vl  lastErrno$m278167723
tests/cases/literal-unions/litunion-order-cross-module-alias.vl  listDir$m278167723
tests/cases/literal-unions/litunion-order-cross-module-alias.vl  pastEnd$m278167723
tests/cases/literal-unions/litunion-order-cross-module-alias.vl  pathKind$m278167723
tests/cases/literal-unions/litunion-order-cross-module-alias.vl  readFile$m278167723
tests/cases/literal-unions/litunion-order-cross-module-alias.vl  readFileInto$m278167723
tests/cases/literal-unions/litunion-order-cross-module-alias.vl  readFileRange$m278167723
tests/cases/literal-unions/litunion-order-cross-module-alias.vl  readFileRangeInto$m278167723
tests/cases/modules/literal-binding-std-constant/entry.vl  fileSize$m278167723
tests/cases/modules/literal-binding-std-constant/entry.vl  lastErrno$m278167723
tests/cases/modules/literal-binding-std-constant/entry.vl  listDir$m278167723
tests/cases/modules/literal-binding-std-constant/entry.vl  pastEnd$m278167723
tests/cases/modules/literal-binding-std-constant/entry.vl  pathKind$m278167723
tests/cases/modules/literal-binding-std-constant/entry.vl  readFile$m278167723
tests/cases/modules/literal-binding-std-constant/entry.vl  readFileInto$m278167723
tests/cases/modules/literal-binding-std-constant/entry.vl  readFileRange$m278167723
tests/cases/modules/literal-binding-std-constant/entry.vl  readFileRangeInto$m278167723
tests/cases/std/args-none.vl  programArgs$m730195605
tests/cases/std/buffer-bytes-file-staging.vl  fileSize$m278167723
tests/cases/std/buffer-bytes-file-staging.vl  lastErrno$m278167723
tests/cases/std/buffer-bytes-file-staging.vl  listDir$m278167723
tests/cases/std/buffer-bytes-file-staging.vl  pastEnd$m278167723
tests/cases/std/buffer-bytes-file-staging.vl  pathKind$m278167723
tests/cases/std/buffer-bytes-file-staging.vl  readFile$m278167723
tests/cases/std/buffer-bytes-file-staging.vl  readFileInto$m278167723
tests/cases/std/buffer-bytes-file-staging.vl  readFileRange$m278167723
tests/cases/std/buffer-bytes-file-staging.vl  readFileRangeInto$m278167723
tests/cases/std/fs-append-text.vl  fileSize$m278167723
tests/cases/std/fs-append-text.vl  lastErrno$m278167723
tests/cases/std/fs-append-text.vl  listDir$m278167723
tests/cases/std/fs-append-text.vl  pastEnd$m278167723
tests/cases/std/fs-append-text.vl  pathKind$m278167723
tests/cases/std/fs-append-text.vl  readFile$m278167723
tests/cases/std/fs-append-text.vl  readFileInto$m278167723
tests/cases/std/fs-append-text.vl  readFileRange$m278167723
tests/cases/std/fs-append-text.vl  readFileRangeInto$m278167723
tests/cases/std/fs-into.vl  fileSize$m278167723
tests/cases/std/fs-into.vl  lastErrno$m278167723
tests/cases/std/fs-into.vl  listDir$m278167723
tests/cases/std/fs-into.vl  pastEnd$m278167723
tests/cases/std/fs-into.vl  pathKind$m278167723
tests/cases/std/fs-into.vl  readFile$m278167723
tests/cases/std/fs-into.vl  readFileInto$m278167723
tests/cases/std/fs-into.vl  readFileRange$m278167723
tests/cases/std/fs-into.vl  readFileRangeInto$m278167723
tests/cases/std/fs-range.vl  fileSize$m278167723
tests/cases/std/fs-range.vl  lastErrno$m278167723
tests/cases/std/fs-range.vl  listDir$m278167723
tests/cases/std/fs-range.vl  pastEnd$m278167723
tests/cases/std/fs-range.vl  pathKind$m278167723
tests/cases/std/fs-range.vl  readFile$m278167723
tests/cases/std/fs-range.vl  readFileInto$m278167723
tests/cases/std/fs-range.vl  readFileRange$m278167723
tests/cases/std/fs-range.vl  readFileRangeInto$m278167723
tests/cases/std/fs-roundtrip.vl  fileSize$m278167723
tests/cases/std/fs-roundtrip.vl  lastErrno$m278167723
tests/cases/std/fs-roundtrip.vl  listDir$m278167723
tests/cases/std/fs-roundtrip.vl  pastEnd$m278167723
tests/cases/std/fs-roundtrip.vl  pathKind$m278167723
tests/cases/std/fs-roundtrip.vl  readFile$m278167723
tests/cases/std/fs-roundtrip.vl  readFileInto$m278167723
tests/cases/std/fs-roundtrip.vl  readFileRange$m278167723
tests/cases/std/fs-roundtrip.vl  readFileRangeInto$m278167723
tests/cases/std/fs-write.vl  fileSize$m278167723
tests/cases/std/fs-write.vl  lastErrno$m278167723
tests/cases/std/fs-write.vl  listDir$m278167723
tests/cases/std/fs-write.vl  pastEnd$m278167723
tests/cases/std/fs-write.vl  pathKind$m278167723
tests/cases/std/fs-write.vl  readFile$m278167723
tests/cases/std/fs-write.vl  readFileInto$m278167723
tests/cases/std/fs-write.vl  readFileRange$m278167723
tests/cases/std/fs-write.vl  readFileRangeInto$m278167723
tests/cases/std/process-exit-never-narrows.vl  exit$m1703640757
tests/cases/std/process-exit-never-narrows.vl  fileSize$m278167723
tests/cases/std/process-exit-never-narrows.vl  lastErrno$m1703640757
tests/cases/std/process-exit-never-narrows.vl  lastErrno$m278167723
tests/cases/std/process-exit-never-narrows.vl  listDir$m278167723
tests/cases/std/process-exit-never-narrows.vl  pastEnd$m278167723
tests/cases/std/process-exit-never-narrows.vl  pathKind$m278167723
tests/cases/std/process-exit-never-narrows.vl  readFile$m278167723
tests/cases/std/process-exit-never-narrows.vl  readFileInto$m278167723
tests/cases/std/process-exit-never-narrows.vl  readFileRange$m278167723
tests/cases/std/process-exit-never-narrows.vl  readFileRangeInto$m278167723
tests/cases/std/process-exit-never-narrows.vl  runProgram$m1703640757
```
