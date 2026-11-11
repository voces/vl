# Step 7 L6: the last positional atom pairing follows the member, 2026-11-11

`unionAtomTysOf` pairs a union spelling's atoms with the type's canonical members by position,
and a pinned instance spells its members in source order (D15675, #7154).
`unionAtomTysAlignedOf` pairs each atom with the canonical member that spells it. #7154 and #7186
moved four callers onto it. This PR moves the last one, `registerInlineUnionAtoms`, and
`unionAtomTysOf` becomes its private fallback.

The base is master `e42ae722`.

## The reading

A probe compiler, built in the scratchpad and never refreshed into a seed, compared the two
pairings at `registerInlineUnionAtoms`. It read every `tests/cases` file and every distilled
`cells/` and `named/` cell (19,536):

| | reaches | programs |
| --- | --- | --- |
| the positional pairing gives an atom another member's type | 35 | 9 |

Every one is a pinned instance whose spelling orders the members differently from the canonical
sequence. Examples are `Z[]` paired with `P`'s type
(`generics/pin-union-param-ref-list-before-record.vl`), and a map paired with `string`'s type
(`generics/pin-exact-key-union-box-is.vl`, `generics/pin-param-union-with-map-member.vl`).

None of them changes output. The loop registers each paired type's sub-union and never reads the
atom with it, so a permutation of the pairing registers the same types. The aligned pairing makes
this hold by construction rather than by that loop's shape.

## Changed

- `registerInlineUnionAtoms` calls `unionAtomTysAlignedOf`.
- `unionAtomTysOf` is no longer exported. Its only caller is the aligned pairing's fallback, for
  an atom that spells no canonical member.

## Proof

- **Bytes.** The 9 programs, and every `tests/cases` file and distilled `cells/` cell (9,202),
  were built with a master L1 seed and with this candidate's L1 seed. All are the same: exit code,
  module bytes, and the diagnostic with digits erased.
- **Locally:** one refresh, lint-self, rep-fuzz, distilled `regress.vl`, seed-size,
  late-demands, the dead-export and render-parse budgets, and `cases_wasm` on the refreshed seed.
