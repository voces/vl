# Review medium 6, the lowering pass: mostly L1's, plus one small pass of its own (2026-11-15)

Design only, nothing built. Review medium 6 (`engineering-review-2026-11.md`) asks for "a faithful
syntax tree with a lowering pass". L5 step 5 (`2026-11-14-phase-products-design.md` §3, "`Parsed`
is frozen") waits on it, and steps 6 (`SymId`, about −900 to −1,200) and 7 (the memo, about −1,300
to −1,500) wait on step 5. This note answers the coordinator's question: is medium 6 a second pass,
or is it "the check-time rewrites move into L1's lowering"?

**Answer: mostly the second.** The rewrites split three ways by when they run:

| class | what it is | where it goes |
|---|---|---|
| PRE | rewrites that run before checking | a small resolve-time pass of their own |
| POST | rewrites that run after checking, mostly for the emitter | retire into L1's builder at I9; I8 is the earliest possible (no legacy reader left) |
| MID | rewrites the checker builds and then checks | become appends above the parse range, not overwrites |

L1 confirms the routing (§5). Phase A (I1–I8) reads the post-rewrite tree for every construct,
because byte identity with legacy requires it. So the checker's emit-only rewrites retire only at
I9, when the builder reads the template read-only plus checker facts. The emitter's own rewrites
(`emit_rewrite.vl`) retire at I8 and mono's at I9, so step 5's deletion arrives at I9 and no
earlier.

## 1. The inventory (measured)

Every `arenaSetNode`, `arenaReplaceNode` and `ast.vl` `mk*` call in `check_*.vl` and
`typecheck.vl` is listed: 276 call sites in 89 functions across 30 files. The tool is
`writes.mjs`, in the scratchpad and not committed. Each function was graded from its caller chain
up to the program driver (`check_program.vl:4673-4737`, `check_pins.vl:478`) and from whether
later checking reads what it wrote.

| class | functions | `mk*` (appends) | overwrites below the parse range |
|---|---:|---:|---:|
| **PRE** (runs before `checkNode(root)`, reads no type) | 18 | 47 | 18 |
| **MID**, in-walk (builds nodes, then checks them in the same walk) | 39 | 136 | 31 (both MID rows together) |
| **MID**, between passes (`pinApply` writes annotations, `checkProgramAgain` re-walks them) | 13 | (in the 136) | (in the 31) |
| **POST** (stamps or lowers after checking; the emitter consumes it) | 19 | 32 | 12 |
| **total** | **89** | **215** | **61** |

- **The PRE drivers are, in order:**
  - `parenNamesCollapse` (`check_pins.vl`);
  - `intrinsicValuesWrap` (`check_intrinsic_values.vl`);
  - `hoistMatchScrutinees` (`check_match_hoist.vl`);
  - `annotateTyArgLambdas` (`check_generic_args.vl`);
  - `tyParamSplitRun` (`check_typaram_bare.vl`), which runs after `bindProgram`.
  
  None of them reads a node type.
- **Direct node-field writes** (`n.field = …`, `n.list.push(…)`) in the checker are another 19
  lines. That is a lower bound, because a write through a local alias is not caught.
- **The emitter's own overwrites:** `emit_rewrite.vl` has 6 and `emit_mono.vl` has 2. Mono's AST
  clones come on top.
- **Epoch readers:** 26 `arenaEpochNow()` reads outside `ast.vl`, in 10 files, most of them memo
  stamps in `emit_*`.

**Two structural facts constrain every design.**

1. **The checker re-walks the arena it rewrote.** `checkProgramAgain` and `fnTagEtaAgain` re-run
   `checkProgramPass` over the same arena. A re-walk sees lowered `match`es as if-chains, getters
   as calls and split void returns. So today every PRE pass must be idempotent, and every POST
   rewrite must survive a re-check.
2. **Not every write in a `check_*.vl` file is a check-time write.** `recEqTyped`, `recEqAnd` and
   `recEqNullTest` (`check_operators.vl`) have one caller, mono (`emit_mono.vl:7023`).
   `mkNumTyped` (`check_node_tys.vl`) is called only from `emit_mono.vl` and `emit_rewrite.vl`.

