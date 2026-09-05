# Profiling the compiler

`VL_PROFILE_GUEST=<out.json>` runs a compile under a sampling guest profiler (~1 ms epoch
interrupts, `compile_vl_guest_profiled` in `scripts/vl-host/src/main.rs`) and writes a
Firefox-profiler JSON. Frames read `wasm-function[N]` unless the SEED carries a name section,
so build the seed with `--names` first — and profile with that seed, never ship it.

```sh
vl build compiler/entry.vl -o /tmp/names.wasm --names --compiler build/vl-compiler.wasm
VL_PROFILE_GUEST=/tmp/p.json vl build compiler/entry.vl -o /tmp/o.wasm --compiler /tmp/names.wasm
python3 scripts/profile-rank.py /tmp/p.json 20      # rank by SELF time
```

Notes, each of which cost something to learn:

* **The profiled run bypasses the `.cwasm` sidecar** (epoch instrumentation is a different
  engine config), so it pays ~10 s re-JITing the compiler no matter how small the input.
  That fixed cost is why the merge-gate guard is
  `tests/vl_scaling_shape_test.ts`'s ratio and not a profiler run.
* **Rank by SELF time, not inclusive.** A whole-arena scan called from one place shows up as
  ~all self; a dispatcher shows up as ~all inclusive. `profile-rank.py` prints both.
* **`__str_eq__` high in the list is a symptom, not a site** — it is the name-keyed
  registries (`isUName`, `variantIndexOf`, `declaredSlotOf`, `__map_probe__`) doing linear
  lookups. `python3 scripts/profile-rank.py` has a sibling idiom: rank the immediate PARENT
  frame of every sample whose leaf is a given function, to find whose loop it is.
* **`VL_STD=<worktree>/std`** on every worktree probe — the host resolves `std:` from the
  BINARY's checkout, which is the main repo's.

## Measured 2026-09-02 (#2419)

Self-compile before the memo, 28,755 guest samples: `moduleHasUnionAs` 29.8% self time and
`moduleHasNumCast` 29.4% — each a whole-arena scan asked once per emitted function (4,399
functions, no union-`as` in the compiler, so every scan ran to the end) — and
`fieldClosureFeOfRecv` 12.8%, scanning to prove an answer `fnValUsed` already gave. After:
master's source compiles in 11 s by the memoised compiler versus 43 s by master's own fixpoint
at load 13 (116 s → 6 s on an idle box), byte-identical output.

## Measured 2026-09-03 (D1514) — the SECOND instance of the class, and the one no guard saw

#2419 was a module-wide predicate re-derived once per emitted FUNCTION. The `??`-merge
family is the same shape one rung deeper and three levels nested: `anonLeafCloSlotMark` asks
`anonLeafParamFnTarget` per callback-typed parameter, that asks `anonLeafParamFnTargetAt` per
`Param` of the name, and that scanned every `Call` asking `anonLeafCallMayTarget`, which asks
`anonLeafOneDeclNamed` — a whole-arena scan — per candidate. On the witness (four lines
importing `std:fs` and `std:array`) the emitter's self time was `anonLeafOneDeclNamed` 59.2%,
`__str_eq__` 17.3%, `anonLeafFnValueNames` 11.4%, `anonLeafFnValueTargetGo` 10.5%, with
`anonLeafParamFnNamesAt` at 97% INCLUSIVE. `vl check` 0.02 s against `vl build` 5.0 s.

**The pattern the fix takes is an INDEX, not a memo.** A prefix memo (`modUnionAsSeen`) is
right for a predicate whose answer only grows; it is wrong here, because "is this call wild"
and "is this name used as a value" are whole-arena facts that a suffix can change. So
`anonLeafIxBuild` REBUILDS, once per program, and every reader takes a list by key in the same
arena order the scan produced. Byte-identical seed; the corpus oracle fell 14.5 s to 2.3 s.
**Neither guard below fired**: the compiler's own source declares no callback-typed parameter,
so the self-compile never paid it, and the shape family had no axis for the entity. That axis
(`callback slots`) is the third guard's new row, and it is what a second instance of a class
owes.

## Measured 2026-09-05 — the third instance, and the one whose comment named the wrong table

