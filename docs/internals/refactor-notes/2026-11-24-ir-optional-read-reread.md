# IR: a standalone `?.` over a global or field-read base, 2026-11-24

Lane IR-N4. Base: master 334f6958. Class `optional read base`.

## Change

- Legacy's `emitOptMemberValueGo` writes `emitOptChainIsNull`, then `emitOptChainValue`. An
  unstaged base is `emitExpr`'d at each read (`emitOptRecvBase`, `emitOptChainValue`), and a third
  time where the leaf field has its own null test (`emitOptLinkNullOpen`). So a global base is
  `global.get` again, and a field base is its object and `struct.get` again.
- `optRead` took only a non-temp variable base. It now also takes a temp where
  `recvReadsAgain(base)` holds, meaning the builder recorded the read (`irReadVar`, `irReadAgain`,
  `irReadField` over one).
- The lowering writes the first read with `irLOpnd`, and every later one through
  `opndAgain(orV, omObj)` (`irHoistRecv`). A variable's `opndAgain` is its `irLOpnd`, so existing
  claims don't move. The `nonNull` arm reads once, as before.

## Predicates and their legacy callers (R8)

| predicate | callers |
| --- | --- |
| `recvReadsAgain` (existing, new use) | `emitOptRecvBase` and `emitOptChainValue`, which `emitExpr` an unstaged base at each read |

## Legacy tails the IR calls

- None new.

## Witnesses and readings

Witnesses, all committed:
- `tests/cases/expressions/optional-read-global-and-field-base-positions.vl`, the Q58 sweep: a
  global base `g?.v` / `g?.s` and a field base `hold.p?.v` / `hold.p?.s`, each over a record, a
  record whose string field is null, and null. The positions are a call argument (`i32 | null` and
  `string | null` parameters), a nested argument, a `return`, an annotated and an un-annotated
  `const`, an `if` arm, a `??` operand, a record field and a statement; plus a function-local field
  base `h.p?.v`. Concat and an interpolation hole are check refusals for a nullable, so they do not
  apply. 88 functions and the starts match.
- `tests/cases/expressions/optional-read-effectful-base-runs-once.vl`: `next(k)?.v`,
  `xs[at(k)]?.v` and `(o = next(k))?.v`, over a record and null. A counter climbs by one per read,
  under both seeds and claimless.
- `tests/cases/expressions/optional-read-linked-chain-and-sibling-global-write.vl` covers three
  things:
  - `o.f?.g?.h` in 3 positions, with the middle link null in one run and the first field null in
    another (it stays `optional read chain`, legacy's under both seeds);
  - `o.f?.g` over a nullable record field in 3 positions, the case where legacy reads the base a
    third time for the field's own null test;
  - `h2(gl?.v, setG())` and `h3(setG(), gl?.v)`, where a sibling argument's call reassigns the
    global: `1` and `2`, as legacy.
- `tests/ir-shadow-rows/optional-read-global-and-field-base.vl`: the positions in one row.
- Capability probe `scripts/capability-probes/optchain-ref-list-leaf-inferred-binding.vl`.

Fixpoint seeds on both sides, master 334f6958 against this branch. Each census arm was built in a
tree at its own commit: the base arm in a `git archive` of 334f6958, the branch arm in the
worktree. `VL_STD` is the tree's.

| class (tests/cases census, rows summed) | master | branch |
| --- | ---: | ---: |
| optional read base, functions | 3 | 0 |
| start: optional read base | 16 | 0 |
| optional read base, capability probes | 1 | 0 |
| tests/cases armed functions matched | 81678 | 81701 |
| tests/cases armed starts matched | 7156 | 7164 |

Of the 19 tests/cases rows, 9 match fully: 2 functions and 7 starts, plus the probe's start.
- Functions: `optional-chain-value-binding.vl` and `optional-member-statement-and-tail.vl`.
- Starts: `coalesce-nullable-function`, `optchain-standalone-leaf-reps`, `optional-call-guard`,
  `hole-param-nullable-read-pin`, `newline-leads-with-member-is-as`,
  `call-ends-shadowed-narrowing` and `nested-width-nullable-existing-record`.

The other 10 move on, each measured as a row new on the branch for its program:
- `coalesce optional place`: 7 rows, 1 function (`optional-chain-member-recv`) and 6 starts. The
  starts are `record-literal-write-yields-place-record`, `record-write-value-read-at-slot-row`,
  `return-if-lowers-as-tail-if`, `tail-if-field-assign-arm`, `optional-chain-guarded-dot`, and
  `self-recursive-arm-field` with `is box not a local`.
- `optional read chain`: 2 starts (`optchain-standalone-fn-leaf`, `optchain-standalone-map-leaf`).
- `call of a non-declaration`: 1 start (`optional-member-statement-and-tail`).

Under mode 6, every witness reads 0 order, mismatch or fail rows. All 23 run alike under both
seeds (rc and output), and claimless over them is identical (23).

Checks:
- No program's covered count fell (per-program `blockers none`, master against branch: 0).
- Self-compile: 20539 covered, matched and claimed on both; modes 1, 3 and 5 build the plain bytes.
- `ir-identity --names`: identical 9433, fail under both 3267, differ 0, built under one only 0;
  self-compile identical. `--claimless`: identical 14460, differ 0.
- `--cases`: identical 7803, fail under both 68, differ 0, expected divergence 2 (master's declared
  `arm-site-hoisted-index-positions.vl` and `list-union-element-through-hole.vl`, the same on
  both); witnesses same 61, differ 0.
- tests/cases legacy A/B: identical 7518, fail under both 67, differ 0; the moved list is empty.
- Armed shadow: 24 fail or mismatch rows on both, the same file (master's declared divergences in
  3 programs, none a witness here). `--claims`: `ir-shadow: ok`.
- Order check (mode 6): 0 order rows over the distilled corpus and over tests/cases.
- `self-ir-misses`: 0 missed. Deep nesting: 8 passed; the labelled-loop margin passes at 910 KB and
  fails at 900.
- `tests/vl_ir_door_guard_test.ts` 13 passed; `tests/vl_emitter_state_audit_test.ts` 7 passed.
- Fuel: L2 125949701660 against master's 125949701604 (per PR -0.00% on base 334f6958).
- Late demands 9/9; late tag rows 307/307. Seed size +0.6% on its baseline.
