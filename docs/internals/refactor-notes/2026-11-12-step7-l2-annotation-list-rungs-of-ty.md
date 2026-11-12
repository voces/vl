# Step 7 L2 §7: two annotation rungs read their type, not the list spelling, 2026-11-12

Lane w310, item (e), first part: `emit_base`'s scalar-list and paren-union spelling predicates.
Two of their callers outside `emit_base` hold the annotation's type, and they now ask it.

- `annArrayRungsSkip` (`emit_collect.vl`) asked `nameIsStringArray` of the annotation spelling.
  It now asks `annTyIsStrList`: a type that reps as a string list, or a list of one string
  literal.
- `letWidensAtomToStr` (`emit_fn_scans.vl`) asked `parenUnionArrElemName` of the spelling. It now
  asks whether the element type is a `TyUnion` that takes an atom as its string.

The base is master `ad86edf8`, with a fixpoint seed on both sides. The population is the whole
sweep, 23,962 programs.

## Probe

The probe ran in a scratch compiler that was never refreshed into a seed, using the predicates
note's accumulator, with a reach tag per site.

| site | reach | true | disagree |
| --- | --- | --- | --- |
| `annArrayRungsSkip` | 17,525 | 1,397 | 5 |
| `letWidensAtomToStr` | 1,456 | 9 | 880 |

The disagreements are spellings, not types:

- **`annArrayRungsSkip`.** A list of one string literal has the same type whether the annotation
  is spelled `string[]` (D7340, where it reps as atoms) or `"circle"[]`. The skip answered by the
  spelling. A first twin, the string-list rep alone, cost 4 programs `runs → not-runs` with
  "only i32[] arrays and struct/union element arrays are supported". `annTyIsStrList` also takes
  the one-literal list.
- **`letWidensAtomToStr`.** `tyTakesAtomAsStr` holds for `string[]` and `(string|null)[]`, so the
  paren-union test was the discriminator. `Json[]` is the one alias union that the paren
  spelling did not name.

Every test cell from the two probes' disagreements was built with the base seed and with the
candidate: 407 the same, and 0 that differ in bytes or exit code.

## Left

These predicates' other callers are on other lanes' queues:

- w311: `emit_shape_rows`' ref-list functions;
- w317: `emit_mono`;
- w314: `fieldCodeOfSpelling`'s untyped legs, the only caller of `scalarListRepOfName`;
- w324: the shape walk.

Each predicate is deleted when its last caller holds a type.

## Proof

- **Local full sweep.** `--prove-fixpoint` seeds on both sides: 23,962 same, 0 bytes-only
  movers, 0 output movers, 0 runs → not-runs, 0 new compiler traps.
- **Render-parse.** With `--findings`, parses stay at 57. These were callers, not counted parse
  sites. The baseline is rewritten to master's 19 renders.
- **Checks.** `rep-fuzz-check.sh` is exact. `cases_wasm` passes 7,461 with 0 failed. lint-self
  is clean. The export budget, with findings, has 0 dead exports.
