# Type hash-cons stage 4i, measured and not taken: the emitter's comparers stay structural (lane H), 2026-11-16

4h (#8483) graded the emitter's `tySame` and `tyEq` against canonical ids. No id merged two types
that the comparer kept apart, and all 127 splits were at recursive types. 4i (#8491, closed by
coordinator ruling) built the switch, and this note records what it measured.

## The switch

`tySameSealed` and `tyEqSealed` answered from the ids:
- equal ids: "equal";
- different ids where neither walk met a back reference or a nominal cut: "unequal";
- otherwise, or inside a mono fresh scope: the structural comparer decides.

A per-row bit beside the id memo recorded whether the walk met a cycle.

**Correctness.** With the 4h shadow still armed, over the 15,472 programs that reach emit (of the
19,940-file population: `tests/cases` outside `modules/`, `distilled/cells`, `distilled/named`,
`compiler/entry.vl`):

| comparer | sealed agrees with the comparer | sealed true, comparer false | sealed false, comparer true | comparer asked |
|---|---:|---:|---:|---:|
| `tySame` | 5,886,132 | 0 | 0 | 129,035 (2.2%) |
| `tyEq` | 1,001,622 | 0 | 0 | 2,852 (0.3%) |

**Cost.** All three seeds build one fixed input, master e1f7f37c's `compiler/entry.vl`.
`self-compile-time.sh` builds each checkout's own source, so it mixes the seed's cost with the
source's growth. Here the source grew by the 4h walk.

| seed | guest fuel | vs master |
|---|---:|---:|
| master e1f7f37c | 89,768,690,552 | — |
| 4h (wrappers, shadow off) | 89,842,217,320 | +0.08% |
| 4i (the switch) | 89,953,153,556 | +0.21% |

The tripwire's own reading put 4i at +0.4% over the committed baseline and master at −1.6%, a gap
of 2.0%. Of that, 0.2% is the seed and the rest is the larger source.

**Why it costs.** On the L2 input, the id memo behaves as designed. A scratch seed, never
committed, counted:

| reading | count |
|---|---:|
| sealed calls | 5,977,594 |
| memo hits | 16,634,565 |
| fresh id walks | 35,631 |
| memo resets (an emit-epoch move) | 1 |
| resets from a type-variable rename | 0 |
| calls inside a fresh scope or an open walk | 0 |

The emitter's calls mostly exit early on a kind mismatch, and two memo lookups cost slightly more
than that early exit. The design note's estimate of `tySame` at 0.8% and `tyEq` at 1.37% of L2 is
mostly checker-side calls. On master's guest profile, `tyEq` is 1.26% inclusive.

## The ruling

Do not switch. The ids replace the comparers when L2 retires the checker's `tySame` and `tyEq`
families. Then the switch deletes those families instead of adding a second path beside them. 4h's
wrappers stay as the seam for that change.

## The named set

`hash4h-recursive-splits` (`scripts/silent-sweep/distilled/named/`, 9 cells, all `runs` on master
350eab14e) holds the nine programs where 4h's ids split a pair the comparer calls equal:
- a named recursive record against its anonymous unrolling, `hash4h_named_unroll_*`: 2 cells;
- one recursive alias rolled and unrolled, `hash4h_rolled_*`: 7 cells.

A later change to how recursive types are canonicalised, such as a partition refinement over
cycles, regresses against them.
