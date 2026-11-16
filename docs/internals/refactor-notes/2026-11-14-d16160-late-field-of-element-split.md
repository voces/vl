# D16160, layer 1: a call through a field of a handed-on element splits the set

**Change.** Two reads, one in the elaboration and one in the tag decision. Layer 2 (#8009, the
held list's row alias) is underneath.

* **`elabMintParamRowFactAt`** (`emit_elab.vl`) noted a fact for an instance's call through an
  element read of a parameter (`v[1](x)`), but not through a field of one (`v[1].f(x)`). It now
  accepts both. The instance types that callee with the field's set, which the check could not
  see.
* **`fnTagSetSplits`** (`check_elab_cap.vl`) answered from the check's calls only. The decision
  after the elaboration had the fact, but the list-of-records branch of `ftLitJoin` asks
  `fnTagSetSplits` before it records the record literals' fields as leaves. A fact whose members'
  results differ now counts as a split too. With the leaves found, `ftPlan` tags the set and the
  literal stores ids.

**Probed.** In the decision after the elaboration, set 2 reached `ftTry`, and `ftPlan` refused at
"each member needs a leaf" (`t < 0 && ftSubNeed.length == 0`). Each piece alone leaves the
witness refused.

**Fixture.** `closures/list-of-records-of-hole-fns-handed-to-open-param.vl` is new: two splitting
lists through one parameter, and an agreeing list through another.

**Residue.** D16144: a splitting list and an agreeing list handed to the same parameter.
