# D16093, D16097: a set's element or field handed to a generic function parameter dispatches

**Change.** One rule in the tag decision (`check_fn_tag.vl`), with no emitter change.

* **The defect.** A value of a set delivered to a closed function type (an escape) is built as a
  closure there, unless the set needs a dispatch. Before, a set needed one only when it had one
  member or a generic member.
* **Why that failed.** A set of un-annotated functions has no one closure signature, so its
  element or field was emitted as a closure of one member's guess:
  * a list element was refused at emit (`emitClosureValue`, D16093);
  * a field built an instance whose call returned that member's `i32` where `R` was the join
    (D16097, clause 1).
* **The rule.** An escape whose site is an element or field read now also dispatches when
  `ftWideEscOk` holds for its set (a member is generic or un-annotated) and the members' results
  differ at the destination's parameters (`holeSetSplitsAt`). Agreeing members keep the closure,
  byte for byte, as D3975's `tests/vl_fn_set_rep_test.ts` pins.
* **The scope.** It is limited to `Index` and `Member` reads. Applied to a bound `let`, it also
  tagged a binding the veto then re-typed, which added a second refusal to D9003's cell.
* **The monomorphizer.** The first diagnosis, that `monoHoleGenFnPin` pins one member, was wrong.
  With the set tagged, the existing tagged-set pin handles the call, and `monoHoleTwoPinsFail` is
  not reached for these spellings.

**Position matrix.** `scripts/capability-probes/matrix/set-value-to-generic-fn-param.matrix.vl`,
graded both faces with `capability-matrix.vl --before/--after`:

| cell | before | after |
| --- | --- | --- |
| `list_differ` | emit refuses | RUNS |
| `field_differ` | SILENT (invalid wasm) | RUNS |
| `list_agree`, `field_agree`, `choice_*`, `let_agree`, `returned_differ` | RUNS | RUNS |
| `let_differ` | check refuses | check refuses — D16098 |
| `returned_agree` | emit refuses | emit refuses — D16099 |

The table reads the same in both faces: 62 of 66 run, 0 runs → not-runs, 0 silent after.

**Fixture.** `closures/set-element-and-field-handed-to-generic-fn-param.vl` is new.
