# IR: a valued if or coalesce join boxed as itself (2026-11-22, lane IR-N2)

`box of a valued if` at 568e22a3: 28 sole-blocker functions over the corpus files, 26 of them the
`nj2_ch` grid (`print(kind((q ?? (r ?? 5))))` over `i64 | null`, `i32 | null`). The coordinator
ruled the box delivery IR-N2's; the chain itself builds (#9407).

Ablation of `nj2_ch__i64_i32__lit5__print__rop`, with the miss disabled in a scratch seed:
legacy writes the box's `i32.const` tag inside the outer coalesce's arm, before the inner
coalesce. The IR wrote it after, so the lowering found the tag above the join's value
(`unlowered: operand above a valued if's value`). This is the order D17042 had for a record's
stash.

## The change

- `boxOfJoinAt` (`ir_build.vl`): the delivery from `at` built exactly one join, a valued `SIf` or
  an `SCoalBox`, and the box of its out. The builder takes that shape where it missed before.
- `stashIfBoxHead` (`ir_lower.vl`), D17042's hook ahead of each join, also writes the head of a
  box whose value is that join's out (`lwIfBoxAt`, noted once per function). The box then skips
  it. Only plans whose head writes a tag ahead of the value take this path: `atom`, `atomAsStr`,
  `rec`, `obj`, `refList`, `map`, `clo`.

Corpus covered = matched 44792 → 44818 (+26, the `nj2_ch` grid) and tests/cases +1 on one A/B
over seeds of the #9460 head, no new fail rows.

Row file `tests/ir-shadow-rows/coalesce-chain-boxed.vl`; witness
`tests/cases/unions/numeric-coalesce-chain-boxed-into-generic.vl`.
