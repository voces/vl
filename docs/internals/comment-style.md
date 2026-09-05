# Comment style — what a comment in `compiler/*.vl` is for

A comment is read by someone changing the code beside it, and is never re-graded, so
anything that can go stale belongs where a gate re-runs it. The mechanical half of rules
1, 2, 3 and 5 is `compiler/lint.vl`, ratcheted by `scripts/comment-budget.py`. (`std/`
has its own consumer-facing rubric: `std-comment-audience`, `std-api-review.md` §4.)
The two are DISJOINT and both halves enforce it: the lint skips the four codes for a std
module and the ratchet walks `compiler/` alone, so a consumer's `vl check` never reads
std's comments against this page (D1601).

1. **Contract and the non-obvious why, nothing else.** What a caller may rely on —
   inputs, the sentinel it returns and when, the invariant it keeps — and what breaks
   without it. A measurement needs a graded home beside it (`D<row>`, a `DECISIONS.md`
   section, a `docs/**.md`); `comment-measurement-uncited` fires when it has none.
2. **Length.** A function header is at most 4 lines, an inline block at most 2, the
   module header at most 12. `comment-block-too-long` applies 4 to every block but the
   module header, which is the first block with no code before it (blank lines and the
   leading `import` region may precede it).
3. **No history.** No "was / used to / previously / no longer / landed / measured", no
   dates, no instrument output, no session or sweep ids, no "the first cut / a candidate
   that …" narration. The inventory row holds it, `git log -S` finds the rest.
   `comment-history` matches those phrases and any `yyyy-mm-dd`, whole-word and
   case-folded, outside backticks.
4. **At most one `D<id>` per block**, and only when the row is the evidence for a
   constraint the code cannot explain in a line. A `D<id>` is never the comment's
   subject: the sentence says what holds, the id says where it was graded.
5. **No emphasis by capitalisation.** Identifiers go in backticks, ordinary words in
   lower case. `comment-shouting` fires on two words of three-or-more capitals in a row
   outside backticks; the acronym allow-list (`ABI`, `AST`, `WASM`, `UFCS`, …) lives in
   `cbIsAcronym` in `compiler/lint.vl` and its copy in `scripts/comment-budget.py`.
6. **No cross-block narration.** Not "see three functions up", not "as above" — name the
   function, so the sentence survives the next reordering.

## The ratchet

All four codes ride one ratchet, since the tree cannot reach zero in one PR.
`python3 scripts/comment-budget.py --check` (a gate in `gate.sh` and in CI) fails when
any FILE's count for any code goes up; `--write-baseline` lowers it, in the same PR as
the trim that earned it, `--list <code>` names the blocks, and `--why` names the blocks
that LEFT since the baseline's commit — so a fall can be attributed to the trim that
earned it rather than read as a detector going quiet. `scripts/lint-self.sh`
holds a code out of its `info` gate only while the committed baseline still owes it, so
the exemption deletes itself at zero. `tests/vl_comment_budget_test.ts` pins the lint and
the script to agree, hit line by hit line. The baseline schema and those four commands
are `scripts/ratchet.py`, shared with the four sibling ratchets.

**A comment-only change must produce a byte-identical seed** — `scripts/refresh-compiler.sh`,
then `cmp` against a seed built from the pre-trim source. One byte different means the edit
touched code.
