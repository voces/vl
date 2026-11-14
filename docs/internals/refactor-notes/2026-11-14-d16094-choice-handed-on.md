# D16094: a choice of functions handed to an open parameter dispatches

**Change.** This is the `let` veto (D16009) applied to choices, as the coordinator approved. It
adds no language semantics, and an untagged choice still refuses with today's message.

* **The judges.** `holeChoiceJudge` and `holeSetJudge` (`check_relate_core.vl`) no longer refuse
  a choice reached by a hand to an open parameter. That is, one not judged at a call
  (`holeJudgingCall`) and not vetoed. Instead each records the choice and its type
  (`fnChoiceWideNote`). If the decision tags the set, the callee's instance dispatches.
* **The veto.** `fnTagEtaAgain` (`check_elab_cap.vl`) vetoes a recorded choice whose set stayed
  untagged (`fnChoiceVeto`). The second check then refuses it. A choice that only open
  parameters and calls read (`fnChoiceHandedOnly`: handed itself, or initialising a binding each
  read of which is one) is decided after the instances, as a `let` handed to an open parameter is
  (`fnLetOpenHandBds`). `fnOpenHandNote` (`check_calls.vl`) records those hands.
* **The extra pass.** It is the one `fnTagEtaAgain` already runs, at most once (`fnTagEtaRan`). A
  vetoed choice and a vetoed `let` share it. A program with neither pays nothing.

**Position matrix** (base → candidate):

| program | base | candidate |
| --- | --- | --- |
| `const g = if c { str } else { inc }; ap(g, 3)` | refused | `s` / `4` |
| `ap(if c { str } else { inc }, 3)` | refused | `s` / `4` |
| `sel` returns an `if`; two `return`s; handed on | refused | `s` / `4` |
| D13740's witness, `only("abc", if k { twice } else { lenOf })` | refused | `3` |
| callee calls it twice, or at two types; stores it in a list | refused | runs |
| choice called directly; members agree; generic annotated callee | runs | unchanged |
| `ap(g, 3) + 1` | refused | refused, naming `i32 \| string` |
| choice also delivered to `(a: i32) => i32 \| string` (a binding, a parameter, a return) | refused | refused by the veto; with the judge skipped and no veto, a wasm trap |
| a choice and a `let` both vetoed in one program | refused | both refused, in the one extra pass |
| `keep(g)` returning the choice, called after | refused | refused |
| `let` returned, then handed on (D16094's witness) | refused | refused, D16094 |

**Fixtures.** `error-hole-fn-choice-results-differ.vl` and
`error-hole-fn-return-join-handed-results-differ.vl` now run and are renamed.
`choice-of-hole-fns-handed-to-open-param.vl` and `error-choice-of-hole-fns-handed-and-escaped.vl`
are new.
