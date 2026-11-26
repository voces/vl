# IR: a list literal's element retag is typed at the list's element type (2026-11-26, COV-CALL)

**Defect.** Master 44be9fd1c reds `ir shadow cases`: verifier rule 3, "vN's rep is not its
type's", rises 0 -> 1. The failing functions:

- maps/container-twin-retag-positions `decl`, `backL`, `@start`
- records/plain-record-at-variant-twin-and-bool-list-at-i32-positions `asElem`
- records/intersection-recursive-twin-row-retag-positions `elems`

**Mechanism.** `arrayLit`'s element retag (`retagsAsStands`, #10262) typed its temp with
`repTemp`, that is, at `repTyOf(er)`. #10322 holds a built record at its storage row's rep, and
`repTyOf` of that rep names the type that first minted it, whose rep is now another record. The
retag only surfaced once #10321 let the list itself retag and these functions were claimed.
Each PR passed alone.

**Fix.** The retag's type is the literal's element type (`nodeArrayElemTyIx`) where that type's
rep is `er`, else `repTyOf(er)`. Where neither names `er`, the builder misses
`array element retag type` rather than writing an untyped temp. The other `repTemp` sites are
unchanged; a probe flagged no other untyped retag in these programs.

**Proof.** All three programs verify, build with `VL_IR_REQUIRE_CLAIM=1` (rc 0), and print
their `@log` lists.
