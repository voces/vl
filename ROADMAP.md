# VL / Vital — Roadmap

The vision: a scripting-feel language with types **hidden by aggressive inference**, **permissive &
structural**, **fully type-safe** (statically sound — no untyped code; inference holes resolve to
concrete types), compiling to **lean WebAssembly**. Deliverables: an **LSP-backed VS Code extension**
(partial), a **CLI** (the native `vl` — `build`/`check`/`run`, `-O` via wasm-opt; brains in
`build/vl-compiler.wasm` under wasmtime), and an **in-browser playground** (partial).

**Self-hosting status:** the compiler is written in VL (`compiler/*.vl` — lexer/ast/parser/
typecheck/wasmEmit) and **compiles itself to a byte-exact fixpoint** (stage3 == stage4,
`scripts/native-fixpoint.sh`, ~6s, no TS past the seed; gated in CI by `ci-native`). The TS
genesis is gone — the seed's source of truth is the published `seed-latest` release (self-compiled
each master push), with the immutable `seed-v0` anchoring the lineage. **The TS host is DELETED** —
the ~18K-LOC `compiler/*.ts` front end, the `cli.ts` release binary, and the `checker-parity-sweep.ts`
oracle are all gone; only the dependency-free type leaves (`coreTypes.ts`/`diagnostics.ts`) remain for
the LSP/playground. The self-hosted `compiler/*.vl` is the one and only compiler.

Status: 🟡 partial · ⬜ not started.

**Repo layout:** `compiler/` — the self-hosted compiler (`*.vl` — lexer/parser/typecheck/wasmEmit,
built to the wasm seed; the only `.ts` left are the `coreTypes`/`diagnostics` type leaves) ·
`scripts/vl-host/` — the native Rust `vl` host · `lsp/` — the VS Code extension + LSP server (drives
the seed) · no `grammar/` — the old `.g4` spec is gone; the hand-written parser + the `tests/`
corpus are the de-facto spec · `tests/` — `.vl` corpus + runner · `docs/` ·
`reference/` — retired ts-interpreter. Tracks are **independent** unless a dependency is called out.

> **Maintaining this file.** The roadmap is *forward-looking* — what to do next, why, dependencies,
> what's remaining.
> - *Shipped work?* → `CHANGELOG.md`.
> - *Why we chose something non-obvious?* → `DECISIONS.md`.
> - *How an already-done thing works?* → the code + git history, or a `docs/<subsystem>.md` explainer.
>
> Done items graduate to CHANGELOG. Partial items keep only the remaining/forward part. (Agents:
> on finishing, move the item to CHANGELOG as a one-liner; put rationale in `DECISIONS.md`.)

---

## Next (highest leverage)

### Ruled and sequenced (owner decisions already made, waiting only on order)

- **Kill the ambient builtin `toString`; rename std:fmt's `toStr` → `toString` in its
  place** — DONE #2199 (ruled 2026-09-01, shipped the same day). Default scope, all six
  emit/classify/collect arms and `emitToString` are gone; `std:fmt` exports `toString`;
  every in-tree caller migrated; both retired spellings get a targeted import hint.
- **String interpolation — SHIPPED #2188 (templates), EXTENDED and UNIFIED the same
  week (plain strings + the `\{` migration).** ONE hole syntax, `\{expr}`, in BOTH
  quoted forms: `"v=\{x}"` and `` `v=\{x}` `` are the same construct, desugared in the
  parser to concat over `std:fmt`'s renderer bound ABSOLUTELY via a compiler-injected
  bare import edge plus an unspellable rename row. The trigger sits in the ESCAPE
  namespace (Swift's `\(` placement, the owner's brace spelling), which is what makes it
  additive at zero permanent cost — `{` is data in every string forever, and `"a\{b"`
  was a hard lex error before. `${` is ordinary text now and `\$` is retired; multiline
  stays backtick-only. Two remainders, both measured and both UNCHANGED by the
  extension: a STRING-only hole still pulls `std:fmt`+`std:str` because the host closes
  the module graph before any type exists — the fix is whole-program DCE, not a
  literal-form-specific drop; and an `f32` hole reaches the pre-existing
  `emitProgram: union atom has no value box` floor at the SAME spelling a hand-written
  `x.toString()` does (`scripts/capability-probes/f32-into-f64-union-arm.vl` owns it —
  the hole is a second door, not a second defect). The hole domain needs no scheduling:
  it is read off the renderer, and picked up `f64` from serde Stage 0 with no edit.
  The `toStr` → `toString` rename above was the one-line edit it was advertised as
  (`TPL_RENDER_EXPORT` in `driver.vl`).
- **`else` requires braces** — DONE #2165; recorded here only because the ruling predates
  the entry above and the DECISIONS entry is the durable home.
- **An else-less `if` as a VALUE is `T | null` everywhere — RULED (owner, 2026-09-02), TO BUILD
  as D1086.** Checker first (return / `??` / argument / field / element / assignment RHS agree
  with the binding rule), then the emitter's synthesized `null` else arm over the row's 2×12
  scope × rep grid, both faces. DECISIONS.md §"An else-less `if` used as a VALUE". Compile-goal
  track.
- **UFCS is never implicit; the LSP surfaces the import — RULED (owner, 2026-09-02);
  TOOLING HALF SHIPPED the same day.** `expect(x).toEqual(y)` keeps needing `toEqual`
  imported. DECISIONS.md §"UFCS is never implicit".
  - **DONE.** Completion after `.` offers every free `f(self: T, …)` the receiver
    dispatches to, from the file's whole module graph plus every `std:*` module, each
    labelled with its module and carrying the import rewrite as an `additionalTextEdit`;
    a quick-fix on the missing-import diagnostic adds the name to the import, one action
    per candidate module. The candidate set is the CHECKER's (`ufcsCandidatesAt`, a new
    LSP query over the same `declFirstParamIsSelf` + `assignable` pair `ufcsCallTy`
    applies), so a generic `self` fits a concrete receiver without the host doing type
    matching. Two capabilities fell out: a CALL receiver (`expect(1).`) completes at all,
    which the field scan's bare-identifier lookup never could; and the import edit spells
    a SPECIFIER (`./shapes`), not the module key the checker reports.
  - **DONE (compile-goal half).** The diagnostic names the missing import and carries
    `ufcs-not-imported;member=…;modules=…;recv=…` on the `diagCodeLen`/`diagCodeByte`
    channel, so the quick-fix keys on the code and its message-shape fallback is retired.
    `recv=` is last and is read as everything after the first `;recv=`. D1230.
  - **REMAINS.** Workspace modules the file does not already import are not probed — the
    500-file crawl is too expensive per keystroke — so a workspace `f(self: T, …)` is
    offered only from a module already in the graph.
