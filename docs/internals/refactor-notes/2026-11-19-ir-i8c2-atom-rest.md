# IR I8c part 2: the rest of the atom decode, 2026-11-19

After part 1 (`2026-11-19-ir-i8c-atomstr.md`, #9127), the census on master `0bf13a76d` still had
about 82 corpus functions blocked by an atom class alone:

| class | functions | grids |
| --- | ---: | --- |
| `print nulAtom` | 28 | d3140 8, d3281 8, d16530 6, d3290 4, d16363 2 |
| `string atom` | 28 | d3290 19, d16530 7, d426nul 2 |
| `coalesce niche nulAtomStr` | 14 | d3290 14 |
| `print atom` | 12 | d3290 4, d2595 3, dord 3, d16530 1 |

Most of the pairs were two of these together, from `d3290`.

## The change

- **A string literal at a `K | null`** is built at its member's atom rep. `deliver`'s existing
  `RRetag` carries it into the niche, which holds the id as is, so no byte is added.
  `emitStrLitAt` already writes the id.
- **`print` of an atom (`atom`) or its `K | null` (`nulAtom`).**
  - `printAtomTexts` is the one member choice. Legacy's print and the IR's `printAtomTail` both
    spend it.
  - `printAtomStashed` is the shared write after the id's stash: the decode, then the stream,
    behind the `-1` null word for `nulAtom`.
  - The builder misses a `K | null` that legacy first reads out of a wider box
    (`narrowedNulLitPinBoxKey`).
- **`k ?? "s"` over a `K | null`** at a `string` is `RCoalAtomStr { zaL, zaD, zaAt }`, for a
  plain string-literal default. Legacy's arm is split into `coalAtomStrReserve` (its scratch
  slot, taken before `k` as it was), `coalAtomStrOpen` and `coalAtomStrClose`. Legacy and the
  IR's lowering both call them. The reserve-first order matches legacy only for a `k` the IR
  lowers in place; a `k` that is a pending temp minting its own slot would order the two slots
  differently, which the armed shadow reports as a byte mismatch.

Compiler lines are +171 −55, 116 net. No legacy line is deleted; legacy's print-atom and
`??`-atom arms now delegate to the shared pieces.

## Readings

| reading | master `0bf13a76d` | this change |
| --- | ---: | ---: |
| corpus functions with no blocker (census) | 30,836 | 30,899 (+63) |
| corpus covered = verified = matched (shadow) | 30,836 | 30,899 (67.6%) |
| L2 self-compile fuel | 99,531,088,597 | 99,612,488,794 (+0.08%) |

The census rows left with an atom class: `member atom` (1) and `atom string source + store element seed` (2).
