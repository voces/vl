# The argument pin's arms, measured

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.4 on 2026-11-07; its `§` references are to that file.

#### The argument pin's arms, measured (2026-11-07)

Instance dedupe no longer reads the pin string (previous subsection), so each arm of
`monoArgClosedPin` (P), `monoArgTyNameCascade` (C) and `monoArgTyNameBound` (B) was graded by
turning it off alone. Each candidate was built to its own two-level seed from the master fixpoint
`a87d79b88` and graded by run output (exit code, stdout, message) over every program the arm
reaches. The population is 19,338 programs plus 4,490 single-file inventory witnesses: 23,828.
Where output held, bytes were compared too. The split with split-dep: these three functions are
this lane's, and the one-producer redesign, `monoArgTyNameProjected` and `monoArgTyNameRep` are
split-dep's.

**Deleted: output-, byte- and pin-identical.** In each, the fallback answers the same pin. The
pin text was compared too, by logging every `monoArgTyName` answer on master and on the branch
over the programs these arms reach (209 decisions, 64 programs): bytes alone cannot see it, since
an instance's function name is not its pin. B2 rests on one program, named, so a regression in
that spelling points at the arm.

| arm | what it read | programs reaching it | case |
|---|---|---|---|
| P2 | `monoLitBuiltTy` → nominal (D15181) | 13 | fallback answers identically |
| P3 | `elabArgBuiltRep` → nominal | 32 | fallback answers identically |
| P4 | `recCopyTyOf` → nominal (D15183) | 8 | fallback answers identically |
| B2 | the callee's concrete return annotation | 1 (`generics/nested-generic-call`) | fallback answers identically |

**Kept: output and bytes hold, the pin text moves.** These wait on the naming rule.

| arm | what it reads | programs | off |
|---|---|---|---|
| P10 | function-holding closed type → `monoFnTyPin`, the wasm signature | 65 | the pin spells the full type; `vl_call_bind_shadow_test`'s FNV witness, the "agree at the wasm signature" class, reads `agree` |
| B1 | `monoBuildTyPin` | 1 (`soundness/covariant-record-field-read-only-runs`) | `{x:i32\|string}` becomes `W$m…` |
| B4 | an annotated local's annotation | 1 (`structs/inline-shape-local-beside-declared-twin`) | `{r:i32}` becomes `Circle` |

**Kept: identical, but one half of a twin.** B8 (a local's initializer, when not `i32`, 3
programs) and B17 (a global's `""` floor, 5 programs, all rejects) are each output- and
byte-identical off. The local and module-global rungs of `monoArgTyNameBound` are written as twins
so that a rung cannot exist in one scope only. B8's twin is B16 and B17's is B9; B16 is
load-bearing and B9 never answers, so deleting B8 or B17 alone would break the pairing.

**Kept: load-bearing.** Turning the arm off moves output.

| arm | what it reads | programs | off |
|---|---|---|---|
| P6 | a record type, not narrowed → its nominal pin | 672 | 2 runs → not-runs (D3458's witness, `named-hole-function-to-generic-callback-parameter`) |
| C9 | a named function value → `=>` + its `fnSigKey` | 17 | 2 runs → not-runs, 8 message changes |
| B12 | a parameter's annotation | 36 | 4 runs → not-runs, one a **compiler trap** (exit 70, `record-with-generic-fn-field-into-narrower-declared-param`) |
| B13 | a module global's annotation | 74 | 8 runs → not-runs, 2 message changes |
| B16 | an un-annotated global's initializer, when not `i32` | 34 | 1 message change (D15190's witness) |

The redesign must preserve P6, B12 and B13. B12 off traps the compiler, so do not try it blind.

**Kept: output holds, the code moves.**

| arm | what it reads | programs | off |
|---|---|---|---|
| P8 | a narrowed record read → the record its place holds | 12 | 1 program: a parameter becomes `ref` instead of `ref null` |
| P11 | a numeric literal union → its base scalar | 33 | 1 program: an instance splits, one more function |
| B6 | an un-annotated local's held type (D14440) | 20 | 1 program: its struct types change |

**Never answers: 20 returns, handed to split-dep's one-producer redesign.** None of them
answers in any of the 23,828 programs, and none is reached by its own filed witness. Turning all
20 off together moves no output, and a 400-program sample is byte-identical wherever it builds.

**18 are deleted.** Each of them returns only a non-empty pin. Where it never answers, the
code below it already produced every result, so deleting it changes nothing on this population.
The fixpoint byte+output sweep is the check, and it also covers side effects.

**2 stay:**
- C13 recurses into `monoArgTyName`, so it can return the `""` refusal. The probe logged only
  non-empty C answers, so a zero count does not show it is unreached.
- B9 is a `""` floor, B8's twin, and moves with it.

C12, the closure arm's `""` floor, is not in the table and is unchanged.

| return | what it reads | row | fate |
|---|---|---|---|
| C1 | `holeLitPinOf`, a literal retyped at a hole parameter | D5840 | deleted |
| C2 | `holeOperandI32PinTyOf`, a shared node at a boolean or literal-union hole | D2919, D2942 | deleted, with its helper |
| C3 | `argNichePinTyOf`, an `i32` niche or nullable literal union | D2998, D2985 | deleted, with its helper |
| C4 | `holeNulStringPinTyOf`, a `string \| null` hole | D3016 | deleted, with its helper |
| C5 | `loopVarArgPinTyOf`, a for-in loop variable | D3015 | deleted, with its helper |
| C6 | `litAtomPinElemTyOf`, a list literal of atoms | — | deleted, with its helper |
| C7 | a generic-application parameter annotation | D941 | deleted |
| C8 | a fallible numeric `as?` | D1041 | deleted |
| C10 | a function value's own signature key | — | deleted |
| C11 | a forwarder's own closure pin | D1795 | deleted |
| C13 | an if-arm's prelude local | D2821 | kept: can answer `""` |
| B3 | the callee's inferred return | — | deleted |
| B5 | `monoDestListPinName` of a local | — | deleted with B14, and the helper |
| B7 | an empty-literal local | D764 | deleted with B15 |
| B9 | a local initializer's `""` floor | — | kept: moves with B8 |
| B10 | `monoCapturedDestListPin` | — | deleted, with its helper |
| B11 | `monoCapturedParamPin` | — | deleted, with its helper |
| B14 | `monoDestListPinName` of a global | — | deleted with B5 |
| B15 | an empty-literal global | D764 | deleted with B7 |
| B18 | `monoModuleDupPin` | — | deleted, with its helper |
