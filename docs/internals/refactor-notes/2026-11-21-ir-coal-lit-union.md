# IR coverage: a `??` over an i32 niche cell (2026-11-21, lane IR-N1)

`coalNiche` built only the `string | null` plain block, the atom-to-string widening, a boxed
operand and the nullable references. Every other `coalNicheArmOf` arm was a named miss
(`coalesce niche <arm>`). `litUnion` was the largest: 15 self-compile functions had it as their
only blocker, and 16 in the corpus. `nulBool` writes the same shape at a different sentinel.

## What landed

- **One legacy writer.** `emitCoalesceNicheCell` is the `litUnion` and `nulBool` arms of
  `emitCoalesceNiche`. It writes the operand, `coalNicheOpen(sent, reEval)`, the default,
  `coalNicheElse(reEval)` and the end. Where `coalLhsStashes` says the operand is not re-read, open
  stashes it in the coalesce-call slot and else reads the stash; otherwise the present arm
  re-evaluates the operand. The bytes are unchanged.
- **The IR's two arms.** `CoalValArm` gains `litUnion` and `nulBool`. The builder's
  `coalNicheCell` builds the operand, then the default into the null block writing the out, as a
  `SCoalBox`. The lowering writes the same tails and, for a re-read, the operand again. The
  verifier checks the operand's niche (an atom niche, or `repBoolNiche`) and that the out is the
  niche or its present value.
- **Named misses.** A re-read operand that is not a variable (`coalesce niche place`, such as a
  field of a re-readable receiver), and an operand after a waiting temp (`coalesce niche after an
  operand`).

## Coverage

MEASURED
