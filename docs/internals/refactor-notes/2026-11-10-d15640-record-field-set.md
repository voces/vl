# D15640: a named function in a record field keeps its set, 2026-11-10

This builds the DECISIONS.md ruling "A named function in a record field is a set id, as in a list"
for the shape D15640 names. Base is master `5502fc80`. Matrix template:
`scripts/capability-probes/matrix/record-field-named-function.matrix.vl`.

## What changed

- **check_calls.vl.** D13969's `judgeHoleFieldCalls` used to build every record argument holding a
  named generic at the closure instance, at check time. It now queues the build, and
  `holeFieldBuildsFlush` (run from `pinSolve`) decides it. A record keeps the named function's set
  only when all of these hold:
  - some call hands the same callee field `{ f: g }`, where `g` is an un-annotated parameter that
    its own function also calls;
  - every call of that function hands `g` the one function the record names (`hfbHandsNamed`);
  - no call hands the field a closure.

  Otherwise it is built as before.
- **check_fn_tag.vl.** `ftNamedFieldHolds` holds a record field that names a function as that set's
  id in the late tag decision. Each such literal is stamped again at the id record once the set is
  tagged (`fnTagRepTyOf`, check_elab_cap.vl).
- **emit_elab.vl.** `elabMintFactsPass` can take a field-read row fact (`elabMintParamRowFactAt`)
  before a later instance forwards a hole into that parameter. When that happens, `elabMintFacts`
  runs the pass again with the forward known. Without this, the binding-first order of D15640
  (`const r = { f: dbl }; call0(r, 4)` before `both(dbl)`) got a row fact for one `call0` instance
  and none for the other. The partial rule then untagged `{dbl}` in round 2, and emit failed with
  "internal: the tag decision after the elaboration did not settle".

## Why the gate is narrow

The previous lane's WIP kept the set whenever some call handed the field a hole parameter. A
combination grid exposed losses that its 175-program script did not. The grid has 1,620 programs:
three callee shapes × three `both` shapes × three record values × five binding positions × two
argument types × three `both` arguments × two orders. Each run below is compared with master
`62b80f09`. Against `5502fc80` the shipped row is unchanged:

| candidate | runs → not-runs | → invalid wasm | not-runs → runs |
| --- | --- | --- | --- |
| WIP as handed over | 187 | 20 | 112 |
| WIP plus the order fix | 177 | 24 | 144 |
| plus "every call hands the hole the record's function" | 18 | 12 | 144 |
| plus "the hole's function calls it" (shipped) | 0 | 0 | 144 |

The residue is now refused with the old honest message. That covers a hole handed two different
functions (filed as D15650) and the matrix's annotated face.

## Proof

- **Seed:** 6,611,488 bytes, +0.3% on the baseline. Two refreshes are byte-identical.
- **Matrix:** 22 of 48 run (master 3); 0 runs → not-runs; 0 silent.
- **`check-filed-witnesses --strict`:** D15640 moved emit_reject → runs. D15639, D15643, D15644,
  D15645, D15646, D15647 and D15650 are unchanged as filed.
- **Distilled `regress.vl`:** no cell changed class.
- **Also green:** rep-fuzz (exact), lint-self, seed-size, late-demands (6), the dead-export,
  render-parse and pin-helper budgets, the inventory tests, probe-rollback, scaling-shape and
  cases_wasm.
