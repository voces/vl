# Fix D17067: unary `-` and `~` take a `never` operand (IR-C1)

**Defect.** `unTyOfArg` (`check_operators.vl`) required a numeric operand for unary `-` and `~`,
and named `never` as what it got. The binary operators return `never` for an operator over a `never`
operand (D16006, D14420), so this was a refusal the design does not owe (clause 2). `!` already
took `never`.

**Change.** A `never` operand returns `never` before the numeric check. In the IR, `-` and `~`
over such an operand are built at legacy's i32, as step 7 builds a binary operator: the operand is
the never call's i32 temp, and the operator's temp is typed by its rep. `!` over one is the named
miss `not over a never operand`, because its bool rep is not the never call's i32.

## Legacy tails the IR calls

None.

## Sweep (capability matrix, base seed → fixed seed)

| template | before | after |
| --- | --- | --- |
| `never-operand-of-unary-neg.matrix.vl` (`-fail()` at f64) | 64 of 64 check refuses | 64 of 64 RUNS |
| `never-operand-of-unary-bnot.matrix.vl` (`~fail()` at i32) | 64 of 64 check refuses | 64 of 64 RUNS |
| `never-operand-of-unary-lnot.matrix.vl` (`!fail()` at boolean) | 64 of 64 RUNS | 64 of 64 RUNS |

The bodies over `i32`, `i64`, `f32`, `f64` and `boolean` other paths: `-` and `~` were refused at
each, and all now run.

## Moved programs (legacy A/B over tests/cases and the capability probes)

- `tests/cases/soundness/never-operand-of-unary-runs.vl`, the new witness: refused at check → builds.

## Readings (base 2bca1d806, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| `ir-identity.sh --cases` | identical 7705, fail under both 68, differ 0; witnesses same 61, differ 0 |
| `ir-identity.sh --claimless` | identical 14035, differ 0 |
| `ir-identity.sh <base> <head> --names` | identical 9037, differ 0, built under one only 0; self-compile identical |
| armed shadow, corpus / `--claims` | 45432 covered = verified = matched; no fallback |
| order check (`ir-shadow.vl --prepost`) | 0 order rows, base and head |
| R7, deep nesting, margin | 372 ok; 5 ok; fail 903 KB / pass 906 KB on both |
| `gate.sh --fast`, `lint-self.sh`, inventory rows and refs | passed; clean; 10 of 10 |
| L2 self-compile fuel per PR | +0.01% on 118,910,522,655 |
