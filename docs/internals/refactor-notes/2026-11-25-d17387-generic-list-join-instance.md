# D17387: a generic join of two list literals at an instance of two number types (2026-11-25, lane IR-D1)

The bug, from inventory row D17387 (clause 1, silently wrong): `if k { [a] } else { [b] }` in
`w<A, B>`, called as `w(1.5, 2, false)`, printed `.length` 0 and trapped on `[0]`. The annotated
and returned spellings at `(i32, f64)` were invalid wasm.

## Mechanism

The instance's type of the `if` is the substitution of the template's kept-apart join `A[] | B[]`.
That substitution keeps the two lists apart, here as `f64[] | i32[]`, and the emitter tags each
arm with its member of that union. The instance's elaboration re-check built `[b]` at the widened
`f64[]` instead. The wasm was an f64 list tagged `i32[]`: the tag's `ref.test` failed and the read
took the empty default.

Three readings in the re-check widened it. Each spelling needs its own:

| change | the reading | spellings it fixes |
| --- | --- | --- |
| `ifArmsJoin` (`check_node_rules.vl`) | `ifTailElseJoin` and `ifTailBankValTy` joined the concrete arms with `joinArmLit`, which widens and adopts both arms there; in an elaboration re-check of an `if` recorded in `tpJoinUnions`, two lists now stay apart (`joinVariantTys`) | the bare binding, the returned `if` |
| `liveNodeTyOf` (`check_fit_rules.vl`) | `listMemberIn` and `arrLitFitsList` chose a literal's union arm by its template type `B[]`, which no instance member equals, then by fit, which `[2]` meets at `f64[]` first; they now read the instance's type | the annotated `A[] | B[]` binding |
| `listArmIn` (`check_assignable.vl`) | its own-type pass compared arena indices; it now compares types (`tyEq`) | statement returns |

Ablation, removing each change with the other two kept:
- Without `ifArmsJoin`, the binding and the returned `if` print 0.
- Without `liveNodeTyOf`, the annotated spellings are invalid wasm.
- Without `listArmIn`'s `tyEq`, statement returns print 0.

## Readings

All seeds are fixpoints. The base is master `bf61bf508`, and each census arm ran in a tree at its
own commit.

- **The grid** (`tests/cases/generics/join-list-literals-number-pairs.vl`):
  - Pairs `(i32, f64)`, `(f64, i32)`, `(i32, f32)`, `(f32, f64)`, each at `k` true and false.
  - Five spellings: literal `if`, annotated `A[] | B[]`, returned `if`, statement returns, and a
    moved (bound) list arm.
  - Reads `.length` and `[0]`.
  - Base: 83 output lines wrong. Head: 0, both shipped and claimless.
- **Controls unchanged:** the non-generic join (`f64[]`, `1` / `2.5`), the scalar `A | B`
  (`2.5` / `2`), and D2760's own witness (`b`).
- **Legacy byte A/B** over `tests/cases` and probes: 8243 same, 2 moved.
  - The grid.
  - `generics/return-join-kept-list-literal-at-generic-pin.vl`: output identical to its `@log` on
    both seeds. `listArmIn`'s `tyEq` alone moves it: reverting that change restores base's bytes,
    and reverting either other change keeps the new ones. At `T = i32`, `[t]` finds its own
    `i32[]` arm and is built there (tag 7), not boxed into `(i32 | null)[]` (tag 13).
  - No program outside generics moved.
- **Identity:**
  - `--names`: `identical 9433, differ 0`; self-compile identical.
  - `--cases`: `identical 8176, differ 0`; witnesses `same 89`.
  - claimless: `identical 14517, differ 0`. Claimless compiler sha256 `17238b93…33e6`, built in
    `93c41beb8`, `compiler/` clean.
- **Checker A/B** (`vl check --batch --json --severity hint`, exit and diagnostics): 22306 files
  across cases, probes and the distilled corpus, 0 differ.
- **Ratchets:**
  - late demands: 10 in 8 files, baseline 10.
  - late tag rows: 315, baseline 315, 0 gone.
- **mono-tyaram-grid:** 252 OK and 9 REJECT on both seeds, results identical; no BAD cells.
- **Census:**
  - Claimed functions: cases 87938 → 87959, witnesses 22308 → 22311, self 20686 → 20689.
  - 0 lost. Cases shows 2, both the known `inner` name collision, with identical rows on both arms.
  - `array element coercion` rows cleared: `join-two-type-params.vl::w` (cases 22 → 21) and
    D2760's witness `w` (witnesses 12 → 11). The IR needed no change; it claims the grid, 20 of 20
    functions matched.
- **Fuel:** per PR +0.00% on 129604740245.

## Legacy tails the IR calls

None new.