## 2. What freezing needs, by class

- **`mk*` appends do not break a freeze.** They land above the parse range `n1`. So 215 of the
  276 sites are already compatible, and the problem is the 61 overwrites plus the field writes.
- **PRE (18 overwrites, 18 functions)** becomes `lowerResolved(root)`, a pass owned by
  `Resolved`.
  - It runs once per module, before `checkNode(root)`.
  - It writes copy-on-write: a rewritten node and its ancestors are minted above `n1`, and the
    module's root moves to the lowered root.
  - `Parsed` below `n1` is untouched, so the parse bank keeps it as it is, and its undo path (the
    edit log) is no longer needed for PRE.
  - It must not run twice. Today `checkProgramAgain` re-runs these passes over their own output,
    which is why they must be idempotent. After the move, the re-walk starts from the lowered root.
- **POST (12 overwrites, 19 functions)** retires into L1's builder at **I9**; I8 is the earliest
  possible, once no legacy reader is left (`ir-design-2026-11.md` §5.3). It does not retire at the
  I-step that first claims the construct.
  - Until I8 the legacy emitter still lowers every unclaimed function from the rewritten tree. So at
    I4 a desugared `match` must still exist, and a claimed function is built from the same
    if-chain. `SSwitch` from the source `match` is a named mover after I8.
  - At I8 or I9 the desugar becomes the builder's own lowering: `check_match_desugar.vl` (4 functions, 16
    sites), the `recEq*` rows, `voidRetRewrite`, `getterRewriteSites`, `synthInlineLitUnionDecls`
    and `ftBuildArmsAt`.
  - The stamp-only rows (`checkOptMemberNode`, `flatMemberFold`, `cexDeliver`,
    `inferRetAnnotate`, `castBoundDecide`, `tplHoleHandled`) become facts the builder reads, which
    `coercionAt` and the per-node types already carry.
  
  Moving a POST rewrite out of the checker changes what a re-walk sees: the original construct,
  not its lowering. So each move is graded on the corpus by `regress.vl`, not by byte identity.
- **MID (31 overwrites, 52 functions)** is the real work. The in-walk group builds a node, then
  checks it, and it overwrites the slot so that later readers by index find the new node.
  - Copy-on-write cannot redirect those readers without an indirection.
  - The cheapest indirection was measured, as a redirect check in `nodeAt` that never fires: it
    costs **+2.27% L2 fuel** (89,583,968,903 to 91,621,570,872 on `314123b83`). That is too much
    for a check that never fires, so a general redirect is rejected.
  - Each MID overwrite therefore becomes one of two things:
    - a parent-slot write that points the parent at an appended node (the parent is copied above
      `n1` if it is itself a parse node);
    - a checker fact that the builder lowers, which is the POST route, for writes whose only
      later reader is the emitter. The subagent classification marks 7 MID functions as "returns
      or stamps the type itself, the emitter is the reader".
  - The between-pass pins (`check_pins`, `check_width`, `check_width_slot`, `check_rec_rows`,
    `lbiApply*`, `lamRetApply`) write annotations from solved types, and the next pass re-reads
    them. Under step 3's `CheckRun` they become solved facts that the re-walk reads, not annotation
    nodes. They are a restart's input, not a tree edit.

## 3. Steps

Each step is graded by `regress.vl` and the capability probes. Steps 6.1 and 6.3 must also be byte
identical on fixpoint seeds.

