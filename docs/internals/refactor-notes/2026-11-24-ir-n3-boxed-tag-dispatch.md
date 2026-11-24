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

Two committed templates, graded on fixpoint seeds (base master fd2d6cd6e, built in its own tree at
that commit; candidate in the lane's tree), 70 graded cells each (two_instances skipped):

| template | `capability-matrix.vl --before/--after` | shadow mode 4, before → after | mode 1 after |
|---|---|---|---|
| `optional-call-through-hole-fn-field` | runs 72 of 74 both; 0 runs → not-runs | 68 cells `rep ?` (56 start, 12 functions) → none; 4 `optional read staged` unchanged | 168 covered, 168 matched |
| `optional-call-effect-order-under-box` | runs 68 of 70 both; 0 runs → not-runs | 68 cells `rep ?` → none | 302 covered, 302 matched |

The two `array_element` un-annotated cells of each are check-refused under both seeds (D17133). In
the effect-order template the key's and the argument's logs read `kn` once per evaluation, in that
order, in every position. Shadow mode 6 over every kept cell: no order row. The kept cells and the
origin programs below are claimless-identical under both seeds (149 identical, 4 fail under both,
differ 0).

Origins of `boxed tag dispatch`, each the same shape (a dispatch's value into a leading box), each
now covered and matched: tests/cases `closures/{generic-record-written-into-map-through-param-read-
through-optional, hole-fn-generic-in-map-called-at-two-types, hole-fn-in-unannotated-map-read-back,
hole-fn-record-in-map-after-same-shaped-literal, untagged-choice-handed-back-through-generic-to-
wider-result}` and corpus `named/d15199_run_{function_field,no_write}`.

Found on the way: D17180 (`get()?.f(4)` on an un-annotated function's result, a clause-1 emit reject
on both seeds); the effect template reads its receiver through a logging key instead.

## Legacy tails the IR calls

`holeBoxHead` (unchanged): the box's leading tag, written ahead of the dispatch.

## Measured (fixpoint seeds on both sides)

Base master fd2d6cd6e (`base44`) against the candidate (`fxbtd`), each a fixpoint after one refresh:
byte A/B 20,727 programs, 0 moved, 0 rc-differ; tests/cases A/B identical 7,678, differ 0; mode 3
corpus differ 0, mode 3 self byte-identical; `ir-identity --names` self-compile identical, `--cases`
differ 0, `--claimless` identical 14,472, differ 0; corpus shadow 46,893 matched, 0 order rows;
tests/cases mode 1 covered and matched +1 function, +4 start bodies (`uncovered boxed tag dispatch` 1 →
0, `start uncovered rep ?` 8 → 0, 3 to `shared member callee kid`, 1 to `method get`); self ir misses 0;
self-compile guest fuel on the base tree 126,891,355,906 → 126,912,717,492 (+0.02%), per-PR L2 +0.11%.