- **Driver lossless-recovery flag — STAGE 1 DONE #2210** (ruled 2026-09-01, shipped the
  same day). A file whose EVERY parse diagnostic is a lossless recovery's is typechecked
  and linted anyway, so "missing brace" and "type error four lines down" are reported
  together — the LSP stops blanking all type feedback the moment a body is half-written.
  Sparse index-keyed column beside `P.diags` (`dgLossless`, `compiler/ast.vl`), set by the
  ONE site that provably preserves the program (`parseBracedBody`'s unbraced-body arm);
  `vcParseBlocked` in `driver.vl` gates six pipeline entry points on it. Emit still never
  proceeds past a parse diagnostic (a recovered program checks, it does not build), and
  `formatSrc` keeps the ANY reading because `fmt -w` would otherwise re-spell the mistake.
  **STAGE 2 is the remainder and needs no further ruling**: convert the lossy skip sites
  one at a time — each conversion making a recovery faithful and then deleting its pin from
  `tests/vl_lossless_recovery_test.ts`. The phantom cases that suite pins are the standing
  regression floor; widening the gate without making the recovery faithful is exactly what
  they exist to stop. DECISIONS.md §"A recovered parse IS typechecked" is the durable home.
  - **`expectClose`'s skip-to-closer — DONE #2397.** The defect was never the arity: the
    parser had no separator arm, so an element-starting token ended the list and
    `expectClose`'s scan DELETED it on the way to the closer. A missing list separator is
    now diagnosed and INSERTED (`parseArgs` / `parseArrayLit` / `parseObjLit` /
    `parseParamList`, each gated on its own element-start test), and `expectClose` marks
    LOSSLESS exactly when its scan consumed nothing — a closer that is merely missing drops
    no token. `f(1 2)`, `f(1 2 3)`, `g(f(1 2), 3)`, `[1 2]`, `{x: 1 y: 2}` and
    `function f(a: i32 b: i32)` all typecheck now, and `f(1 2 3)` against a two-parameter
    `f` reports the TRUE `expected 2, got 3`. `[{x: 1} {x: 2}]` is correctly still gated —
    `{` is not an element start, by the same argument that makes it `expectClose`'s scan
    bound. **The insert is SAME-LINE ONLY**, and the first cut of the change proved why:
    every list site skips NEWLINEs, so an ungated insert read a missing CLOSER at end of
    line as a missing COMMA and swallowed the next statement as an element
    (`const xs = [1, 2` / `print(xs.length)` invented two type errors) — the exact phantom
    class the pins exist to stop. The price is that a missing comma at a line end inside a
    MULTI-LINE list is not inserted either; a missing closer and a missing separator are
    indistinguishable there, and that spelling behaves exactly as master does. Four pins
    remain. DECISIONS.md §"A missing list separator is inserted, never skipped past".
  - **NEXT: the `then`-removal arm in `parseIf`**, which is already single-statement and was
    called out at stage 1 as the cheapest remaining candidate.
- **Modernization program — (1) comment trim, PILOT DONE #2413**: `compiler/parser.vl`,
  `compiler/format.vl` and `compiler/emit_sections.vl` are at the 12-line comment-block
  budget (72 blocks over 12 → 2, both of those module headers under their own 40-line
  budget), with a byte-identical seed and the moved text archived verbatim in
  `docs/internals/{parser,format,emit-sections}-notes.md`. `emit_bytes.vl` and the large
  emitter/checker files come later, under a freeze; the lint + ratchet
  (`scripts/comment-budget.py`) lands separately.
- **Modernization program, item 3 — the defect inventory is ONE FILE PER ROW. TOOLING SHIPPED;
  the split itself lands on merge day.** `scripts/inventory/split.py --apply --relink` run
  against fresh master, under a freeze on inventory appends; every consumer already reads
  either form, so nothing else changes that day. Two gates came out of it:
  `tests/vl_inventory_refs_test.ts` (a cited row must EXIST — #2405 deleted a row and every
  gate stayed green) and the file-stem check in `vl_inventory_rows_test.ts`.
- **Modernization program — (2) position-matrix harness, DONE #2415**:
  `scripts/capability-probes/matrix.py` generates a capability's POSITION × FACE matrix from
  ONE `matrix/*.matrix.vl` template — twenty delivery and discrimination positions, both
  faces, one program per cell each printing a value only a correct conversion produces —
  and grades it in `run.py`'s vocabulary, exiting non-zero on `runs → not-runs` between two
  seeds or any `SILENT` after. Briefs stop hand-writing ~40 programs and stop losing the
  ones they skip: D965 lost global assignment, D1193 was silent at seven of nine positions,
  #2406 missed the un-annotated return face and the early-return guard. Four templates ship
  as the harness's own controls, D1197's `array_push` cell grading `SILENT` among them
  (`tests/vl_capability_matrix_test.ts`). README §"The position matrix".
- **Width subtyping — RULED (owner, 2026-09-01): the non-prefix refusal is a GAP, closed
  the Roc way** — shape-monomorphization of narrow-typed consumers (offsets constant per
  caller shape; zero runtime cost; paid in instance count — the variant-count tradeoff
  the monomorphization notes already track, with WasmGC-subtyping collapse as the future
  escape). The storage caveat stands: only FUNCTION-parameter width monomorphizes free;
  non-prefix STORAGE (a narrow-typed container holding wide values) pays boxing/adapters
  under any scheme. Owner's rider, recorded: watch for hidden perf traps — the implicit
  lossless numeric conversions were embraced without pricing them, and this must not
  repeat silently; the mitigation is an INSTRUMENT, not hesitation (a per-build instance
  report making mono growth visible — filed as part of the implementation's grading).
  Compiler-side work; the compile-goal session's surface.
- **Deep `is` over a `Json` value — `is` BUILT 2026-09-02 (PR-DEEPIS); the `as` TRIO IS THE
  REMAINDER.** `r is T` for a JSON-SHAPE `T` is now a runtime shape walk plus a conversion:
  the checker records the deep sites, the driver generates one `__vlJsonIs_<k>` +
  `__vlJsonGet_<k>` pair per distinct target as ordinary VL SOURCE, splices it into the
  program and re-checks, so the arm binds a real `string[]` / `Cfg` / `{[string]: i32}` and
  no delivery position had to be wired. S1 (copy), S2 (integral, in-range — literally
  `v as? i32`) and S3 (absent key matches `T | null` as `null`) all hold; D1035 CLOSED.
  **Still to build: S4, the `as` trio** — `r as T` yielding `T | JsonError` with
  `JsonError { kind: "shape", path: "<json pointer to the first mismatch>" }`, `as!`
  trapping with the same message, `as? ` yielding `T | null`. That needs the walker to track
  a POINTER (the current pair returns a bare boolean and a bare `T`), and adding `"shape"` to
  the exported `JsonError.kind` literal set is a std API change that must go through
  `std-api-reviewer` first. Three residue rows carry the rest: **D1197** (`.push` drops the
  non-null recovery for a narrowed nullable ref — the reason the walker is a PAIR rather
  than one `T | null` function), **D1198** (a recursive JSON shape target has no walker,
  because the generator inlines each level), **D1190** (a deep `is` arm that rebinds or
  writes the tested place refuses). Closing D1197 is the unlock for both of the others.
  Design + the built/not-built split: `docs/serde-design.md` §"Deep `is` / `as` over a
  `Json` value" §"WHAT WAS BUILT"; DECISIONS.md has the standing rule.
- **`as` trio over a `Json` value — the remainder of the item above, NOT BUILT** — `std:json` v1 (#2322) ships NO
  accessor helper (json-design §6 q1 = (a), "until we have an actual consumer"); the
  decoder is the operator: `if doc is Cfg { doc.server.port }` / `doc as Cfg` (trio
  semantics), a compiler-derived per-`T` shape walk that BUILDS the `T`-repped value from
  the tree. Measured today: `is` is a tag test — a struct RHS is refused as "not a variant",
  and a refinement of an arm (`["xyz"] is string[]`) is check-clean and answers `false`
  unconditionally (**D1035**, this item's witness). Design + four sub-rules (copy
  semantics; integral `i32` fields — the same predicate as q2's exact `as`; **S3 RULED
  2026-09-02: an absent key matches a `T | null` field and reads `null` — VL's own map
  read already does, and a nullable field is not a REQUIRED key for OQ-7's arm rule**;
  `as` propagates `JsonError { kind: "shape", path }`) in
  `docs/serde-design.md` §"Deep `is` / `as` over a `Json` value"; DECISIONS.md has the
  rulings. It is serde Stage 2's JSON half brought forward (checker "is a JSON shape"
  predicate + emitter walk keyed on the RHS type); OQ-1 (b)'s intrinsic stays for the
  binary source and `serialize`. Position matrix before the checker narrows (D965).
  Compiler-side work; the compile-goal session's surface once the sub-rules are ruled.
- **Numeric `as` honours the trio — RULED (owner, 2026-09-02), NOT BUILT.** A numeric `as`
  to an INTEGER target is exact-or-fail: `f64 → i32`/`i64` succeeds iff integral and in
  range, `i64 → i32` iff in range (no wrap), `i32 → i64`/`f64` cannot fail; failure is the
  trio's — bare `as` propagates `null` (the return must carry `| null`, else the checker
  names `as!`/`as?`), `as?` yields `T | null`, `as!` traps. A FLOAT target rounds and never
  fails. Loss is spelled `trunc(d) as! i32` / `floor(d) as! i32`. Nothing ships in std
  (json-design §6 q2's `asExactI32` is `as?` spelled as a function). Measured today
  (**D1041**): the suffix is accepted and IGNORED on a numeric cast — `3.9 as? i32`,
  `3.9 as! i32` and a bare `3.9 as i32` inside an `i32 | null` function all print `3`;
  `4294967298 as i32` prints `2`. **The build, in order:** (1) migrate every numeric `as`
  site in the tree to `as!` (they were written under "traps on NaN / out of range" and mean
  it) — **DONE, #2355 (vl-de, 2026-09-02): `compiler/` 2, `std/` 15, `tests/cases` 167,
  `cmp`-byte-identical** (the 67/21/230 first quoted was a bare grep; 70 of its compiler+std
  hits were comment prose) — byte-identical on today's seed because it drops the suffix, so
  the fixpoint proves the migration touched nothing;
  (2) checker: `checkCastNode`'s numeric arm reads `asMode` — bare `as` places the
  propagation obligation on the enclosing return as the union arm does, `as?` types
  `T | null`, `as!` types `T`, and `as?` on a lossless edge is a hint; (3) emitter: exact
  lowering for an integer target (`i32.trunc_sat_f64_s` + `f64.convert_i32_s` + `f64.eq`,
  the `i64` twin, `i32.wrap_i64` + `i64.extend_i32_s` + `i64.eq`; NaN fails the compare for
  free), `as?` delivering the tagged `i32 | null` at every D965 position, `as!` trapping with
  a source-located message (the diagnostic half of the old `f64-as-i32-out-of-range` ask),
  and the `trunc`/`floor`/`ceil`/`nearest`-operand peephole to the single trapping
  instruction — do not lean on binaryen for that fold, its float folds are NaN-conservative;
  (4) `std/fmt.vl` `parseI32`'s "unchecked wrapping truncation" comment goes. Grade on
  D1041's ten-row table.

  **STATUS 2026-09-02: DONE — (1) #2355, (2)(3)(4) #2361.** `3.9 as? i32` prints `null`,
  `3.9 as! i32` traps with `as! i32 at <l>:<c>: not exact`, a bare `f64 as i32` inside an
  `i32 | null` function propagates, `4294967298 as? i32` is `null` rather than `2`, and
  `trunc(d) as! i32` is the one `i32.trunc_f64_s` with no compare in front of it (checked with
  `wasm-dis`). D1041's ten-row table matches the ruling row for row; the twelve-position
  delivery matrix is `tests/cases/numerics/as-cast-exact-positions.vl`. Zero `runs` lost — no
  distilled-corpus cell changed class.

  Three corrections the build made to what is written above:

  * **The exactness test is "integral AND in range", not the round-trip compare** this bullet
    and D1041 both specified. `trunc_sat` + convert-back + `eq` is exact for `f64 → i32` and
    UNSOUND for the other three float pairs, because the convert-back rounds:
    `9223372036854775808.0 as? i64` saturates to `i64::MAX`, converts back to exactly `2^63`,
    and compares EQUAL — admitting a value the target cannot hold. DECISIONS.md carries the
    correction.
  * **Five pairs, not two.** `f64 → i32`, `f64 → i64`, `f32 → i32`, `f32 → i64`, `i64 → i32`
    — the complete set of (source, integer target) pairs on which a VL value can lose itself.
  * **The `as?` lowering is an EMITTER ARM, not the `emit_rewrite` desugar the wip branch
    designed.** A desugar cannot work here for a pass-ordering reason the branch never
    reached: `dispatchRewrite` runs AFTER the collect passes, so the `if`/`null` it synthesises
    is invisible to `nliInferIfLet` and the `T | null` box is never interned. Keeping the
    `AsExpr` node instead reuses the delivery matrix the UNION `as?` already has.

  Four things the wip attempt settled, three of which held:

  * **The site count was 17, not 88** (compiler 2, std 15, tests/cases 167 — the 67/21/230
    estimate was a bare grep, and 70 of its compiler+std hits are prose inside `//` comments
    discussing casts). Corrected here and in DECISIONS.md.
  * **A DESUGAR, not an emitter arm, is the right lowering for `as?`** — `d as? i32` becomes
    `if d == trunc(d) && d >= LO && d <= HI { d as! i32 } else { null }` in `emit_rewrite`,
    beside D962's `??`. It is small precisely because `i32 | null` already has a rep at every
    delivery position and an `if` yielding it reuses all of them, where an `emitAsCast` arm
    would re-wire that matrix by hand. The predicate was MEASURED exact before it was written:
    a fraction fails the first conjunct, an overflow and an infinity fail the range, and NaN
    fails the first conjunct for free (`NaN == trunc(NaN)` is false). `trunc` returns `f64`.
  * ~~**THE BLOCKER IS THE SYNTHESIZED `null`, AND IT IS NOT A POSITION GAP.**~~ **WRONG on
    both halves, and the measurement that says so cost one run.** The refusal was not the
    blocker's cause and the positions were not wired: graded across twelve delivery positions
    the wip branch produced `bare null needs a struct-typed context` at TWO and check-clean
    INVALID WASM at nine — the majority failure was never the message the finding names. The
    real cause is pass ORDER (see the third correction above): `nliInferIfLet` runs in the
    collect passes and `dispatchRewrite` runs after them, so no registration route ever sees
    the synthesised `if`, and `nodeTyCarry` cannot help because the missing thing is a
    REGISTRY row, not a node type. The hand-written control that "runs at all four positions"
    also fails at a fifth the finding did not try — `print(if b { 7 } else { null })` — which
    is exactly the position D1041's own witness needs.
  * **A bare `as` is a different lowering from `as?`**, not the same one — it yields `T` and
    propagates on failure, so it wants the early-`return` shape `emitAsCast`'s UNION arm
    already uses, not the `if`-expression above.

  And one price to write down before phase 2 ships: today a bare `f64 as i32` TRAPS on NaN,
  ±Inf and overflow. Under the ruling those become a propagated `null`. After #2355 the tree
  spells no bare numeric `as`, so the only program whose meaning changes is a user function
  returning `| null` with a bare numeric `as` inside; everything else becomes a loud check
  error. DECISIONS.md §"Numeric `as` to an INTEGER target is exact-or-fail
  under the trio" has the survey (Julia's `Int(3.9)` InexactError / `trunc(Int, x)` is the
  model adopted) and the cost. Compiler-side; the compile-goal session's surface.
- **A subsumed literal arm COLLAPSES — RULED (owner, 2026-09-02); DONE — the collapse AND
  both hints.** The bare-literal half shipped as **D1024** and the MIRROR
  (`Kind | string` is `string`) as **D1048**, which needed the drop in BOTH producers — at
  type construction (`unionDropSubsumedArms`) and on the annotation SPELLING
  (`canonDropSubsumedParts`), each alone a `runs → not-runs` veto. The first hint arrived
  free (the existing redundant-annotation hint fires at a collapsed annotation); the
  SECOND — at an `is <literal>` whose operand collapsed — is now built, keyed on the
  provenance the collapse RECORDS (`collapsedTy` / `collapsedAliases`), because the
  collapsed type itself carries no trace of the dropped arm. A union is a
  set of values; an arm that adds none adds no arm, decided per arm after flattening and
  through aliases: `string | "err"` is `string`, `Name | "err"` (alias) is `Name`,
  `Json | "err"` is `Json`, `Kind | string` is `string`; `Kind | "err"` (three atoms) and
  `i32 | "err"` (a real two-arm box) stay. `x is <literal>` is a VALUE test everywhere — what
  every spelling that builds today already does. Two non-blocking hints: at the written
  subsumed spelling, and at an `is <literal>` whose operand collapsed; none at a generic
  instantiation. **Build:** the collapse in CANON (the type becomes the base / a smaller
  union) — never a dedupe of a built member set, box tags are positional — which closes
  **D1024** (`function f(): string | "err"` is check-clean invalid wasm today because the
  literal widens to a DUPLICATE `string` atom); then the two hints. Grade on D1024's spelling
  table (`return`, parameter, alias, `Json | "err"`, `Kind | string`, module-scope binding)
  and on `is "err"` answering as `==` at each. The second hint's own grade is the 18-program
  A/B in `tests/cases/literal-unions/is-literal-over-collapsed-arm.vl` plus that file's
  negatives (a real litunion, a real two-arm box, a plainly-declared `string`, a shadowing
  inner binding, a generic instantiation, and a non-literal check type). The generic-instantiation refusal that shared
  D1024's table (`orErr<T>(): T | "err"` at `T = i32` → `no recorded members`) was NOT this
  item — it is about mono-minted unions, struct arm or literal alike — and it has since
  CLOSED as **D1042**: the pin registers its union through `canonEmitName`, so the clone and
  the direct spelling meet on ONE row. Closing it exposed **D1193** (a literal `is` narrowed
  neither branch, so every position that READ the value rather than printing it was
  check-clean invalid wasm at the direct spelling too), which shipped with it. The residue is
  **D1194**: an inferred return that takes its union from a callee's declared `i32 | "err"`
  is still a loud check reject conceding codegen.
  DECISIONS.md §"A subsumed literal arm COLLAPSES". Compiler-side; compile-goal surface.
- **`is A` over same-shape struct arms is a DISCRIMINANT-VALUE test — RULED (owner,
  2026-09-02), DONE (#2365).** `type Circle = { kind: "circle", r: f64 }` /
  `type Square = { kind: "square", r: f64 }` is a legal union and `s is Circle` is true iff
  the tag names the shared shape AND `s.kind` is a member of `Circle`'s literal set — the
  arm set `s.kind == "circle"` already narrows to. A literal-typed field is a type that is
  also a value; membership is decided by the value. Overlapping sets are legal and truthful;
  a same-shape pair with NO literal-typed field (`{v: i32} | {v: boolean}`) is refused by
  the CHECKER — a design rule (`docs/guide/unions.md`) the emitter enforces today. The rep is
  the compiler's choice: one heap type + one tag + an `i32`-sentinel compare (recommended;
  no rep change), or distinct heap types (not vetoed) — provided the answer stays the
  value's, never the name a value was built under. Was: the singleton-literal TS idiom an
  EMIT REJECT with no `is` in the program (the idiom unwritable); two-member disjoint or
  overlapping sets folded into one variant and took the wrong arm silently (**D1023**); only
  different field names ran. **Built as the four steps planned** — the collect pass admits a
  same-signature pair differing in literal-typed fields of the same storage; `is A` adds the
  membership compare after the tag test, as an `if` and NOT an `i32.and` (both operands of an
  `and` evaluate, so the discriminant's `ref.cast` ran on arms of every other shape — only a
  THREE-arm union sees it); `checkUnionDiscriminable` owns the no-discriminant refusal at
  both the declared and inline spellings; `is` and `==` agree at every row. **The recommended
  rep needed no rep change, and one measurement is why:** atom ids are interned globally by
  literal VALUE, so `"y"` is the same `i32` in `"x" | "y"` and in `"y" | "z"` — a per-type
  numbering would have forced interning per base type. Two arms the tag already merged also
  had to be merged in `buildVariantTwins`, whose canon key preserves each arm's literal set:
  a shared tag with two heap types reproduced the filed trap from the other side.
  **Residue, named and now CLOSED (D1050, 2026-09-02):** a named litunion ALIAS in one arm
  beside an inline set in the other is legal by the ruling and refused, because the two
  litunion reps (interned atom / string ref) share no layout. The close lays the mixed field
  out under ONE rep — the interned ATOM — in the variant row and the arm's declared struct
  row, so the arms fold onto a single heap type; the WHOLE-TREE litunion unification (the rep
  cliff proper) was NOT needed and remains unbuilt. **The cliff was smaller than its name**:
  scoped to the arms of a mixed pair, it moved 0 of 255,504 corpus cells and emits master's
  own source byte-identically. Its BOUND is `tyIsLitUnion` on both arms — a set beside its
  own BASE (`{kind: K1} | {kind: string}`) and a BARE single literal are not atom material and
  keep the loud refusal, so the message literal stays counted. D1023's RULED paragraph has the
  six-row table and the grading list; DECISIONS.md §"`is A` over same-shape struct arms is a
  DISCRIMINANT-VALUE test" and §"a mixed-spelling variant field carries the ATOM". The std rule that was interim is now only a style
  preference: a std error struct no longer NEEDS a unique field name, since a unique `kind`
  literal discriminates. Compiler-side; compile-goal surface.
- **A `type` declared in a function body is LEGAL and lexically scoped — SHIPPED (#2391).**
  Ruled by the owner 2026-09-02 and built the same day, in two steps: (1) **#2369**, the interim
  loud refusal at the declaration; (2) **#2391**, the scoping, which removes it. Every `type`
  form (struct, union/literal union, recursive, generic alias, nominal `new`, `flat`) is
  admitted in a body, scoped to the block, shadowing outer names, and free to name the enclosing
  function's type parameters. **The mechanism is the MODULE MERGE'S, one scope in:** the parser
  mints a body-scoped declaration under a unique name (`P` → `P$b7`), spells every reference in
  its lexical extent at that name, and HOISTS the declaration into `progStmts` — so the
  checker's passes 0a–0d and every emitter registry build, which read `root.progStmts` and only
  that, work unchanged, exactly as `name$mN` already makes two modules' `Pair` two types.
  In the PARSER because recursive descent is lexical by construction and `parseTypeAtom`'s IDENT
  arm is the ONE substitution site every type-position name reaches. Type-parameter capture is a
  GENERIC ALIAS (`type P = {a: T}` in `f<T>` → `type P$b7<T>`), reusing the substitution a
  module-scope `Pair<A>` applied at a type parameter already performs. Sub-rulings both built: a
  local NOMINAL type may not escape through an inferred return — checker ERROR at the return, at
  three spellings including a returned closure; a structural one escapes as its shape, measured
  through all three escape positions. D1046 closes with it — a nested NAMED function naming the
  enclosing `T` was one loud emit reject and TWO check-clean invalid-wasm spellings the row had
  not named, all five grading rows now `runs`. DECISIONS.md §"A `type` declared in a function
  body is legal and lexically scoped". Compiler-side; compile-goal surface.
- **Assertion failures locate at the MATCHER, not `expect` — SHIPPED (#2386).** Ruled by the
  owner 2026-09-02 and built the same day, std-side only. Each `std:test` matcher
  (`toEqual`/`toBeTrue`/`toBeFalse`) takes a trailing `caller: CallerLoc = __callsite__`; the
  receipt dropped the `caller` it carried from `expect`, and `expect` dropped the parameter —
  a second place to hand in ONE location would need a precedence rule with no honest answer,
  so the one-hop forwarding surface moved with the anchor to `expect(v).toEqual(1, caller)`.
  `not()` needs no caller (it decides nothing; the FINAL matcher reports) and got none. Both
  blockers were gone by then: D1044 (a UFCS call omitting a defaulted tail argument, which is
  every matcher call in every test file) closed in #2371, and the leading-dot chain
  continuation shipped in #2382 — **so the LINE moves, not just the column**. Measured: a
  one-line `expect(x).toEqual(y)` at column 5 reports **col 15** (the ruling's "col 14" was
  the DOT — off by one in the prose, not the compiler); `not().toEqual` → the final matcher;
  `expect(build(cfg))` ⏎ `  .toEqual(want)` → the `.toEqual` line; `toEqual(expect(3), 4)` →
  its own `toEqual`; a forwarding helper → its caller; a passing assertion → no location.
  Cost re-measured both ways: 10M passing assertions inside the noise (0.42–0.43 s vs
  0.41–0.45 s), −10 bytes unoptimized, byte-identical at `-O3`. `testDiscovery.ts`'s wire
  format is unchanged (only its doc comment, which named the wrong token). DECISIONS.md §"A
  failed assertion is located at the MATCHER, not at `expect`".
- **A leading `.` / `?.` on a new line continues the postfix chain — SHIPPED (#2382).** Ruled
  by the owner 2026-09-02 and built the same day. `parsePostfix` gains a NEWLINE arm that LOOKS
  past the run of newlines and continues iff the next kind is DOT/QUESTION_DOT; `(` and `[` do
  NOT continue (legal statement starts) and trailing-dot stays refused, both pinned. Grepped
  rather than asserted: **0 of 10,355 `.vl` files** begin a line with `.`/`?.`, so no existing
  program changed meaning. **The formatter was the real half** and is fit-or-break now — inline
  while the chain fits `fmtWidth`, else one `.link(args)` per line at one extra indent from the
  first link — with the threshold at **two links, a link starting at the first step CARRYING A
  CALL** (a leading plain `.field` merges into the head, which is what keeps `P.toks.push({ … })`
  and `node.callArgNames.length` on `wrapList`'s answer). Cost measured as a same-tree A/B over
  two seeds: **1 of 10,355 files** reformats (`tests/cases/arrays/map-struct-to-struct.vl`, a
  92-column three-link chain), **0 under `compiler/`/`std/`/`scripts/`**. Five corpus cases plus
  two `vl_fmt_test.ts` pins; LSP untouched. DECISIONS.md §"A leading `.` on a new line continues
  the chain". A consequence for the matcher-location ruling above: with the matcher on its own
  line the failure's LINE moves too, not just its column.
- **Colored `print`** — ruled in principle 2026-09-01 with one hard constraint (ANSI must
  never leak into pipes/files/copies): Node's split — bare strings always raw, rendered
  values colored, escapes emitted only by the TTY-detected sink, `NO_COLOR`/`--color`
  honored, renderer strings stay ANSI-free forever. Full policy + staging in
  `docs/serde-design.md` §"Print, templates, and color". Stage C0 (primitive coloring,
  host-side, small) can land any time; composite coloring rides serde Stage 2.
- **Reference identity — RULED 2026-09-01, ten decisions taken one at a time**
  (`docs/identity-design.md` §0 carries the rulings, `docs/internals/identity-critique-synthesis.md`
  the evidence). `===`/`!==` on every reference kind INCLUDING functions — inverted from A15's
  old text: `==` on a function is now a check error; `Map`/`Set` keys structural and
  `==`-comparable (the Rust-style field restriction was REFUSED — NaN keys are Go's unreachable
  entry, recorded in the header); `IdentityMap`/`IdentitySet` as concrete types that SATISFY
  `{[K]: V}` (the critics' "off the interface" was refused: the index-signature is the
  capability, and a signature names the concrete type when it wants one); the serial deferred
  until a program measures the scan as a problem. Two things the ruling asked for that do not
  exist today ride along: concrete `Map<K, V>`/`Set<T>` names as annotation types, and
  `Map<string, i32>()` explicit type arguments. Build items in ship order under **A15**; the
  operator is routed to vl-de.

### Awaiting owner rulings (durable list; each row names its doc)

- **Constraints / nameable bounds — DONE 2026-09-01 (#2217).** Shipped whole:
  `{ toString(): string }` call-shape members, `<T: Showable>` and inline bounds,
  expression satisfaction (field first, then UFCS), strict bodies, whole-program
  coherence, and bound chaining by subsumption. `docs/constraints-design.md` §7 is the
  record — read §7.5 first, it lists what the plan did not know. Root fix for D952's
  wordless refusal at the BOUNDED spelling, and it closed D1001 (an unsatisfied
  instantiation was check-clean invalid wasm). The D976 substrate was NOT used and the
  reason is measured: the checker's inferred-shape column does not survive into emit, so
  bounds ride the ANNOTATION path instead. Follow-ups filed rather than folded in:
  **D1002 and D1005 have since CLOSED (2026-09-02)** — a generic body's member dispatch is
  now decided per instantiation (the rewrite asks the call sites what the body cannot
  answer) and the UFCS receiver's fit is re-asked at the pin by a ninth deferred table
  (`ufcsCstr*`) with a field-precedence guard; **D1063** is the residue those two named,
  the disagreeing instantiation pair that shares one AST node. Still open from this list:
  D1004 (the wordless member-access diagnostic on an unbounded `<T>`) and LSP bound-member
  completion/hover on `x: T`.
- **Track-caller — DONE 2026-09-01 (#2235); the ANCHOR moved to the matcher 2026-09-02
  (#2386), so the `expect`-token findings below are the landing's, not today's.** Both halves
  have shipped. The std side is
  three things and no compiler change: `export type CallerLoc = { file: string, line: i32,
  col: i32 }` in `std:test`, the track-caller parameter (`caller: CallerLoc = __callsite__`,
  on `expect` as it landed and on each MATCHER since), and a
  second line on the failure message reading `  at <file>:<line>:<col>`. The editor payoff is
  D9 slot 12, which this SUPERSEDES rather than completes — the heuristic queued there was
  never written. What the landing measured, all of it new:
  - the alias satisfies the intrinsic with **no compiler change**, confirmed both ways (a
    user-declared alias of the same three fields takes `__callsite__` too);
  - the extra parameter survives monomorphization at **14 of 14** receiver classes — i32,
    i64, f64, boolean, string, struct, `i32[]`, `string[]`, `Circle[]`, a literal union, a
    value union, and nullable i32/i64/f64 — every one reporting an exact position;
  - **one hop, measured four ways**: a helper that forwards its own `caller` reports its
    CALLER, one that does not reports its own assertion (in the helper's FILE), a GENERIC
    helper forwards correctly at two instantiations, and an explicit `CallerLoc` literal is
    just an argument. Still true after #2386; only the hand-in point moved, from
    `expect(v, caller)` to `expect(v).toEqual(1, caller)`;
  - the anchor was the `expect` token at every spelling — `expect(x).toEqual(y)`,
    `expect(x).not().toEqual(y)` and the non-UFCS `toEqual(expect(x), y)` all reported the
    `expect(`, never the `.toEqual` and never the `it` line. **Reversed the next day by the
    owner's matcher ruling (#2386)**: every one of those three now reports its MATCHER
    token, and a chain broken over lines reports the matcher's LINE;
  - cost: **+325 bytes** (5,873 → 6,198) on a one-assertion module unoptimized, and
    **byte-identical at `-O3`** (596 bytes both ways — Heap2Local scalarizes the struct, the
    DECISIONS finding for `__callsite__` reproduced through std); ~11 ns per PASSING assertion
    (10M iterations: ~0.33 s → ~0.44 s), which is the receipt copy plus the call-site
    `struct.new`.
  Deliberately NOT in it, and each is a separate surface decision rather than a rider:
  `fail(msg)` takes no location (its argument is the author's own sentence), `it`/`describe`
  keep their signatures (a registration site is not an assertion site), and the
  `--strip-locations` opt-out below is still the recommendation and not the state.
- **Track-caller — expanded brief (owner asked for more detail, 2026-09-01).** The
  mechanism: a magic parameter TYPE — a std `CallerLoc` (module key + line + col; the
  compiler holds all three at any call site) whose trailing parameter is SYNTHESIZED at
  each call site when the caller omits it. Survey: Rust `#[track_caller]` (attribute +
  hidden Location + fn-pointer shims), Swift `#line`/C++ `source_location` (magic DEFAULT
  ARGUMENTS — needs default args, a far bigger VL feature), JS stack parsing (no wasm
  stacks), Zig `@src()` (callee-side, wrong thing). Three clean properties: NO
  transitivity machinery (synthesis is a default; a wrapper forwards its own `caller`
  EXPLICITLY — ordinary code); indirect calls are honest if `CallerLoc` is legal in
  function TYPES (the call site's own location is synthesized — the compiler always
  knows the site even when the callee is dynamic); cost is three constant-folded scalars
  per opted-in call. The sharp edge: `(i32) => void` and `(i32, CallerLoc) => void` are
  DIFFERENT types, so a marked function is not a drop-in where an unmarked fn value is
  expected (matchers are never taken as values in practice). WASM-TRACE LANE, asked and answered
  (2026-09-01): standards exist — the name section (today's trap output already shows
  `vl!takes` via wasmtime symbolizing it), DWARF-for-wasm (devtools/wasmtime
  source-level), the spec's frame-text convention, the EH proposal — but they are
  host-mediated CRASH forensics in engine-dependent formats; none can put a position in
  `expect`'s own message string. Rust ships BOTH lanes (DWARF panics + track_caller)
  because they answer different questions; a future DWARF emission is a separate
  debugger-scale item this does not preclude. MODE FLAG, asked and answered: per-mode
  defaults (on for test, flag for run/build) make `CallerLoc` — a READABLE value — mean
  different things per mode, which the dual-run bar itself would flag as divergence;
  recommended instead: synthesis uniformly ON everywhere (one semantics, reproducible
  messages) + an explicit `--strip-locations` opt-OUT for release (size + the real
  concern, source-structure leakage in shipped binaries — Rust's remap-path precedent),
  documented as output-changing like `--color=always`. DECISIONS: (a) adopt the
  param-type mechanism; (b) allow `CallerLoc` in function types; (c) accept the
  not-a-drop-in consequence; (d) uniform-on + `--strip-locations` over per-mode
  defaults. ROUND 3 (owner: "explicit CallerLoc opt-in seems very
  ugly — is this standard?"): the VISIBLE PARAMETER is the majority spelling — Swift
  (`file: StaticString = #file`, XCTest's whole surface), C++20
  (`std::source_location::current()` as a default), C# (`[CallerLineNumber] int line
  = 0`), Zig (fully explicit `@src()` at every call) all put it in the signature; only
  Rust hides it, at the cost of attribute machinery + fn-pointer shims; wasm's only role
  is closing the runtime-introspection lane (Python/JS/Java frames). The structural
  complaint is real though: Swift/C++/C# express the magic through DEFAULT ARGUMENTS —
  a general feature + one callsite intrinsic — where the magic-type proposal fuses them
  into a one-type special case. RECOMMENDATION SUPERSEDING THE MECHANISM CHOICE:
  **default arguments v1 first, track-caller as their first customer.** v1 scope:
  trailing params only; defaults evaluated AT THE CALL SITE in the caller's context
  (the Swift/C++ semantics — required for `__callsite__`); default expressions
  restricted to literals, module-scope consts, and `__callsite__` (legal only as a
  default value); fixed-arity ABI preserved (compiler fills omitted args — no overload
  resolution enters the language); a defaulted function VALUE carries its full
  signature (not a drop-in where the shorter fn type is expected — same edge either
  way). Independent justification: std has NO deprecation story, and trailing defaults
  make std evolution ADDITIVE (a shipped function can grow an options param without
  breaking a caller) — structural relief for a version-locked std. Then track-caller is
  one std line: `expect(value: T, caller: CallerLoc = __callsite__)` — magic visible as
  one literal in one place vs an invisible rule about a type name; everything
  downstream (call sites, explicit forwarding in wrappers, failure output, the
  fn-value edge) is byte-identical between the two spellings. Sequencing: behind
  constraints Phase 1's merge (two concurrent typecheck features is the measured
  rebase-pain ceiling). RULED (owner, 2026-09-01, "let's do A — schedule in
  defaults, then we can do tracking"): DEFAULT ARGUMENTS v1 at the scope above, then
  track-caller as their first customer (`expect(value: T, caller: CallerLoc =
  __callsite__)`). One-hop semantics confirmed with the owner: a CallerLoc is one
  location, never a chain (the chain is the parked trace lane); std may later thread a
  breadcrumb parent field as a library pattern, no language addition.
  **HALF ONE IS DONE AND TRACK-CALLER IS UNBLOCKED (#2225).** Default arguments v1 shipped
  complete — see B15a — including the `__callsite__` intrinsic itself, typed structurally
  against `{ file: string, line: i32, col: i32 }` so a std `type CallerLoc = { file: string,
  line: i32, col: i32 }` satisfies it with NO compiler change. **THE STD SIDE HAS SINCE
  SHIPPED TOO — see the DONE row at the top of this group (#2235)**; what this paragraph
  described as remaining is done, and the editor anchor with it. Two facts the defaults
  landing measured that the follow-up inherited, both confirmed by it: the location's `file`
  is the CALLER's module KEY (`""` for a single-source compile with no module table — a
  `vl test` run always has one, and a file importing `std:test` is a module table by
  construction, measured), and the position is the CALLEE's own anchor token, which is
  the `expect` line the row exists to report. The `--strip-locations` opt-out and the
  uniform-on decision are NOT built and are still the recommendation, not the state. The
  editor-side single-expect anchor was D9 slot 12; it needed no ruling and was never built —
  this superseded it.
- **`vl test --trace` inline run values** — RULED low priority (owner, 2026-09-01,
  "low prio I guess"): keep parked; an emitter flag instrumenting USER programs (never
  the compiler) logging `(site, value)` pairs, extension renders decorations after a
  run. Revisit when the test-debugging story matters more than new surface.
- **`vl compile` → standalone executable** — RULED low priority (owner, 2026-09-01):
  parked from the CLI overhaul (#2080); no design written, none owed until revisited.
- ~~D971~~ — RESOLVED without a ruling, hours after this ledger was written (the
  one-directional staleness this file warns about): the refusal's sentence described a
  calling convention the emitter does not use — a lifted capturing instance already
  takes its env as the leading param and `emitDirectCall` already pushes it. Closed by
  DELETING the refusal; capability probes 9/9.
- **serde OQ-1..OQ-11** (`docs/serde-design.md` §Open questions) — **decisions A–G RULED
  2026-09-01** ("Recommendations all sound reasonable to me"), after the three-lens critique
  panel (consistency / cross-language / performance) + synthesis,
  `docs/internals/serde-critique-synthesis.md`. Architecture holds. One clause each:
  **(A)** reject unknown fields, exact case-sensitive matching, reject duplicate keys, always
  emit `"f": null` → new **OQ-8**;
  **(B)** `i64` is always a JSON NUMBER, never a decimal string → new **OQ-9**
  (`parseI64`/`parseI32` land separately; the I-JSON framing was NOT verified and the ruling
  does not rest on it);
  **(C)** untagged arms must differ in FIRST TOKEN or REQUIRED KEY SET → **OQ-7** amended;
  **(D)** build the static acyclic-shape predicate + depth-cap floor + N/4N timing probe →
  §Cycles, with reference-identity keys split out as **OQ-11** (a language question — since
  RULED yes, identity 2026-09-01: the seen-set is an `IdentitySet<T>`, A15 item 4) and
  `serializeUnchecked` still deferred;
  **(E)** VLB header carries an 8-byte wire-relevant shape fingerprint → new **OQ-10**;
  **(F)** **OQ-6 REVERSED** — newtypes accepted transparently, erased at emit, brand kept by
  the checker (the `Buf`/address hazard is its open remainder);
  **(G)** **Stage 1 is UNBLOCKED and SCHEDULED** — `std:json` v1 is a real `Json` VALUE TREE
  plus a parser and a renderer, not a pull lexer with hand codecs; §Approach 1 is being
  re-derived with a POSITION axis as separate in-flight work. **Its SURFACE is now
  proposed — `docs/json-design.md` (2026-09-01): `Json` / `JsonError { at, kind, msg }` /
  `parseJson(self: string): Json | JsonError` / `toJson(self: Json): string | JsonError`,
  compact, `f64` numbers, `nonfinite` render error, depth cap 128, strict per ruling A.**
  Owner's seven answers are its §0. **CRITIQUED 2026-09-01** — three Opus critiques (std
  #2302, crosslang #2305, usability #2306) synthesised in
  `docs/internals/json-critique-synthesis.md`; the unanimous and measured changes are
  written into the design (`JsonError` gains `path` as its distinguishing fourth field,
  `1e999` refused at parse, `-0` rendered, I-JSON profile, depth cap 128 measured at ~8×
  margin, `toJsonPretty`/`jsonKind` named as WHAT IS NOT HERE), and **§6 holds the questions the
  owner still has to rule**: ~~helpers (recommended: one `jsonPointer`, RFC 6901, `kind:
  "missing"`)~~ — **q1 RULED 2026-09-02: none; the decoder is deep `is`/`as` (bullet
  above)** — ~~`asExactI32` in `std:fmt` + whether `f64 as i32` saturates~~ — **q2 RULED
  2026-09-02: no helper, numeric `as` is exact-or-fail under the trio (bullet below)** —
  and ~~whether `string | "err"` collapses (D1024)~~ — **q3 RULED 2026-09-02: it
  collapses, per arm, after flattening, through aliases (bullet below); §6 is fully ruled**. **v1 BUILT — #2322 (2026-09-02)**, reviewed by
  `std-api-reviewer` (MERGE AFTER FIXES, ten findings, all header text, all taken); building
  it filed D1029–D1034. Three more gaps filed by the critique
  round: D1025 (a map subscript mints no narrowing key — the usability critique's gap A,
  check-clean invalid wasm at an integer-literal key), D1026 (a null-bearing alias
  composed with `| null` — CLOSED #2312 for its witness), D1027 (the `Json | null`
  signature D1026 was filed for is STILL refused after that fold: recursion is a second
  ingredient; re-graded identical after D1021 closed, so its own mechanism) and D1028 (a
  NAMED alias of the composition, `type JR = Json | E`, delivered the recursive alias's
  value arms raw while the direct spelling ran — CLOSED #2318). **Measuring it found the blocker: D1021
  — `Json | JsonError`, the ruled fs-shaped return, was check-clean INVALID WASM because a
  recursive alias did not compose into a wider union — CLOSED #2315** (probe
  `scripts/capability-probes/recursive-union-alias-composed.vl` now RUNS). The API was NOT
  bent around it (a carrier struct ran and was declined — std has no deprecation story);
  the builder is unblocked (briefed 2026-09-02 on the ruled core). Also filed: D1022 (named arm
  aliases `JsonObject`/`JsonArray` in a recursive union — readability, not blocking).
  Still open in that section: OQ-2/OQ-3/OQ-4 (full briefs with recommendations, awaiting a
  ruling). Engineering fallout filed: D1008 (`u8[]` struct field, clause 2),
  D1009/D1010 (`null` membership in a recursive union at the checker — stage 1 ships around
  both with one-line workarounds), D1011 (host `print` of an f64 breaks a halfway tie
  to odd where `toString` and the spec round to even; host-side, #2248), plus the routing table in the
  synthesis (print≠toString f64, `type Dec<T> = (Lex) => T`, `parseI64`, `fromUtf8` view,
  seeded string hash, stage clause table).


> **Destringify types — CLOSED, nothing to schedule.** Verified 2026-08-25 against the programme's
> own standing check (`docs/internals/destringify-types-program.md` § "How to verify"): both greps
> pass. Do not re-open it from a stale call-site census; run that check first.
>
> **The one forward question it leaves — now PRICED, still unstarted** (Modernization program item
> 4; `docs/internals/registry-by-type-id.md`, 2026-09-02): the emitter's registries are keyed on the
> canon-SOFTENED spelling because that is the REP, not the type. Measured over 2,389 registered
> union rows, **neither candidate key in the tree works**: the arena index is not an identity, and
> `repCanonId` merges **360 row pairs** the positional box-tag ABI needs apart (63 with different
> member sets) while SPLITTING a nested union from its flattening — which is #2406-d2 exactly. The
> answer is a new interned rep key minted by canon once, that every producer obtains rather than
> renders; the shim shows the cheap version closes 1 of 5 filed witness rows, because a MISSING
> REGISTRATION (D1042 row 1, D1112) is not a key question and a PRODUCER DISAGREEMENT is.
> **65% of the 81 name-keyed sites are NAME-ONLY** — the name was cut from another name — and
> `registerInlineUnion` recurses on such a cut at 11 of its 18 sites, which is B277 one layer up.
>
> **Before scheduling any remaining boundary-parse cleanup**, ask B277's second question (does the
> split relocate the work, or remove it?). `registerInlineUnion` is 8,696 reaches and was REFUSED on
> exactly that ground — the measured win is 793 — and the tail below 1,300 has not been re-asked.

### Consumer-driven requirements — webcraft (`docs/webcraft-requirements.md`)

The first real downstream consumer, currently TS with a planned VL rewrite, has published a tiered
ask keyed to **our own item IDs** (A14, A16, B6a, B15a, B-mem, B-hint). Its tiers are adopted as-is
rather than re-derived. The forcing date is **M7** (the port begins); M2–M6 gate on nothing from us.

> **No open ask as of 2026-08-25.** A1/A2 shipped, A5 answered, and every A3 row is shipped or
> non-reproducing; only field-position UFCS remains and webcraft agrees our reject is right. Their
> priority order lives in `~/webcraft/docs/design/vl-requirements.md` § "Remaining asks, prioritized"
> — a different repo, and the authority. **Re-run an ask before scheduling it**: across two passes,
> six rows filed here as live work were already fixed.

**P0 — gates the port STARTING. The `Buffer` linear-memory tier (our B-mem, "one deliberate escape
hatch"). ALL FOUR SHIP; this tier is CLOSED.** They were prerequisites for each other in practice,
which is why they closed in order rather than in parallel.
- ✅ **P0.1 `Buffer` alloc + the full load/store width matrix** — CLOSED (#1275 shipped the last
  compiler half). **8 load widths** (`__load_i8__`, `__load_u8__`, `__load_i16__`, `__load_u16__`,
  `__load_i32__`, `__load_i64__`, `__load_f32__`, `__load_f64__`) and **6 store widths** (the four
  wide ones plus `__store_i8__`/`__store_i16__` → `i32.store8`/`i32.store16`), plus
  `__memory_size__`/`__memory_grow__` and the emitter's first `0xfc` opcodes
  `__memory_copy__`/`__memory_fill__` — all single instructions, verified by disassembly. Every
  scalar VL has round-trips at its own width. **Bulk `len` is UNSIGNED**: a negative length TRAPS
  where the old std emulation loops silently no-op'd, and `std:buffer` guards it. Overlap is pinned
  as memmove semantics (both directions, with the inverted forward-loop control).
  The allocator and the `Buffer` type ship in **`std:buffer`, not the compiler** (O1 = (c), owner's
  ruling): `Buffer(n)` bump-allocates with lazy `memory.grow`, `Buf = { base, length }`, reclamation
  is `bufferMark()`/`bufferRelease(mark)` (O6 — LIFO, no per-object free, **and a `Buf` held across a
  release is a dangling reference into linear memory: silent corruption, not a trap**). O5 = lazy
  growth with NO epoch export — the host re-takes its typed-array views after any allocating call and
  detects staleness via `byteLength === 0`, which is what the ecosystem already does.
  **The capture bug (§B3/O7) that blocked every `Buffer` METHOD is fixed**: `capScan` exempts a
  builtin/intrinsic in CALLEE POSITION (#1172) and now reads the checker's own reservation list, so
  a named function wrapping any memory intrinsic emits in a module that uses a function value.
  *(Two prior versions of this row were measured stale in opposite directions — first "4 store
  widths, 1 load width" (it counted DECLARATIONS in `compiler/wasmBuiltins.ts`, deleted by kill-TS
  #466), then "the allocator and the bulk ops have not shipped" with O1/O5/O6 called unruled, all
  four claims false by then. **Re-derive a P0 row against `std/buffer.vl` and `compiler/typecheck.vl`
  before quoting it** — this tier's rows have gone stale faster than any others in this file.)*
  `docs/internals/buffer-design.md` §A1 (probe table), §I (stores), §J (S5/S6).
- ✅ **P0.2 Exported memory** — replaces the per-scalar host-call ABI for bulk data; the host
  overlays `Float32Array`/`DataView` in place, and nothing else in the export contract changes.
  The module's linear memory is exported as `memory`, automatically,
  gated on the memory existing at all (the same `memUsed` flag that emits the memory section), so a
  program that never touches linear memory is byte-identical to before. A memory-only module now
  emits an export section, which it previously skipped entirely. A user function exported as
  `memory` in a memory-using program is a loud compile error (O4 ruled (i)). No host change was
  required — wasmtime, the JS import shape, `wasm-opt` and `wasm-dis` all already tolerated an
  exported memory; proved from both hosts (`tests/vl_exported_memory_test.ts` overlays
  `Float32Array`/`DataView` on `instance.exports.memory.buffer` and reads guest bytes in place).
  **A `memory.grow` DETACHES every host view**: `byteLength` goes to 0 and an indexed read returns
  `undefined` rather than throwing, so a JS host must re-read `.buffer` after any call that can grow.
  That contract is asserted by test, not merely documented. (In a Rust/wasmtime host the same hazard
  is a borrow-check error instead — measured.)
- ✅ **P0.3 Reinterpret casts** — `f32bits`/`f32fromBits`/`f64bits`/`f64fromBits`, one opcode each.
- ✅ **P0.4 Float/int opcode intrinsics** — f32/f64 `sqrt abs floor ceil trunc nearest min max
  copysign`; i32/i64 `clz ctz popcnt rotl rotr` + unsigned `divU remU ltU leU gtU geU`. Free
  functions, width taken from the operands, shadowable by a program's own function of the same name.
  `sin/cos/pow/exp` stay a deliberate non-ask — no wasm opcode computes one, so any std `sin` would
  be a policy choice in its last bit, i.e. a determinism trap.

**P1 — gates the port being GOOD.**
- ✅ **P1.1 Typed views over Buffer** (`buf.f32view(off, count)`, `.length`, `x[i]`, `x[i] = v`) —
  the kernel is structure-of-arrays; this was "the thing most worth absorbing into the language".
  The views are `std:buffer` with **zero compiler lines**; the BRACKET is B14's free index
  operators, which land it for every user type at once. `buffer-design.md` §L,
  `index-operator-design.md`.
- 🟡 **P1.2 `flat` record layouts (AoS)** — declared field order = layout, fixed sizes, no reordering,
  scalars and nested `flat` only. The C-struct tier **WasmGC structurally cannot provide**. Forcing
  customer is a Lua 5.3 VM needing bit-exact `pairs()` order. The DECLARATION half ships:
  `flat type TValue = { value: i64, tt: i32, pad: i32 }` is validated (scalars, newtypes over
  scalars, nested `flat`) and MEASURED, and the layout is readable as `TValue.size` /
  `TValue.tt` — checker-folded constants, so **no emitter file changed** and a `flat` declaration
  emits byte-identically to the same one without it. **No implicit padding**: offsets are the
  running sum of declared widths (the spec's own explicit `pad` field is the argument, and
  unaligned access is legal in wasm). **THE FUSION HALF IS DONE (#1317) — and it needed ZERO
  compiler lines**: `"[]"` returns a row ADDRESS (a newtype over `i32`) rather than a row, so there
  is no row to fuse away and `.tt()` is an offset load off an integer. `st[i].tt()` is `cmp`-identical
  to the hand-written `tt(slotAt(st, i))` at both `-O0` and `-O3 --closed-world`, where both
  accessors inline away entirely. The doc's "the bracket deletes two accessors per field" was
  corrected by building it: it deletes none — it deletes the CONTAINER axis (N×M → N+M).
  **`T.size` FOR A TYPE PARAMETER SHIPPED (#1329)** — `T.size` / `T.<field>` are legal wherever `T`
  is a live type parameter: the checker types them `i32` and leaves the node standing, and the
  MONOMORPHIZER folds them once per instance against that instance's binding. Verified on shapes
  outside the fixture (`{x:i32,y:i32}` → 8, `{p:i64,q:i32,r:i32}` → 16, that type's `q` → 8).
  **Of the two filed blockers, one was never a blocker**: generic `flat` DECLARATIONS are unrelated,
  because the records `rows<T>` indexes are concrete. Generic `flat` decls remain rejected by design.
  **SUB-BYTE AND BYTE-MULTIPLE FIELD WIDTHS — RULED (owner, 2026-08-22), not yet built.**
  `flat` accepts only `i32`/`i64`/`f32`/`f64`, newtypes over those, and nested `flat`, **so a byte
  field costs four bytes and `flat` cannot express a C struct containing a `uint8_t`** — which is
  the job it exists for. It gains STORAGE widths: byte-multiple (`u8`/`i8`/`u16`/`i16`, the same
  packed-storage feature `u8[]` needs — see B7 and the `u8[]` work) and **sub-byte
  (`u1`…`u7`)**, so a wire format spells itself: `flat type Header = { ver: u1, ext: u1, kind: u6 }`
  is ONE byte and self-documenting where today it is a `u8` plus a comment.
  **`boolean` becomes legal at 1 bit** — it rejects today only because it has no defined width,
  and `{ ver: boolean, ext: boolean, kind: u6 }` reads better than `u1` for a flag.
  **THE COMPILER FOLDS THE LAYOUT, THE USER WRITES THE SHIFT** (owner: *"100% accept shift/mask
  to read/write"*). `Header.kind` / `Header.kind_shift` / `Header.kind_mask` are checker-folded
  constants — the same running-sum machinery, over BITS instead of bytes — and access stays
  explicit (`getBits(__load_u8__(a + Header.kind), Header.kind_shift, Header.kind_mask)`).
  **So this needs NO emitter change**, exactly like `flat` today; the error-prone half (which byte,
  which shift, which mask) is computed from the declaration and the mechanical half stays visible.
  GENERATED accessors (`h.kind` doing the shift for you) are the expensive half and are
  deliberately NOT taken — additive later if the explicit form grates once a real decoder is
  written.
  Two rules attached: **a field may not straddle a byte boundary** (a compile error naming explicit
  padding as the remedy — the same discipline as `flat`'s no-implicit-padding rule, and it sidesteps
  the worst of C's ambiguity), and **bits pack MSB-first within a byte**, matching how RFC-style
  specs number them (IP's version field is the top four bits).
  *Why this is safe where C bitfields are not:* C's are cursed because **C** does not specify bit
  order, so they cannot port a C struct bit-exactly. A binary FORMAT does specify it, so decoding
  one is a different job with a definite answer — the objection does not transfer. Rust, Go, Swift
  and C# all declined bitfields; Zig took them with a specified layout, which is the model to copy
  if generated accessors are ever built. The honest width set is bounded by what widens losslessly
  into the next value type: `u8`/`i8`/`u16`/`i16` → `i32`, and `u32` would need `i64` while `u64`
  fits nothing — so byte-multiples stop at 16 bits.
  REMAINING for `buf.rows<T>` is the BRAND alone, and it is subtler than filed: letting the
  operator's return be a type parameter so the container names the brand *compiles, runs and reads
  the right bytes* — and proves nothing, because the discriminating witness is the one where the
  brands are supposed to STOP a wrong program, and that is where it fails. Filed with the witness in
  `docs/internals/flat-records-design.md` §11.3.
- 🟡 **P1.3 Optimization defaults** — the PROFILE ships (#1318): `vl build -O3` runs
  `wasm-opt --closed-world -O3 --gufa -O3`, `-O` is unchanged, and a missing `wasm-opt` stays a soft
  no-op.
  **RULED 2026-08-18 — both knobs, see `DECISIONS.md` and `open-rulings.md`'s Ruled section.**
  `-O3` STAYS the release rung: at a 5% materiality floor the 46-row three-rung sweep has `-O3`
  better on **12** rows and worse on **4** (`sort-heap` 1.37x, then three at ~1.05x), so the nominal
  23/23 split is noise and one row is not allowed to set the default. The standing instruction below
  — *do not answer with a single recommended flag until the split is fixed or documented as the
  answer* — is satisfied by **documenting it**: `sort-heap` becomes the named exception in
  `cli-design.md`, and `bench/results/summary.md` gains the `-O` column it still lacks. The binaryen
  inline budget is a **build flag, never a default** (+82% bytes / +127% `wasm-opt` time on the
  compiler for zero self-compile gain; same shape as C10). **Direction:** internalize optimization so
  it can be applied selectively, gated on OVERALL self-compile time — which makes P9 decidable, since
  the shipped seed `build/vl-compiler.wasm` is 1,224,039 B, i.e. UNOPTIMISED, exactly the rung where
  P9 is worth 5.6%.
  **THE ASK IS "OPTIMIZATION DEFAULTS" AND THE HONEST ANSWER IS THAT THE BEST RUNG IS PER-PROGRAM.**
  `bench/run.sh` built the default and `-O3` and **never plain `-O`**, so every "`-O3` recovers Nx"
  figure in `perf-landscape.md` means *versus unoptimized*, not *versus the best rung available* — a
  question this suite had never asked. A three-rung sweep over all 46 benchmarks says `-O3` is not
  uniformly the answer, and separates two failure modes the two-rung harness reported identically:
  **`OPT-LOSES`** (both optimized rungs worse than none — 7 rows, headed by `arith/mixed-width` at
  **2.23×**, where the *unoptimized* build is 212 ms against Rust's 188; already ruled UPSTREAM by
  #1325, since bare `-O` carries it identically) and **`O3-WORSE-THAN-O`** (`-O` is the best rung and
  `-O3` hands the win back — `arrays/sort-heap` 854 / **648** / 837, which #1325's ruling does NOT
  cover and which IS a profile question). Both flags now ship in the harness with the `-O` column.
  `-O3` still wins big where it wins (`lambda-hot` 2.2× over `-O`, `dispatch-table` 1.43×). See
  `perf-landscape.md` §2.4a and §P11. **Do not answer this ask with a single recommended flag until
  the per-program split is either fixed or documented as the answer.**
  Two further measured findings invert the ask. **(a) Heap2Local is the wrong lever** — `-O3`
  open-world leaves all four allocations of the canonical union box and naming `--heap2local`
  explicitly changes nothing at any rung, while `--closed-world -O` melts all four; the box melts by
  closed-world type refinement + DCE, not escape analysis. `--gufa` is measurably INERT on VL output
  (0 allocations and 0 `ref.cast`s removed, on the fixtures and on the 1.1 MB compiler alike) and is
  shipped only because P1.3 names it. **(b) REMAINING, and it is the half that matters:** the union
  box does NOT melt once the narrowed value is READ. The 4→0 row is measured on allocate-tag-test-
  discard; `if e is Unit { e.hp }` — what a sim writes — is 4→4 at every rung, and a struct union is
  4→2 even tag-only. The `{backing,len,cap}` wrapper half IS delivered (melts completely). Pinned at
  4/4/4 by `opt-melt/union-box-payload-read`. `docs/internals/opt-profile-design.md`.
  **#1320 CORRECTS THE RULE AND CHEAPENS THE FIX.** The discriminator is allocation SITES, not
  consumption: at ONE site the box melts whatever is done with it (2→0 read or unread); only at ≥2
  sites does a payload read keep it alive. VL emits one site per union ARM, so a two-armed helper is
  two sites — which is the whole reason the rows above read as they do. **An unboxed rep is REFUSED
  by measurement** (16 hand-written WAT modules: `ref.i31`, a payload-typed box and a tagless
  `ref.test` box each halve 4→2 and then stop), and so is a documented source pattern — no VL
  spelling reaches one site (`if`-expression and let-on-two-branches both stay 4→4, verified
  independently). **The fix is an emitter-side RETURN-PATH BOX-SINK** — 309 corpus sites, two locals
  and one exit block per union-returning function, touching no field-0 read, no tag band, no sig
  token, no boundary and no checker; measured 2.0–2.2× on WAT. A16 remains irrelevant to this row.
  `docs/internals/unboxed-union-rep-design.md` is the design record.
  **PHASE 1 SHIPPED (#1322)**: the return path builds the box ONCE — 2 sites → 1 per two-armed
  producer, 78 removed over 76 functions. **Quote the win with its optimizer level or not at all**:
  plain `vl build` is a WASH (535 → 530 ms), `-O` is **1.76×** (304 → 173), `-O3` 1.66×. The sink
  removes a MERGE POINT, not an allocation, so Heap2Local must be there to collect. It also melts a
  rung EARLIER than predicted (plain `-O`, no `--closed-world`/`--gufa`) — the ceiling was the site
  count, never binaryen.
  **THE RETURNED IF-EXPRESSION SHIPPED (#1337)**: it lowers as per-arm exits through the same
  peephole — 4 sites over 3 modules, and the two spellings of one program now read the same.
  **THE BINDING SHIPPED**: `const u: A | B = if c { a } else { b }` reaches ONE site — box sites
  **1,551 → 1,498 corpus-wide (53 removed over 6 modules)**, +55 B (+0.0022%), 6 up 0 down. That
  shape had THREE sites, not two: the binding's slot is a non-null `(ref $uBox)`, so a null box was
  pre-seeded before the `if` for definite assignment and overwritten on every path. The single
  post-`if` store dominates every read, so the pre-seed goes too. **The rung story is DIFFERENT for
  this one and must not be quoted as phase 1's**: it removes an ALLOCATION, not just a merge point,
  so plain `vl build` is **1.36×** (750 → 551 ms CPU, min-of-7) where phase 1 was a wash; `-O` is
  1.68×, `-O3` 1.50×. Both sinks share one reserved local pair.
  REMAINING: **a `let` written from an init and a LATER assignment** (`union-box-branch-local`,
  4/4/2) is NOT a sink — its two writes have no merge point, and collapsing it means holding the
  tag/payload pair across a liveness window, i.e. §6's refused candidate (c). Measured and filed in
  `unboxed-union-rep-design.md` §12.4. Then the payload box itself, which needs a single payload
  type to reach zero allocations.
- ✅ **P1.4 Bounds-check ergonomics** — not asking for unsafe access; asking that the canonical
  view loop either hoists the bound or relies on the memory trap, **and that this is stated** so
  kernel code can be written to the fast pattern deliberately. **ANSWERED, and the answer is that
  NO rung hoists it.** At `-O3` the whole kernel inlines into one loop and the body still executes
  `i < 0 → unreachable` and `i >= len → unreachable` **per access** — the second being the exact
  negation of the loop guard four instructions above it, which binaryen does not eliminate (nor does
  it learn `i >= 0` from `i = 0` plus increment). Trap count inside the loop is **exactly
  2 × accesses/iteration**: 2 read-only, 4 read-modify-write, 6 for `y[i] += x[i]*dt`.
  **This could not have been answered by timing** — the checks are perfectly predicted, and
  `scale-view` at `-O3` reads the same as a hand-hoisted bare-intrinsic kernel (0.444 vs 0.428 ns).
  **The check is not what costs; the DESCRIPTOR FIELD RELOAD is, and it is a whole-program
  property.** The two-view kernel reloads `base`/`length` **7× per element**; the one-view kernels
  reload **0**. Measured by attribution, not inferred: six hand-written compares over hoisted
  base/extent cost 0.140 ns, the seven reloads 1.095 ns — the fence is **11%** of the excess, the
  reload **89%**. (Re-derived on three byte-identical-but-for-one-axis modules: 90.3% / 9.7%.) That
  corrects §L4's "attributed, not proven" residual by **4×** (0.27 → 1.2 ns).
  **The follow-on filed here as B6b's "backing-pointer LICM" is REFUTED as an emitter item, and the
  mechanism first written down was wrong.** It is not GUFA folding a single live view's fields: the
  fast kernels collapse to TWO functions and ONE `struct.new` because `f32view` gets inlined and
  Heap2Local melts the descriptor outright, while `axpy` keeps four functions and two allocations.
  The axis is the INLINING BUDGET, not the view count — `scale-seedtwice` (one view, one column, the
  same kernel, an idempotent helper called twice) runs **3.05×** slower at `-O3`, and two descriptors
  that AGREE on both fields stay fast. Nor can the emitter hoist: six of the seven reads live inside
  `std:buffer`'s `getF32`/`setF32` and only enter the loop when binaryen inlines them, and binaryen's
  own `licm` moves only TOP-LEVEL loop-body statements (proved by a two-function probe where `--licm`
  hoists 3/3 from the top-level spelling and 0/3 from the nested one), so hoisting the single
  user-written read is worth **2.9%**. What works is `--always-inline-max-function-size=60` — 0
  reads, 0 allocations, 1.736 → 0.636 ns/elem — at **+82% module size and +127% `wasm-opt` time on
  the 1.16 MB compiler**, which routes the question to the optimization-defaults row rather than
  here. Pinned by `tests/vl_view_descriptor_melt_test.ts`.
  **The stated fast pattern needs no rung**: hoist `byteAddrF32(0)` and `.length`, then bare
  `__load_f32__`/`__store_f32__` — 0.296–0.500 ns on all four shapes at all three rungs. And the
  fence is **not** a trade: hoisting base/extent while keeping `if i < 0 || i >= n { __trap__() }`
  inline is fully fenced at **1.35×** raw, versus 4.1× through the accessors.
  Also corrected: **`x[i]` is NOT byte-identical to `x.getF32(i)`** — it calls `"[]"`, which calls
  `getF32`, an extra frame worth **0.855 ns/element (31%)** at the flagless rung.
  Pinned by `tests/vl_buffer_view_bounds_shape_test.ts` (per-kernel per-rung goldens **plus three
  contract assertions independent of the numbers**, sabotage-verified) and `bench/buffer-view-bounds/`.
  `buffer-design.md` §M. ~~**Filed for an owner ruling, NOT shipped**: a scalar-arg `getF32At(base,
  length, i)` per width is zero compiler lines and 3.0× on the fenced two-view kernel, but it widens
  `std:buffer`'s public surface and its §L6a size tax, and the same win is reachable by hand today.~~
  **SHIPPED 2026-08-24** as webcraft's A1 — `getF32At`/`setF32At`/`getI32At`/`setI32At`, plus
  `f32base`/`i32base` minting a width-BRANDED `F32Base`/`I32Base` so a cross-width call is a named
  reject rather than a silent reinterpretation. The two costs that argued against it did not survive
  re-measurement: the §L6a size tax is **zero** (only imported names are emitted — 1609 bytes either
  way), and the alternative it was being held for, B6b's backing-pointer LICM, closed as a measured
  negative on 2026-08-16. On the consumer's own six-column kernel: 24 `struct.get` per element → **0**,
  6.345 → 1.964 ns/element, **3.23× with all 24 bounds traps intact**. `buffer-design.md` §M8; new
  bench rows `soa-view`/`soa-at`/`axpy-at`.
  *(This row read ⬜ "not started" while `webcraft-requirements.md` §P1.4 already read ✅ STATED from
  the typed-views slice — the THIRD stale webcraft row found in one day. Re-derive a tier row against
  the requirements doc and the tree before quoting it.)*
- ✅ **P1.5 Nominal/opaque types (= our A14)** — `type EntityId = new i32` mints an identity a
  structural checker cannot; `new` is a contextual keyword, the type is erased before emit, and
  `std:buffer`'s two views are now `new { base, length }` (the `f32base`/`i32base` hack deleted,
  and the module 12 bytes SMALLER because the two shapes collapse to one heap type).
- ✅ **P1.6 `vl test`** — SHIPPED. `vl test [path]` discovers `*.test.vl`, compiles each module-aware,
  and runs them one wasm instance per file across a host thread pool. Trap isolation is real (a
  trapping test fails alone; the host re-instantiates and the file keeps going), a non-compiling test
  file is one failing entry with the compiler's own diagnostics, failure messages are read back
  structurally off the instance (`expected 7 to equal 8`, not `wasm trap: unreachable`), and four
  CPU-bound files measured 1.11 s serial → 0.31 s at `--jobs 4`. `std:test` grew the registration
  half (`describe`/`it`/`itSkip`/`beforeEach`/`afterEach`) beside the matchers.
  Shipped shape + the three divergences from the charter: `docs/internals/vl-test-design.md`.

**P2 — wanted, not gating:** ~~i32-keyed Map/Set + `for k in map` (B6a)~~ **DONE** for every value
type the string-keyed rep lowers and every position but a union member (B6b extended the mv slot's
identity from the VALUE to the (KEY, VALUE) pair, then gave the struct/variant FIELD row the same
key column); ~~contextual f32 literals~~ **DONE**; ~~`match` phase 2 — variant payload
binding~~ **DONE** (`match cmd { Move{x, y} => … }`, punned fields; renaming + nested destructuring
measured and deferred — B21 item 1); literal-union compact representation (A16) — **DESIGNED
AND FILED**, its allocation rationale refuted by measurement and its correctness half (81 of 244
cells) blocked on three owner rulings; readonly
fields / A9 variance; ~~default params (B15a)~~ **DONE** (direct calls AND the UFCS spelling, which
took the same arity range in v1's completion; a function VALUE keeps exact arity, by design);
SIMD over Buffer (unlocked by P0, not requested yet);
keep emitting a names section on non-`-O` builds.

**Non-asks, deliberate — do not build these for them:** exceptions/async (our `T|E` + trap model is
*preferred*), separate compilation / wasm linking, UTF-8 strings (B7), WASI, a std math/trig library,
in-language GC knobs.

- ✅ **PROMOTE `vl test` ahead of the std expansion — DONE, and two of this note's premises were
  wrong.** Recorded because both were load-bearing for the sequencing argument:
  1. **`std:fs` was NOT the gate.** This note calls the failable-IO story "the critical-path item":
     the VL walk needs fs primitives, `std:fs` needs `T | E`, so `vl test` waits on the
     error-handling review. That reasoning assumed the runner would be a standalone VL PROGRAM.
     It is not — the brain landed in `compiler/cli.vl`, which already walks directories for
     `vl check`/`vl fmt` over `CMD_LIST_DIR`, with the skip-list and glob matching already in VL.
     Zero `std:fs`, zero error-handling dependency. The error-handling review is still worth doing;
     it was never blocking this.
  2. **"The linker stays EMPTY — no host-function imports at all" is false**, and was already false
     before this work: every VL program that prints imports `imports.__print_*__`, so a test module
     does too. The browser-execution property survives — a browser driver supplies exactly the seven
     print imports `playground/src/runtime.ts` already supplies — but it is "the same small shim the
     playground already has", not "nothing to shim".
  Original note follows.
  (Owner's ordering: *"before we expand the std
  library, I'd prefer we get our own test runner and assertion library"*.) It is **already designed** —
  `docs/internals/test-runner-design.md` — and the design **already encodes the owner's "as much code
  as possible in VL, Rust is a thin wrapper" direction**: *"the brain is VL; Rust is the mechanism
  pump"*, *"runner logic in VL wherever possible, not Rust"*. `std:test/runner` is **a VL program**
  owning all POLICY (argv interpretation, the directory WALK + glob/filter, the plan, `.only`/skip,
  report formatting, the exit code); the host owns only mechanism the wasm capability model cannot
  express, as RAW primitives never policy — `listDir`, `readFile`, thread pool, instance lifecycle,
  capture buffers, trap catching, timeouts.
  **Browser execution falls out for free**, which is the property to protect: the two sides talk
  through a **command-queue protocol** (host pumps `rnNextCmd()`, executes, commits back) and
  **the linker stays EMPTY — no host-function imports at all**. So a browser driver is the same loop
  in JS with nothing to shim, and the VL brain survives the H-M2 Rust-host teardown unchanged.
  Two things to settle, one now decided:
  1. **Sequencing — DECIDED: `vl test` lands BEFORE the std expansion.** The charter's "v1 lands with
     std-design slice 4" is **superseded**; `std:testing` comes out of slice 4 as its own unit. The
     reason is the owner's stated preference — a real test runner and assertion library must exist
     before std grows, so every std addition arrives with tests written in VL rather than TypeScript.
  2. **The genuine gate is the failable-IO story, not the ABI.** The VL-side walk consumes fs
     primitives, so `std:fs` must exist, and `std:fs` is **gated on `docs/error-handling-design.md`
     (`T | E` with a structural `IoError = { code, msg }`) which is DRAFTED, PENDING OWNER REVIEW**.
     That review is the critical-path item. Note also `std-design.md` files `std:fs`/`std:args`/`std:io`
     as "WASI-era additions" — reconcile with (a) browser execution and (b) webcraft's explicit WASI
     non-ask: the primitive set should be host-neutral (`listDir` is deliberately shaped as
     `fd_readdir` so the VL walk survives a WASI transition with only the transport changing).
  Motivation is independently strong: **all 38 test files are TypeScript/Deno today**, so the language
  cannot test itself and Track J has no on-ramp. The runner is also *"the first nontrivial VL program
  (not compiler module) in the tree"* — demand-driven dogfooding.

- ⬜ **Host ABI for VL scripts (dogfooding).** *Not* a test-runner blocker (above) — this is about the
  12 shell scripts. VL programs today can **compute and print, nothing else**: the entire import
  surface is seven print builtins, so `scripts/fuzzgen.vl` writes to stdout and the shell splits it,
  and `fuzz-vl.sh` passes parameters by **sed-rewriting the VL source before compiling it**
  (`s/^let RICHVALUES = .*/let RICHVALUES = $VALUES/` — rename that `let` and the flag silently stops
  working). Value order: **(1) `argv`** (kills the sed-patching); **(2) file read/write**;
  **(3) directory listing**; **(4) process spawn + exit code + captured stdout/stderr** — which is what
  unlocks the orchestrators, since `refresh-compiler.sh` / `rep-fuzz-check.sh` / `native-fixpoint.sh`
  exist to run the compiler and compare; **(5) `env` + `exit`**.
  **Cost to name up front: every new import must land in THREE hosts** — `scripts/vl-host/src/main.rs`,
  `tests/support/runWasm.ts`, `scripts/wasmtime-host.rs` — plus the declaration in `compiler/wasmEmit.vl`.
  Miss one and a script runs under the CLI and fails under `deno task test`. Keep the ABI tiny, land it
  as one batch. These are the same syscalls a `vl` CLI written in VL needs, so it is step 1 of Track H.

- ⬜ **`match` over ALL unions, not just literal unions.** Verified at `cd69bd9`: a litunion scrutinee
  works, and both other union kinds are rejected by the checker —
  `match scrutinee must be a literal union, got {c: i32} | {d: i32}` and `…got i32 | string`. The
  workaround is an `is`-chain, which works but is not exhaustiveness-checked — so the one property that
  makes `match` worth adopting in the compiler's own kind ladders (a missing arm is a *compile* error,
  not a runtime "no interned slot") is exactly the property unavailable on the unions the compiler
  actually uses. This is the load-bearing dependency under the kind-numbering collapse below, which
  currently reads "make sure that surface is actually load-bearing enough to carry rep code first" —
  **it is not, yet, and this is why.** Needs: scrutinee admission for struct/scalar/mixed unions in
  `typecheck.vl`, arm patterns that bind the narrowed type (reusing the `is` narrowing machinery), a
  tag-switch lowering (the union box already carries a tag — `is` chains re-test it linearly), and
  exhaustiveness over the member set (which is now a real data structure, `unMemTys`/`unMemberSet`).
  **Distinct from webcraft's P2 "match phase 2" (variant payload binding, `Move{x,y} => …`)** — that
  extends the *arm*, this extends the *scrutinee* — but they share the narrowing and lowering work, so
  do them adjacently and let phase 2 ride the tag-switch this lands.

> **#2 priority — drive the rep-composition fuzz baseline to 0** (`scripts/rep-fuzz-baseline.txt`;
> item 2 below). Every remaining entry is a fail-loud REJECT — a coverage gap the compiler refuses
> cleanly, never a miscompile — so this is *finishing the implementation of the language surface we
> already accept*, not new features. As of 2026-07-19 it is **17** (from 199 earlier the same day;
> `docs/internals/rep-fuzz-findings.md`). The residual is the deepest tail — nested
> closures×maps×arrays×unions at depth 4-5 — which is exactly where the parallel kind-numbering
> (below) hurts most, so the burn-down and the `repOf` rewrite reinforce each other.

- ⬜ **Dogfood `match` + literal-unions to collapse the kind-numbering (use the surface we HAVE).**
  The recurring authoring pain (evidence: the depth-4-5 burn-down tail) is that rep families are
  *stringly-typed* (`"nullist"`, `"nuli64list"`) and *bare-i32 field codes* (18/28/29/30…), enumerated
  in **parallel switch ladders that must stay hand-synced** — `fbValtype` / `fbValtypeNullable` /
  `fbRefNullForKind` / `fbHeapIdxForKind` over one kind set; `fieldTypeCode` / `nameFieldCode` /
  `anonFieldCode` over another. The dominant slice failure mode is "forgot the arm in ladder N," found
  only at runtime as "no interned slot." **VL already has literal-union types + a working `match`
  (A16/B21 phase 1) — adopt them in the compiler's own rep/kind code** so a missing arm is a
  non-exhaustive-`match` *compile* error, not a runtime hole. Order: (1) make sure that surface is
  actually load-bearing enough to carry rep code first — `match` exhaustiveness (A-exhaust / B21) and
  literal-union ergonomics fully implemented and dogfood-tested; (2) migrate the kind ladders to a
  single `match` over a literal-union of kinds, opportunistically as the `repOf` rewrite touches each.
  **Step (1) widened in B21 phase 2a**: exhaustiveness-checked `match` is no longer literal-union-only
  — it covers struct / scalar / mixed / `| null` unions too, so a ladder keyed on a VALUE union (the
  `Ty` arena's own shape) gets the same missing-arm compile error a litunion ladder does. The one
  union kind still outside it is a union with LITERAL members (`0 | 1 | 2`): an arm's test would be
  `n is 0`, which does not lower — see B21 below.
  Deliberately NOT building new enum/ADT machinery yet — only if adopting today's `match`+union
  surface proves insufficient. Related: carry structured `Ty` through codegen instead of
  round-tripping through emit-name strings (the `tyToEmitName` `K0→string` softening caused an
  invalid-wasm; `splitUnionAtoms` paren-depth was the same class; and REVERSING that softening
  cost another, because a name-keyed consumer compared the stored spelling against a CLOSED atom
  vocabulary that a user's alias name can never be in — the string layer makes both directions of
  a spelling change unsafe) — subsumed by the `repOf(type)→descriptor` rewrite (item 3, which
  already derives from the `Ty` arena).

- ⬜ **Emitter rep architecture — reduce the structural↔nominal / kind-scheme special-casing.** The
  recurring smell (see `DECISIONS.md` if expanded): the checker is **structural** (`{x:i32}`), the
  emitter is **nominal** (keyed by name in `structIndexByName`/`rlSlotByName`), and the same wasm rep
  families are enumerated in **3+ numbering schemes** (`vtKind`, `sigKeyRetKind`, mf-result-kinds) with
  translation functions between them. Plan, in order of leverage:
  1. ⬜ **Structural-tolerant emitter (incremental, low-risk).** Migrate nominal-only resolvers to the
     structural-aware `structIndexOfTypeName` (tries nominal first, then field-set match) so the
     structural→nominal bridge is centralized, not re-added per consumer. Do it opportunistically when
     touching a site; gate each step (fixpoint + corpus + suite). Migrating a resolver is
     behavior-preserving for nominal names (`structIndexOfTypeName` tries `structIndexByName` first) and
     only ADDS resolution for structural shapes — so the gate validates safety even where the fixpoint
     (i32-only) can't. **First target — inline-shape nested struct field — DONE (#665):**
     `collectNestedFieldShapes` pre-pass + `fieldTypeCode`/`fieldRefElemName` resolving via
     `structIndexOfTypeName`. The remaining `structIndexByName` sites stay nominal-only for now — migrate
     each opportunistically when a structural name actually reaches it (premature otherwise: today they
     all receive nominal names, so a blanket swap is a no-op with risk).
  2. 🟡 **Rep-bug burn-down — THE #1 PRIORITY (drive to 0).** ✅ **Soundness milestone holds:** every
     unsound class (INVALID-WASM, TRAP, MISMATCH) is **0**; the check is EXACT/bidirectional
     (`scripts/rep-fuzz-check.sh`: soundness never baselineable, new rejects + stale entries both
     fail). Wave history in `docs/internals/rep-fuzz-findings.md`. **As of 2026-07-19 the baseline is
     17** (a broad 16-seed net; down from 199 the same day — a session that graduated the map-reader
     value-call path (former item (c)), the nullable-scalar & nullable-list families (former item (d)),
     nullable-litunion/f32 struct fields, f32/f64-list value atoms, variant composite-field boxing,
     closure-result composite/nullable/map results, array-of-(nullable-)closure elements, and several
     hand-found TRAP/INVALID-WASM fixes the fuzzer never generated). REMAINING (coverage, not
     soundness) is the DEEPEST tail — depth-4-5 compositions such as
     `{[string]: {a, f: (i32) => (() => {[string]: i64}), z}}` (map→struct→closure→closure→map) and
     `(((i32) => f32)[] | i32)[]` (closure-array-under-union in an array) — several of which resist
     point-fixes and want the recursive `repOf` rewrite (item 3) + the `match`/kind dogfood (above)
     rather than another parallel-ladder arm. Keep graduating baseline shapes as fixes land; when the
     list empties the fuzzer is at true zero over the wide net.
  3. 🟡 **`repOf(type) → descriptor` unification (the "rewrite") — strangler, in progress.**
     Foundation SHIPPED (→ `CHANGELOG.md`): `emit_rep.vl`'s `RepDesc` derived table-driven from the
     `Ty` arena (cycle-safe: kind arms recurse ≤1 wrapper level; generation-stamped visited marks),
     with the print-import scan exact, `vtKindOfType` delegated, the `$fnsig` seam COMPLETE
     (one token vocabulary; keys mint AND decode only through it — `repSigSlotTokOfKind`/
     `repSigTokHasSlot` on the encode side, the single `sigKeyRet*` result decoder on the
     consume side; `repLegacyCodeOfKind` and every per-site digit/char parse deleted —
     → `CHANGELOG.md`), and the `fRet*` fold COMPLETE (every per-family flag table folded
     into the stored `fRetKind: VKind[]`; `inferredRetKindCore` is a plain read —
     → `CHANGELOG.md`).
     The SLOT layer (item (b)) is COMPLETE — structural heap-type dedup by canonical layout
     across ALL FOUR name-keyed tables: STRUCT (`repCanonKey` → `sTwin` → shared `sHeapIdx`),
     REF-LIST (`rlTwin` + the inline-shape spelling bridge), MAP-VALUE (`mvTwin` + the
     canonical tag/arm seam `mvCanonRepOf`), and VARIANT (`buildVariantTwins` →
     `uVarTwin`/`uVarHeap`, retiring the arithmetic `uVarIdx + vi` heap identity) — see
     `DECISIONS.md` + `CHANGELOG.md`.
     Rep-rewrite Stage A SHIPPED (audit Part III Phase 2 items 3–4, the foundation; →
     `CHANGELOG.md`): the RECURSIVE `Rep` tree — `repTreeOfTy`, TOTAL over the post-mono
     arena (every type gets a tree or an explicit `unsup(reason)` policy node; hash-consed
     index-linked arena, cycle-safe, generation-stamped like #917's memos) — plus the
     `$VL_REP_SHADOW` differential harness (tree vs flat on every `rdCovered` fact; corpus +
     self-compile + 16 pinned fuzz seeds + a branching/declared/multiobs survey sweep with
     ZERO disagreements) and the per-compile coverage report (the Stage B burn-down buckets).
     Stage B WAVE 1 SHIPPED (→ `CHANGELOG.md`): (b1) litunion alias PROVENANCE on the
     arena (mint-site stamps + `tyLitUnionAliasIx`; the alias-copy half of the
     `litunion:noalias` bucket is real atoms now — the residue is inferred literal-JOIN
     unions, context-dependent by design, correctly policy nodes), the three #920
     flat-path irregularities reconciled (arity-aware variant-member registration; the
     bare-array litunion arm provenance-widened to match the nullable twin; the inline
     positional asymmetry documented as the canon pass's intended policy), and the FIRST
     consumer migration: `repOfTy` is tree-PRIMARY (kind/nul/list-elem are the tree's
     projections wherever the flat arms claim coverage; flat still owns coverage + the
     nominal slot, and shadows the tree under `$VL_REP_SHADOW` — the Stage A direction
     inverted).
     Stage B WAVE 2 slice 1 SHIPPED (→ `CHANGELOG.md`): the R1 map-valued-FIELD seams —
     mono-ness at `mvSlotOfValNameFind` decided by the interner's own classifier (atom /
     niche map fields ride the mono map), the shape-text variant seam records + interns
     code-19 field value slots (map-in-union-arm lowers), the narrowed-member map
     receiver resolves through the variant field tables, and the field-set matchers
     (`objVariantName` / `shapeFieldTypeCompat`) are map-VALUE-rep tightened so twin
     name-set arms with different map values never collide. Baseline 273 → 255 (18
     graduations, 4 pinned tests).
     Stage B WAVE 2 slice 2 SHIPPED (→ `CHANGELOG.md`): the R1 map-in-list-in-union seam
     (`{[string]: V}[] | X` constructed from `[h]` map-binding literals) — the array
     literal routes through the ARM's build (`unionRefArrayArmSlotForMapElem` picks the
     arm by canonical value rep, the arm's reflist slot threads the build, the wrapper
     tags with the arm's slot tag) and the frame pre-pass reserves the map scratch
     narrowing-blind for the `t[i][k]` read shape. Baseline 255 → 249 (6 graduations,
     1 pinned test).
     Stage B WAVE 2 slice 3 SHIPPED (→ `CHANGELOG.md`): the R1 union-variant FIELD kinds
     (the "only iN/boolean/string/array union-variant fields" bucket) — nested-struct
     fields (code 15) accepted on the inline-shape variant path (`variantNestedShapeOk`,
     the pure `internInlineShape` mirror; `collectA` interns the deferred target), field
     UNIONS of union-arm shapes pre-registered (`registerVariantArmFieldUnions`, before
     the outer union's rows so slices never interleave), the construct seeds
     `pendingStructIdx`/`pendingMapSlot` (the `emitObj` discipline) with the target
     union's OWN arms picked first (`unionArmVariantForObj` — the cross-union name-set
     collision), `structIndexOfExpr`/`memberUnionFieldName` resolve narrowed/variant
     receivers (the latter narrowing-BLIND for the frame pre-pass, `nodeTyIsUnion`-gated),
     `callRefSlot` reserves for member-chain closure callees
     (`calleeIsUnionArmClosureMember`), and the member-STORE scalar widening
     (`emitScalarFieldStoreVal` — the pre-existing `p.g = 9` i64-field invalid-wasm, flat
     and nested). Baseline 249 → 221 (28 graduations, 4 pinned tests).
     Stage B WAVE 2 slice 3b SHIPPED (→ `CHANGELOG.md`): map-through-closure-result in
     union arms (`forceCloResultMapTypes` — the collect-scan forces the map machinery +
     interns the value slot from a union arm's / nullable-closure's / curried closure
     RESULT, the R2×R1 combo; a value-union result stays deliberately un-forced/loud).
     Baseline 221 → 220 (1 graduation, 1 pinned test).
     Stage B WAVE 2 slice 3c SHIPPED (→ `CHANGELOG.md`): the nulclosure-sig R2 family
     (`collectCloSigs` interns the inner closure key from every nulclosure annotation
     TypeRef; `collectFnValUse` flips the machinery for kind 19 — a null-only caller's
     narrowed call now finds its sig) + repOf item (d), the closure-value-call ref-arm
     union-result narrow (`refArmUnionRetName`: adopt + record + pin + `nodeUnionName`
     resolve — one renderer, producer and consumer agree). Baseline 220 → 213
     (7 graduations, 2 pinned tests). Residuals stay loud: list/curried/value-union
     nulclosure RESULTS (collection/sig seams still unminted), the no-lambda decoy-only
     ref-arm union spelling, and the anonymous-element ref-arm unions behind the #911
     declared-twin gate — widening the gate was ATTEMPTED and REVERTED: the structural
     producer pin turns the construct-only fuzz line
     (`p2c ((i32) => {f: boolean}[] | {w: i32}) | f64`) PASS → REJECT because
     `emitReturnValue`'s union-arm matcher cannot box an anonymous-element reflist arm
     ("array value does not match any array member"), so the gate holds until that
     boxing seam lands.
     STAGE B remaining charter (consumer migration, family-by-family, each PR gated by
     fixpoint + corpus + rep-fuzz + the shadow sweep): (b2, REMAINING TAIL) typed-value
     maps in composition (R1) through `Map(val)` trees — the still-loud
     nested/nullable-value policy set (each stays rejected until its
     rep is genuinely minted); (b3, REMAINING TAIL) nullable-list-in-field /
     struct-through-list (R5/R6, compositional once consumers read the tree — the R4
     2-D-array half SHIPPED: the family dissolved through the existing composed
     machinery, → `CHANGELOG.md`); (b4) closure
     composite results via sig keys interned from `Closure(params, result)` nodes (R2);
     (b5) value-union composite members (R3b/R7 — the genuine ABI-policy cluster); then
     migrate `vtKindOfType`/the valtype ladders onto `repTreeVKind` and delete the flat
     `RepDesc` when its last consumer moves.
     REMAINING legacy items: (a) widen `repOfTy` coverage (typed-value maps,
     litunion/union-element arrays — subsumed by Stage B above); (e) the variant⇄struct-table
     seam, **re-measured 2026-08-26 while closing `silent-class-inventory` D32, and this row was
     wrong in one direction and right in the other**. Its SILENT rung is now CLOSED: a
     `Circle[]` whose element is a union ARM resolved the LIST's element heap through
     `rlElemStructRow`'s canon-key bridge onto whatever standalone struct shared the arm's
     layout, `vl check`-clean and refused at load. That rung now declines for a name the
     variant table claims — the exact complement of `exprVariantIndex`'s `Index` arm — which is
     the #911 declared-twin gate this item asks for, taken at ONE resolver. The seam is
     otherwise as follows, each re-run on this tree and identically on master (`a80c6717`):
     the "DECLARED struct twin flowing into a variant-arm position still fails validation"
     clause did **NOT** reproduce — `pickU(k: Kot)` calling `takeU(u: U)` with `U = Cat | Dog`
     and `Kot`≅`Cat` prints `7`, as does the `const u: U = k` binding spelling. That is a
     PARAPHRASE of this row's sketch, not a filed program, so read it as "the nearest spelling
     runs, and this row needs a filed witness before it is scheduled" rather than as a close.
     The second clause DOES reproduce and is unchanged: an inline-shape union arm
     (`type U = {m:i32} | Dog`) rejects a declared-name `is` spelling (`u is Cat`) with
     `emitProgram: `is` names a declared union member with no interned arm representation`,
     loud on both compilers. The remaining fix wants the same declared-twin gate at the `is`
     resolver.
- ✅ **Kill the TS host. DONE — the TWO COMPILERS are now one.** The TS compiler core
  (`compiler/*.ts` front end + `cli.ts` + the `checker-parity-sweep.ts` oracle) is DELETED; the
  self-hosted `compiler/*.vl` (the wasm seed) is the sole compiler. Got here in stages:
  0. ✅ **Corpus oracle flipped off the TS compiler.** `cases_wasm_test.ts` (seed under deno) is
     the sole corpus oracle, run in `ci-native`; the TS `cases_test` runner is gone.
  1. ✅ **LSP-on-wasm.** `server.ts` is wasm-only (the `vital.checker: ts|both` modes + their
     live parity instruments removed). The batch parity sweep reached accept/reject VERDICT parity
     over the corpus and was retired; the residual 81 span/ergonomic deltas are recorded in
     `docs/internals/vl-tech-debt.md` (native is the spec now — "match the TS span" is no longer a goal).
  Follow-through that outlived the TS kill (separate, still open):
  - ⬜ Delete the gated deno-side RUN half + its 305-file whitelist outright (see F-tiers).
  - ⬜ `std:` Phase 2 (H0) written in VL — DESIGNED: `docs/internals/std-design.md` (the `std:` scheme,
    hybrid delivery, the two-primitive intrinsic floor + `__trap__`, slices 0–6 with gates; six
    open decisions flagged for the maintainer). Doubles as the demand-driven discovery engine
    for the remaining emitter long tail (each gap fails loudly).
  - The `.vl` compiler is the spec, so a parked soundness xfail is a fixable bug rather than a
    parity constraint. Two have since flipped to ordinary passing pins on exactly that reasoning:
    arith-hole-operand (A13), and array-element-recursion, whose premise that `{[i32]: T}` spells
    `T[]` B6a's i32-keyed `Map` retired.
- ✅ **`vl test`.** SHIPPED — see `docs/internals/vl-test-design.md` for the built protocol and the
  three divergences from the charter (brain in `compiler/cli.vl` not `std/test/runner.vl`;
  compilation stays VL-side and only EXECUTION crosses; `.only` is not spellable in VL, so
  runner-side `-t` + `itSkip` are the selection story). Chartered follow-ups below still stand,
  plus: ~~void-return covariance on function values (the `done()` wart)~~ **RULED 2026-08-18** —
  covariance is consequence (b) of `void` becoming a unit type, which retires `done()` outright
  (`DECISIONS.md`, Types & semantics); f64 failure rendering,
  per-test timings/timeouts, `--no-capture`, `dot`/`json` reporters.
  Original charter entry: `docs/internals/test-runner-design.md` (jest-shaped `describe`/`it`/`expect`
  over `std:testing`; two-phase registration, host-driven `vlt*` protocol; `*.test.vl` discovery
  + configurable globs; files parallel by default / in-file serial, opt-in fresh-instance
  `it.concurrent`; per-test capture, failure-first reporting). **v1 lands BEFORE the std expansion,
  not with std-design slice 4** — the charter's sequencing is superseded (see the promotion note under
  Next); chartered follow-ups: ~~compiler-injected call sites~~ **DONE — track-caller (#2235),
  through default arguments rather than an attribute, and `expect`-only**; ~~generic
  `expect<T>`~~ **DONE (#2104)** + structural diffs, power-`assert` rewriting. New behavioral tests switch to `*.test.vl` at v1 (directive-corpus
  growth stops; conversion waits for the TS-tier teardown).
- 🟡 **Error-handling design** — RULED and PARTLY BUILT: `docs/error-handling-design.md`
  (errors-as-values via unions — `T | null` for absence, `T | E` with a structural `IoError`
  alias for reasoned failure, traps (`__trap__(msg)`) for bugs; no catchable throw in v1, `exnref`
  reserved for a possible async era, Go-style multi-value returns ruled out; union-`as`
  propagation, under a unified `as` principle). **REMAINING: `as?` only.** The model shipped —
  `std:fs` is fallible on the ruled `T | E` shape, and the `as` trio's two lowered members
  landed 2026-08-24: `as` propagates the remainder (checked against the enclosing return) and
  `as!` traps, both over a value-atom arm, a struct arm and a SUB-UNION target. `as?` parses
  and is refused at the checker — its `T | null` result is the one member whose rep is
  per-`T` (a nullable REF for a string/struct/sub-union arm, a value NICHE for a scalar), and
  its lowering emits correct bytes while the binding/consumer classifiers still need a
  nullable arm each. It is the member the design itself calls lossy, so nothing waits on it.
  Also open: the seven O1–O7 questions, of which O5/O6 are settled by the above.
- ✅ **Explicit numeric conversion syntax — SHIPPED; this entry was STALE.** The lossless-only
  implicit-widening rule (#298) makes the lossy edges expressible only via a cast, and that cast
  **exists**: `as` covers every edge this item named — `i32 as f32`, `i64 as f64`, and the
  narrowings (`i64 as i32`, `f64 as i32`, which truncates: `5.7 as i32` is `5`). The implicit form
  gives a diagnostic that names the remedy (``i64 doesn't fit in f64 — the conversion is lossy and
  must be made explicit with `as` (write `x as f64`)``), and mixed-width arithmetic rejects with
  ``operator '+' mixes f64 and i64``. Verified 2026-08-02 on all four edges. **REMAINING is a
  SEMANTICS + DIAGNOSTIC item, not a syntax one**, and it is sharper than the original entry:
  - **RULED 2026-09-02 (owner): out of range is neither a trap, a saturate nor a wrap — it is
    a FAILURE under the trio** (§Next "Numeric `as` honours the trio"; DECISIONS.md). The
    measurement below stands as the pre-ruling state and the diagnostic half is folded into
    the build item.
  - **`f64 as i32` out of range TRAPS, with a raw wasm backtrace and no diagnostic.** Measured:
    `100000000000.0 as i32` → `error while executing at wasm backtrace: vl!<wasm function 5>`;
    `(0.0/0.0) as i32` traps the same way. VL emits the trapping `i32.trunc_f64_s`; wasm also has
    `i32.trunc_sat_f64_s`. The neighbours diverge — **Rust saturates** (`2147483647`), **JS wraps**
    (`1215752192`) — so this is a real three-way design choice that VL has made by accident and
    documented nowhere. Trapping is defensible under the "traps are for bugs" model, but it must be
    a stated ruling with a diagnostic, not a bare backtrace.
  - In-range truncation is toward zero (`5.7 as i32` → `5`) — and under the ruling that
    spelling FAILS (`5.7` is not integral); the truncation is spelled `trunc(5.7) as! i32`.
  - **Scientific-notation literals do not parse**: `1e30` is `undeclared identifier 'e30'`. Small
    lexer gap, found while probing the above.
- **Param-skip ergonomics** (`docs/guide/lambda-param-skip-design.md`) — prerequisite 1 (self-host
  lambdas/HOFs) is nearly satisfied; decide leading-comma vs `$#` (recommendation deliberately open).
- **C5 / H-M1** — `deno compile` + brew tap. Small, decoupled; ships the distribution story now.
- Smaller/independent: A-robust holes (`Map()`/`Set()` empties, generics), A-exhaust codegen elision,
  B6b collections building blocks, B13 callable objects, B17 lint backlog, A6b Stage A.

---

## Track A — Type system (`typecheck.vl`)
*Blueprint: Elixir v1.20 set-theoretic types, fully-typed (no gradual escape hatch).*

- ⬜ **A-OPMOD. A user-defined binary operator dispatches ONLY in a single-file program.**
  MEASURED 2026-08-29 while closing D491, on master `c6eb736c`. This runs and prints `99`:

      type V = { x: i32 }
      function "+"(self: V, other: V): i32 { return 99 }
      function addv(a: V, b: V): i32 { return a + b }
      const p: V = { x: 1 }   const q: V = { x: 2 }
      print(addv(p, q))

  Prepend ONE `import { mk } from "./lib"` line — changing nothing else, and never using
  `mk` in the operator's neighbourhood — and it becomes a LOUD check reject:
  `operator '+' is not defined for V and V`. Not generic-specific (the plain
  `function "+"(self: V, other: V)` above is the measured case) and not `self`-dispatch in
  general (a UFCS `function double(self: V)` called as `p.double()` runs in module mode).
  So the loss is specific to operator NAMES.

  LIKELY the per-module rename map (`driver.vl`'s `modRenameTo`) mangling the declaration
  to `+$mN` while a `p + q` SITE has no name to rewrite, leaving `opSelfFnTy`'s `lookup("+")`
  with nothing — **that attribution is inferred, not instrumented; confirm before
  scheduling.** The four behaviours above are measured.

  It is LOUD, so it is a capability gap and not a silent class — but it bounds the whole
  operator-declaration family (D444/D445/D471/D425/D491/D521/D541): today those rules only
  ever matter in single-file programs. It is also why D491's landing is inert in module
  mode: `isBinOpFuncName` declines a mangled name, so the imported declaration is neither
  refused nor dispatched, and the silent cell survives there. Measured as unchanged
  base -> landing.

  **D521's landing is inert there for the SAME reason, and that was measured rather than
  inherited** (#2014): prepend one unrelated `import` to `function "+"(self, other) { return
  99 }` beside `print(a + b)` and it is `vl check` rc 0 printing 8 again, with an
  instrumented compiler reading `bankUn=0` — the declaration is never banked, so the
  whole-program verdict has nothing to refuse. Every row this list bounds should be checked
  in module mode before its reach is described; this one behaves differently there and the
  difference is the mangled name, not the rule.

- 🟡 **A4. Negation types** (`!A`). REMAINING: full open-world negation tracking (needs A12).
- 🟡 **A5. Flow narrowing.** REMAINING: `case`/multi-guard (no grammar); stored-witness (A6b Stage B);
  optional *call* `x?.f()` + chain short-circuit `x?.y.z` (use `x?.y?.z`); per-call
  reachability-pruned return types (blocked on memoize-with-holes — see `docs/guide/narrowing.md`,
  and see A5b: the pruning is ALSO gated on A4, which the guide does not say).
- ⬜ **A5b. The pruning asymmetry — one side is intersection, the other is negation.** MEASURED
  2026-08-16 on `function foo(thing) { if thing is string { return 6 } return "ok" }`:
  `foo(true)` infers **`string`** (pruned) while `foo("ok")` infers **`i32 | string`** (not pruned).
  An explicit `else` does not change it. The working side kills the then-branch by INTERSECTION
  (`boolean ∩ string = Never`), which ships; the missing side needs the else-branch to narrow by
  NEGATION (`string ∖ string = Never`), which is **A4**, *"REMAINING: full open-world negation
  tracking (needs A12)"*. So A5's pruning is partly gated on A4, not only on memoize-with-holes.
  (The behaviour is verified; the intersection-vs-negation attribution is read off A4's own text
  and is not instrumented — confirm before scheduling.)
- ⬜ **A5c. Literal-preserving inference for STRINGS, with use-site widening.** Owner ruling
  2026-08-16: `const x = "ok"` should infer the singleton litunion `"ok"`, not `string`, because
  string-literal unions are VL's enum idiom and a hardcoded string is far likelier to be an enum
  member than a plain string; widen to `string` at the USE site if usage demands it. Numeric
  bindings are unchanged — `let x = 0` stays `i32`. Return position is the sharper half: a literal
  return feeds the caller's inference and compounds with A5's pruning (`foo("ok")` → `6`, not `i32`).
  **REP PREREQUISITE, and it inverts the rationale if skipped:** a NAMED litunion reps as an interned
  i32 atom, but an un-named/inline one reps as a real `(ref $array)` string — verified, the named
  const emits no global while the inline one emits `(global (ref 1) … array.new_fixed)`. Inference
  produces un-named types BY CONSTRUCTION, so shipping this without first extending the atom rep to
  un-named literal types puts inferred values in the slower rep — losing the runtime parity that is
  the whole argument for string enums.
  **#1852 did NOT move that rep, and A5c still needs it.** What it added is the missing CONVERSION
  at atom-typed destinations for a ONE-MEMBER literal set — `if s is "aa" { return s }` and a `"aa"`
  parameter were check-clean invalid wasm while the two-member spelling beside them ran, because the
  conversion hook asked a predicate that requires a `TyUnion`. Values still rep as strings at their
  own type; they convert only where an atom slot receives them.
- ⬜ **A5d. Deferred (use-site) widening.** `softenImplicitType` widens a literal to its base EAGERLY
  at the binding. A5c needs the opposite: keep the literal, widen on demand at the use. Different
  machinery, not a parameter of the existing pass. Unfiled before 2026-08-16.
- 🟡 **A6. `is` operator + tagged unions.** REMAINING: `ref.test` fast-path for ref-vs-ref; union
  arrays (`[boolean | i32]`); declared type-guard signatures (A6b Stage A).
- 🟡 **A6b. Proof-carrying narrowing (type guards as values).** REMAINING — **Stage A:** richer
  discriminants (`if bar(x) is null`), multi-input correlation, declared (verified) predicate
  signatures. **Stage B:** stored witness (`const f = bar(x); … if f is null` narrows x) — needs
  binding tracking + invalidation (a lightweight borrow). Stage B also subsumes per-call tight return
  types (the forward direction of the same correlation).
- ⬜ **A8. Exact / Inexact variance.** Params Inexact by default (accept excess properties), values
  Exact. Guards the `a.foo = b` width footgun. (TODO.md)
  **Defaults + surface RULED 2026-08-18** — see A9.
- ⬜ **A9. Readable / Writable variance.** Applied automatically during parameter inference. (TODO.md)
  **RULED 2026-08-18: inferred, with NO annotation surface in v1, and nothing to migrate.** The
  migration half was settled by measurement, not preference — the population an A9 tightening could
  break is empty of *working* programs: every subtype-container shape already either rejects loudly
  (struct width, behind #1456's gate, including read-only bodies and un-annotated sources) or is
  already check-clean invalid wasm (`i32[]` → `(i32|null)[]`, `K[]` → `string[]`, in BOTH directions).
  So the **Writable** half only moves cells up a column, while the **Readable** half is blocked on
  REPRESENTATION rather than on this ruling (the two array types are distinct WasmGC types with no
  conversion; the checker already says "type-valid … but not yet supported by codegen"). An
  annotation is wanted later and is additive: with inference alone, variance is a property of a
  function BODY, so adding a `.push` silently breaks callers with the error at the call site — an
  API-stability argument that only bites once there are cross-module consumers.
- 🟡 **A10. Parametric types / generics.** REMAINING: same `map`/`filter` generics for `Map`/`Set`
  (B6a); **const generics** (numeric/value type parameters, e.g. `Decimal<10, 8>` /
  `Buffer<N>`) — today generics take *type* params only; enabler for the parameterized
  `Decimal<Backing, Scale>` family (B2) and any fixed-size/parameter-by-value type.
  (Forward/mutual-reference return-type inference: shipped as A17 — see `CHANGELOG.md`.)
- 🟡 **A12. Soundness corpus.** REMAINING: keep growing it. NAMING IS LOAD-BEARING and has its own
  contract (`tests/cases/soundness/README.vl`, mirrored in `docs/guide/soundness.md`): a must-error
  pin is `*-reject.vl`; `xfail-` means the COMPILER is wrong and splits by direction —
  `xfail-unsound-*` accepts too much (no `@error`; closing it tightens the checker),
  `xfail-false-reject-*` refuses a sound program (`@error` pins the undesired diagnostic; closing it
  LOOSENS the checker, so it needs reject-parity work). An `xfail-` file that is really a passing
  pin makes the item it belongs to read OPEN — six did exactly that to A13 below. There are
  currently no `xfail-unsound-*` files. Container element variance (`Cat[]` into an `Animal[]`
  param) is live and not pinned here at all — `docs/internals/open-rulings.md`. The SELF-HOST
  checker's soundness floor (15 false-accept classes) is closed; new classes go straight to corpus
  + both checkers.
  THE `xfail-miscompile-` TIER (accepts, then emits invalid wasm) stands at **two** members here
  plus one under `tests/cases/std/`, down from twelve: seven closed in one pass (#1863), an eighth
  right after (#1865), a ninth beside it (#1866) and two more with #1864 — and EIGHT of those nine
  were the same sentence, a ladder with an arm its sibling ladder lacks (see `CHANGELOG.md`,
  Track B, and the enumeration in `tests/cases/soundness/README.vl`). The eighth was the map one:
  `emitObj` seeds a nullable-map field's construct context under `scode == 29` and the
  VARIANT-literal twin had no `vcode == 29` arm, so FIVE shapes — not the one its header named —
  rode the ambient mono STRING-keyed default. The ninth, `numeric-litunion-empty-list-seed`, was
  the same sentence once its "this needs a REP decision first" header was checked rather than
  believed: the rep was already decided and already named (`numLitUnionBaseTy` — a numeric literal
  union reps as its BASE SCALAR), so the pair closed together with the `xfail-false-reject-` file
  beside it.
  ~~**TWO miscompile fixtures remain here** (the inline-litunion element read, plus the loud
  `totality-gate` one) and TWO false rejects, with one more miscompile under `tests/cases/std/`.
  What remains is attributed rather than merely listed: the `ctxKeepsLitUnion` FAMILY DECISION —
  … Closing it means CHOOSING one position-INDEPENDENT rule; that predicate's header names the two
  candidate position rules already built and REFUTED.~~
  **STALE — THE `ctxKeepsLitUnion` FAMILY IS CLOSED, AND IT DID NOT NEED THE DECISION THIS
  PARAGRAPH DEMANDED.** Every fixture it names has graduated, `tests/cases/soundness/` holds no
  `xfail-miscompile-` file at all, and the ONE under `tests/cases/std/` is a `u8[]` generic
  argument with nothing to do with literal unions. The predicted "choose one position-INDEPENDENT
  rule" is not what closed it: the position rule is RIGHT — the three preserve positions are
  CONTAINERS, whose slots really do hold the atom — and what was wrong was (a) that `RC_FN_RES`
  was in that set while a function RESULT is a scalar position whose counterpart `RC_ROOT`
  softens, and (b) that the conversions across the remaining boundaries were missing at four
  producers. Closed by the boundary reconciliations of #1910 / #1917 / #1919 / #1926 and the four
  rungs of the BOUNDARY class (element read, element store, ordering, result list, monomorphized
  argument, function-value call result, callback delivery, container store). The checker-side
  totality gate, which carries an ordering constraint in its own header, is unrelated and its own
  row.
  **#1864 CLOSED TWO AND CORRECTED TWO FILED DIAGNOSES IN OPPOSITE DIRECTIONS.**
  `narrowed-litunion-fn-value-arg` was filed as needing three `$fnsig` producers moved
  "byte-identical or nothing" (`cloParamTok` / `annSigKey` / `sigKeyOfTy`); re-derived,
  `cloParamTok` was already right and `annSigKey` CANNOT be fixed — its whole input is a rendered
  spelling, and a narrowed litunion COPY renders exactly like a genuinely INLINE one while repping
  differently. One producer moved and the CONSUMER ranks them. `array-litunion-element` was grouped
  with it as "the same question" and is NOT — closing the first changed nothing there.
  `permuted-object-closure-arms` called its INTERLOCK with #1864 correctly (neither half works
  alone) and named the wrong second half: the RENDER SORT it proposed was built and MEASURED, and
  sorting `tyToEmitNameAt` needs `tyToNominalNameAt` with it and STILL forks, because a fourth
  producer — `canonEmitNameAt`, which canons the SOURCE ANNOTATION TEXT — keys declaration order
  (`types/nullable-union-alias.vl` and `literal-unions/inline-atom-shape-field.vl` both go red).
  What landed instead is two lines, neither a render: `emitIs`' union-box arm asks the STORAGE
  question as well as the registry one, and `tySameAt` compares object fields by SET rather than by
  POSITION.
  **THE MISSING FIXTURE KIND IS NOW A TWO-INSTANCE GAP, NOT A ONE-OFF.** #1867 (a permuted OBJECT
  union arm: `u is PB` answers FALSE for a PB, because `structFieldCodesEq` is POSITIONAL and the
  2026-08 layout canonicalization's 14 measured positions do not include the union arm) and the
  inline-litunion silent sibling (`const v: "a" | "b" = tags[0]` prints the raw atom id) both
  COMPILE, VALIDATE, run and exit 0 with a WRONG ANSWER. `@no-instantiate` cannot pin a valid
  module, `@trap` explicitly rejects one, and `@run` + `@log` cannot assert that output is ABSENT
  or that a printed value is not some OTHER value. Two instances is enough to say the gap is in the
  harness. The cheapest kind that would serve both is an EXACT-output directive — assert the FULL
  output sequence rather than a subsequence — because #1864's own shape ("runs, exits 0, prints
  nothing") is then just the empty case and #1867 is the "prints 1 and only 1" case.
  **RE-DERIVE A FILED DIAGNOSIS BEFORE BUILDING ON IT.** FIVE of the headers were wrong about
  their own defect, and for a miscompile the re-derivation is `wasm-tools print` on the bad module.
- 🟡 **A13. Operator-constraint inference.** A binary op with a hole operand records a deferred
  `(lt, op, rt)` constraint that every generic call site re-validates under the substituted
  argument types (`binOpDefinedFor`) — arithmetic, string concat, relational and equality all fall
  out of that one rule, so `add(1, "x")` and `cmp(1, "x")` reject exactly as their annotated twins
  do. A MIXED hole/concrete ORDERING now defers through the same rule (workboard E6, **24 cells**:
  `<` `<=` `>` `>=` × the two half-annotated directions × `string` / a string literal type / a
  string literal union), so `function f(a, b: string) { a < b }` is writable and every non-string
  binding of the hole still rejects at the call that pins it. REMAINING: the *stored-closure*
  operator case (`vec + vec` via a `"+"` field) still hits the WasmGC width wall (B13). Also
  REMAINING — `+` never applies `softenLitTy`, so a string LITERAL type cannot be concatenated in
  any ANNOTATED spelling (`function f(a: "a", b: "a") { a + b }` errors *"operator '+' is not
  defined for string and string"*) while the bare spelling accepts; 6 cells, unfiled direction —
  unlike E6 the fully-annotated twin rejects too, so it needs its own ruling. The `any` rendering
  these diagnostics use is E7.
- 🟡 **A14. Named/opaque types.** Zero-cost nominal NEWTYPES ship: `type EntityId = new i32` /
  `type F32View = new { base: i32, length: i32 }`. Distinct in the checker in every position,
  ERASED before the emitter (no emitter file changed), literals brand-polymorphic, `as` for both
  construction and unwrap. `docs/internals/newtype-design.md`. REMAINING: generic newtypes
  (`type Handle<T> = new …`), an OPAQUE type with runtime identity (`x is EntityId` — a newtype
  has no tag by construction), and a newtype as a MAP KEY (a pre-existing map-key-grammar gap a
  plain alias hits too).
- 🟡 **A15. Equality — RULED 2026-09-01** (`docs/identity-design.md` §0 carries the ten rulings;
  `docs/internals/identity-critique-synthesis.md` the evidence). Build items in SHIP ORDER, each
  independent of the next, the API fixed by the ruling:
  1. **`===`/`!==`** — one `ref.eq`; operands struct / list / map / function / nullable-of-one;
     a union of struct arms by PAYLOAD (rides D989's unboxing); a function by table index + env
     `ref.eq` (today's `==` lowering under the new spelling), with `==` on a function becoming a
     CHECK ERROR and a function-field struct refusing `==` by field name; `null === null` static
     `true`, `x === null` hinted to `== null`; the check-error template with three arms (scalar /
     string / union-with-scalar-arm) rendered at the user's spelling; the generic constraint
     reported at the call's argument like `+`. **Acceptance is a VALUE TABLE, never a compile**
     (D989's near-miss: one side unboxed compiled clean and printed `1 == 2` as `true`): same
     object true · two equal objects false · across union arms false · `null === null` true ·
     inside AND outside an `is` guard · `mk(1) === mk(1)` false · `const a = f; const b = f;
     a === b` true · a newtype fixture proving `Id` never prints as `string`. → **vl-de**.
  2. **Struct keys for `Map`/`Set`** — key-eligible = `==`-comparable; hash and `==` share one
     lowering (D1017 first); `-0.0` folds into `0.0` in the hash; the NaN-key and mutable-key
     rules go in the `Map` header.
  3. **`Set<T>`** (C2.2, unbuilt), the concrete names `Map<K, V>` / `Set<T>` as annotation-legal
     types (`Map<string, i32>` is `unknown type` today — only `{[string]: i32}` works), and
     TS-style explicit type arguments on a call (`Map<string, i32>()` is a parse error today;
     `f<a>(b)` becomes a generic call and the relational chain `f < a > (b)` is given up, as TS
     does).
  4. **`IdentityMap<K, V>` / `IdentitySet<K>`** on the flat-scan rep — the 7-field map struct
     with `ref.eq` as the probe compare and `index`/`hashes` unused; `IdentityMap <: {[K]: V}`,
     `IdentitySet` on the sequence read core like `Set`; `K` = anything `===` accepts; header:
     identity keys keep objects alive, insertion-ordered. Two permanent std names →
     `std-api-reviewer` pass. Closes serde OQ-11 (the cycle seen-set becomes an
     `IdentitySet<T>`).
  5. **The serial — ONLY when a program measures the scan as a problem.** Lazy `i64` on a private
     heap type per keyed class (the `repCanonKey` seam), 0 = unassigned, mixed through
     `fbI32HashMix`, resolved by `ref.eq` (a SEED, never an identity — a wrap is a slowdown).
     Prerequisite: a declared-vs-rep field split in the emitter (`emitStructEqRec` walks the rep
     count today and would compare the slot; `emitStructExprAsVariantBox` copies field-for-field;
     `repStructSlotsTwin` is computed twice and must agree). `flat` classes get no slot and stay
     on the scan. Acceptance: synthesis §2c's four cells + the N/4N timing probe (fail above 6×).
  Still REMAINING from before, unchanged: `boolean`→i32 coercion when storing a comparison
  result; SELF-HOST struct/function-value equality (guarded loudly today).
- 🟡 **A16. Literal-union types.** REMAINING: the **enum representation** (i32 tag for a closed
  literal union — see `docs/guide/unions.md`); a literal union read *inside* a body softens to base
  (coarser member-narrowing there than at the call boundary).
  > **THE NUMERIC LITERAL-UNION FAMILY IS RULED AND SHIPPED, AND IT WAS NEVER A16's.** `type K =
  > 1.5 | 2.5` reps as its **BASE SCALAR** — `i32` / `i64` / `f64` — and membership is a value
  > test. That is not a new decision: `numLitUnionBaseTy` has been its home, `tyKindOf`'s own
  > literal arm states it verbatim, and `emit_rewrite`'s `$fnsig` pin reads it. A16's two open
  > owner rulings (`open-rulings.md` §A16-tag-scheme, §A16-ref-i31) are about how to encode the
  > interned **atom ID** of a STRING literal union inside a mixed union box; a numeric literal
  > union has **no atom ID**, so there is nothing for either scheme to encode and nothing here
  > waits on either ruling. Two filings had concluded the opposite —
  > `xfail-false-reject-numeric-litunion-array-in-signature` re-attributed itself to A16 on
  > 2026-08-23 ("it closes with A16's numeric-literal-union representation, not before"), and
  > `xfail-miscompile-numeric-litunion-empty-list-seed` called it "a feature decision about that
  > family, not a missing arm". **Both are wrong in the same way**: they inferred a missing rep
  > from a missing ARM, because `tyIsLitUnion` demands `litKind == "str"` and every ladder they
  > landed in was the string one.
  >
  > **MEASURED before choosing** (`cdf7940c`, 14 broken cells over a base × position grid, string
  > column 0 broken): the numeric family is used — 71 alias declarations in 36 corpus files plus
  > 37 inline annotations, and **0 in `compiler/` and 0 in `std/`** — and it already WORKED at
  > every scalar position (a `K` param, return, const, struct field, `is` narrowing over
  > `K | string`, arithmetic, a `K` value printed). Every broken cell was an ARRAY position, and
  > the i32 base passed most of them **by accident** — the un-seeded list default IS the i32
  > wrapper, so only f64 and i64 had a cell the default did not fit. Three ladders had the
  > `TyPrim` element case and not the literal-union one (`nodeTyArrayElemRepName`,
  > `tyAnnRefListKind`, `tyKindOf`'s `TyArray` leg), and a fourth site claimed a numeric litunion
  > as an ATOM (`exprIsLitAtom`'s array-element arm, via `nodeTyIsPureLitUnion`, which tests only
  > `is TyLit`) — invisible until a STRING litunion is declared in the same module, because every
  > atom classifier sits behind the module-wide `gLitUnionUsed` that only the string family sets.
  > Grid green afterwards, runtime output pinned. Pins:
  > `tests/cases/soundness/numeric-litunion-{empty-list-seed,array-in-signature}.vl` and
  > `tests/cases/literal-unions/numeric-and-string-litunion-in-one-module.vl`.
  >
  > What the numeric family still does NOT do, and it is a loud reject rather than a wrong
  > answer: `x is K` over `K | f64` is refused (``emitProgram: `is` names a type that is not a
  > union variant``) because both arms rep as the same f64 and the box collapses. That IS an A16
  > question — it is the same discrimination problem the tag scheme exists for — but it is a
  > REJECT, not a miscompile, and it is the only cell of the family that is.
  > **The MIXED-UNION half is DESIGNED AND FILED, not shipped** — `docs/internals/litunion-compact-rep-design.md`.
  > A standalone litunion and the four `ctxKeepsLitUnion` positions ALREADY rep as the interned
  > i32 atom; what does not is the member of a mixed box (`K | f64`), which stores a string ref.
  > **The rationale that justified building it is refuted by measurement**: the store already
  > costs exactly ONE `struct.new`, because the member string is a pooled immutable global
  > (`collectStrPool`) and the payload is a `global.get` — so no rep can allocate less, and the
  > `$vbI32` variant of the compact rep would allocate MORE. The surviving wins are equality (a
  > `ref.cast` + an O(len) `__str_eq__` CALL becomes one `i32.eq`) and correctness.
  >
  > **The correctness population is 81 of 244 grid cells — 42 of them SILENT wrong answers, 34
  > invalid wasm, all `vl check` rc 0** — and it has ONE root cause: `valueAtomKind` has no code
  > for a literal-union member (it returns `-1`), so the box's kind vocabulary cannot name the
  > arm. **35 of its 42 call sites have no compensating litunion leg**; the four defect families
  > are exactly the gates nobody visited. Storing an atom-typed VALUE into `K | f64` emits
  > `f64.convert_i32_s` on the atom ID and tags it f64; reading a narrowed arm back into a
  > `K`-typed position is invalid wasm in 9 of 9 spellings; `K | string` puts a real string on
  > the litunion arm's tag (`x is K` is TRUE for `"zz"`, six lines); `K | K2` reps as a bare
  > string with `is K` const-folded to `i32.const 0`.
  >
  > **A loud reject is NOT available for the collision shapes** — measured: rejecting
  > `K | string` moves 12 `RUN-OK` cells DOWN and `K | K2` moves 4, so they are BLOCKED on the
  > rep rather than independently fixable. Three owner rulings gate the build: the tag scheme (a
  > 14th value-atom kind re-bases both slot bands by a constant; a per-set slot band re-bases
  > them wholesale, renumbering every union box tag in every program), whether `ref.i31` enters
  > the emitted vocabulary (measured available in wasm-tools' shipped set, V8 and wasmtime 47 —
  > and the only encoding that does not regress allocations; the emitter has zero i31 today), and
  > what `K | K2` should MEAN — **and that last one needed no ruling and SHIPPED as slice C
  > (→ `CHANGELOG.md`)**: a union all of whose members are literal unions IS one. The filing's
  > *"only the checker's render has to move"* is REFUTED by measurement (render-only is 2 cells
  > UP and **12 DOWN**) — `tsToTyReal`'s annotation-union arm never flattened a union MEMBER, so
  > `K | K2` interned as a `TyUnion` OF UNIONS, `tyIsLitUnion` answered no, and `anyLitUnionUsed`
  > left `gLitUnionUsed` at 0, switching off every atom classifier in the module. With the arena
  > arm + a canon mirror: **54 cells UP and 0 DOWN over 420** (46 of them silent-wrong → correct), and `K | K2` lands on the exact
  > ten-cell RUN-OK set of the hand-written spelling of its flattened members (19 of 20 when a
  > declared alias for that set exists). The RUN-MERGE variant is ruled OUT with numbers — master
  > already performs it when the flattened alias is declared, and there it is 0 UP / 2 DOWN.
  > TWO follow-on slices remain (A: the atom→box STORE; B: the box→atom READ, which should wait
  > for the rep rulings); the working cells are pinned by
  > `tests/cases/literal-unions/mixed-union-litunion-arm-floor.vl` and the flatten by
  > `tests/cases/literal-unions/union-of-litunions-flatten.vl`.
  > *Also measured: the fuzzer DOES reach litunion-in-mixed-union (26 and 14 of 800 cases on two
  > seeds) and is VACUOUS on every defect family — it only ever stores a member LITERAL.*
  >
  > **THE THREE WITNESSES THIS ENTRY RESTS ON NO LONGER REPRODUCE (2026-08-22, `be49bfcc`).** Run
  > verbatim: F1 (an atom-typed value stored into `K | f64`) tags it `K`; F2 (a narrowed arm read
  > back into a `K`-typed position — *"invalid wasm in 9 of 9 spellings"*) prints `aa`; F3 (`x is K`
  > TRUE for a plain `"zz"`) prints `ok: not K`. Same answers on a seed 81 commits older, so this is
  > long closed rather than freshly fixed. **Three cells are not a 244-cell grid, so this is NOT
  > "A16 is fixed"** — but the two remaining owner rulings (`open-rulings.md` §A16-tag-scheme,
  > §A16-ref-i31) are briefed entirely on the population these three witnesses stand for, and
  > `open-rulings.md`'s section A — *"Something is BROKEN while these wait"* — has no surviving
  > demonstration. **Re-derive the grid before briefing either ruling or scheduling slice B.** The
  > same re-run retired D3 and D4 from `silent-class-inventory-2.md`, D4 being that document's
  > largest filed silent family; the standing rule both corrections argue for is *run the witness
  > before scheduling from the row*.
  >
  > **ORDERING OVER A STRING LITERAL UNION IS CORRECT AND COSTS A WIDEN — the cheaper correct
  > designs are FILED HERE, NOT BUILT.** `<` `>` `<=` `>=` used to compare INTERNED IDS (a valid
  > module, exit 0, wrong answer); they now widen each atom to its member string and take the
  > lexicographic core. Pinned by `tests/cases/soundness/litunion-alias-relational-compare.vl`
  > and the grid beside it. **MEASURED COST**, 20,000,000 comparisons over a 5-member alias:
  > **0.04 s before (the wrong `i32.lt_s`), 0.16 s after, 0.14 s for the identical loop
  > hand-written over a `string[]`** — so the correct answer costs a string comparison plus
  > ~15% for the widen tower, and code size is +205 bytes on a two-member witness (1816 →
  > 2021). Corpus-wide the change is inert: **1685 of 1688 `@run` fixtures emit byte-identical
  > wasm**, the three that move being the new pins. Correctness first was the standing ruling,
  > so this shipped as-is. TWO CHEAPER DESIGNS, both O(1) per compare and neither built:
  > **(a) an id→RANK side table** — one `(array i32)` global mapping atom id to its
  > lexicographic rank, so the compare stays `rank[x] < rank[y]`: two `array.get`s and one
  > `i32.lt_s`, no widen, no string loop, and no change to how ids are assigned. Costs one
  > global sized by the atom count. **(b) assigning atom ids in GLOBAL member-text order at
  > intern time**, which makes the bare `i32.lt_s` correct for ANY pair of atoms (one global
  > order is order-isomorphic to every alias's own). It needs ids to be frozen before emission
  > — today `internAtom` runs DURING emission, from `emitAtomToStrChain` among others — so it
  > is a two-pass change to the interner, and every consumer that reads first-appearance order
  > has to be audited. (a) is the smaller bet; (b) is free at run time. Neither is worth doing
  > until an ordering-heavy shape shows up in a profile — a sort over a `K[]` is the hot one.
- ⬜ **A17 follow-up: `never` inference.** A17 demand-driven inference is shipped, and so is
  half (b) of this row — **the `unconditional-recursion` lint SHIPPED** (`compiler/lint.vl`,
  headline case `tests/cases/lint/unconditional-recursion.vl`). It fires with the return type
  ANNOTATED, which is the spelling nothing else saw: dropping the annotation gets "cannot infer
  a return type", and adding one silences that message while leaving the infinite recursion in
  place. The rule is a clean-PATH existence question — each statement reports whether some path
  through it reaches a function exit or the next statement WITHOUT a self-call, and it fires only
  when the body has neither — so a base case, a self-call in a loop body or one `if` arm, and a
  self-call behind `&&`/`||`/`??` all stay quiet. **Measured 10 firing / 12 quiet over 22
  constructed shapes; ZERO findings across `compiler/*.vl` + `std/`.** Scope is DIRECT
  self-recursion keyed by the declaration's own name; mutual recursion (`f` → `g` → `f`) needs a
  must-call graph over the module and is pinned OUT by
  `tests/cases/lint/unconditional-recursion-mutual-no-warn.vl`.
  > REMAINING: (a) infer `never` for a genuinely base-case-less divergent recursive cycle
  > (currently a stopgap "annotate a return type" error). **This is a LANGUAGE-DESIGN slice, not
  > a bug fix, and it needs an owner ruling** — measured while landing (b):
  > **`never` is not spellable** (`function f(): never` → `unknown type 'never'`), so an inferred
  > `never` is a type hover would display and `--fix`/annotation round-trips could not write back;
  > **`tyIsEmitRepresentable` returns false for it** (`typecheck.vl`), so a `never`-returning
  > function has no wasm functype result and no call-site value rep; and the language's STANDING
  > posture is that a `never`-typed value is a HARD ERROR at its declaration (CHANGELOG "A3 fix:
  > `never`-typed value rejected cleanly", `tests/cases/lint/empty-intersection.vl`), which (a)
  > would have to carve an exception in. The payoff is also now small: the ANNOTATED spelling
  > already checks AND emits fine today (`vl build` rc 0), so (a) buys only the right to omit an
  > arbitrary annotation — and with (b) shipped, omitting it no longer costs the user the
  > diagnostic that names the real bug. Three rulings gate it: does `never` enter the SURFACE type
  > vocabulary; what wasm result does a `never` function declare (no-result + `unreachable`, or a
  > poison value); and what `const x = loop(1)` means when `never` is bottom-assignable to
  > everything (`assignable` already returns true for it).
- ✅ **A-infer-empty. Usage-based inference for empty collections.** Empty ARRAY `[]` inference
  shipped, and so did the `Map()`/`Set()` half this row filed as REMAINING (**A-infer-map-set**;
  headline case `tests/cases/maps/infer-from-set.vl`, `tests/cases/sets/infer-from-add.vl`).
  `const xs = []; xs.push(1)` infers `xs: i32[]`; `const m = Map(); m.set("a", 1)` materialises
  `{[string]: i32}` and the whole Map surface works off it; `const s = Set(); s.add(3)` likewise.
  The un-inferable case still reports the clean "cannot infer — annotate" floor
  (`tests/cases/maps/error-uninferred.vl`) rather than crashing. **One residue is split out as its
  own row below** — the inferred map's VALUE representation.
- ⬜ **A-infer-map-value. An inferred `Map()` only reaches the MONO value reps.** `A-infer-map-set`
  materialises the hole for `i32` and `boolean` values only; **every other value type the annotated
  spelling supports fails to lower**, at emit, with `emitProgram: unsupported map value type (only
  i32 / boolean / string / struct values)` — a message that names `string` as supported while
  rejecting it, because the reject is about the *shape sentinel*, not the type. Measured on the
  current seed:

  | spelling | inferred | annotated twin |
  |---|---|---|
  | `m.set("a", 1)` / `m.set(1, 2)` | **runs** | runs |
  | `m.set("a", true)` | **runs** | runs |
  | `m.set("a", "x")` | **emit error** | `{[string]: string}` runs |
  | `m.set(1, "x")` | **emit error** | `{[i32]: string}` runs |
  | `m.set("a", 1.5)` | **emit error** | `{[string]: f64}` runs |

  **The KEY type is not the axis** — `i32` and `string` keys behave identically; the VALUE type is.
  **Root cause, and it names the fix:** `letMapShapeOf` (`compiler/emit_classify.vl`) is
  **annotation-first** — an `mv` slot `>= 0`, the per-value-type map struct, is minted from *the
  annotation's value type-NAME* (`mvShapeOfMapName(lt.tyName)`). An un-annotated `const m = Map()`
  has no such name, so it falls through to `mapShapeOfExpr` over a bare constructor, which can only
  answer the mono shape or `-3`; `emitMapNew` (`compiler/wasmEmit.vl`) then fails loudly on `-3`.
  So usage-driven inference resolves the map's TYPE without ever minting its REP. Closing it means
  seeding the mv slot from the inferred value type rather than from a spelled name — which is the
  same "keyed structurally at the value" layer the alias-identity note at `letMapShapeOf` already
  argues for, so the two wants converge. `Set()` inference is unaffected (a Set is boolean-valued
  and therefore mono either way). Unpinned by the corpus: `infer-from-set.vl` is the only
  un-annotated `Map()` case and it uses an `i32` value. Ties **A-robust** — this is exactly the
  "audit the other holes (`Map()`/`Set()` empties) for the same clean-diagnostic-not-crash
  guarantee" REMAINING, and today the diagnostic is neither clean nor accurate.
- ✅ **A-infer-null. `let x = null` as a nullable hole.** SHIPPED. `let x = null; x = 5;
  print(x + 1)` prints `6` on the current seed — the `T` in `T | null` is inferred from later usage,
  with flow-narrowing stripping the `| null` on definitely-assigned paths. (Rationale: DECISIONS
  "`let x = null` is a nullable hole".)
- ⬜ **A-infer-params. Top-level function param inference.** Infer named-function param types from
  usage constraints (HM / the existing A13 row-poly inference path), consistent with "hide types where
  possible." Requiring annotations on all named-fn params is NOT VL's stated stance.
- 🟡 **A-exhaust. Exhaustiveness analysis for `is`-chains.** Dead-arm flagging and omit-the-`else`
  return-coverage shipped. REMAINING: **codegen** — elide the provably-true final discriminant test +
  drop the dead arm (a type-driven optimization binaryen cannot do; runtime already correct via the
  no-`else` `unreachable` fall-through; pure size/speed, deferred).
- 🟡 **A-robust. Robustness floor.** An unresolved `Infer`/`Unknown` type must produce a clear
  **"cannot infer — annotate"** diagnostic; it must NEVER surface as a cryptic `Unhandled "Unknown"
  type` codegen error or a `containsInfer` TypeError crash. The main trigger — `const xs = []; xs.push(1)`
  — is fixed (A-infer-empty now infers it, and the "cannot infer — annotate" floor is deferred to
  scope-close so it fires only for a genuinely-unconstrained empty). REMAINING: audit the other holes
  (`Map()`/`Set()` empties, unresolved generic params) for the same clean-diagnostic-not-crash guarantee.
  The `Map()` half has a **named instance**: an inferred map with a non-mono value type reaches emit
  and fails there with a message that lists `string` as supported while rejecting a `string` value —
  see **A-infer-map-value**. That one is a rep gap, not only a diagnostic gap, but it is also the
  concrete case this REMAINING was written for.

---

## Track B — Codegen, memory model & runtime (`wasmEmit.vl`)
*Allocation = WasmGC; binaryen stays (it doesn't block self-hosting). → `DECISIONS.md`.*

- 🟡 **B2. Numeric codegen.** Hex/octal/binary literals + digit separators: SHIPPED (see
  `tests/cases/literals/`). Self-host i64/f64/f32 scalars, `f64[]` arrays, the
  lossless-only implicit-widening matrix, and explicit `x as T` numeric casts (every
  direction — the lossy widenings, narrowings and trapping float→int; see `CHANGELOG.md`):
  SHIPPED (#290–#298). REMAINING: **arbitrary-precision `BigInt` and a `Decimal<Backing,
  Scale>` family** as future `std`-library generic types (not primitives). Prereq: const
  generics (A10). Also REMAINING — an EMITTER GAP, live: **`%` with a float operand emits
  invalid wasm.** `binOpcodeF64` / `binOpcodeF32` (`emit_base.vl:552`, `:591`) return `-1` for
  `%` because wasm has no `f64.rem`; the consumer (`wasmEmit.vl:15514`) guards `if opcF >= 0`
  and falls THROUGH to the i32 tail, emitting `i32.rem_s` over float operands. `vl check` is
  clean, then instantiate fails `type mismatch: expected i32, found f64`. Verified with BOTH
  operands annotated (`f64 % f64`, `f64 % i32`, `i32 % f64`, `f32 % f32`) and on the bare
  literal `5.5 % 2.0`, so it is not an inference gap. A `-1` opcode must fail loudly rather
  than fall through; the language-consistent fix lowers `a % b` as `a - trunc(a/b)*b`.
  Workboard D7.
- 🟡 **B5. Objects.** REMAINING: methods via `self`+UFCS (B14); typed literals in object values
  (`{n: 4<i64>}`); Exact-by-default for values (A8).
- 🟡 **B6. Collections — growable `T[]`.** REMAINING: in-place bulk append (deferred — will be
  `xs.push(...ys)` once variadics land); representation inference (§VL.7 — lower never-grown
  values to a header-less fixed array); `map`/`filter` build-side generics for `Map`/`Set` (A10);
  `.vl`-std migration once a module system exists. (design: `docs/guide/collections-design.md`)
- 🟡 **B6a. `Map` + `Set`.** The **struct/variant FIELD position is DONE** — `{[i32]: V}` now ships
  in every position the string-keyed rep occupies except a UNION MEMBER, for every value type it
  lowers (`string`, a struct, `i32[]`, `string[]`, `f64`, `i64`, `f32`, `V | null`, a union, a
  closure, a nested map): a binding / parameter / return / `| null` / an ARRAY ELEMENT / a closure
  RESULT / a map VALUE / a STRUCT or VARIANT FIELD. The field's mechanism was the filed one: a
  field ROW recorded the map's VALUE name and VALUE type with the KEY ERASED (`sFieldElemName` /
  `sFieldElemTyIx`) while an mv slot's identity is the (KEY, VALUE) pair (B6b), so both field
  tables grew a key column (`sFieldElemKeyI32` / `uFieldElemKeyI32`, written by the ONE row
  recorder and read at the ONE shape home `sFieldMapShape` / `uFieldMapShape`).
  **The LIST-TYPED field element (`{m: {[i32]: V}[]}`) is DONE TOO, and its mechanism was NOT the
  field row's** — the residue `i32MapSpellingLowerable`'s note predicted, re-verified as `vl check`
  rc 0 + invalid wasm, turned out to be one arm short in `ensureRefElemTy`'s `k == 3` (map
  ELEMENT) arm. That arm is the one place EVERY map-typed ref-list element passes through, at any
  nesting and in any position; it forced `mUsed`/`lUsed`/`aUsed` and interned the element map's mv
  VALUE slot but not `mI32Used`, and a missing flag arm falls through to the flag's own `false`.
  `mI32Used` gates the i32-keyed map STRUCT, `__map_probe_i32__` and the per-function 5-slot
  i32-KEY scratch frame, so `mapI32Base` landed on the next frame's base and the store's KEY
  temporary aliased the map-REF temporary at the same local index (`type mismatch: expected (ref
  $type), found i32`, with `call 4294967295` — the -1 probe index — beside it) for an mv-slot
  value, and `mapTypeIdxOf`'s guarded `-4` arm rejected loudly for a mono one. The key was NOT
  erased on the way in: the inline-shape field row's own KEY column WAS written `false` by hand for
  codes 5/28 (the one of five row recorders that did not ask `nameIsI32KeyedMap` of the field's own
  text) and is now uniform, but no consumer reads that column outside codes 19/29, so the erasure
  was latent and not the cause. Measured over a 72-cell key × position × value-rep × op grid: 12
  check-clean-invalid-wasm and 12 loud cells fixed, 0 silently-wrong outputs before or after, and
  the three spellings `{m: {[i32]: V}[]}` / `{m: M[]}` / `type S = {m: {[i32]: V}[]}` emit ONE
  byte-identical module (the third already did, unchanged). Corpus build A/B: 0 of 1858 files
  differ, so 0 new interned types. Pinned by `maps/i32-keyed-list-field-{collect,mono-value,
  alias-element}.vl`, each alone with its key because `mI32Used` is module-wide and a DECLARED
  `type S` spelling covers it. The map-ARRAY annotation arm's hand-written copy of the same
  forcing went with it.
  REMAINING, all
  loud rejects with pinned fixtures: **a UNION MEMBER** (`{[i32]: V} | i32` — the box carries no
  map shape, `maps/error-i32-keyed-position-union-member.vl`); **a list of LISTS of maps**
  (`{[i32]: V}[][]`, one `[]` deeper than the peel, on both the bare and the field spelling —
  `maps/error-i32-keyed-position-array.vl`); and an ARRAY OF CLOSURES returning one
  (`(() => {[i32]: V})[]`). **And the MAP-VALUE position, which the list above and the gate's own
  reject MESSAGE both claim is done and which is in fact a loud reject**:
  `{[string]: {[i32]: V}}` is `emitProgram: an i32-keyed Map/Set is supported as … / a map value —
  not inside '{[string]:{[i32]:f64}}'`, because `i32MapSpellingLowerable` peels a function RETURN,
  ONE `[]` and a `| null` and has no arm for a map VALUE. (`{[i32]: {[i32]: V}}` passes the gate —
  the OUTER key satisfies it before the value is looked at.) MEASURED, not guessed: adding
  `if nameIsMapSpanEnds(bare) { return i32MapSpellingLowerable(mapValNameOf(bare)) }` after the
  leaf test makes the construct + `.size`/`.has`/`.delete` forms run and leaves the corpus at
  1790/0/7 and the grid unmoved — but it opens a position whose VALUE can never be READ back
  (`const g = m[k]; if g != null` over a map-valued map is `bare null needs a struct-typed
  context` on BOTH key reps, the separate loud item below), and a one-line widening of a soundness
  gate wants its own map-value × value-rep × nesting grid, so it is filed rather than landed.
  Also filed, on both key reps: a struct that is a MEMBER of a declared
  union cannot be a map VALUE (`mvValKindOfName`'s last arm asks `structIndexByValName`, which a
  variant is not in — `tests/cases/maps/error-map-value-struct-in-union.vl`).
  (The filed "a SET-typed FIELD has no `.add`" row is STALE — `.add` gates on the VALUE TYPE as
  of `sets/add-through-every-position.vl`, and `{seen: {[i32]: boolean}}` + `s.seen.add(5)` runs.)
  **The `m.get(k) ?? d` METHOD spelling is DONE** — it was taught HALF the fused-read set (every
  `??` rule asked `binLeft is Index`), so it printed the RAW ATOM ID over an atom-valued map and
  turned the non-member default into a LATE emit error; both now resolve the receiver through the
  ONE shape home `fusedMapReadRecvIx`. The **BARE mono-map read's MISS is null** for a
  niche-bearing value too (`{[K]: K}` / `{[K]: boolean}`, not just the `| null` spellings) — `0`
  was a real value there (atom id 0 is the first-interned member, boolean 0 is `false`), so
  `m[missing] == <that member>` read TRUE and the `!= null` narrow saw a miss as present.
  REMAINING on that axis, both loud: a **plain-`i32`-valued** map's narrowed bare read
  (`const g = m[k]; if g != null`) is `emitProgram: bare null needs a struct-typed context` — every
  i32 is a legal value so there is no spare sentinel, and `m[k] ?? d` is the spelling; and a
  **BARE `m.get(k)` with no `??`** is `emitProgram: callee is not a function name` in every
  position, on both key reps and for every value rep (only the FUSED `m.get(k) ?? d` lowers —
  routing the bare method spelling would need the `.get` twin at every `expr*` Index arm, not just
  the `??` ones). Also:
  `map`/`filter` over Map/Set (A10); clean diagnostic polish for unannotated/used `Map()`.
  (Self-host native parity: string-keyed maps, delete, `Set`/`.add`/`.get`, and ref-valued maps
  (string/struct values, #319) landed; map-typed params are the remaining native map gap.)
- ⬜ **B6a-opt. `Set` drops the unused `vals` array** (LOW priority). A `Set` is emitted as a
  boolean-valued map, so it carries a `vals` array that is always `true` (~17% of a Set's memory +
  needless alloc/grow/`array.copy` on resize). The type already tracks `mSet` (a Set is distinguished
  from a real `{[string]: boolean}` Map, which genuinely needs `vals`), so a Set can leave `vals`
  null and skip the vals-touch in new/add/compact/rehash (~5 `mSet`-gated sites). Memory/perf
  refinement, behaviorally invisible; would intentionally diverge from the host (which keeps `vals`
  for sets) as a justified improvement, not a regression.
- 🟡 **B6b. Collections building blocks & open items** (all detail in `docs/guide/collections-design.md`).
  - ✅ **Prerequisite intrinsics** — `__array_new__`/`__array_new_default__` + bulk `__array_copy__`
    (+ `__trap__`, std-design D1), thin `defaultScope`/typecheck.vl intrinsics lowered inline in both
    emitters, monomorphized per element type (native: i32/boolean/f64 element reps; ref/string
    elements fail loudly — emitter long tail). Corpus `tests/cases/intrinsics/`.
  - **Std-over-primitives** — write the collection (and opportunistically `print`) as `.vl` std, not
    compiler-privileged types (ties to H3 / H0 phase 2 `std:` scheme).
  - **Indexing perf** (DECIDED resolutions; sub-choices open) — native-indexing flag (drops B13
    indirect call), ~~backing-pointer hoisting (LICM)~~ **REFUTED for the typed-view descriptor,
    measured — see P1.4 above and `buffer-design.md` §M4**: the emitter can reach only 1 of the 7
    per-element reads (worth 2.9%) and binaryen's `licm` moves only top-level loop-body statements,
    so the repair is an inline-threshold question priced at +82% compiler module size, not a pass;
    bounds-narrowing.
  - **Representation inference** (DECIDED direction; open compiler work) — infer fixed-array vs
    growable rep from usage; interprocedural + alias-unioned; co-design with variance (A9).
  - **Naming & forcing surface — UNCOMMITTED** — `T[]` + inference is the committed surface; names
    `List`/`Array` and any annotation to force a representation are deliberately open.
  - **Language-wide, still open** — value-vs-reference (default reference), error model.
  - **Deferred** — per-frame pooling; user-facing low-level array escape.
  - **Remaining open questions** — capacity/seed construction spelling; `map`/`filter` return type.
- 🟡 **B7. Strings — THE REPRESENTATION MIGRATION IS SHIPPED.** Steps 0–2c are in:
  `std:str` (#1835), Step-0 measurements (#1836), the heap-type split (#1843), the slice
  header with O(1) views (#1845), and the **UTF-8 byte swap** (#1848). A VL string is now
  `(struct (ref (array (mut i8))) $start $len)` — `s[i]` is a **byte**, `.length` a **byte
  count**, `slice` **byte offsets** returning an O(1) view; code points come from
  `for cp in s` / `cpAt` / `cpLen` / `isCharBoundary`. Validity is Go-lean (U+FFFD, never a
  trap). See `docs/guide/strings-design.md`, `docs/internals/string-rep-measurements.md`,
  `docs/internals/str-byte-semantics.md`, `docs/internals/utf8-byte-ready.md`.

  **MEASURED END TO END** (`23b9f55f` → `5f66c6ca`, user-CPU medians of 5 interleaved runs,
  peak RSS; wall clock was unusable — the box averaged 2.7 load, and synthetic
  function-name corpora proved worthless because map probe cost is **bimodal on BOTH
  builds**, see the residue item below):

  | workload | before | after | |
  |---|---|---|---|
  | `vl build` — full self-compile | 2.04 s · 700 MB | 2.05 s · 650 MB | CPU **flat**, mem −7% |
  | `vl check` — whole compiler (5.9 MB) | 1.09 s · **546 MB** | 1.56 s · **284 MB** | CPU **+43%**, mem **−48%** |
  | `vl fmt --check compiler` | 0.49 s | 0.58 s | +18% |
  | seed module | 1,308,280 B | 1,372,836 B | +4.9% |
  | `split` of a 400 k-char string | — | — | **4.4× less allocated** |

  The shape: **memory is much better where strings dominate and CPU is worse there**;
  `vl build` is flat because emit (~60% of a compile) never touched a string. The −48% on
  `check` is the headline win; the +43% CPU is the headline cost.

  **STEP 3 — THE CACHED HASH — IS SHIPPED, AND IT IS NOT THE ANSWER TO THE +43%.** The
  header is now `{backing, start, len, hash}` with `$hash` the ONE mutable field (a memo of
  a pure function of three immutable fields — `java.lang.String.hash`, sound for the same
  reason), 0 = not-yet-computed. It removes **80% of all hashing**: a guest sampling profile
  of a self-compile reads `__str_hash__` at **3.59% → 0.73%** self time. But 3.59% was the
  entire ceiling, so the workload moves **−1.5% user CPU** (`vl check`, n=21 interleaved
  pairs, 1.560 → 1.536 s) at **0 B per string** of memory (§1.2's prediction re-measured
  under all three collectors) and +0.25% seed size. **The `==` hash short-circuit was also
  built, measured, and REJECTED** — it fires, but buys −0.17% (noise), because
  `__map_probe__` already gates its compare on the stored per-entry hash and the direct-`==`
  population is 3–7-byte pooled literals whose byte scan is 1–3 iterations. See
  `strings-design.md` §Equality.

  **WHERE THE +43% ACTUALLY LIVES, measured** (same profile, self-times, master):
  `__str_eq__` **19.2%**, `cTyIxListHas` **12.9%** (a LINEAR LIST SEARCH — nothing to do
  with strings, and the largest single item on the board), `tyTopIndexOf` 3.0%,
  `__str_hash__` 3.6% (now 0.7%). `__str_eq__`'s own top consumers are literal-compare
  chains (`repTreeVKind`, `repTreeListElemName`, `objFieldType`, `litUnionAliasOfLitTexts`),
  not map probes. The next slice should look at `cTyIxListHas` and at turning those
  literal chains into something that is not a chain — **not** at hashing.

  REMAINING, in priority order:
  1. **`__print_string__` is still per-element.** #1848 converted the CLI data-out channel
     (`vl fmt` on 7 MB 0.80→0.46 s) but not this one — a new import functype moves four
     hardcoded indices. **Non-ASCII printing is 15% slower** than before the swap; ASCII is
     unchanged.
  2. **Source intake is still UTF-32**, one code point per word, so the host→guest staging
     path did not get the 4× the storage did.
  3. **`s.backwards()` is unbuilt.** §Codepoints specifies it and UTF-8
     self-synchronisation makes it O(1)/step; nothing consumes it yet.
  4. **`utf8Length` should be deleted** — a second name for `.length` is a trap
     (`utf8-byte-ready.md`), but it is a breaking removal wanting its own slice.
  5. **Map probe cost is bimodal, on BOTH builds** — an 8,000-function corpus checks SLOWER
     than a 12,000-function one, in both directions, reproducibly, under user-CPU timing.
     That is hash-collision luck, not size, and #1848 changed the hash domain (bytes, not
     code points) so it reshuffled which inputs are lucky. **Pre-existing weakness the
     migration exposed rather than caused** — but it makes any per-file benchmark
     meaningless and is worth its own look. **Step 3 did not change this** — the memo
     removes repeat hashing, not collisions.
  6. **True display width ≠ code points** (CJK double-width, combining marks, emoji). `vl
     fmt` counting code points restores pre-#1848 behaviour and no more; a real width
     model is a separate question. `vl fmt` was in fact counting BYTES — every line with a
     non-ASCII character wrapped 2–4× too early — until `dispWidth` in
     `compiler/fmt_util.vl`; §Width in `str-byte-semantics.md` has the repair and why no
     gate in the tree could see it. That helper is the single site a width model changes.

  `docs/guide/strings-design.md` is now a ruled design, and **the "not before bootstrap" gate it
  opened with is LIFTED** (byte-exact fixpoint, TS host gone, `u8`/packed `(array mut i8)` shipped
  with `std:fs` — the substrate). **The design REVERSED its own API ruling:** the core is now
  **byte-indexed** (Go/Rust camp) — `s[i]` a byte and `.length` a byte count, both O(1) — with code
  points by **iteration** (`for cp in s`, `s.backwards()`, `s.cpAt`/`s.cpLen` named and explicit).
  That deletes the ASCII fast-path flag, its constant-propagation heuristic, the **O(n²)
  indexed-loop cliff** on non-ASCII, and the two-coordinate-system seam against `std:regex` byte
  offsets. Storage is UTF-8 `array i8` under a **slice header** `{backing, start, len, hash}` — the
  header is for **O(1) views** (`slice`, `split`), NOT an ASCII flag, and it is what lets a
  re-slice serve as the scanning cursor so VL needs no cursor type. `string` stays **GC**; SIMD /
  word-at-a-time work belongs to **`Buffer`** (B-mem) — wasm SIMD is linear-memory-only and a GC
  `(array i8)` cannot be read as an `i64`/`v128`. `wasm:js-string` is **rejected** (UTF-16
  semantics + browser-only). Ties A7.
  REMAINING, in order: **(0)** measure the two-object header break-even on short strings — the
  compiler's workload is short interned identifiers and that is where the memory claim is weakest;
  **(1)** the **method surface** on today's rep — `split`/`join`/`trim`/`replace`/`startsWith`/
  padding/ASCII case; there are only **six** string methods today and *you cannot split a string in
  VL*. Rep-independent, and it is the fixture corpus the rep change gets validated against;
  **(2) DONE** — the storage + header swap, in three stages: `sTypeIdx` split from `aTypeIdx`
  (2a), the slice header with O(1) views (2b), and **UTF-8 `(array i8)` storage with a
  byte-indexed surface (2c)**. `s[i]` is a byte, `.length` a byte count, `slice` byte offsets,
  and code points come from `for cp in s` / `cpAt` / `cpLen`; validity is Go-lean (no
  validation, U+FFFD on malformed input, `fromCodePoints` substitutes). **(3) DONE** — `__map_hash__` +
  `__string_eq__` to byte level **atomically** with the cached hash: the byte-level half came
  free with 2c (a string IS bytes) and the header memo shipped as Step 3. **Unblocked, and NOT taken here:** wasmtime's
  `ArrayRef::new_from_i8_slice` is i8-only, so `(array i8)` is what lets the host stage source in
  ONE call instead of ~3.4M (B-mem) — the guest-side intake is still one UTF-32 word per code
  point through `srcLoad`, because the change is a protocol edit on both sides and does not
  belong in the stage that moves the unit; and the UTF-8 encode/decode half of **H-M2** (killing
  the Rust host), which now exists in the emitter as `__utf8_dec__`/`__utf8_enc__`. Weigh against the loss of word-at-a-time scanning (`memory-gc-design.md` §2.2) — resolved
  here by pushing that work to `Buffer` rather than to `string`.
- 🟡 **B8. Loops.** REMAINING: `for…in` over objects/maps; `for val, i in arr` and `for , v in obj`
  destructuring forms; **expression `step`** on a counter range (`for i = 1 to 5 step i * 2` — a
  multiplicative/variable step, not just a const increment), distinct from the const-step
  build-loop-fusion descriptor (DECISIONS) and the `step 0` lint (B17);
  **float for-range bounds** (`for i = 1 to 1.5` — today bounds must be i32; open up to f64, maint.
  note on #377); **user-defined iterators** (`for x in <anything>` via an iterator protocol, so
  `for…in` is not array/map-only — maint. note on #377).
- ⬜ **B12. Concurrency — and it is NOT `async`/`await`.** The model is RULED (owner,
  2026-08-22) and written up in `docs/internals/concurrency-design.md`; nothing is built.
  **I/O concurrency is UNCOLOURED and direct-style** — an I/O function is an ordinary
  function, suspension is the host's business (stack switching) and is invisible in source,
  so `std:fs` can ship against a blocking host and gain concurrency later with ZERO source
  changes anywhere. Concurrency is requested with **one optional argument on `map`**
  (`urls.map(f, 8)`), which is bounded and structured by construction and has no unsafe
  spelling — omitting the limit gives SERIAL, unlike `Promise.all`, where the hazard is
  reached by writing less. Results are `(T | E)[]`, needing no machinery beyond the ruled
  error model. **CPU parallelism is DEFERRED** (a worker is a separate heap, and those
  restrictions are artifacts of WasmGC references not crossing threads *yet* — baking a
  temporary platform gap into a permanent surface is how you get two APIs); multiple cores
  stay a HOST capability, where `vl test`'s `parallel_map` already uses them. An **inferred
  effect analysis — never written down, never in a type** — powers three things: the
  "these run one at a time" lint, mechanism selection, and eliding the concurrency
  machinery when a callback cannot suspend. `async`/`await` is REJECTED with reasons
  (ecosystem duplication; the CPS transform; `await x as T` on every fallible call);
  `await` stays a reserved keyword and `async` stays a legal identifier.
  **Browser parity is deliberately off the initial path** (owner, 2026-08-22) — blocking
  I/O is trivial under wasmtime and *not implementable* on a browser main thread.
  Sequencing (steps 1–3 need no async decisions at all): host ABI batch → `std:fs` →
  the `as` trio (steps 1-3 DONE: `std:args`/`std:fs` ship, and `as`/`as!` lowered
  2026-08-24 — `as?` refused at the checker, and it is the lossy member) → stack
  switching → `map(f, limit)` → effect inference.
  **`map` should be std** (owner, 2026-08-22) and the blocker is one intrinsic, not the
  optimizer: the builtin does NOT inline the callback (`call_indirect` per element, same
  as std would pay), it buys a pre-sized `array.new_default`; `mapIndexed<T, U>` in
  `std/array.vl` is the existence proof that a generic std `map` is writable today, and
  the residue is a generic, monomorphization-aware sized-array constructor
  (`__array_new_default__` is i32-only — its element kind "is not derivable from the
  argument list").
- 🟡 **B13. Well-known-symbol dispatch.** REMAINING: callable objects (`"()"`).
- ⬜ **B13a. Multi-index matrix idiom** (low priority). Single-bracket `m[i, j]` → multi-arg
  `"[]"`/`"[]="` + flat-backed `Matrix`/`Grid` type. Nested `m[i][j]` already composes today —
  including over B14's free index operators, where the outer receiver is the inner operator's return
  type (`tests/cases/index/operator-overload-by-receiver.vl`).
- 🟡 **B14. Methods via explicit `self` + UFCS.** Free INDEX OPERATORS ship — `function "[]"(self: T,
  i: I)` / `function "[]="(self: T, i: I, v: V)` make `x[i]` / `x[i] = v` a direct call, dispatched
  by the receiver's TYPE (so two receivers with the identical structure dispatch apart on their
  nominal brands), overloadable per receiver, and merge-safe across modules.
  `docs/internals/index-operator-design.md`. REMAINING: route the ARITHMETIC/comparison operator
  dispatch (B13) through the same registry — a free `function +(self, b)` works single-file but is
  NOT found across the module merge (`lookup(op)` uses the raw name; measured); `c.area` (no `()`)
  as a bound value; mutation/variance (A9).
- 🟡 **B15. Lambdas + declaration-vs-value.** SELF-HOST function-value ABI shipped (#306: `call_ref`
  + closure struct, non-capturing + capturing; design `docs/internals/selfhost-lambdas-design.md`); escaping
  closures + function-valued struct fields shipped (#310); `.map`/`.filter` EMIT is the next slice
  (see Next). Pinning-by-use for an UN-ANNOTATED function taken as a value is now the rule rather
  than the exception: `monoCoerceFnValue` materializes a concrete instance at every typed boundary
  a generic function value crosses — an annotated binding, a concrete function-typed call
  ARGUMENT, an annotated RETURN, an ARRAY element, a struct FIELD (declared alias or inline shape)
  — and a binding used only as a direct-call callee monomorphizes per call site at FUNCTION and
  MODULE scope alike. REMAINING: a generic passed to a HOF whose CALLBACK PARAMETER is itself
  un-annotated (`function apply(g, x, y) { return g(x, y) }`) — nothing declares a type to
  materialize against, so it needs the callback's type inferred from the HOF's own BODY. The
  reject names the function, the un-annotated parameters, and the signatures the program's own
  call sites already pin (`error-generic-fn-value-inferred-hof.vl`). What a nested CAPTURING
  function still owes this entry is exactly ONE arm and it is loud: a nested function whose OWN
  parameter is un-annotated is lowered through the value ABI at the i32 default and hits that
  reject even though it is only ever called directly by name (`function o(n) { function k(x) x +
  n; k(1) }`). The f64/string half of that family was NEVER this ABI — it was the env FIELD and
  the READ out of it being typed by different answers, closed under workboard D8; the tell is that
  annotating `k`'s parameter does not move it while annotating `o`'s does. Also open: an inline
  object shape that COINCIDES with a declared alias's shape is a separate emitter limit
  ("binding's inline-shape type has an unsupported field"), unrelated to generics.
- ✅ **B15a. Optional params + default values — v1 COMPLETE (#2225), ruled 2026-09-01.** Nothing
  open. **Direct-call-site sugar**, and **defaults subsume optionals** (`p?: T` is desugared in the
  PARSER to `p: T | null = null`; only a surface marker survives, for the printer). A call omitting
  trailing arguments — or, named, skipping a middle one — is normalized to full arity before
  mono/collect, so the callee's signature, the monomorphizer's instance keying and the `$fnsig`
  closure ABI are all untouched. **The sequencing note ("after the rep Phase-2 `$fnsig` interning
  wave") was NOT live and is retired**: `fnSigKeyOf` keys off the DECLARATION's parameter list,
  never a call site's argument count, and the rewrite classifies its callee with the same
  `fnIndexOfInScopeChain` `emitCall` uses — so a function VALUE keeps full arity (`const kv = k;
  kv(1)` is still an arity error, pinned).
  **THE SEMANTICS, and everything else follows from it: a default expression comes from the
  DECLARATION and its NAMES RESOLVE THERE; only its EVALUATION POSITION is the call site.**
  The admitted set is exactly the three forms for which that sentence needs no machinery — a
  **literal**; a **module-scope `const`** (resolved against the module frame, then MARKED so no
  caller-local of the same name can capture the substituted reference, and renamed by the merge so
  a dependency's default takes ITS module's binding); and **`__callsite__`**, a
  `{ file: string, line: i32, col: i32 }` value legal in no other position. `const` and not `let`,
  so declaration-time and call-time evaluation stay indistinguishable and v1 owes no answer about
  which it meant. Three more rules, each pinned by a reject case: a default must be **annotated**
  (a hole and a default stay disjoint, which is what keeps mono out of it); defaults are
  **trailing-only**; and a defaulted parameter's annotation may not name the function's own **type
  parameter**.
  **The two things that closed here rather than shipping as remainders.** UFCS took the same
  ARITY RANGE the plain spelling takes — `5.scale(2)` == `scale(5, 2)` — because the earlier
  reading ("widening the receiver-injecting rewrite changes DISPATCH") is true and is not a reason
  to leave two spellings of one call disagreeing; both halves now read the declaration's range
  (`ufcsCallTy`, `drwSelfFnOf`) so they cannot drift. And `__callsite__` is the one default whose
  NODE is per-site, minted by a usage-gated pre-pass BEFORE `checkProgram` sizes `nodeTyIx` — the
  D969 placement rule, the same one `parseTemplate` follows.
  Intrinsics don't wait on this — `__trap__(msg?)` (error-handling-design.md) is bespoke checker
  arity, like existing builtins. `DECISIONS.md` §"Default arguments v1".
- ⬜ **B16. Redeclaration / overloading.** Current: same-scope redeclaration errors; nested shadowing
  allowed (uniquified in codegen) — INCLUDING a block-scoped local that shadows a PARAMETER, which
  codegen ignored outright until the live lexical binding was made to outrank the param in both
  halves of name resolution; witness `tests/cases/scope/local-shadows-param.vl`. Future: ad-hoc
  overloading? Default "no" → `DECISIONS.md`.
- ⬜ **B6c. An UNCHECKED map read — the fast path beside the boxing fix.** Filed 2026-08-25
  from the owner's question when the boxing fix was approved: *"we should maybe figure it an
  unsafe fast path?"* Not scheduled; recorded so the shape is not re-derived.
  - **Why it becomes worth having.** A map MISS on a numeric-valued map currently narrows as
    PRESENT (`tests/cases/soundness/xfail-miscompile-map-scalar-miss-narrows-present.vl`), and
    the ruled fix is to BOX the read wherever it is consumed as a nullable — measured at a
    proxy ~1.11x / 1.2 ns per read. That is the right default. It is also the first time a
    correct map read costs anything, so the escape hatch stops being hypothetical.
  - **THE SPELLING IS ALREADY RULED: `m[k] as! V`.** The owner's question found the better
    answer than the `getUnchecked`/`m.at(k)` name filed here first. `as!` is the trapping
    member of the ruled `as` trio (`error-handling-design.md` §Trio) and it already MEANS
    exactly this — "a miss is a bug" — so the hatch needs no new name, only a lowering.
  - **It is free, not merely cheap, and that is the point.** The union box exists solely to
    carry WHICH ARM a value is; `as!` asserts the arm, so there is nothing left to carry:

    | | the correct read (#1901) | `m[k] as! i32` fused |
    | --- | --- | --- |
    | probe | `entry != 0` | the same compare |
    | miss | build the null-tagged box | `unreachable` |
    | hit | 2 allocations | **0** — the raw scalar |
    | extra branch | — | **none** — the trap rides the probe's own compare |

    So this is not "unsafe for speed" — it is the same work with the box deleted, and the
    only thing given up is a recoverable miss, which is precisely what `as!` is for.
  - **BLOCKED ON A PREREQUISITE, and it is not about maps.** Measured 2026-08-25: the `as`
    trio does not accept `T | null` as a SOURCE at all — `f() as! i32` over a
    `function f(): i32 | null` is `` `as` supports numeric conversions only ``, and so is
    the `string | null` twin. The trio works on multi-arm unions (`Circle | Rect`) only. So
    the order is: extend the trio to nullables FIRST (its own change, useful on its own),
    then fuse the map-read case. Not measurable before that — there is nothing to compile.
    Contrast `std:buffer`'s hoisted accessors (§M8), which kept their fence precisely because
    dropping it bought nothing there.
  - **Measure BEFORE building it.** Two of the three obvious customers may already be served:
    `m[k] ?? d` does NOT box (it probes the entry table and coalesces), and a `for k in m`
    loop already has the entry in hand. So the residual population might be small enough that
    the hatch is unnecessary — establish that it is not before widening a permanent surface,
    the same discipline the `getF32At` addition was held to.
  - **std, not the compiler**, if it lands: `Map` is a compiler-known type but this is
    POLICY over an existing probe, the same call `std:buffer` made for `Buffer` (O1 = (c)).
    A std export means the `std-api-reviewer` gate applies.
- ⬜ **B6d. Lint: a `.has(k)` guard whose body re-reads `m[k]`.** Filed 2026-08-25 from the
  owner's question — *"if the user checks `m[k]` manually, do we narrow a later assignment,
  saving allocations?"* The answer is NO, and the guard makes it WORSE, which is what makes
  this worth a diagnostic rather than a doc line. Measured in one loop, `-O3`, in-loop:

  | spelling | allocations | probe calls |
  | --- | ---: | ---: |
  | `const v = m[k]` then `if v is i32` | 1 | 1 |
  | `if m.has(k) { … m[k] … }` | 1 | **2** |
  | `if m[k] != null { … m[k] … }` | 1 | **2** |
  | `m[k] as! i32` | **0** | 1 |

  - **Why it does not narrow, and why that is right.** `m[k]` is not a stable place. Carrying
    "present" from the guard to the read needs a proof that nothing mutated `m` and nothing
    changed `k` in between — including through any call — which is an aliasing analysis, not
    a narrowing rule. TypeScript declines the same thing for the same reason: it narrows a
    BINDING (`const v = m.get(k)`), never a repeated call. So the language's answer is bind
    once, and that answer is fine; what is missing is telling anyone.
  - **The shape is syntactically local**, which is what separates this from B17's harder
    rows and from the union-let lint (which needs rep knowledge, see the P1.3 row in
    `webcraft-requirements.md`): a `.has(k)` / `!= null` guard whose body reads the SAME
    receiver with the SAME key expression, with no assignment to either in between. Precise
    to detect, mechanical to fix, and the fix is one of two spellings the language already
    has (`as!` for an assertion, or bind once and narrow).
  - **Why it will actually fire**, unlike the union-let lint's zero hits: `if m.has(k)` then
    `m[k]` is the spelling people reach for from memory, because it is what every other
    language teaches. It is currently the worst-performing of the four.
- 🟡 **B17. Diagnostics + lint.** BUILD OUT — the lint rule backlog (a few at a time). Shipped (see
  `CHANGELOG.md`): prefer-`const`, unused-import, dead/constant branch (`constant-condition`), `step 0`
  (`for-step-zero`), unreachable-after-return / -break / -diverging-if/else, unused function,
  match-arm coverage via the unified lint walker, binding-keyed use tracking. REMAINING:
  - **division by constant zero** — a literal / constant-foldable zero divisor: hard **error** for
    integer division (`x / 0` WILL trap at runtime — wasm `i32.div_s`), **warning** for float
    (`0.0 / 0.0` is a defined quiet NaN per IEEE-754, but a literal zero divisor is almost always
    a typo). Runtime semantics stay untouched (int: trap; float: IEEE NaN/±inf — the standard
    modern-language split). Precedent: the `for-step-zero` lint.
  - **discarded call result** — a non-void call whose result is silently dropped at statement
    position (`work()` for an `(): i32`) is likely a bug; warn (with an explicit-discard escape
    hatch TBD, e.g. `_ = work()`). Codegen correctly emits `drop` today
    (`tests/cases/statements/discarded-call-return.vl`); eliding a provably-pure dropped call is
    binaryen `optimize()`'s job, not ours. (Very low priority.) An intentional bare assignment
    STATEMENT (`x = 5`) is fine and never warns — assignment-as-expression yields the RHS by
    design (→ `DECISIONS.md`).
  - **assignment-of-a-literal in condition position** — `if x = true { … }` (especially with
    `x: boolean`) slips past the mandatory-bool condition check because the assignment
    EXPRESSION types as the RHS; an assignment whose RHS is a LITERAL inside a condition is
    almost certainly a mistyped `==`. Warn. (The non-literal form `while (line = next()) != ""`
    is the intended idiom and stays clean.)
  - **per-line / per-file diagnostic suppression** — an `// vl-ignore <code>` (line) /
    `// vl-ignore-file <code>` mechanism so any lint can be locally silenced; prerequisite for
    shipping opinionated lints like the two above. Diagnostics already carry stable `code`s.
    (Low priority.)
  - **LSP quick-fixes** (code actions): "remove unused binding" / "prefix with `_`" / "`let`→`const`".
    Diagnostics already carry stable `code`s; the LSP has no code-action provider yet.
  - ~~**an inference HOLE renders as `any` in user-visible diagnostics**~~ **DONE** — a hole
    now renders as the blank `_` (*"comparison expects numeric operands, got `_` and string"*,
    *"cannot assign `(_, _) -> _`"*), so the diagnostics no longer contradict
    `docs/guide/soundness.md`'s "**No `dynamic` / no implicit `any`**". Chosen from this
    entry's own shortlist by elimination: `?` already suffixes a nullable in the SAME renderer
    (`{bar: ?}` one token from `{bar: T?}`), `<hole>` adopts the angle-bracket shape the
    renderer reserves for ABSENCE (`<none>`/`<error>`/`<?>`) when a hole is present, and every
    bareword (`unknown`, `unsolved`) repeats `any`'s category error of looking like a type NAME.
    Workboard E7.
  - Cross-cutting: thread `severity` through all remaining error variants; consistent message style.
- 🟡 **B-mem. Linear memory — make it a design, not a scratch page**
  (design: `docs/internals/memory-gc-design.md`). The collector half shipped (`vl run` on the
  engine's tracing collector + the `$VL_GC` knob). REMAINING, in order:
  - **Audit gaps** — nearly closed. TWO of the seventeen memory builtins declared in
    `typecheck.vl`'s default scope have no emitter lowering: `__store_string__` and
    `__log_string__`, bridges for a `__log__` path the native emitter replaced with an in-module
    decoder, which nothing reaches (`buffer-design.md` O8 proposes deleting both declarations
    outright). The diagnostic half is done — an unlowered builtin is a positioned CHECKER admission,
    not `call to unknown function`.
    *(This bullet used to read "SEVEN of the ten … The store/load matrix is also asymmetric — four
    `__store_*__` widths, only `__load_i32__`." The seven was right; the "four store widths" counted
    DECLARATIONS — measured, only `__store_i32__` ever lowered. Seven loads plus
    `__memory_size__`/`__memory_grow__`, then the three wide stores, have since been lowered, which
    is what moved the count from seven to five to two. It also said "the matrix is now asymmetric the
    OTHER way: eight load widths, one store width" — true until the store slice.)*
    The matrix is now symmetric for every scalar VL has; only the narrow 8/16-bit stores are absent.
  - **Bulk host I/O — BOTH halves shipped** (`perf-program.md` §6 in, §7 out). The driver exports
    `srcLoad` / `modKeyLoad` / `modSrcLoad` / `cliResultLoad`; a `__load_i32__` in those loops sets
    `memUsed`, which materialises the memory the host stages through (exported as `memory` per P0.2
    — no `.vl` file can name an export `ioMem`, so `StrIn::probe` gained one line and now probes
    `ioMem` then `memory`). **4,565,054 host calls per self-compile became 279; the host's
    `stage_program` phase went 192 → 135 ms, `vl fmt --check compiler` 577 → 518 ms**, peak RSS
    unchanged. No `Reserve` (VL has no list-capacity primitive) and no seed split (the published
    seed compiles it).
    **The OUT direction is the mirror and also shipped** (`perf-program.md` §7): the GUEST writes the
    same window and the host copies out. `rbyteStore(off, count)` packs emitted BYTES four per i32
    word — chunk = the whole 65,536-byte page — and `cliCmdDataStore(off, count)` writes CLI payload
    code points one per word. **A self-compile's read-back went 1,112,716 host calls → 17 and
    `[profile] readback` 17 → 1 ms; `vl fmt compiler` went 4,520,527 calls → 290 and 545 → 486 ms.**
    Same presence probe, same 2×2 fallback, still no seed split. The channels left per-call were
    MEASURED small first: 300 diagnostics are 9,790 calls / 0 ms, `cliCmdPath` is one path, and a JS
    consumer pays ~3–5 ns a call (the LSP's `fmtByteAt` over the repo's largest file is 4.93 ms).
    **Still to weigh, and now only for a future B7:** wasmtime 47's `ArrayRef::new_from_i8_slice`
    builds a GC array from a host byte slice in ONE memcpy — no linear memory, no data section, and
    it would remove the element loop that survives on BOTH sides here. It is **i8-only**, so it lands
    free the moment strings are `(array i8)` (B7) and not before. Sequencing question, not a fork.
  - **The tier itself** — an allocator (bump/arena), a data section, and the `Buffer`/`Array<T>`
    escape (`collections-design.md` §OQ.7), designed once for FFI / SIMD / bulk-I/O rather than
    accreted as intrinsics. Not a second object model → `DECISIONS.md`.
- ⬜ **B-hint. Emit branch hints** (`wasm-toolchain-audit.md` §4.0). wasmtime reads the
  `metadata.code.branch_hint` custom section to lay cold blocks out of line
  (`Config::wasm_branch_hinting`; off by default until the proposal is fuzzed, so the host opts
  in). Hints are ADVISORY — never semantics — so a wrong hint costs speed, never correctness,
  which makes this the cheapest optimization channel VL has. The emitter already writes a custom
  section (`selfhost-name-section.md`), and the checker already knows what an engine cannot infer:
  `is`-guard arm ordering, null checks the narrowing pass proved, and the provably-true
  discriminants A-exhaust computes. Start with the one-sided cases (a trap arm is cold; a
  `?? default` fallback is cold) and measure before widening.
- ⬜ **B-alloc. Allocate less** (the real answer to GC pressure, `memory-gc-design.md` §4.4).
  Heap2Local on the DEFAULT path (today `wasm-opt` runs only under an explicit `-O`, so the pass
  `DECISIONS.md` leans on is opt-in); representation inference (B6 §VL.7) to drop the
  `{backing,len,cap}` wrapper for never-grown lists; more union-arm niche encodings to drop
  `{tag,value}` boxes; `Set`'s dead `vals` array (B6a-opt).
  **MEASURED 2026-07-29** (`docs/internals/perf-program.md` §2.1): a self-compile peaks at
  **511 MB** of never-reclaimed GC heap for `compiler/*.vl` (100,238 lines / 4.56 MB — ~112 bytes
  of heap per source BYTE) under the null collector,
  and the static census says why — `string` is `(array (mut i32))`, so every one of the binary's
  2,573 string literals is an i32-per-code-point array. The same document rules that **`flat`
  records are NOT this lever** (P1.2 is a declaration feature with zero emitter lines; the
  flat-able i32 sidecars are ~10% of self-time against the string layer's 33.6%) and names the
  adjacent one that IS: bulk host↔guest staging over the now-host-visible linear memory, whose
  host half is already written and waiting on `ioMem` + `srcLoad` exports. **That staging item has
  since shipped** (§6) — and it moved TIME, not memory: peak RSS read 511.2 → 511.3 MB, because the
  GC-side accumulator is unchanged and only the host CALL was removed. Allocation is still this
  bullet's problem.
- 🟡 **B-sym. Identifier interning** (`docs/internals/identifier-interning-design.md`;
  `perf-program.md` §3 item 2, §8 and **§9**). **THE TABLE AND PHASE 3 SHIPPED.**
  `compiler/symbols.vl` holds one intern table with a whole-program id space, an ARENA-NODE
  side table as the carrier, and the eight in-place name writers notifying it; the three
  whole-program name→index maps (`globalNameMap`, `fnNameMap`, `parentLetOf`'s per-block map,
  plus `nestedNameSet` and the `startBlockLetOf` memo) are sym-indexed dense arrays, and ~70
  call sites feed them `sidOfNode(<the index they already held>)`. **The re-baseline CONFIRMED
  the phase table it was required to re-derive** — phase 3 6.32% against 6.2 predicted, phase 4
  4.73% against 4.4, phase 5 1.63% against 1.6 — so this is the rare case where the plan
  survived contact. Phase 3 is worth **−4.5% of a self-compile** (interleaved profile A/B, 14
  runs per leg; min-of-41 wall clock −4.2%/−5.6% against a ±1.1%/±2.2% control band) and
  **2,466,975 → 479,079 string-keyed probes per self-compile, with ZERO divergences over
  2,371,115 both-implementation comparisons**. −1,383 compiler bytes.
  **Three findings worth carrying.** (1) **R3 was confirmed by a dead-exact WASH**: the
  intermediate build that converted the maps but left every caller passing a string read
  `sidOf` + `sidLookup` = 6.33% against the 6.32% it replaced — *interning at the point of use
  has already paid the probe it was meant to save*, and the entire win came from the carrier.
  The carrier is read **20.5× per intern (95.1% hit rate)**. (2) **A SID-keyed table aliases
  across programs where its NAME-keyed predecessor did not** — sid 3 exists in every program,
  the spelling `foo` does not — so every sid-keyed table must be dropped where the id space is;
  missing that failed **18 wasm-harness cases that each pass in isolation**. (3) **The fixpoint
  ladder is BLIND to all eight name-writer poisons; the suite and the corpus are the
  witnesses** — the filed "six poisons redden ONLY the ladder" reading did not reproduce at
  the merge gate and `perf-program.md` §9.6.1 retracts it with the re-measurements. Writers
  1–3 (the driver merge) are provably inert today because the carrier is empty before emit,
  and they are kept as defence, not as covered code. **Phases 4 and 5 remain**: `lookup` is now
  the largest single string consumer (2.83%) and the undo-log rewrite is small — but
  `perf-program.md` §9.7 records the blocker, that `T.scopes[top][name] = v` and
  `T.scopes.pop()` are the self-compile's only exercisers of two emitter arms. Historical
  context follows.
  The largest compiler-side perf item, and the re-baseline
  it required **re-ordered it**. The SYMBOL/IDENTIFIER consumer class is **19.59% of a
  self-compile** (12 warm guest runs, 20,985 samples) — but it has no hotspot (largest member
  3.07%, top five 10.31%), and four of its biggest measurable costs were not about identity at
  all: a full capture re-WALK per returned identifier (4.35%, one call site), four un-hoisted
  `fnStmtsPosOf` calls in one frame (4.34%), a whole-arena rescan per `nameNamesFunction` query
  (2.64%), and `parentLetOf`'s double map probe (1.64%). **Those four plus `keywordKind`'s
  19-way chain shipped and are worth −11.1% of a self-compile** (interleaved min-of-21;
  `vl check`/`vl fmt` structurally flat as controls at −0.1%/−0.9%), with no intern table and
  no new ID space. The design holds the rulings for what remains: ONE table in a new leaf
  `compiler/symbols.vl`, a WHOLE-PROGRAM id space (per-module would have to be remapped at the
  merge, and `modRenamed` is itself a top consumer), an **arena-node side table as the carrier**
  (interning at the point of use is not a win — a `sidOf(name)` call has already paid the probe
  it was meant to save), the eight in-place name writers that must notify, and R6: a name→index
  map becomes a **sym-indexed dense ARRAY**, not an i32-keyed map, because the id space is dense
  and "a later id is a different string" makes `sid >= len ⇒ absent` exact. Phases 3-5 are the
  three whole-program name→index maps (6.2%), the checker's scope chain (4.4%) and the merge
  rename table (1.6%). **Also ruled: `keywordKind` on interned ids is a NO** — a closed
  vocabulary needs an enumeration, not a table — and the same applies to the whole TOKKIND class
  (2.47%, a class neither earlier split had). **The sabotage worth remembering: a COLLISION in an
  identity table is invisible to the fixpoint ladder, to the six-channel corpus A/B over 1,713
  files, and to all 3,610 tests** (§8.4); `tests/cases/objects/anon-field-value-name-not-a-function.vl`
  is the gate that now names it.
- 🟡 **B-ci. CI wall clock** (`docs/internals/perf-program.md` §1). `ci-native` crept 74 s → 89 s
  p50 / 106 s p90 by 07-29; the forensics over all 1,317 master-push runs say the creep is
  **not** compiler speed (the self-compile step is 9 s of 89) but three step-level costs: the
  native-align suite's ~1,618 SERIAL `vl check` spawns (27 s), a 1.2 GB cargo-target restore
  (17 s) and a per-push `--features embed-seed` cargo build (15 s). SHIPPED: the embed-seed build
  is now the parallel `ci-embed-seed` job, the target-dir restore is gated on the `vl-bin` cache
  missing (97.9% hit rate), and the align spawns are pooled (13.1 s → 4.6 s locally, interleaved
  min-of-3, same 1,797/0). **MEASURED ON THE RUNNER over two runs: `ci-native` 89 s p50 → 42–50 s**
  — the align step 27 → 19/20 s (four cores cap what 2.8× local predicted), the 17 s restore
  skipped, the 15 s embed build gone; workflow wall clock 89 → ~50 s. REMAINING: a
  `vl check --batch` mode would take the last ~1,600 spawns to a handful (§3 item 5), and
  `build.rs`'s `VL_SEED_KEY` forces a full crate recompile of the embed job every push (§3 item 8,
  ~16 s on a job that is not the critical path — the 48 s first reading was runner variance, and
  §1.5.1 records that correction as the method point it is).
- ⬜ **B18. Tail-call optimization** (low priority). binaryen 130 has `return_call`; detect tail
  position and emit it.
- ⬜ **B-chore-liststore-fuse. Re-fuse the three split-form list stores in `emit_rep.vl`**
  (one-liner). The indexed-store eval-order fix (the #918 family's LIST twin — `a[i] = f()`
  where `f` reallocates `a`'s backing) landed, but #921's split-form workarounds at the tree
  builders (`rtGo`'s array arm, `rtOfNullable`, `rtOfMap` — comment-marked) must stay ONE seed
  generation: the published seed's store lowering predates the fix (bootstrap ordering, the
  #918 precedent). Once a seed containing the fix publishes, swap each split temp back to the
  fused `rtChild[ix] = …` store.
- 🐛 **B-bug. `while` as the tail statement of a void function crashes binaryen's Vacuum pass.**
  A `while` loop in *tail position* of a `void`-returning function body aborts inside binaryen
  optimization. Workaround: don't end a void function on a bare `while`. Fix: investigate the
  Vacuum-pass input for a result-less loop in tail position (likely a malformed/None-typed block tail).
- ⬜ **B-validwasm. Codegen must emit valid wasm WITHOUT relying on binaryen `optimize()`.** Some
  constructs (nullable-ref narrowing after null-checks, divergent loops, maps/sets, recursive types)
  currently produce valid wasm only after `optimize()` runs. The H4 self-hosted emitter path has no
  binaryen, so codegen must produce valid wasm pre-optimize. Surfaced by the `VL_NO_OPT` experiment;
  prerequisite for H4 / H-M2 (emit-bytes-directly). Audit each construct that relies on binaryen to
  legalize its output and fix the IR-builder to emit legal wasm directly.
- ⬜ **B20. Loops as expressions + `break <value>`.** Lift `for`/`while` into expression position;
  a loop evaluates to its `break` value or `null`. Three layers: grammar → types (mirror the
  `returnTypes` mechanism) → codegen (`__brk` block gets a result type).
- 🟡 **B21. `match` over tagged unions (payload binding).** Phase 1 (literal-union `match`,
  exhaustiveness-by-default — a missing arm is a hard error, à la Rust/Swift), **phase 2a
  (VALUE-union scrutinees)** and **phase 2b (PAYLOAD BINDING)** have shipped (→ `CHANGELOG.md`;
  `tests/cases/match/*`). Phase 2a is the
  discrimination half: an arm pattern is a member TYPE (`C =>`, `i32 =>`, `null =>`, `A | B =>`),
  parsed into a real `IsExpr` over the scrutinee, so compiler-enforced completeness now covers
  structural/tagged-union discrimination — the complement to the if-chain coverage check
  (A-exhaust), which cannot demand completeness at all. Every arm binds the narrowed member.
  Phase 2b is the binding half: `Move{x, y} => x + y` binds one arm-local `const` per punned field,
  desugaring to the `const x = scrut.x` prepend the plan called for — byte-identical to the
  hand-written if-chain twin across 18 measured cells.
  REMAINING:
  1. **Payload binding: the two richer clause forms.** ~~Flat punned binding~~ **DONE (phase 2b).**
     Still open, both measured as one-branch extensions in `docs/internals/match-design.md`:
     **renaming** (`Move{x: a}` — the formatter already reads the binding name off the `LetDecl`,
     so it is a parser branch plus a `field: name` print) and **nested destructuring**
     (`Move{p: {x, y}}` — needs a `Member` CHAIN initializer and narrowing through it).
     ~~Also open and NOT phase-2b-specific: a binding arm cannot be a `const` INITIALIZER~~
     **DONE (C6)** — an if-expression arm's value is now its LAST statement and everything before
     it is the arm's PRELUDE, so `const r = match u { A{a} => a … }` and the hand-written `if`
     twin both lower, in every join rep. The prelude is lowered only where the collect pass
     allocated its locals in the order the emitter's local cursor replays — a binding INITIALIZER
     and a `return` operand. The two positions it does not walk (an if-expression buried deeper
     in an expression, e.g. `print(match u { A{a} => a … })`; a TOP-LEVEL binding, whose `const`
     is a module global and whose start-function collection never sees the initializer) are LOUD
     rejects naming the supported spelling. Widening either means teaching collect to walk
     expressions / global inits in emit's evaluation order — the slot pre-order is the whole
     constraint, and `armPreludeBlocks` is what keeps a mismatch loud instead of silent.
  2. **Unions with LITERAL members** (`0 | 1 | 2`, `"x" | 7`) — refused at the type tier today
     (`match over a union with literal members is not supported`) because an arm's test would be
     `n is 0`, which the emitter has no rep for (`literal \`is\` over a struct union is not
     supported`, on master too). Two ways out: teach the emitter the literal `is`, or route a
     homogeneous numeric-literal union through phase 1's `==` arm path (its members already
     canon-collapse to the base scalar).
  3. **A `_` written before other arms is silently REORDERED to last** (phase 1 behaviour, unchanged:
     `desugarMatchAt` makes the wildcard the bare `else` wherever it sits, so `match k { _ => a,
     "x" => b }` runs `b` for `"x"`). First-match-wins says `a`. Either honour source order or
     reject a non-final `_`.
  4. **An OR-arm's residual is a pre-existing emitter gap**, not a match one: `A | B => …` lowers to
     `(u is A) || (u is B)`, and reading a field on the complement in a LATER arm hits
     `emitProgram: field access but no struct type declared` — reproducible on master from the
     hand-written `if u is A || u is B { … } else { u.c }`.
- 🟡 **B-debug. Source maps + trap diagnostics follow-ups.** REMAINING: (1) **full source-mapped
  stack traces** — map every wasm frame in the trap's stack → VL `function (file:L:C)`, not just
  the top frame; (2) **value-rich panic messages** — a host `panic(msg)` abort path that formats
  the offending values (e.g. `index 7 out of bounds (length 3)`, `integer division by zero` —
  today both surface as a bare wasm backtrace); (3) an index-assignment LHS has
  no parser span yet — broaden parser span coverage for OOB *write* errors. Also feasible: a
  **REPL** (accumulate-session-source + recompile-per-entry) as a future CLI item.
- ⬜ **B-emitmsg. Human, clear, explainable emit-failure errors.** Codegen/emit failures still
  surface developer-internal phrasing — e.g. a recursion cycle through a nested collection
  (`{ [string]: Tree[] }`) reports `emitProgram: map value type has no interned slot` / `(emit error)`,
  jargon that names an internal data structure rather than the user's mistake. Audit the `wasmEmit.vl`
  error paths and rewrite each into a source-located, plain-language diagnostic that names the
  offending construct and (where possible) the supported alternative — matching the quality bar the
  type-checker diagnostics already hit (cf. the A-track honest-message work). The still-unsupported
  nested-collection recursion shape is the canonical first case (its fixture lives in
  `tests/vl_check_codegen_test.ts`, which deliberately asserts only the emit-stage *marker* so it
  won't pin the wording this item improves). Compile-time analogue of B-debug's value-rich panic
  messages (runtime traps).
- ⬜ **B-repdebug. Rep-resolution introspection for compiler authors.** Diagnosing WHY a composite
  shape rejects — or which parallel kind-ladder is missing an arm — is a manual minimal-repro hunt
  today, the single biggest per-slice time sink in the rep burn-down. Two cheap tools would collapse
  it: (1) `vl check --why-reject <file>` (/ `--explain-rep <type>`) printing the rep-resolution path
  and the exact bail site (e.g. `map value kind → -3 at mvValKindOfName`) — the emit dual of the
  checker's honest messages; (2) `vl build --dump-reps` dumping the interned rep / heap-type table +
  the `mAssignTypeIndices` layout — the heap-index oracle is append-only and invisible, so seeing it
  is the difference between a 30-second and a 30-minute diagnosis. Serves the compiler author, not
  end-users (contrast B-emitmsg, the user-facing message). Adjacent, cheap: have the `.vl` corpus
  runner label WHICH tier failed (run-oracle vs `assertLint`) — a lint-tier fixture-directive bug
  (undeclared `@warning`, or an `@hint` the wasm-lint tier can't emit) reads as a compiler failure
  today and has cost real misdiagnosis.
- ⬜ H3 merge-by-renaming is a bridge — post-parity revisit notes live in native-modules-design.md
  §Post-parity revisit (symbol-based resolution replaces the rename walker).

---

## Track C — CLI (`vl` / `vital`)

*The NATIVE `vl` exists (`scripts/vl-host`, ~150 lines of frozen Rust over wasmtime): `vl build`
(`-O` via wasm-opt) / `vl check` (parse+typecheck only) / `vl run` (incl. `.wasm` passthrough) /
`vl fmt` (`-w`/`--check`, AST-driven via `format.vl` — the sole formatter; the TS `format.ts` is
retired), brains in `build/vl-compiler.wasm`. Iteration: `scripts/refresh-compiler.sh` refreshes the
seed from current `compiler/*.vl` in ~40s.*

- 🟡 **C5. Distribution (public release).** The shipped artifact is now the NATIVE `vl` host with
  the seed embedded (`--features embed-seed`; `release.yml` builds all 5 targets, `build-binary.sh`
  locally) — the `deno compile cli.ts` path is retired. REMAINING: tag / brew tap / sha256 bump
  (the publish job + Formula are drafts) — decoupled from all compiler work, deferred to H5.
- ⬜ **C-cli polish.** `vl build` to stdout when no `-o` (decided: yes, pipe-friendly); WAT output
  (`--wat`, via wasm-tools or wasm-opt); surfacing diagnostics with spans once the spans rungs land.

---

## Track D — LSP / editor experience (`lsp/src/server.ts`)
*Mostly independent; benefits from Track A. AST nodes carry source spans (Track G).*

- ⬜ **D9. Editor-surface queue** — the ordered work-through of
  `docs/internals/editor-surface-survey.md` (2026-08-31; the full LSP 3.17 + VS Code surface
  graded against the shipped extension and the `WasmChecker` capabilities — statuses,
  feasibility notes, and the detail live THERE; this list is the order, not the spec).
  Worked serially, one worktree agent per item, gates + PR each; quick wins first:
  1. ✅ Document highlights (`referencesAt` verbatim + `definitionAt` to mark the decl Write)
  2. ✅ Status-bar seed indicator (`vital/seedOrigin` notification → one item per window)
  3. ✅ Document symbols — flat outline (`tokensAt` + `moduleSurface` + a host scan for
     `type` decls; nesting still needs a body-extent export later)
  4. ✅ Code lens: export reference counts (`lastUseMap`, no new crawl; locations
     resolve lazily on click)
  5. ✅ Hover polish — #2105 — — ONE user-facing type-render pathway in the query layer owning
     `$mN` demangling (hover/inlay/member/alias leak it today; scopeAt's inline wraps
     collapse into it), and a FUNCTION-BINDING hover that zips the decl's parameter
     names with `TyFunc.fnParamTypes` (`it(name: string, body: () => void) => void`) —
     types are structural and carry no names by design, so the names come from the
     declaration; the same data feeds 10 (signature help)
  6. ✅ Flow-narrowed types at a position — #2108 — — hover AND member completion (D1's standing
     remainder, both surfaces re-reported from live use 2026-08-31: hover inside
     `if result is string { … }` shows the full union, and `result.` inside an
     `is IoError` arm offers NOTHING — measured: `memberCompletionsAt` on the narrowed
     receiver returns `[]` while a plain `IoError` receiver returns msg/code) — needs
     per-OCCURRENCE type retention in the native symbol pass (`symRetainType` keeps one
     type per binding, last write wins; narrowing is flow-sensitive); hover prefers the
     occurrence's type, and the member-completion receiver resolution reads the same
     store. One native change, two surfaces. Pairs with 5's render pathway.
  7. ✅ Rename symbol (+prepare) — #2103 — `referencesAt`/`crossFileReferences`; its own PR
     (write-path feature, alias/import edges need care)
  8. ✅ Testing API: per-test click-to-run — #2112 — TestController + tokenizer-based
     discovery (`lsp/src/testDiscovery.ts`); `-t` substring ambiguity measured and
     surfaced, dirty buffers mirrored beside the file so relative imports resolve
  9. ✅ Folding ranges + language-config indentation/on-enter rules — #2170 — blocks,
     paren/bracket groups, `//` runs and the leading import block, off the shared host
     tokenizer (`lsp/src/vlLex.ts`, lifted out of `testDiscovery.ts`) — so it is SEED-FREE,
     the one handler that survives a missing seed; plus `indentationRules` + `//`/`///`
     on-enter continuation (no block-comment rule — VL has none)
  10. ✅ Signature help — #2199 — the CLEAN grade, because it cost less than the bridge:
     one native export family (`sigAt` + `sigParam*`/`sigRet*` — the survey's §7
     "Signature table", verbatim) returns the callee's parameters as DATA, so the
     rendered-string re-parse the survey called "the acknowledged debt" was never
     written. Same zip `fnSigStr` renders for hover (slot 5), kept in columns. UFCS
     drops `self` in the CHECKER, so argument N is parameter N at both spellings.
     The host half is lexical only (`lsp/src/signatureHelp.ts`, third consumer of
     `vlLex.ts`) — which call, which argument, through strings/char literals/
     nested groups/template holes. Gap named, not papered over: a BUILTIN callee
     has no parameter table (the absence that also darkens member hover on them),
     and param-name inlay hints at call sites are now unblocked by the same family
  11. ⬜ Doc-comment-aware hover/completion (needs the one native doc-text export;
     the D7 linkifier host side already exists)
  12. ✅ Test-failure anchor — #2235 — **SUPERSEDED BY THE REAL FIX, and the cheap half was
     never built.** The queued heuristic was: when a test body holds exactly ONE
     `expect(...)`, anchor the failure TestMessage at that call instead of the `it(...)`
     line, with multiple expects keeping today's anchor. Track-caller landed first, so the
     runner now REPORTS the position (`std:test`'s `at <file>:<line>:<col>` line) and
     `testDiscovery.ts` parses it into a `FailureLocation`/`FailureAnchor` the extension
     turns into `TestMessage.location`. Two things the heuristic could not have done, both
     pinned: a body with SEVERAL expects anchors at the one that actually failed, and a
     failure inside a HELPER — a `expect` reached through a function the body called —
     anchors in the helper's own FILE, which no scan of the test body could ever have found.
     The `it`-line fallback is kept for the failures that carry no location by construction
     (`fail(msg)`, a raw trap, `<compile>`)
  Not queued (and why, in one line each): workspace symbols (rides on 3's plumbing —
  fold in when 3 lands), DAP (no debugger yet; the `vl test --trace` inline-values idea
  is a separate pending ruling in §Next, not debugger-gated), notebooks/monikers/
  call-hierarchy (n/a per survey until asked for by use).

- 🟡 **D1. Hover types.** REMAINING: flow-narrowed receiver types; Map/Set members (when B6a fully lands).
- 🟡 **D3. Autocomplete.** REMAINING: wiring a completion provider into the Monaco playground (E).
- 🟡 **D4. Formatter.** REMAINING:
  - **Unfaithful-fallback constructs** — reproduced verbatim from the source span rather than
    regenerated: `type` aliases (body & span discarded by the checker), operator-named &
    method-shorthand functions, operator/index-method call desugars. (Trailing comments on `type`
    aliases now stay on their line — #146; functions with a commented expression body now fall back
    to verbatim correctly — #154; the trailing-comment placement fixes — #165/#172/+.)
  - **AST type-syntax fidelity gap** — the typechecker fully resolves every type it records (a tiny
    `i32` annotation becomes a giant structural `Object`; `type`-alias bodies and spans are
    discarded). Retain the *as-written* type syntax (or its span) so the AST is lossless for
    types — also benefits hover/inlay rendering (D1/D6/D8).
- 🟡 **D — Project-wide unused-export hints.** Core shipped: debounced workspace pass on save (+ 3 s idle), use-map over ≤500 `.vl` files, `hint`/`unnecessary` diagnostics for zero-reference exports. REMAINING: **struct field–level unused-export analysis** — deferred because VL's structural typing makes field-level usage tracking fuzzy (a field could be "used" via a widened receiver type without any import); a future refinement could cross-check field names against known call sites once structural subtyping is tightened.
- ⬜ **D — Organize Imports should drop a DUPLICATE specifier too.** The `duplicate-import`
  lint (#2393) already names every repeated specifier and its quick-fix removes one — but
  `server.ts`'s Organize Imports filters the lint stream to `unused-import` alone, so a
  one-key "organize" leaves the duplicate behind. Adding the code to that filter is one
  line; what needs checking first is `organizeImportEdits` over TWO IDENTICAL ranges in
  different statements (the unused case never produces two edits that delete the same
  text), which is why this is a follow-up and not part of #2393.
- ⬜ **D8. Hover verbosity step-expansion.** Alias-name preservation is done (see `CHANGELOG.md`).
  REMAINING: the interactive shallow↔deep verbosity stepper — expand one alias layer at a time
  on demand via the proposed LSP 3.18 hover-verbosity API (`HoverParams.context.verbosityLevel`
  + `Hover.canIncrease`/`canDecrease`). The renderer (`stringifyType` `maxDepth`) is ready;
  blocked on the protocol landing in `vscode-languageserver` (currently 3.17.5). When it lands:
  deps/min-version bump + map `params.context.verbosityLevel` → `maxDepth`, set
  `canIncrease`/`canDecrease` on the returned `Hover` — no renderer change needed (see comment
  in `lsp/src/server.ts` ~L394).

---

## Track E — Browser playground + sandbox
*Depends on C1. The compiler is pure TS + binaryen (wasm), so it runs client-side.*

- ⬜ **E3. Sandboxed execution** — compiled user wasm in a Web Worker, fresh `Memory`, controlled
  `log` only, enforced limits. (Today user wasm runs on the main thread — fine for local use,
  harden before any public deploy.)

---

## Track F — Infrastructure & hygiene
*Independent; do continuously.*

- ✅ **F2. Gate debug `console.log`s** — moot: `toWasm.ts` is deleted (the `.vl` emitter has no such logs).
- ✅ **F4. Re-enable inline `m.validate()`** — moot, and superseded by something stronger.
  `m.validate()` is the **binaryen-JS `Module` API**, which no compile path uses any more: the
  emitter writes bytes directly (`compiler/emit_bytes.vl`) and the only surviving binaryen-JS call
  in the tree is the playground's `readBinary`/`emitText` WAT pane. What the ask wanted — catching
  an invalid module before it is blessed — ships instead as **`vl build` running wasmtime's
  `Module::validate` over every artifact it writes and exiting 1 when the engine rejects it**
  (`--no-validate` opts out), gated by `tests/vl_build_validate_test.ts`. That is the real
  validator on every build, not binaryen's on a dev build.
- ⬜ **F5. Settle the name** (VL vs Vital) and apply consistently.
- ✅ **F6. Document the build** — done, and the command this row named never survived kill-TS.
  There is **no root `deno task build`**: `deno.json`'s tasks are `lsp:build` · `lsp:dev` · `test` ·
  `gen-std` · `compile` · `install` · `playground*`, and `deno task build` exists only inside
  `lsp/deno.json`. The build is documented in `AGENTS.md` — `scripts/refresh-compiler.sh` (seed),
  `cd scripts/vl-host && cargo build --release` (the shipping CLI), `cd lsp && deno task build`
  (the LSP bundle), `deno task test`. The antlr/gradle gen step was already gone when this was
  filed. (Two TS-era spike records — `docs/internals/wasmtime-parity.md`,
  `docs/internals/selfhost-g2-spec.md` — still invoke the retired root `deno task build`; that is
  era-appropriate text inside dated records, not a live instruction.)
- ✅ **F7. Fix the `paramater` misspelling** — moot: **the only occurrence of that string in the
  tree is this row** (`grep -r paramater`, excluding `.git`/`node_modules`, hits this line and the
  workboard row tracking it). Whatever carried it is gone.
- 🟡 **F8.** REMAINING (F5-adjacent): confirm vscode-languageclient forking the ESM server in VS Code.
- 🟡 **F9. Perf baseline.** The TS-driven harnesses (`scripts/perf*.ts`) were RETIRED with the
  kill-TS dev-script sweep (they benchmarked the TS `compile()`); the past wins/abandons live in
  `CHANGELOG.md`. REMAINING: rebuild a baseline against the NATIVE binary
  (`vl build`/`vl run` timing) if/when regression-tracking is wanted again; plus:
  - ✅ **F9b. Cache / clone binaryen IR across selfhost sub-tests** — moot: **there is no binaryen
    IR to cache.** No selfhost sub-test constructs a binaryen `Module`; the emitter writes bytes
    (`compiler/emit_bytes.vl`) and binaryen survives in the tree only as the `wasm-opt` **binary**
    that `vl build -O/-O3` shells out to, plus the playground's `readBinary`/`emitText` WAT pane.
    Same cause as F4.
  - 🟡 **F-tiers. Collapse the redundant corpus runner.** (This is Track J's J1 — it removes
    Deno-as-an-engine.) **RE-SCOPED — the gate this row was written against no longer exists.**
    `SELFHOST_DENO_RUN` is gone from the tree entirely (→ `CHANGELOG.md`), along with the corpus
    RUN half, its 305-file whitelist, the V8-side golden fixpoint and the emit-program suite. **The
    actual residue is narrower and lives somewhere else: four deno tests still EXECUTE emitted wasm
    under V8** via `tests/support/runWasm.ts` — `tests/cases_wasm_test.ts` (the whole behavioral
    corpus, and the one that matters), plus `vl_exported_memory_test.ts`,
    `vl_global_promotion_test.ts` and `vl_reexport_abi_test.ts`. REMAINING: move those onto the
    native runner, which is what "removes Deno-as-an-engine" now means. **`cases_wasm_test.ts` is
    the SOLE behavioral corpus oracle** and its `EXPECTED_DIVERGENCES` list is load-bearing, so it
    cannot simply be deleted — it has to be re-hosted. Also: the single-unit assembly compile was
    SUPERLINEAR in the TS host (~5s as a 2-module graph vs ~100s concatenated — wasmEmit.vl was the
    multiplier); that host is retired, so the note is history. (Landed → `CHANGELOG.md`: gating,
    parallel sweep, seed cache + ~3s refresh, graph-compile caching — no big assembly remains
    always-on. The native golden byte-tripwire that briefly covered this is since retired —
    redundant with the fixpoint + the functional corpus, → `CHANGELOG.md`.)

---

## Track H — Self-hosting & distribution (the bootstrap end-state)
*The goal: VL compiles itself; the TypeScript/Deno host retires; the compiler becomes VL→wasm on a
generic wasm runtime. **Distribution does NOT require self-hosting** (the two timelines are
independent).*

- 🟡 **H0. Module system.** Phase 1 done — see `CHANGELOG.md`.
  - **Phase 2 (⬜):** the `std:` scheme + embedded `.vl` std over the two-primitive intrinsic floor
    (collections, `std:fmt`, `std:testing`).
  - **Phase 3 (🟡):** cross-file / std LSP. Module-aware DIAGNOSTICS landed (`lsp/src/moduleGraph.ts`):
    the open file is analyzed as the entry module — its imports resolve through a workspace
    `ModuleReader` (open buffers + disk), so imported names no longer flag "undeclared" and genuine
    import errors (bad path / not-exported / cycle) surface on the import line. Hover/completion seed
    the same imported-name types (real types, no squiggle). Cross-file NAVIGATION now landed:
    go-to-definition and doc-comment xrefs on an imported name jump to the EXPORTING sibling's
    declaration (resolved by reading the sibling through the workspace reader and locating the
    exported binding's decl span via the symbol table); find-references gathers occurrences across
    the current file + other OPEN documents + UNOPENED on-disk siblings (a name's canonical
    `(exportingKey, exportedName)` is matched per document; the importer's symbol table is
    graph-seeded so imported-name uses are recorded). On-disk crawl is scoped: project root detected
    from the LSP workspace-folder root, or by walking up to the nearest ancestor containing
    `deno.json`, `package.json`, or `.git` (at most 6 levels); `.git`, `node_modules`, `dist`,
    `.claude`, `reference` dirs are skipped; at most 500 `.vl` files read per request
    (`MAX_DISK_FILES`); open-buffer text wins over disk for any file open in the editor.
    REMAINING: the `std:` scheme (phase 2).
  - **Deferred:** import maps, namespace/default imports, export-all, re-exports.
- 🟡 **H2. Make VL expressive enough to write a compiler.** REMAINING: maps (B6a), enum tag for
  literal-unions (A16).
- 🟡 **H3. The self-host compiler (`compiler/*.vl`).** Corpus parity REACHED (sweep 312/316, the
  residue is the parked soundness xfails — see "Kill the TS host" in Next; history →
  `CHANGELOG.md`). The port compiles ITSELF to a byte-exact native fixpoint (stage3 == stage4,
  `scripts/native-fixpoint.sh`, ~6s, gated in CI by `ci-native`). REMAINING:
  - **Spans** — continue the rungs (rung 1 = token positions; rung 2 = native `path:line:col:`
    diagnostics, #312; rung 3 = end positions for LSP ranges, `diagEndCol`) so more diagnostics
    carry real positions; message/span parity gates the deno-CHECK-tier deletion (F-tiers).
  - **The untested emitter long tail** — each fails loudly (nullable lists beyond `i32[]|null`,
    map-typed params / nullable map fields, struct-union `==`, `?.` beyond i32/boolean leaves,
    …); burned down demand-driven as real VL code (std, the compiler) hits them.
  - ⬜ **H4.1. No `byte`/`u8` type (ergonomic/representation gap, not a blocker).** Bytes are
    represented as `i32` masked `& 0xff` in `wasmEmit.vl` and round-trip/instantiate fine; a real
    packed byte buffer (B7/B6 `(array i8)`) would drop the 4×-wide detour. (detail: `docs/internals/selfhost-gaps.md` §H4.1)
  - ⬜ **H4.6. Array spread / concat in call position (worked around).** A small `appendAll()` loop
    helper covers bulk-append today; `xs.push(...ys)` lands with variadics (B6). (detail: `docs/internals/selfhost-gaps.md` §H4.6)
- ⬜ **H-M2. Wasm-native distribution (end-state).** The `vl` binary becomes a wasm runtime
  (wasmtime — full WasmGC since v27) + a small host shim. No V8, no binaryen, no Deno.
  **Engine choice re-validated (2026 survey):** wasmtime remains the only standards-track
  non-browser engine with complete, production WasmGC (27.0+; as of 46 a **copying** collector is
  the default alongside DRC and null, and the collector is a per-invocation tuning knob —
  `$VL_GC`, `memory-gc-design.md`). Wasmer gets GC mainly via its V8 backend (a JS
  engine again); WAMR/wazero are embedded/Go niches without GC. **System-API strategy:** WASI
  preview 1 is the whole OS surface `vl` needs (fd_read/fd_write/path_open/args_get/proc_exit),
  implemented natively by wasmtime — we write no OS code. The split: formatting + all compiler
  logic in VL; ONE emitter prerequisite — a linear memory + a GC-string→linear-memory copy
  (the `__store_string__` analog), since WASI's ptr/len ABI can't take GC refs (this also
  subsumes H4.5: emitted bytes leave via fd_write, killing the decimal-string handoff).
  Target WASI p1 — still the right target, but for a changed reason: wasmtime 46 **removed the
  `wasi-common` crate** and p1 now lives in `wasmtime-wasi`'s `p1` module reimplemented over p2,
  while **WASI 0.3.0 is on by default** as of 46. So p1 is a stable shim over a moving stack rather
  than its own implementation, and "p2/component-model still settling" no longer describes the
  landscape — GC↔component interop is the part that still does. Distribution: zero-code via
  `wasmtime run --dir . vl.cwasm` (AOT-compiled) behind a launcher script; a single static
  `vl` binary is an OPTIONAL thin Rust embedding of the wasmtime crate (engine setup +
  preopens only — no OS logic), deferrable until the flip.
  **Status (2026-06): the INTERIM Rust host shipped** (`scripts/vl-host` — `vl build/check/run`,
  brains in `build/vl-compiler.wasm`; the native stage3 == stage4 fixpoint holds via
  `scripts/native-fixpoint.sh`, ~6 s, no TS past the seed). **Killing the Rust host entirely is
  confirmed feasible** (no negatives beyond the VL-side work): (1) the emitter gains WASI p1
  imports + a linear memory + the GC-string↔memory copies above (UTF-8 encode/decode written in
  VL); (2) the driver becomes a WASI `_start` reading `args_get`/`fd_read`, writing bytes +
  diagnostics via `fd_write`; (3) `print` lowers to `fd_write` so EMITTED user programs also run
  under any stock engine. Then the only dependency is a prebuilt conforming engine binary (any
  GC+WASI engine — wasmtime today), same trust/distribution model as deno now, and
  `scripts/vl-host` is deleted. Low priority while the interim host is ~150 frozen lines.
- ⬜ **H5. Versioning — deferred; rustup/Volta model, not nvm** (→ `DECISIONS.md`). Make the H-M1
  install path version-stamped so a launcher can slot in later.

**Sequence:** kill-the-TS-host staging (LSP-on-wasm stages → tier deletion → `std:` Phase 2) →
real import/export for the `.vl` build (post module-revisit) → C5/H-M1 distribution (anytime,
decoupled) → H-M2 host swap (kill the interim Rust host once the WASI driver lands).

---

## Track J — Kill Deno (the destination behind the TS-host kill)
*The north star: remove Deno entirely — no `deno test`, no `deno run`, no `deno compile`, no
`deno.json`/`deno.lock`, no `setup-deno` in CI. End-state runtimes: wasmtime+WASI for the `vl`
brain (Track H, H-M2), Node for the JS-side tooling that outlives the TS compiler (LSP bundling,
the playground). Detailed inventory + staged plan: `docs/internals/deno-deprecation.md`.*

**This track is NOT a competing now-priority.** The active front is **killing the two compilers**
(see Next) — that is the top goal, and it is the road this leads down: it removes Deno's largest
role for free. Track J is the follow-through *behind* that front. Deno is NOT one dependency — it
fills six roles on different timelines, and most of the surface dies as a side effect of work
already in flight (the TS-host kill, `vl test`, H-M2); J is the genuinely Deno-specific residue
plus the final teardown, sequenced after the compilers are gone (the J4 bundling swap is the one
piece that can land early, fully decoupled).

- ✅ **J0 — the TS-oracle brain. DONE (Deno's biggest role, gone).** The `compiler/*.ts` core
  graph is DELETED — no more TS front end running under Deno, no V8-adjudicated corpus emit. Only
  the dependency-free type leaves (`coreTypes.ts`/`diagnostics.ts`) remain. `deno check`/`deno lint`
  now cover just those leaves + the JS-side tooling; the `.vl` compiler is checked by the native
  checker + `lint.vl` (`lint-self.sh`, `ci-native`).
- 🟡 **J1 — the V8 wasm executor.** Tests run emitted wasm via `runWasm` in Deno's V8; the native
  tier already runs the same bytes under wasmtime (`scripts/vl-host`, `ci-native`). REMAINING:
  finish folding the corpus RUN + CHECK verdicts onto the native/wasmtime tier (this is F-tiers +
  Next step 2) so no gate depends on Deno-as-an-engine. Then the only thing left for Deno is
  *orchestration*, not execution.
- ⬜ **J2 — the test harness (the hard core).** All 52 `tests/*.ts` are `Deno.test`. Split by what
  they test:
  - **Behavioral `.vl` corpus** (`cases_test`/`cases_wasm_test`, `selfhost_*`) → migrate to the
    native runner + `*.test.vl` under **`vl test`** (already designed/charted — see Next +
    `docs/internals/test-runner-design.md`). This is the bulk of the harness and the main forcing function.
  - **TS-infra tests** (LSP, playground, lint-TS, format, symbols, stringify, source-map) → these
    test TS that outlives the compiler; they move to a **Node** test runner (`node --test`) when
    their subsystem is ported, OR ride along under Deno until then. Decide the Node-runner cutover
    once `vl test` has absorbed the behavioral corpus.
- 🟡 **J3 — build/dev scripts.** Nearly done by attrition: `build-binary.ts`→`.sh`, and
  `smoke-binary`/`perf*`/`checker-parity-sweep`/`native-golden-check` are all deleted (retired with
  the TS compiler / as redundant). The ONLY remaining `scripts/*.ts` is **`gen-std.ts`** (embeds the
  `.vl` std into `std/embedded.ts`) — load-bearing; port to `.vl` (dogfood) once VL has the file I/O
  it needs, or move to Node. Audit for `Deno.*` globals when ported.
- ⬜ **J4 — bundling (independent; can land anytime).** The LSP (`cd lsp && deno task build`) and
  the playground (`playground/build.ts`) are esbuild-under-Deno; their deps are already
  node-resolvable (binaryen, vscode-languageserver*, monaco). Swap to esbuild-on-Node (`npm`
  scripts) — decoupled from all compiler work, the cleanest early win.
- ✅ **J5 — distribution. DONE.** The `deno compile cli.ts` binary is retired; `release.yml` builds
  the native Rust `vl` host with the seed embedded (`--features embed-seed`, via `build-binary.sh`)
  for all 5 targets per-OS. No V8/node/binaryen in the shipped artifact. (`compiler/cli.ts` +
  `build-binary.ts` + `smoke-binary.ts` deleted; DECISIONS C5 marked RETIRED. → `CHANGELOG.md`.)
- ⬜ **J6 — final teardown.** Once J0–J5 land: delete `deno.json` + `deno.lock`, drop
  `denoland/setup-deno` from `ci.yml`/`pages.yml` (replace the deno cache steps with node/wasmtime),
  rewrite the AGENTS.md command list off `deno task *`, and remove the dual-runtime `no unguarded
  Deno globals` rule (compiler core becomes Node+wasmtime only).

**Sequence:** J4 (anytime, independent) ‖ J0 rides the TS-host kill ‖ J1 finishes with F-tiers →
J2 behavioral corpus onto `vl test` → J3 load-bearing scripts → J2 TS-infra onto `node --test` →
J5 folds into H-M2 → J6 teardown. **Dependencies:** J2-behavioral needs `vl test` (Next); J5
needs H-M2 (Track H); the rest is unblocked. **Open decisions (maintainer):** Node `node --test`
vs another runner for the surviving JS-side tests (J2/J3); whether load-bearing scripts port to
`.vl` (dogfood) or to Node (faster).
