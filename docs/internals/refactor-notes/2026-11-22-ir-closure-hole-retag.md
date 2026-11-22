# IR: a closure read across closure openness is the same closure struct, retagged, 2026-11-22

Lane IR-N6, H1 of the hole-closure family. The coordinator routed the family's cells here, and an
ablation by rep pair split them. H1 is the cells whose cell and read reps differ only in a
closure's openness: one side's parameter or result is `unsup` (a hole), the other's is closed,
directly or inside a list or map. On the instrumented scratch seed, H1 was about 53 tests/cases
functions. H2, an `i32` tagged-set id read at a closure rep, is IR-N7's.

Witness, ablated: `const c = (y) => y + "C"; const fs = [c]` misses at `narrowed read`, whether
or not `c` is called. An annotated lambda passes, an alias passes, a module-level binding passes,
and a typed-list destination stops at another blocker, `array element coercion`.

## The change

- `cloHoleRetag(src, dst)` in ir.vl is `repFillsHole` in either direction, plus a map's values at
  the top level only. `repFillsHole`, the helper behind `listRetagHole`, is unchanged.
- The verifier's `RRetag` arm admits it. Every closure lowers to the one closure struct, so the
  retag writes no byte.
- The builder retags at two places, when `exprPrePathWhy` is empty:
  - a global read, which reads the cell at its storage row (`letBindTy`, which the verifier's
    `globalReadAtTyOrStorage` admits);
  - a local narrowed read, before its final miss.
- Verifier case 25 in `ir_selftest.vl` refuses a retag between closures whose closed parts
  differ, one parameter against two. The queue assigns the real number at train entry.

Every pair of closures lowers alike, so the verifier cannot see a signature mismatch inside a
retag. That guarantee rests on the builder's admission, which only ever changes openness, plus
byte identity. IR-M1's `repsLowerAlike` absorbs the verifier line on its merge, and the builder
call stays. IR-N3's argument-list retag calls the same helper.

## Run proof

`tests/cases/closures/hole-closure-retag-called-through.vl` calls through a module cell read into
a list, and through a narrowed local in a list, indexed and called. It also builds a list of maps
of an uncalled hole function. Every function in it is claimed. It prints the same under the base,
the claimed and the claimless compiler. A map of a hole function retags only while nothing calls
through it, because a call pins the hole and the read is then no longer a retag.

## Readings (base master 2934a5208, fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| tests/cases functions with no blocker | 69,252 | 69,274 |
| tests/cases `global read coercion` (any / alone) | 68 / 61 | 52 / 51 |
| tests/cases `narrowed read` (any / alone) | 81 / 59 | 55 / 44 |
| corpus / self-compile functions with no blocker | 45,243 / 19,905 | 45,243 / 19,905 |
| `ir-only-census`: tests/cases programs fully IR-only | 4,374 of 7,058 | 4,384 of 7,058 |
| deep-nesting margin, lowest passing stack | 930 KB | 930 KB |

Legacy lines deleted: 0. Moved to `@ir`: 0.
