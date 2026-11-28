# Checker cost (#10525 step 3): S2b not built, and the check(node, expected) ceiling

Measured 2026-11-28 (lane COV-IS) on one self-compile: `vl check --codegen compiler/entry.vl`
on master `8109888ab`, checked by the S2a seed (#10824) with scratch probes. The probe seed was
built separately and left no trace: the seeds' sha1 is unchanged. Shares are of `checkProgram`
in a `VL_PROFILE_GUEST_FUEL` profile, with every sample that has a probe frame on its stack left
out.

## S2b (function rows): not built for the checker

Coordinator ruling, 2026-11-28: function × function pairs cost 0.00% of equality work, so S2b
does not pay in fuel. It stays available as row cleanup (about −55k rows) if something else
needs the row count down.

- Function rows: 84,089, of which 4,057 are distinct. Four sites mint 99.5% of them:
  `symDeclInOuter` (check_fn_decl.vl:1313), check_fn_decl.vl:727, the hoist
  (check_top_level.vl:827) and check_fn_decl.vl:1235. Interning would merge only within one
  declaration's set, to an estimated 25–30k rows.
- About 7.85M outermost equality calls, each about one step. Work by pair kind:

  | pair | share of equality steps |
  |---|---|
  | record × record | 88.6% (`tyEq` 68.2%, `sameVariantTy` 20.5%) |
  | function × function | 0.00% |

- Shares of `checkProgram`:

  | frame | share |
  |---|---|
  | `mkFuncTy` | 0.01% |
  | `declareDecl` | 0.30% |
  | `symDeclInOuter` | 0.11% |
  | pair memos | 4.0% (`pairMemoGet` 2.95%, `pairMemoClear` 1.09%) |
  | equality frames | 6.2% |

- Follow-up, not in S2b: one declaration mints its signature 3–4 times.

## Record × record, by declaration

Outermost record × record calls are classed by declared name (`structNameOfTy`, or a generic
application's head) and by a shallow key (field names plus field type indices):

| class | calls | share |
|---|---|---|
| cross-declaration, keys differ | 6,916,408 | 99.44% |
| named × anonymous | 36,433 | 0.52% |
| anonymous × anonymous | 2,329 | 0.03% |
| same declaration | 0 | 0% |

There are no same-declaration pairs, because one declaration is already one row, which the
`a == b` check answers before any frame opens. Nominal interning (S2c) would make no new pair
index-equal. Every cross-declaration pair is decided in one step. S3's ceiling is answering those
pairs by name ahead of the frame and the memo: at most the equality frames plus the pair memos,
about 9–10%.

## Re-checking a node already checked (the check(node, expected) ceiling)

The probe wraps `checkNode`. A node that has been visited before, reached outside any open
re-visit, is a root, and every nested visit is charged to that root. The expected key is
`joinWantAt`, `callDstTy`, and for a lambda its recorded expected return and parameters.

- Re-visit roots cost **12.9%** of `checkProgram` (9,369 roots, 297,766 nested visits). The
  first visits behind them cost 12.1%: the return-inference pre-pass `inferReturnsPrePass`.
- By cause (where the root's first visit happened → where the re-visit happens), counted in
  nested visits:

  | cause | share of nested visits |
  |---|---|
  | pre-pass → real pass (re-inference) | 97.9% |
  | quiet probe → real pass | 0.9% |
  | inside the pre-pass's own fixpoint | 1.0% |
  | real → real | 0.1% |

  Seed/adopt, pinned re-check and if-join install do not appear as separate roots. Together
  they are at most the last three rows, about 0.3% of `checkProgram`.
- Every root is reached again under the same expected key and returns the index-identical type.
  Nested visits: 94.8% index-identical, 4.4% `tyEq`-equal, 0.85% different, 11 under a new key.
- Whole roots whose every node repeats (index-identical or `tyEq`-equal): 8,551 of 9,369 roots,
  but only 60.3% of nested visits. The 818 roots with a differing node hold 39.7%.
- Ceiling for a check(node, expected) memo: **about 7.8%** of `checkProgram`, which is 12.9% ×
  60.3%, weighted by visits rather than fuel. The real pass also records the diagnostics,
  symbols and node types that the quiet pre-pass discards, so a memo that returns only a type
  cannot skip it. The lever is letting a clean root's pre-pass check stand, with its records
  kept.