| step | what | prerequisite | estimate (net compiler lines) |
|---|---|---|---|
| **6.1** | `lowerResolved(root)`: the 5 PRE drivers move under one function owned by `Resolved`, run once per module; `checkProgramAgain` stops re-running them | none | about −20 to +20. Same code, one driver; the idempotence re-runs go. It lands only at ≤0 net, otherwise it folds into 6.3 |
| **6.2** | PRE's 18 overwrites become copy-on-write above `n1` | 6.1 | +40 to +80 (an ancestor-copy helper; each site takes a parent path) |
| **6.3** | a ratchet: count the writes below `n1` after the PRE passes, field writes included, against a budget baseline that may only fall (like `scan-budget-baseline.json`). It becomes a refusal when the count reaches zero | none | +20 |
| **6.4** | the between-pass pins become `CheckRun` facts read by the re-walk (13 functions) | step 3 (landed) | unmeasured; needs a per-function design |
| **6.5** | the MID in-walk overwrites become parent-slot writes or builder facts (31 sites) | 6.3's residue count | unmeasured; per site |
| **POST** | the 19 POST functions retire into L1's builder at I9 | L1 I9 (I8 earliest) | counted in L1's §7, not here |
| **5 (L5)** | `arenaEpoch`, the edit log and the 26 epoch reads delete | 6.1–6.5, **and L1 I9** (emit_rewrite overwrites until I8, mono and the POST rewrites until I9) | −150 to −300 (design §3) |

- **Steps 6.1–6.3 are near zero or growth.** They buy the boundary and the instrument, not
  deletion.
- **The deletion is L5 step 5's, and it cannot land before L1's I9.** So medium 6's own code work
  is small, and the large numbers sit behind L1.
- **Recommended order:** 6.3's ratchet first. It measures the true residue, field writes included,
  which this note can only bound. 6.1 follows only if it nets ≤0. Then 6.4 and 6.5 per family,
  beside L1's phase A. POST follows L1's I9.

## 4. Risks

- **Node indices in output.** Copy-on-write moves a rewritten node's index. Some minted names
  carry a node index (`$scrut<match>`), and per-node tables are keyed by index. Step 6.2 must keep
  each name's index argument the original node's, or byte identity fails. Before 6.2, run
  `vl build --names` on the corpus to see whether any index reaches the names section.
- **A re-walk that sees a different tree.** After 6.1, `checkProgramAgain` starts from the lowered
  root, not from a twice-lowered tree. For an idempotent pass that is the same tree, and the step
  is graded byte-identical on that premise. A PRE pass that is not actually idempotent shows up
  here as a fingerprint difference, and that difference is a finding.
- **POST and the re-walk.** See §2: each POST move is graded on the corpus, not by bytes.
- **Copy-on-write conditions** (L1, §5). Copy-on-write is safe if the PRE lowering finishes before
  any table keyed on node ids is filled (resolve, symbols, check), and every parent link points at
  the copy, so the checker, the legacy emitter and the builder see one index per node. Three
  conditions follow:
  - **(a)** every node 6.2 mints above `n1` carries the span of the parse node it lowers;
  - **(b)** the lowering runs once per program before check, so overlay ids are the same in armed
    and unarmed builds;
  - **(c)** nothing filled before the lowering (parse-side banks, token spans) is read through a
    new index without remapping.
  
  The originals below `n1` stay frozen for the formatter and the LSP.
- **Free tidy-up, byte-identical.** `recEqTyped`, `recEqAnd`, `recEqNullTest` and `mkNumTyped`
  can move to emit-side files now, since only mono and `emit_rewrite` call them. They retire with
  their callers.

## 5. L1's answers

1. **Phase A reads the post-rewrite tree for every construct (I1–I8).** No checker rewrite retires
   before I9. L1 subsumes the POST class only at I9, and anything that freezes `Parsed` before I9
   is medium 6's.
2. **The overlay above `n1` does not conflict.** The IR keys on node indices only through
   `ty(k, node)` and the `at` span back-pointer. There are two requirements:
   - every overlay node carries a source span that maps into the original program;
   - overlay ids are minted deterministically per program, which holds if the lowering runs once
     per program, before check.
3. **The ratchet does not conflict with I0.** The IR modules (`ir`, `ir_build`, `ir_verify`,
   `ir_selftest`, `ir_lower`) make no arena write, and the IR gate keeps the check as a guard.

The classification table (89 rows, with caller chains and file:line evidence) is reproduced by
the inventory command in §1 plus the per-function reading recorded in the PR.
