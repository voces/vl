# IR coverage: `pre-path atom hook`'s one-literal place (2026-11-22, lane IR-N8)

`pre-path atom hook` is the builder's miss where legacy's `emitExpr` writes a node through its
string-to-atom hook (`atomHookArmOf`). On master 14d707ae, a throwaway seed that names the arm,
the node kind, the member count and whether the node is a place put the class's `tests/cases`
functions into these families, each confirmed by a minimal witness and one ablation:

| family | functions | witness, and the ablation that covers it |
|---|---:|---|
| `strToAtom`, one-member place | 22 (+4 start) | `function f(b: "y") { const m: "x" \| "y" \| "z" = b }`; a two-member atom param is covered |
| `strToAtom`, two-member place | 28 | a `1 \| "a" \| "b"` box narrowed past `1` into `"a" \| "b"`; without the number arm it is covered |
| `strToAtom`, one-member call value | 9 (+1 start) | staged once, then the id |
| `wideLit` | 5 (+4 start) | a `const` bound to a literal, read and dropped, then the id |

This PR takes the first. Legacy's tower for a one-member place writes only that member's id and
never reads the place.

## Design

- **Plan and tail (`wasmEmit.vl`).** `strToAtomArmOf` answers `sole` (a re-readable place of one
  member), `chain` or `staged`; `emitStrToAtom` dispatches `sole` to `strToAtomSoleTail`, the
  same `staticAtomId` byte the chain wrote. Only a place, which has no effect, may go unread.
- **`RAtomSole { asAt }`**, family `other` (shadow only, not claimed), no operands, lowered by
  `strToAtomSoleTail`; the verifier holds its destination at an atom (self-test case 24).
- **Builder.** At an atom destination, `deliver` asks the pre-path once for the hook's node and
  builds it by its arm: `litJoin` as before, `strToAtom` on `sole` as `RAtomSole`.

## Measured

Against master 14d707ae's fixpoint seed:
- `tests/cases` covered = verified = matched up by the family's functions (PR body has the
  figures); corpus unchanged;
- `ir-identity --cases`, `--claimless` and `--names` differ 0; the legacy A/B differs 0;
- L2 fuel per PR is source growth: the head seed compiles the base tree at the base's fuel.

The row `tests/ir-shadow-rows/atom-hook-sole-member.vl` has 5 functions, 3 of them `pre-path atom
hook` on master's seed, all covered and matched here.
