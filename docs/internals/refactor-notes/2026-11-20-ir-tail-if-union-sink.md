# IR: a tail `if` under the union return sink (2026-11-20)

`tailIf` refused every link of a tail or returned value `if` in a function taking the union return
sink (`tail if union sink`, from `tailIfPlainWhy`). Legacy's `emitIfTail` writes that `if` as it
writes any other: each arm's value is an exit, and under the sink an exit pops the box it built
into the sink pair and branches to the block wrapped round the body (`emitUnionRetSink`). The IR
lowering already writes a return that way (`sinkExit`, `sinkClose`), so the rung only named a
function, not a shape. One shape under the sink is not plain: a join of one wider number with a
literal tail (`retIfIsOneNumber`), which legacy returns boxed once rather than per arm. That is the
rung now (`tail if one number`); the `tests/cases` A/B found it, in two generic instances.

Measured on fixpoint seeds at merge-base `de317fa31` (functions with no blocker): self-compile
19,018 → 19,024; corpus 41,774 → 41,780, all matched; claims 41,683 → 41,689.
`tail if union sink` 7 → 0 in the self-compile: 6 build, one stops at `tail arm`. None stops at
`tail if one number`. A record union whose arms are object literals stops at `string atom` (their
`kind` literal), a class of its own.

Legacy lines deleted: 0. Moved to `@ir`: 0.