`tests/vl_scaling_shape_test.ts`'s `generic pins` axis carried a bar of 9.0 and a comment
saying `collectA` "interns each pin through `tyTopIndexOf` … a linear scan of the type-name
registry". It does not: `tyTopIndexOf` is a per-character bracket walk over a *string* with no
table, and `grep -c tyTopIndexOf compiler/emit_collect.vl` is 0 — `perf-opportunities-2026-09.md`
§B4 established that a day earlier and the comment went on asserting it. The axis is the
#2419 shape one phase further out: `monoRebuild` re-runs FOUR whole-program passes once per
minted instance, and again after that instance's body walk.

The many arm at 200 / 400 / 800 pins, guest samples (`--names` seed, `profile-rank.py`):

| frame | 200 | 400 | 800 | one arm (400) | samples 200 → 800 |
| --- | ---: | ---: | ---: | ---: | ---: |
| **total samples** | 1,244 | 4,910 | 19,157 | 630 | ×15.4 for ×4 the pins |
| `monoRebuild` incl | 63.2% | 72.4% | 79.5% | **0.0%** | 786 → 15,234 (×19.4) |
| `collectA` incl | 58.7% | 66.5% | 71.8% | 1.8% | 730 → 13,763 (×18.9) |
| `collectTyParamNames` self | 16.2% | 18.0% | 20.0% | 0.5% | 201 → 3,828 (×19.0) |
| `collectA` self | 15.7% | 17.7% | 18.9% | — | 195 → 3,619 (×18.6) |
| `__str_eq__` self | 11.7% | 10.7% | 11.2% | 17.1% | 145 → 2,151 (×14.8) |
| `globalCellKind` self | 7.3% | 7.6% | 7.9% | — | 91 → 1,515 (×16.6) |
| `tyTopIndexOf` self | 3.6% | 4.6% | 4.8% | — | 45 → 918 (×20.4) |

Every share is roughly flat and every count is ×16–20 for ×4 the pins: the whole many-arm
compile is quadratic, not one frame inside it, which is what a per-entity whole-program pass
looks like. `collectA`'s own children at 800 are `collectTyParamNames` 27.8%, self 26.3%,
`forceNestedCloSigReps` 10.8%, `__str_eq__` 8.3%, `nulScalarListKindOfNode` 7.5% — annotation
text work, spread thin, with no registry under it.

**The fix is a stamp, not an index.** All four passes read the arena and nothing else, so
`monoRebuild` skips when `P.nodes.length + fnStmts.length + fnParent.length + monoArenaTick`
has not moved, `monoArenaTick` counting the ten in-place writes `emit_mono.vl` makes to a node
field or an `fnStmts`/`fnParent` slot. `collectTyParamNames` additionally resumes from
`genTyParamSeen` rather than rescanning. After: 7,850 samples at 800 pins (0.41×),
`monoRebuild` 58.9% inclusive, `collectTyParamNames` 0.03% self, axis bar 9.0 → 6.0. What is
left is `globalCellKind` at 16.0% self, reached from `exprIsClosure`: it has a memo, and the
same arena growth stamps it stale once per instance.

## Measured 2026-09-05, second pass — a memo whose INVALIDATION was the quadratic

Re-profiling the same many arm on the post-#2594 seed, `globalCellKind` is the top self frame
(18.5% at 400 pins, 18.3% at 800, 0.3% on the one arm) and 99.6% of its leaf samples have
`exprIsClosure` as their immediate parent. **The re-derivation is not what costs**:
`globalCellKindGo`, the ladder underneath, is the leaf of **0 samples of 5,885**, and
`globalCellKind`'s inclusive share (18.57%) is its self share (18.27%) plus a rounding error.
The whole cost is in the memo's own body — `while gckHave.length <= letIx { push; push }`,
re-growing a column indexed by ARENA INDEX from empty after every invalidation, and the
monomorphizer invalidates once per minted instance.

So the fix is neither a narrower key nor an index: the memo's inputs really are the arena, and
the conservative stamp is right. What was wrong was **dropping the columns to forget them**. A
generation counter forgets in O(1) — a slot is a hit only while `gckHave[letIx] == gckGen` —
and the columns are allocated once for the whole compile. After: `globalCellKind` 1,075 → 8
self samples at 800 pins (18.27% → 0.12%), the many arm 5.38 s → 3.74 s (0.70×, min of three
interleaved), and the axis ratio 0.81× master over nine interleaved pairs. **The bar does not
move**: 0.81× of a bar-6 axis is not a decisive fall, and the worst candidate reading in ten
rounds was 4.81 at box load 226.

