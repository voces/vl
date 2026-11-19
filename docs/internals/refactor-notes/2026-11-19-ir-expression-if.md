# IR: an `if` on an `is` condition, valued or returned (2026-11-19)

`expression if` was one miss for every value `if` off legacy's plain scalar path, and `tail if
guard` refused every returned `if` whose condition was an `is` test. `ifExprPlainKind` now reads
`ifExprPlainWhy`, which names the rung that refused, so the census splits the class by legacy's
own ladder. On master `f2281525` (m48) the self-compile functions it blocked alone were `union`
102, `ref str` 78, `is condition` 76, `arm not lone` 37, `ref list` 21; the corpus's `arm not
lone` 24, `atom join` 16, `ref str` 16, `union` 15.

The `is` rung was an exclusion, not a lowering legacy lacks: legacy's value link writes the
condition and reads a decided constant back off its bytes (`staticValueIfCond`). The IR builds an
`is` only as a tag compare (`boxTest` misses `tagAbsent` and the folded rungs), so it never builds
that constant; a constant `is` condition is still a named miss (`decided is condition`). A
returned `if` takes its condition as legacy's `emitGuardCond` does: a decided `false`
(`isDecidedFalse`) writes no then arm.

Measured on fixpoint seeds against master `f2281525` (functions with no blocker, blocker census):
self-compile 14,561 of 19,033 → 14,788 of 19,035, corpus 35,249 → 35,250 of 45,678; combined
76.97% → 77.32%. Remaining `expression if` rungs alone in the self-compile: `union` 110, `ref str`
91, `arm not lone` 38, `ref list` 28 — the ref joins are legacy's `emitIfExprRef` path.

Legacy lines deleted: 0. Moved to `@ir`: 0.
