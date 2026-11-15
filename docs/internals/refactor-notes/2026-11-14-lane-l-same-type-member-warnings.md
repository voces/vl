# Warnings for union members that are one type — 2026-11-14

Lane L, the owner's ruling that replaces nominal variants (L4) with two warnings.

## What moved

- **At union formation.** The three routes that form a union, the annotation tree
  (`tsToTyReal`), the annotation name (`nameUnionTy`) and the declaration
  (`fillUnionDeclMembers`), keep each member's spelling beside it (`annUnionNamedMember`).
  A member spelled apart that is the same record type as a kept one (D3870's dedup) is a pair,
  and `annSameTypeNoteAt` warns at the annotation or declaration, code `same-type-members`.
- **At a test.** The pairs are kept against the union formed, and against its one member where
  it collapsed to one (`sameTypePairs`, check_state.vl, reset with the type arena). `is` and each
  `match` pattern ask `sameTypeTestNote` with the operand's declared type and the tested
  spelling; a name in a pair warns that it also matches the other, code `test-cannot-tell`.
- **The sink.** `recordTestWarning` (check_side_rows.vl) is `recordDeadTest` with its code a
  parameter; the dead test now calls it.

## Evidence

- Fixture `tests/cases/unions/same-type-members-warn.vl`: a declaration and an inline union, an
  `is` and a `match` arm.
- Fifteen existing `tests/cases` fixtures of same-shape records now declare the warnings their
  unions draw (`// @warning`); no fixture's output or runs changed.
- `scripts/probe-map-classes.tsv` classes the new map (`type-column`).
- Net compiler lines +157 (165 added, 8 removed); emit_mono.vl unchanged at 908.