What is left is `collectA` (`compiler/emit_collect.vl`) at **62.6% inclusive** under
`monoRebuild`'s 71.4%. #2594's stamp removes only the DUPLICATE rebuild — minting an instance
moves the arena for real, so the pass still runs once per instance, and it is a full reset and
re-mint of the ref-list / map-value / annotation row tables rather than a prefix a suffix scan
could extend.

## Measured 2026-09-05, third pass — the pass resumes on the arena prefix

`collectA` re-profiled on 964b5050b is 52.4% inclusive at 400 pins and **63.8% at 800**, with
no hotspot under it: self 35.8% of its own inclusive, `forceNestedCloSigReps` 13.1%,
`nulScalarListKindOfNode` 10.3%, `__str_eq__` 9.5%. The cost is the WALK, so the fix is to walk
less of it.

**It has three phases and only the middle one is a function of an arena prefix**: the union
member re-marks run first, the arena walk second, the field-table re-derivation last. The walk
extends — rows only append, dedup is by key, the flags are monotone, `annRlSlot` is node-keyed.
The field tail does NOT, because a row's index is its slot and box tags are positional, so a
resumed walk's new rows have to land ahead of it: the resume pops back to the length recorded
right after the walk and re-derives the tail. Table by table, and the registry-growth
invalidation rule: `docs/internals/perf-opportunities-2026-09.md` B7.

**The resume is armed by `monoRebuild` and by nothing else.** Only this module's arena writes
are enumerated; the rewrite and annotation-synthesis passes between the pass table's two
`collectA` rows edit nodes in place and write `arrLitCommitName`, which the walk reads. A
version without the arming moved two of 2,975 `tests/cases` modules — one built-to-refused,
one different bytes — which is what the fixture identity sweep is for.

After, at 800 pins: 3,528 guest samples → **1,839**, `collectA` 63.78% inclusive → **1.96%**,
`monoRebuild` 71.4% → **21.37%**, the many arm 3.57 s → **1.18 s (0.33×)**, and the axis bar
6.0 → **2.5** on eleven rounds reading 0.95 – 1.34 across box load 4 to 101. What is left is
`buildFnMap` at **18.71%** of the compile — the same per-instance whole-program pass one row
over, whose `retAnnKindChain` / `retVoidAnnFlag` / `refArrElemNameIf` children are 38.3% /
16.5% / 12.5% of it, and whose per-function return-kind table has no prefix shape to resume on.

## Guards

Three, and they fire at different moments. Profiling is what you do AFTER one of them does.

* **`tests/vl_scaling_shape_test.ts`** — eight pairs, the same work reshaped along one axis
  (functions, types, unions, call sites, closures, callback slots, modules, generic pins),
  graded on the TIME RATIO so machine speed and box load cancel. Fires when a pass starts
  multiplying over an axis, and NAMES the axis. ~20–30 s; two of its axes red on the
  pre-#2419 compiler and `callback slots` on the pre-D1514 one. Three axes are super-linear
  today and carry a bar above their measurement, each naming the function responsible — read
  those comments before widening a bar; `generic pins` left that list when `collectA` learned
  to resume, and its bar fell 6.0 to 2.5 with it. **An axis is only a guard for an entity it HAS**:
  D1514 was cubic in the callback-parameter count for a year of this file's life and every
  pair here was green, because none of them varied that count.
* **`arena-scan-outside-pass`** (compiler/lint.vl) with `scripts/scan-budget.py`'s ratchet —
  a loop bounded by a whole-program table inside a function that is neither a pass nor
  allow-listed. Fires at REVIEW time, before the cost exists: 107 stand today, and the
  per-file count may only fall. A scan resuming from a memo is exempt, since that is the fix.
  It is a REVIEW aid and not a proof: every one of D1514's twenty-five scans was reported here
  and carried in the baseline, so the count falling is what a fix looks like, not what a
  regression is caught by.
* **`scripts/self-compile-time.sh`** — the candidate compiling the compiler, in CPU seconds
  against `scripts/self-compile-baseline.json` (6.3 s idle), tripping past 4×. Fires when the
  other two missed it. HALF the factor pays for contention — the same build reads 12.2–12.7 s
  inside a fanned-out `gate.sh` at load 164 — which is why the band is not 2×. It says only
  that the bootstrap got dearer; the shape family says where.
