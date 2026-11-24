# IR-N3: the boxed tag dispatch, and `rep ?` on a desugared optional call (2026-11-24, lane IR-N3)

A call through a tagged function set (`exprPrePathWhy` = `pre-path tag dispatch`) whose value a
box with a leading head takes: legacy writes the box's tag, then the whole dispatch (callee read,
id stash, arms) on the stack under it, then the box. The IR built the dispatch as nodes ahead of
the box and missed (`boxed tag dispatch`). Its commonest door was a `?.` call through a record
field typed at a hole function (`m["b"]?.f(4)` into `f64 | null`), which first missed earlier at
`rep ?`.

## `rep ?` on a desugared optional call (`exprAt`, `optCallCalleeOfMember`)

`emit_rewrite` desugars `p?.f(a)` to a call whose callee is a minted member with no type
(`optCallCalleeOf`). The builder reads that callee as the plain `.f` call reads its field at its
storage (`sharedFieldCallee`), as `closureCallRhs` reads an untyped member callee.

## The head ahead of the dispatch (`irTagSpan`, `irBoxLeadFirst`, `dispatchBoxHead`)

`tagDispatchAt` notes the dispatch's run of nodes in its body (first, last, count). `boxTempIn`
takes a dispatch only under a plan whose head leads (`holeBoxLeads`) and only where that run is the
body's last (`tagSpanEnding`); otherwise it misses (`boxed tag dispatch`, `boxed tag dispatch past
its span`). It records the box against the run's first node, and the lowering writes the box's
head before that node (`dispatchBoxHead`), so `boxOp` writes no second head. The dispatch's value
stays on the stack as its arms leave it.

Verifier rule 10 (`boxLeadsWhy`) refuses a led box whose dispatch run does not directly precede it
in one body: a node between would land above the head. Failing control: the self-test case
`led-box-past-a-node` (a node inserted between, rule 10) beside `led-box-follows-its-dispatch`
(rule 0).

## Grading — the position matrices

MEASUREMENTS

## Legacy tails the IR calls

`holeBoxHead` (unchanged): the box's leading tag, written ahead of the dispatch.

## Measured (fixpoint seeds on both sides)

PROOF
