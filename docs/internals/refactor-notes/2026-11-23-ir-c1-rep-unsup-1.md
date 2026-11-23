# `rep unsup`, batch 1: hole parameter reads, open operators, a call at its callee's result (IR-C1)

The coordinator assigned this class on 2026-11-23. Before building, I reported its split by the type
that has no rep:
- A1, hole parameter reads;
- A2, operators;
- A3, member reads off a hole receiver;
- A4, call results;
- B, type-parameter reads in lambdas;
- C, empty array literals;
- D, a call recorded at `<error>` (filed as D17073; it runs).

This batch builds A1, A2 and A4/D in `exprAtPre`, where a node's own type has no rep:

- **A1** `openLocalReadRep`: a read of this frame's parameter takes its variable's rep. buildParams
  holds that variable at legacy's declared kind (`paramFrameTy`, N5's `repDescTy`).
- **A2** `openBinRep`: an arithmetic operator takes `binNumWidth`'s width, as legacy writes the op.
- **A4/D** `openCallValue`: a direct call of a declaration that returns is built at its callee's
  signature result rep.

Two attempts measured and left out:
- A `let` read at its built variable's rep: `local` in `coalesce-join-tag-in-instance.vl` then
  declared its locals other than legacy, a byte mismatch.
- A general fallback to `repDescTy(repOfNode(ix))`: it moved 0 functions, since the remaining kinds
  are box, union, list and closure, which the translator does not name. N5 measured the same.

## Legacy tails the IR calls

None.

## Readings (base c12265041, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| `ir-identity.sh --cases` | identical 7707, fail under both 68, differ 0; witnesses same 61, differ 0 |
| `ir-identity.sh --claimless` | identical 14037, differ 0 |
| `ir-identity.sh <base> <head> --names` | identical 9037, differ 0, built under one only 0; self-compile identical |
| armed shadow, corpus / `--claims` | 45441 covered = verified = matched; no fallback |
| order check (`ir-shadow.vl --prepost`) | 0 order rows, base and head |
| R7, deep nesting (R7 suite), margin | 407 ok; 5 ok; fail 903 KB / pass 906 KB on both |
| `gate.sh --fast`, `lint-self.sh` | passed; clean |
| L2 self-compile fuel per PR | +0.06% on 120,007,354,035 |
| legacy A/B (tests/cases + probes) | 0 moved programs |
| tests/cases `rep unsup` (mode 4 blockers) | 45 → 33 functions |
| forced IR-only census, `rep unsup` over the class's 17 programs | 30 → 18 functions |
| tests/cases claimed functions | 78,811 → 78,819 (0 lost) |

## What `rep unsup` still holds

All of what remains needs a non-scalar rep:
- C, empty arrays `_[]` (3);
- A3, member reads off a hole receiver pinned to a union of records (7);
- B, type-parameter reads in lambdas in generic bodies (4);
- `let` reads typed `_` (3);
- calls through a callee that is not a declaration (2).

Shadow row: `tests/ir-shadow-rows/open-typed-param-read-and-call.vl` (8 functions covered = matched).
