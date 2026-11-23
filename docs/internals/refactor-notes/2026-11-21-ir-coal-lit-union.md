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
- **A boolean-niche valued `if`.** `(if c { null } else { x }) ?? d` at a boolean pin builds its
  operand as a valued `if` whose out is the boolean's `2` niche. The lowering now opens that `if` at
  i32, as `emitIfExprAs` does, where it was the miss `valued if rep`.

## Coverage

Measured on fixpoint seeds of this branch and of master `db422387`, each building this branch's
source.

| population | master | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker | 19,388 | 19,398 |
| self-compile claimed (mode 3) | 19,363 | 19,373 |
| corpus with no blocker (45,678) | 43,944 | 43,960 |
| `tests/cases` covered / matched (armed shadow) | 61,061 / 61,054 | 61,104 / 61,097 |

On `tests/cases` the `coalesce niche litUnion` and `nulBool` misses (55 rows, 10 at `@start`) are
gone; `coalesce niche place` is 15. The armed shadow adds no fail, differ or mismatch row. On the
self-compile `coalesce niche litUnion` (15 alone) is gone; `coalesce niche place` 2 and `coalesce
niche after an operand` 2 are left alone.

- **Byte proof:** mode 3 self-compile identical; `ir-identity.sh --names` identical 9,037, fail
  under both 3,267, differ 0, self-compile identical; `--cases` identical 7,579, fail under both
  68, differ 0, witnesses same 60; `--claimless` identical 14,014, fail under both 3,267, differ 0;
  `tests/cases` A/B same 8,693, differ 0.
- **Fuel:** L2 self-compile 105,397,259,196 against master's fixpoint 105,366,050,536 (+0.03%).
