# IR: a recovered read's non-null count is decided where it is built (2026-11-21)

`RRecover` is a nullable local read at its inner rep. Legacy writes the local, then one
`ref.as_non_null` where a `string | null` read recovers (`localNulStrRecovers`) and another where
the read owes its narrowed rep (`readOwesNonNullRecover`). The IR lowering asked both itself.

Both predicates read context that an outer site sets around one legacy emit. An assignment used as
a value re-reads its target inside `asgReReadEnter`, and the builder builds that re-read inside the
same context (`assignValue`), but the lowering runs after it has closed. This is the hazard §10
names: a predicate reading state set and restored around one legacy site answers correctly while
legacy runs, and stale under a claim. In `soundness/short-circuit-write-may-not-run.vl`,
`(s = "w").length` held its re-read at `string | null` (rule 3, a claim fallback). Holding it at
`string` matched the type and lost the `ref.as_non_null` legacy writes, which is why #9339 held it
at its non-null type only for an atom, whose recover writes none.

`RRecover` now carries `rcNn`, the number of `ref.as_non_null` legacy writes, decided by the
builder in the read's own context (`recoverNonNulls`, the same two predicates). The lowering
writes that many. The non-null type hold applies to every kind.

Measured on fixpoint seeds at merge-base `4c186c33`: self-compile unchanged (19,238 covered =
matched); corpus 43,118 flat and all matched; `tests/cases` armed shadow matched 57,339 → 57,340,
fail or mismatch rows 11 → 10 (the rule-3 row gone, none new); the claims gate's
`short-circuit-write-may-not-run.vl` fallback 1 → 0.

Legacy lines deleted: 0. Moved to `@ir`: 0.
