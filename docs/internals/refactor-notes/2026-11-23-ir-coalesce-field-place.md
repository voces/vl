# IR coverage: a union-field `??` off a call, and a string `??` over an if-expression (2026-11-23, lane IR-N2)

## Design

- **Field place.** #9648 made legacy's `emitCoalesceUnionField` keep a receiver that is no
  re-readable place in a lazy slot (`coalFieldRecvStash`). The lowering's `coalUnionField` now
  does the same:
  - it takes that slot where legacy does, before the receiver;
  - it tees the receiver there after the cast (`coalArmRecvCast`);
  - the present arm reads the slot back.
  The builder admits a temp receiver when legacy stashes it (`!unionEqOperandOk`).
- **Valued `if` operand.** A `string | null` `??` whose operand is an if-expression, with a
  string-literal default, is built as #9650's `nulStr` block: the operand inside the block, where
  legacy writes it. The in-place `RCoalStr` path stays for an operand that builds nothing.

## Legacy tails the IR calls

- `coalFieldRecvStash` (wasmEmit): the union-field `??` receiver's stash slot, or -1 for a
  re-readable place.

## Measured

Against master `88df143ea` at its fixpoint seed:
- Census: `coalesce of a valued if` 10 + 4 `start:` → 0; `start: coalesce field place` 24 → 14.
- tests/cases: covered = verified 71,931 → 71,944, matched 71,930 → 71,943. Programs fully
  IR-only 5,431 → 5,439.
- Legacy A/B, `--names`, `--cases` and `--claimless` differ 0. L2 fuel per PR is +0.01%.

Open: 14 `start:` `coalesce field place` functions read the field off a top-level list element
(`xs[0].r ?? d`). That needs an element re-read over a global's temp, plus legacy's bounds
check on the re-read.
