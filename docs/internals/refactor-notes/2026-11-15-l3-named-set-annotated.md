# L3: the named set takes the annotated face; PR B is dropped

**Change (corpus and docs only).** The `l3-record-param-width` named set gains the 8 annotated-face
cells of `record-param-width-before.matrix.vl` beside its 8 un-annotated ones: `direct`,
`two_rows`, `generic_beside`, `nested_call`, `recursive`, `loop`, `loop_two_rows`, `nine_rows`.
These are the 16 cells that stop running with the record-width rewrite off. Each runs on master,
with its output as the cell's expectation.

**PR B is dropped.** It was to fold D14532's per-argument producers (`recAnnArgTakesRep`,
`recHeldArgTakesRep`, `recArgRepNote`) into the row slot.
- D14532 instances a declared record parameter per argument *rep* with the *type* unchanged. In
  its witness `xs[0]` is typed `{f: i32}` but stored at `J`, whose `f` is a nullable box.
- The row slot is type-keyed. It would bind `R := {f: i32} = P` and lose the rep, and binding
  `R := J` fails the hold to `P`.
- So the fold would trade rep-keyed instancing for type-keyed instancing, a soundness regression.

D14532 stays a rep-keyed producer until mono's per-instance rep flow or L1's instantiation into
IR can key one instance by both its type binding and its rep. Under option C the 16 acceptance
cells B was to carry are this named set, together with the three matrices.
