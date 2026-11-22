# IR: a bundle parameter as its record (2026-11-21, lane IR-D1)

Coordinator assignment: the open-type residue in tests/cases. At master 7781e9bd,
`open parameter type` led with 197 functions, 196 of them in `closures/`. These are bundle
holders: an un-annotated parameter called at two signatures, then returned or handed on whole
(`function lap(f) { f(2.5); f(3); return f }`).

## The witness

The parameter's checker type is the hole `(_) => _`, at the uniform closure, so it held open.
Legacy passes it as the bundle's record (`(ref $3)`, one closure per signature) and returns that
record.

## The change

- `paramHeldTy`: a bundle parameter's open type is `bundleRecordTyOf` over its signatures.
- `resultTy`: a function with an open result that hands back a bundle parameter whole
  (`elabRetParamOf`) returns that record.
- `identRead`: a bundle parameter the IR holds as its record is read whole as that variable.
  Before, it missed as `bundle parameter read`. Member picks stay `bundleCallRhs`'s.
- A named closure call statement drops its value as legacy's statement ladder decides. The
  ladder is split out of `emitCallStmtIdent` byte-identically as `callStmtIdentDrops`, which the
  IR's `closureCallDrops` asks. The case this matters for: legacy resolves `f(2.5)` by name to a
  void module function `f` and writes no `drop`.

## Measured vs master 6716810b (fixpoint seeds on both sides)

| population | functions | start bodies |
| --- | --- | --- |
| self-compile | 19,435 → 19,438 | 138 → 138 |
| distilled | 44,442 → 44,445 | 8,052 → 8,052 |
| tests/cases | 61,457 → 61,643 | 4,599 → 4,599 |
| capability probes | 512 → 513 | 156 → 156 |
| filed witnesses | 17,599 → 17,648 | 3,414 → 3,414 |

First misses in tests/cases:
- `open parameter type`: 197 → 0.
- `bundle argument`: 121 → 124, and `open local type`: 76 → 82. These are the next misses the
  holders reach.
