# L2 S3.4c, part 2: a discriminant test on a hole's field narrows its parent at the pin, 2026-11-16

The narrowing rule's first graded change (`2026-11-16-l2-s3-plan.md`, S3.4c), closing D12602.
- **The rule.** `pushDiscrimParentFact` filters a struct union's members by a literal test on one
  of their fields (`z.h.k == "a"`). On a hole there are no members, so it pushed nothing, and the
  arm's reads were re-asked at the pin against the whole union. It now pushes a derived hole on the
  parent, `HD_DISC`, which records:
  - the field;
  - the tested type;
  - whether the arm is the one the test fails.

  The pin answers it with the concrete test's own member filter, now shared as `discrimKeepTy`
  (`check_relate_core.vl`), in the checker's `substHoleTyReal` and in emit's `holePinReadAt`. A pin
  the filter cannot reduce (no union, a member without the field, zero or all kept) reads as itself,
  as the concrete test pushes no fact then.
- **Where else it applies.** The same push serves an `is` test on a hole's field (`z.h is A`). Its
  parent narrows at the pin too.

## What moved

Fingerprint against master's fixpoint seed, both from one worktree: 1 of 20,706 programs moves.
`tests/cases/generics/error-hole-field-write-in-negated-is-arm.vl` still refuses with
`no field 's' on A`, now at the read in the body, as the annotated spelling does, not at the call.
In the else arm of `!(z.h is A)`, the write `z.h = { v: 9 }` narrows `z.h` to the written record
once `z` is the derived hole. The case's position expectation is updated.

## Rows

`check-filed-witnesses --strict`:
- D12602 closes. New case `generics/discriminant-test-on-hole-field-narrows-at-pin.vl` covers `==`
  and `!=`, a declared and an inferred type parameter, both arms, and a declared-after function.
- D3216 (parked) and D16005 stay as filed.

## Gates

See the PR.
