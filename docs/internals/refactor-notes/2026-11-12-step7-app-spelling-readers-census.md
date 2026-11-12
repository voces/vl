# Step 7: the readers that resolved an application spelling by name, re-measured after #7553, 2026-11-12

`2026-11-12-step7-gae-at-instance-type.md` (#7553) named five readers that resolve an application
spelling (`Box<i32>`) by name as the next floor. That census was taken before #7553. This one is
taken on master `8c10dcb1`, after it, over the sweep's 24,117 programs.

## Census

Scratch probe compilers, never refreshed into a seed, tagged an application-spelling name hit
(`annGenAppSpanEnds`) at each reader. Each probe was validated by a control that fires: the same
probe tagging any name hit, on a cell of the old list.

| reader | application hits | note |
| --- | --- | --- |
| `structRowOfSpelling` (so `spellingHasStructRow`, `isSName`) | 0 | the old cells now resolve the render, `{v:i32}` |
| `rlElemStructRow`, its last (name) rung answering | 0 | 7 plain-record hits, D15552's family |
| `elemNameIsNominalAt` | 0 | |
| `monoArgTyNameProjected` | 0 hits; the name missed | `Box<{x:i32}[]>` missed by name where the type gives row 1 |

#7553's typed mint interns an application at its render, so no row is keyed by the application
spelling any more, and these readers' name paths serve plain names only.

## What changed

`monoArgTyNameProjected` (`emit_mono.vl`) reads a field argument's receiver row with
`structRowOfNameTy`: the pinned type's row, the spelling's only when no type is in hand.
Byte-identical on its two census cells, D3900 and
`generics/un-annotated-inline-record-callback-beside-box-list`.

## The type rung

The floor kept `gaeEnsure` from skipping its intern when a row of the type already exists. A
scratch sweep of that rung (`structRowOfRecordTy(ty) >= 0` returns at its head), base and
candidate built by one seed: 24,117 same, 0 bytes-only, 0 output movers. The inline intern
already dedups by type, so the rung is identity. Whether `gaeEnsure` is needed at all, since the
walk leaf interns the same type next, waits on w324's walk PR.
