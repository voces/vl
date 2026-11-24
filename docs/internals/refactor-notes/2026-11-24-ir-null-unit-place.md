# IR coverage: `pre-path null unit read` and `member record`, a null-unit place read (2026-11-24, lane IR-N8)

`pre-path null unit read` on master 73c87bff: 21 functions (10 non-start, 11 start bodies) over 18
tests/cases programs, none in the distilled corpus; this PR's neighbour case adds 3. A probe that tagged each builder site raising a
pre-path miss put all of them at `exprAtPre`, the own-rep expression path. Each is a member, index
or method-call read whose storage is the `null` unit (`readMayBeNulUnit && exprIsNulNone`), which
legacy's `emitExpr` routes to `emitNulNoneRead`: the read emitted in full, dropped, then
`emitNullAt`.

- **`nulUnitPlaceRead` (ir_build.vl)**, asked by `exprAtPre` on that pre-path: the read built past
  the pre-path, an `SDrop`, then the `{nuAt, nuOwn}` null at the read's own rep, `nullOwnAt`'s null
  under `nullOwnRepFits`, the fold an identifier's null-unit read already takes. An element read
  stays the named miss `null unit element read span`: built this way, its read's span is not the
  one `emitIndex` records (`types/null-unit-heap-positions`, `at0`).
- **`memberReadPlain` (emit_plan_union.vl)** loses its null-unit clause. That clause is the pre-path
  condition itself: inside `emitNulNoneRead`, legacy reads the field through `emitMemberNode` →
  `emitMem` → `emitMemStructRead`, a plain read. A probe naming `structFieldPlain`'s first failing
  clause put all 19 `member record` reads the fold exposed at it. Its callers are
  `structFieldPlain`, `variantFieldPlain` and `narrowedFieldPlain`, which only the IR asks
  (`buildMember`, `ir_lower`); legacy's routing is `emitExpr`'s own test.

## Measured

Base master 73c87bff, head its merge with this branch; both seeds fixpoints.

- The dropped clause decides nothing outside the fold: a throwaway probe counting each refusal it
  would have made at a read the fold did not build read 0 over tests/cases and the corpus (21174
  programs) and self-compile, on master 49a2a3c2. A control with the fold's exclusion removed read
  98 over the class.
- The class list (19 programs plus the new neighbour case): functions matched 90 → 97, start bodies
  matched 6 → 16. Every `pre-path null unit read` row leaves. What remains: `null unit element read
  span` 2, `box of a null-typed value` 2, `call of a non-declaration` 2, `print nulNone` 1.
- Armed shadow: tests/cases 79489 → 79496 matched, corpus 45555 → 45555, self 20470; 0 mismatch.
- Covered-fell per program: tests/cases fell 0, rose 13; corpus fell 0, rose 0.
- L2 self-compile fuel per PR −0.01%.

Neighbours: `tests/cases/soundness/null-unit-field-read-off-call-binding-and-annotated-local-runs.vl`
reads the field off a generic call's result, off a local bound to one and off an annotated local;
each prints the receiver's side effect and the `??` default. All three miss on the base and match
on the head. Row: `tests/ir-shadow-rows/null-unit-field-read-folds-to-null.vl`.

## Legacy tails the IR calls

None new: `nullOwnAt`, `nullOwnRepFits` and `exprRepOf`, which the identifier's null-unit fold
already calls.
