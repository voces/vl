# One type-test predicate for `is`, `as` and `match` — 2026-11-14

Lane L, PR-1 of the `is`/`match`/`as` membership-vs-value-fit family: D1118, D2677, D4085
close. D4087's partial fit (a runtime field test, D4089's capability) and D2719's value-niche
`as?` are PR-2 and PR-3.

## What moved

- **The predicate.** `tyTestMemberFit(m, chk)` (check_fit_rules.vl) answers covered, partly or
  none for one operand member. Covered: the member is `chk`, the type parameter it names, or a
  record it contains. Partly: `chk` fits the member, or the member is a type parameter. Four
  readers sit on it: `tyTestMayFit` (can the test be true), `tyTestNamesMembers` (does `chk` name
  members, a cast's arm rule), `tyTestMeet` (the members a record contains, when nothing else can
  fit) and `tyTestIsMember`.
- **Deleted.** `markUnionCover` (check_narrow_flow.vl), the match arm's own membership test;
  `recFitMeetTy` (check_fit_rules.vl), D4062's one-member containment, now `tyTestMeet` over any
  number; the `is` gate's assignability expression (check_operators.vl); the cast's
  `unionCoversTy` test at both its sites (check_operators.vl, the pinned re-ask in
  check_demands.vl). `unionCoversTy` itself stays: assignability (`check_relate_core.vl`) and
  `tyUnionCovers` still read it, and neither is a type test.
- **Recorded, then read.** The checker banks the meet as the test's `isVarTyIx`, for `is` and for
  each `match` pattern, and types a cast by it. The emitter answers a test true where every member
  of a union operand is a member of that recorded type (`isTestedEveryMember`, wasmEmit.vl); it
  derives no containment.

## Evidence

- The table in the PR: every cell this PR owns runs in all three spellings, with distinct values.
- Seed fixpoint. `deno task test` green, after one fix: `tyTestMeet` first kept a member
  `sameVariantTy` matched through an error-typed field, so `{foo: string} | {bar: any}` narrowed
  wrongly and a return type was lost (`lsp_undisplayable_type_test.ts`).
- Net compiler lines +111 (184 added, 73 removed); emit_mono.vl functions unchanged at 908.

## Residue

D16320: contained members sharing a tag with an uncontained one are refused at emit. D16321
(clause 1, on master too): a union of contained records returned as the containing record
builds an invalid module.
