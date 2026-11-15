# A pure `relate` and one recorder: design note, 2026-11-15

Engineering review medium 3 (`engineering-review-2026-11.md` §Medium): split `assignableExpr` into
a pure `relate(src, dst) → Coercion | Mismatch` and one recorder. It is a prerequisite of L1 (a
typed IR, where a coercion is a node) and of L2 (inferred interfaces, under the owner's 2026-11-15
ruling that exports freeze at the module boundary: an interface records the *coercions* a body's
deliveries need, so it needs them as values).

This note is docs only and changes no compiler code. It was measured at master `414f937dc` against
a fixpoint seed: two `refresh-compiler.sh` runs gave byte-identical output (6,388,272 bytes, sha256
`b2a3ff7e…`). Counts come from `scripts/phase-state-census.vl`, from grep, and from the call-graph
census in §B (a Node program, the repo carrying no Python). §A lists each command.

## 0. Summary

- `assignableExpr` (`check_assignable.vl:1675`) is a 4-line wrapper over `assignableExprIn`
  (`:1689`–`:1913`, 225 lines). It has **82 call sites** in 10 modules. Only **29** of them are
  deliveries, the place a value really moves to its destination. The other **53** ask "does it fit?"
  to choose between alternatives, or are the seam recursing into a field or an element.
- The seam's 11 functions call **105** distinct functions. **40** reach no module state. **65** reach
  a write, and 52 of those are recorders in eight effect kinds (§1.2). Nine recorders run *before*
  the answer is known, so they also write on a mismatch. Six tables a recorder writes are read back by
  the judgement during the same delivery (§1.3).
- Because the judgement records, a "does it fit?" question has to be asked under
  `inferQuiet = true; quietDepth++`. The phase-state census lists **20** `inferQuiet` hidden-argument
  scopes. **14** of them only bracket a fit question, and this work deletes them. The other 6 bracket
  whole-body re-checks, which belong to L5 step 3 (`CheckRun`).
- Proposal: `relateExpr(src, srcTy, dstTy, cx) → Fit`, where
  `Fit = Coercion | Mismatch | Refused`. It writes nothing. `recordFit(site, fit) → boolean` is
  the only function that performs a `Fit`'s effects. `assignableExpr` becomes
  `recordFit(srcExpr, relateExpr(…))` with the same signature, so the 29 delivery sites do not change.
- Migration: four effect-kind PRs inside the seam (A1–A4), then five caller-family PRs (B1–B5),
  each byte-identical on fixpoint seeds. Stage C, the type-level `assignable`'s hole pins, waits for
  lane H stage 2.
- Deleted (§4): the 14 quiet brackets with their `quietDepth` pairs, three `prbEnter`/`prbLeave`
  rollback-assertion probes, the seam's two self re-asks and `eqLitDeliver`'s double ask, the 11
  `!inferQuiet` guards in `assignableExprIn`, and the `stampsStand()` test repeated in each recorder.
  **None of the nine `RB_*` site sets is deleted by this work.** They roll back whole-body re-checks
  (§4.3).

## 1. Census

### 1.1 Callers, by family

82 calls of `assignableExpr(` outside comments and its own definition (§A, command 1).

| family | sites | where | what the answer is used for |
|---|---:|---|---|
| **F1** seam recursion | 10 | `check_assignable.vl` (`assignableSubWordSlot`, `assignableLitExpr`, `listArmIn`, `assignableObjLitFields`/`Union`, `assignableArrLitElems`/`Arm`, `nomSlotAccepts`, and `assignableExprIn` itself ×2) | a field, element, union arm or paren of the current delivery; the two in `assignableExprIn` (`:1746`, `:1779`) re-ask the *whole* delivery quietly before recording rep stamps |
| **F2** constraint re-asks | 11 | `check_assignable.vl` (`ctnWrittenCstrsAt`, `bmArgPred` ×2, `argCstrFitsAt` ×2, `holeLitAdopts`, `holeNumLitAdopts`, `holeLitAdopt`, `retNomOnlyAtHole`, `litPinAssignable`, `dstTyParamAdapts`) | re-validate a deferred constraint row once its pins are known |
| **F3** return-inference adoption | 27 | `check_inferred_return.vl` (24 `inferRetAdopt*`/`finishInferredReturn` tails, `retValsDeliver`, `objLitWidenFields` ×2) | "if this tail fits the expected return, adopt it" |
| **F4** local probes | 5 | `check_operators.vl` (`eqLitDeliver` ×2, `checkCoalesceBinNode`), `check_statements.vl` (`retNomPinOk`), `check_program.vl` (`checkerForce`, the dispatcher `joinArmFits` reaches) | choose a type for a literal or an arm |
| **F5** deliveries | 29 | `check_access` 3, `check_calls` 5, `check_fn_decl` 3, `check_member_call` 8, `check_operators` 8, `check_statements` 2 | the value is delivered here, and a `false` answer is the site's mismatch diagnostic |

F1–F4 (53 sites) are the callers that only ask "does it fit?". F5 is the recorder's only real
caller.

### 1.2 What the seam does besides answering

The seam is the 11 functions matching `check_assignable.vl:(assignable|listArm)*`. Together they
call 105 distinct functions. A transitive write analysis over the compiler's call graph (§B) puts
each callee in one of three groups: it reaches no module-level state (40), it reaches only memo or
mode state (13), or it records (52). The analysis over-approximates: a call cycle makes everything
on it reach everything, so `assignableExpr` "reaches" 560 states and the type-level `assignable`
reaches 267. The grouping below is by role, read off each callee, not off those totals.

| kind | callees | what it writes | read by |
|---|---:|---|---|
| **K1** contextual type | 1 | `recordCtxTy` → `nodeCtxTyIx`, leaf ctx rows | `check_fit_rules` |
| **K2** literal re-typing | 11 | `numLitAdoptDeep`, `numLitReadopt`, `litTreeAdoptDst`, `shiftLitAdopt`, `radixLitAdoptDst`, `f32LitTailsAdopt`, `cexDeliver`, `cexFloatUse`, `nomLitAdopts`, `nodeTySet`, `omitFieldNullDeliver` → `nodeTyIx` of literal leaves, `litWide64`, `cexConverted`, `cexWideFloatOk`, `omitFieldNull`, `nomLitRelax` | 34 modules read `nodeTyIx`, the emitter among them |
| **K3** representation stamps | 8 | `recordRepTyAdopt`, `recordElemRepArrayLit`, `recordNullHoleObjAdopt`, `litBoxesAtDst`, `recordWidenRetagTails`, `recordListWidenRetag`, `recordMapUnbox`, `freshMapAtDstStorage` → `nodeRepTyIx`, `nodeRepUnionIx`, `nodeBoxTyIx`, `mapUnboxTyIx`, `listRetag*`, `widenRetag*`, `mapRetag*`, `nodeTyInst` | `emit_elab` and the check-side rep queries |
| **K4** value conversions | 11 | `recordListCopy`, `recordRecCopy`, `fvaAdapt`, `fvaListSetCopy`, `recLitListAdopt`, `recDropAdopt`, `recAdForce`, `adoptFnNameAt`, `fnValVoidCoerce`, `bareBraceDeliver`, `bareBraceSpecSet` → `listCopyTyIx`, `recCopyTyIx`, `fvaBuilt`, `recAd*`, `voidCoerceVal*`, `bareBrace*`; `fvaAdapt` and `fvaListSetCopy` also mint AST nodes (20 `ast.vl` states) | emitter, `check_store_rep`, `check_emit_queries` |
| **K5** deferred obligations | 5 | `rcwPend`, `recPend`, `recOwnPend`, `rcwPinProbe`, `noteRefListView` → `rcwPend*`, `recPend*`, `recOwnSrc`, `rcwPin*`, `refView*` | end-of-body soundness passes (`check_program`), `emit_collect` |
| **K6** inference observations | 7 | `lbiNoteDelivery`, `nolNoteDelivery`, `fsbNoteFnDelivery`, `noteHoleFlow`, `genFnValueCstrs`, `fvaValueRowNote`, `fvaBindingRowsNote` → `lbi*`, `nolTaken`, `holeFlow*`, `expObsPin*`, constraint rows, `elabWideRow*` | hole solving (`check_fn_decl`, `check_pins`), `emit_elab` |
| **K7** diagnostics | 6 | `covarWriteThroughErr`, `covarTwoUnionsErr`, `objShapeAdapterlessErr`, `narListDeliveryErr`, `objLitUndeclaredErr`, `tErr` | the user |
| **K8** type-relation pins | 3 | `assignable`, `assignableOrOpen`, `substTyDeep` pin holes and record join rows unless `inferQuiet` (28 `inferQuiet` reads in `check_relate_core.vl`) | hole solving |
| memo or mode only | 13 | `tyToStr`, `litTyOfExpr`, `tyHasHole`, `isF32AdoptingLitExpr`, `shiftWidensLit`, `litAtDstStorage`, `listFieldWidenDst`, `covarWriteThrough`, `objShapeAdapterlessAt`, `listLitExactArm`, `listLitExactMember`, `litElemSrcTy`, `narConvListDelivery` | themselves |

52 recorders (K1–K8) and 13 memo or mode callees make the 65.

K7 is a second error channel. Each of its arms reports a diagnostic and then answers `true`,
because the program is type-valid and only the delivery is illegal. A quiet ask therefore cannot see
it. `argCstrFitsAt` (`check_assignable.vl:2186`) has to re-ask loudly because of this (D5840).

### 1.3 The three hazards a split must handle

1. **Recorders that run before the answer.** In `assignableExprIn`, nine recorders run before
   `assignableOrOpen` decides, whatever the final answer: `lbiNoteDelivery`, `nolNoteDelivery`,
   `fsbNoteFnDelivery`, `numLitAdoptDeep` (`:1736`), `recordElemRepArrayLit`, `adoptFnNameAt`,
   `fvaValueRowNote`, `fvaBindingRowsNote` and `noteHoleFlow`. So a mismatch also leaves rows behind,
   and that is the reason a fit question needs a quiet bracket.
2. **Read-back.** Six tables a seam recorder writes are read again by the seam's own judgement:
   `nodeTyIx` (a re-typed literal, then `nodeTyIxOf(srcExpr)` at `:1753`), `nodeRepTyIx`
   (`check_assignable`), `cexConverted`, `recAdForced` (`check_fit_rules`), `nomLitRelax` (a depth
   counter `assignableGo` reads), and `numUnionMinted`. That last one is a mode flag set *inside*
   the judgement (`:1708`) and read by later judgements and by the emitter. A pure `relate` must read
   its own in-flight plan wherever today's code reads a table back.
3. **Ambient inputs.** The seam reads `inferQuiet` (11 times in `assignableExprIn`), `stampsStand()`
   (2 in `check_assignable`, 14 in `check_fit_rules`), `wsSuppress`, `cstrProbe`, `fsbName`,
   `litPinN` (13), `tyWideUnionMinted`, `repTemplateMute`, and the mode flags `objShapeAtArm` and
   `shapeAdapt*` set around sub-judgements. `inferQuiet` means "do not record". Under the split,
   `relate` never records, so it stops reading `inferQuiet` and the recorder checks it once. The
   rest stay read-only inputs of `relate` until stage C passes them in a `RelCx` record.

### 1.4 The quiet brackets

`phase-state-census.vl -- --list` reports 20 `hidden` rows for `check_cursor.vl:26 inferQuiet`:

| bracket | sites | wraps | fate |
|---|---:|---|---|
| a fit question | 14 | `assignableExprIn` ×2, `argCstrFitsAt`, `validateCompArgCstr`, `holeLitAdopts`, `holeNumLitAdopts`, `dstTyParamAdapts` (`:3471`, `:3487`), `retValsDeliverQuiet`, `eqLitDeliver`, `joinArmFits`, `binCstrPairRefusal`, `callArgRepTy`, `callRetRepTy` | deleted (B1–B5, C) |
| a re-check of a subtree or body | 6 | `dstTyParamAdapts` (`:3433`, nested `checkNodeHook`), `bankGenAliasDeclTys`, `letFnLambdaParamTys`, `solveUnannotParams`, `globalInitPrePass`, `cstrProbeBefore` | L5 step 3 (`CheckRun`) |

Three of the fit questions are also rollback-assertion probes (`prbEnter`/`prbLeave` in
`argCstrFitsAt`, `validateCompArgCstr` and `dstTyParamAdapts`). Each asserts that a fit question left
no row behind, which is true by construction once the question is `relate`.

## 2. The `Fit` value

```vl
// What delivering a node at a type takes: decided by `relateExpr`, performed by `recordFit`.
export type Coercion = {
  conv: i32,          // CV_*: the value conversion the emitter performs at the node (K4)
  at: i32,            // the type the value is built at (a union or list arm), or the destination
  steps: CoStep[],    // the K1/K2/K3/K5/K6 effects, in today's order
  kids: Coercion[],   // a field's or an element's delivery, in source order (F1)
}
export type Mismatch = { why: i32 }             // MM_PLAIN, or a code naming the contract refused
export type Refused = { code: i32, c: Coercion } // type-valid and illegal: recorded, then reported (K7)
export type Fit = Coercion | Mismatch | Refused

export type CoStep = { kind: i32, node: i32, ty: i32, aux: i32 }   // ST_CTX, ST_LIT, ST_REP, …
```

- **`conv` is the part L1 needs.** Its alphabet is K4 plus the identity: `CV_SAME`, `CV_LIST_COPY`,
  `CV_REC_COPY`, `CV_MAP_UNBOX`, `CV_LIST_RETAG`, `CV_WIDEN_RETAG`, `CV_FN_ADAPT`,
  `CV_FN_SET_LIST_COPY`, `CV_VOID_TWIN`, `CV_FIELD_DROP`, `CV_LIT_LIST_ADOPT`, `CV_REC_AD_FORCE`,
  `CV_GENERIC_FN_AT`, `CV_BARE_BRACE`. Each one becomes an IR coercion node, and its decision moves
  into `relate` unchanged. A ladder over `CV_*` is exhaustive by the ladder rule.
- **`steps` is a list, not a set of fields.** Byte identity needs today's write order. A step list
  keeps that order, and A1–A4 can move one kind at a time without changing the record. Lane E's `Rep`
  ADT replaces `ty` with a `RepId` in the `ST_REP` steps when its stage 4 lands. The record does
  not change.
- **`kids`** turns F1's recursion into composition. An object or array literal's delivery is its
  fields' coercions, so the two self re-asks (`:1746`, `:1779`) become reads of the child result
  already computed.
- **`Refused`** gives K7 its own variant. A caller that only asks "does it fit?" sees `Refused` as
  a fit (today's `true`) without a diagnostic. `recordFit` emits it. D5840's loud re-ask goes.
- **Allocation.** The common delivery has `src == dst` and no step. It returns one shared constant
  `CO_SAME`, so a hot `relate` allocates nothing on that path. A1 measures the share of
  constant-path deliveries with `$VL_FUEL=1` before deciding whether `steps` needs a pooled buffer.
- **Hole pins (K8)** are left out of the record. Today they are unification writes inside the
  type-level `assignable`, and they belong to lane H's binder-identity work (§3, stage C). Until
  then, `relate` calls `assignable` under the same `inferQuiet` it does today, so K8 behaves as it
  does now.

`recordFit(site, fit)`: on a `Mismatch` it records nothing and returns `false`. This holds only from
A4 on (§3), and until then the nine pre-decision steps are carried in `Mismatch` too. On a
`Coercion` it tests `stampsStand()` once, performs `steps` and `kids` in order, records `conv`, and
returns `true`. On `Refused` it does the same and then emits the diagnostic.

## 3. Migration

Every PR passes the same gates. Two `refresh-compiler.sh` runs give cmp-identical seeds, and the
seed equals the predecessor's. `regress.vl` reports 0 `runs → not-runs`. The full
`GATE_IN_WORKTREE=1 scripts/gate.sh` passes. `self-compile-time.sh` is reported against the
ledger's last line. The PR reports the phase-state census's `hidden` count and the §B counts. A PR
reports net compiler lines and the `emit_mono.vl` function count (908 at this commit). No step
touches `emit_mono.vl`. **None moves a byte.** A byte that moves is a defect the split exposed: it
lands first as its own inventory row, from a reserved id block.

**Stage A: the seam builds a plan.** Callers are unchanged. Inside `assignableExprIn`, one effect
kind at a time, each recorder `recordX(…)` splits into `planX(…) → CoStep[]`, which is pure, and an
`applyX(step)`. The seam appends to a local `Coercion`. `assignableExpr` applies the plan where the
recorder ran before, so the write order is today's.

| PR | kinds | read-back to resolve (§1.3) |
|---|---|---|
| A1 | K1, K3 | `nodeRepTyIx`: the plan answers before the table |
| A2 | K2 | `nodeTyIx`, `cexConverted`, `nomLitRelax` (counter becomes a `relate` argument), `numUnionMinted` (set by `recordFit`, not by the judgement) |
| A3 | K4, K7 | `recAdForced`. Coordinate with lane Q: #8267 regroups the `recAd*` rows that `recAdForce` and `recDropAdopt` write |
| A4 | K5, K6, and pre-decision order | the nine recorders of §1.3(1) move after the answer. This is the only stage that could change behaviour, because a mismatch stops leaving rows. It must still be byte-identical. If a byte moves, some later judgement read a mismatch's row, and that is filed as a row first |

After A4, `relateExpr` is `assignableExprIn` minus its writes, and `assignableExpr(s, a, b)` is
`recordFit(s, relateExpr(s, a, b, cx))`.

**Stage B: callers that only ask stop recording.** One family per PR. Each deletes its quiet
brackets.

| PR | family | sites | deletes |
|---|---|---:|---|
| B1 | F1 seam recursion | 10 | the `assignableExprIn` re-asks (`:1746`, `:1779`) and their brackets; `listArmOfUnionFit`'s second walk reads `kids` |
| B2 | F4 local probes | 5 | `eqLitDeliver`'s quiet ask and double call; `joinArmFits`'s and `binCstrPairRefusal`'s brackets |
| B3 | F2 constraint re-asks | 11 | 6 brackets (`argCstrFitsAt`, `validateCompArgCstr`, `holeLitAdopts`, `holeNumLitAdopts`, `dstTyParamAdapts` ×2), 3 `prbEnter`/`prbLeave` probes, D5840's loud re-ask and its `repTemplateMute` pair |
| B4 | F3 return-inference adoption | 27 | `retValsDeliverQuiet`'s bracket and its diagnostic truncate (`T.diags.pop()` to a mark); each `if tail ≥ 0 && assignableExpr(…)` becomes `relate`, then `recordFit` on the arm taken |
| B5 | F5 deliveries | 29 | nothing to delete; the sites call `recordFit(relateExpr(…))` by name only if the review asks, else they keep `assignableExpr` |

**Stage C: the type relation.** `callArgRepTy` and `callRetRepTy` wrap `substTyDeep` "so it pins no
hole", and `assignable` reads `inferQuiet` 28 times in order to skip its pins. Both need the
relation to return its pins as data rather than write them. That is lane H's stage 2 (holes leave
the rows) and stage 1 (binder identity). C waits for those. Then `relate` takes a `RelCx`
(`wsSuppress`, `cstrProbe`, `fsbName`, `litPinN`, `objShapeAtArm`, `shapeAdapt*`) and
`inferQuiet` stops being read by `check_relate_core.vl`.

Order: A1 → A4 in sequence, since each moves the write order of the one before. B1 depends on A4.
B2–B4 are independent of each other. C depends on lane H.

## 4. What gets deleted

### 4.1 Measured now

| what | count | stage |
|---|---:|---|
| `inferQuiet` hidden-argument scopes (phase-state census) | 14 of 20 | B1–B4, C |
| `quietDepth` pairs inside those brackets | 13 pairs (`callArgRepTy`/`callRetRepTy` have none) | same |
| `prbEnter`/`prbLeave` fit-question probes | 3 of 10 | B3 |
| whole-delivery self re-asks | 2 (`assignableExprIn`) + 1 (`eqLitDeliver`) | B1, B2 |
| `!inferQuiet` guards in `assignableExprIn` | 11 | A4 |
| `stampsStand()` tests in seam recorders | up to 16 (2 + 14) collapse into one in `recordFit` | A1–A4 |
| loud re-ask for K7 visibility | 1 (`argCstrFitsAt`, with its `repTemplateMute` pair) | B3 |
| hand diagnostic rollback after a fit question | 1 (`retValsDeliverQuiet`) | B4 |

### 4.2 Expected cost movement

The two self re-asks run the whole seam a second time, quietly, whenever a literal meets a union, an
empty-collection hole or a null-hole record. B1 removes that second run. The size of the saving is
not measured here: it depends on how often the condition holds in the self-build. B1 reports it with
`self-compile-time.sh`. A1 adds one record per delivery that has steps, and A1 reports that cost.

### 4.3 What this work does *not* delete

- **The `RB_*` rollback masks.** All nine site sets (`RB_RETURNS`, `RB_GLOBAL_INIT`,
  `RB_CSTR_PROBE`, `RB_SOLVE`, `RB_MONO`, `RB_CALL_REJOIN`, `RB_PINNED`, `RB_ALL`, `RB_LINT`) wrap a
  re-check of a body or a call, not a fit question. They fall to L5 step 3 (`CheckRun`), and this
  work shrinks what they roll back. After A4 a refused delivery writes no K5/K6 row, so `RB_HOLE_FLOW`
  (from `noteHoleFlow`) and the constraint families `genFnValueCstrs` feeds lose their fit-question
  writers. Whether a family then has no writer left under any re-check is for lane Q to measure at
  step 3. This note does not claim it.
- **The 6 re-check `inferQuiet` brackets** (§1.4): L5.
- **K8**, until lane H's stages 1 and 2 land.

### 4.4 Net compiler lines (estimate)

Stage A is roughly neutral: about −120 lines of guards and re-asks, against about +150 for the
`plan`/`apply` split and the record type. Stage B is about −250 to −350: each bracket is 6–8 lines,
and B4 makes the 24 adoption arms one table walk. Stage C is about −150. The total is about −400
to −500, and each PR reports its own figure.

## 5. Fit with lanes Q, H and E

| lane | overlap | agreement sought |
|---|---|---|
| **Q** (L5) | `inferQuiet`/`quietDepth` are `CheckRun` cursors; #8267 touches `recAd*` rows | Q's step 3 owns the 6 re-check brackets. This work owns the 14 fit brackets. A3 rebases on #8267. |
| **H** (type arena) | `assignable`'s memo (`asgGuardHits`, `pairMemo*`), K8 pins, `tyWideUnionMinted` | Stage C waits on H stages 1 and 2. `relate` reads the arena only through `tyAt` and the accessors. |
| **E** (Rep ADT) | K3 steps carry a `TyId` that E turns into a `RepId` | the `ST_REP` step's `ty` field changes type at E stage 4, and nothing else in the record does |

## 6. Not claimed

- That `relate` is total over today's callers before A4. Until then, `Mismatch` carries the nine
  pre-decision steps.
- That any inventory row closes. This is a dataflow refactor and a byte that moves is filed first.
- Any fuel figure. §4.2 names who measures it.

## A. Commands

```sh
# 1. Callers (82): every call outside comments and the definition
grep -n 'assignableExpr(' compiler/*.vl | grep -v 'function assignableExpr' | grep -vE ':\s*//' | wc -l
# 2. The quiet brackets (20 inferQuiet hidden rows)
vl run scripts/phase-state-census.vl -- --list | grep '^hidden' | grep inferQuiet
# 3. Seam callees and their transitive writes (§B)
node relate-census.mjs compiler
# 4. Ambient reads
grep -o '\binferQuiet\b' compiler/check_relate_core.vl | wc -l      # 28
awk 'NR>=1689 && NR<=1913' compiler/check_assignable.vl | grep -c inferQuiet   # 11
grep -o 'stampsStand()' compiler/check_fit_rules.vl | wc -l          # 14
# 5. Fixpoint
scripts/refresh-compiler.sh; cp build/vl-compiler.wasm /tmp/a.wasm; scripts/refresh-compiler.sh; cmp build/vl-compiler.wasm /tmp/a.wasm
```

## B. The call-graph census

The script finds each top-level function, the module-level `let`/`const` declarations, and the
sibling imports. A function's *direct writes* are `G =`, `G[…] =`, `G.f =` and mutator calls
(`push`, `set`, …) on a name that resolves to a module declaration and is not a local or a
parameter. *Transitive writes* are closed over the resolved call graph. The census reports the
seam's direct callees and how many reach a write. Section 1.2's kinds are assigned by reading each
callee, not by the script.

```js
// Usage: node relate-census.mjs [compiler-dir]
import fs from "node:fs";
const ROOT = process.argv[2] ?? "compiler";
const MUT = new Set(["push", "pop", "set", "delete", "clear", "insert", "splice", "shift", "unshift"]);
const cut = (l) => { let q = null, o = "";
  for (let i = 0; i < l.length; i++) { const c = l[i];
    if (q) { o += c; if (c === "\\") { o += l[++i] ?? ""; } else if (c === q) q = null; }
    else if (c === '"' || c === "'") { q = c; o += c; }
    else if (l.startsWith("//", i)) break; else o += c; }
  return o; };
const noStr = (l) => cut(l).replace(/"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/g, '""');
const mods = {};
for (const f of fs.readdirSync(ROOT).filter((f) => f.endsWith(".vl")).sort()) {
  const raw = fs.readFileSync(`${ROOT}/${f}`, "utf8").split("\n"), lines = raw.map(noStr);
  const imp = {}, decls = new Set(), fns = {};
  for (let i = 0; i < raw.length; i++) if (raw[i].startsWith("import ")) {
    let j = i, t = ""; for (;; j++) { t += " " + cut(raw[j]); if (raw[j].includes("from ")) break; }
    const m = t.match(/\{(.*)\}\s*from\s*"\.\/([^"]+)"/);
    if (m) for (const it of m[1].split(",")) { const w = it.trim().split(/\s+/);
      if (w.length === 1 && w[0]) imp[w[0]] = [m[2] + ".vl", w[0]];
      if (w.length === 3 && w[1] === "as") imp[w[2]] = [m[2] + ".vl", w[0]]; }
    i = j; }
  for (let i = 0; i < lines.length; i++) { const l = lines[i];
    let m = l.match(/^(export )?(let|const) ([A-Za-z_]\w*)/); if (m) decls.add(m[3]);
    m = l.match(/^(export )?function ([A-Za-z_]\w*)/);
    if (m) { let j = i; while (j < lines.length && lines[j].trimEnd() !== "}" &&
        !(j === i && lines[j].trimEnd().endsWith("}") && lines[j].split("{").length === lines[j].split("}").length)) j++;
      fns[m[2]] = [i, j]; i = j; } }
  mods[f] = { lines, imp, decls, fns }; }
const res = (f, n) => { const md = mods[f];
  if (md.decls.has(n) || n in md.fns) return [f, n];
  const r = md.imp[n]; return r && mods[r[0]] ? r : null; };
const WR = /(?<![\w.$])([A-Za-z_]\w*)((?:\.[A-Za-z_]\w*|\[[^\]]*\])*)\s*(=(?!=)|\.(\w+)\s*\()/g;
const CALL = /(?<![\w.$])([A-Za-z_]\w*)\s*\(/g;
const direct = {}, calls = {};
for (const [f, md] of Object.entries(mods)) for (const [fn, [a, b]] of Object.entries(md.fns)) {
  const key = `${f}:${fn}`, body = md.lines.slice(a, b + 1), locs = new Set();
  for (const l of body) { for (const m of l.matchAll(/\b(?:let|const)\s+([A-Za-z_]\w*)/g)) locs.add(m[1]);
    for (const m of l.matchAll(/\bfor\s+([A-Za-z_]\w*)\s+in/g)) locs.add(m[1]); }
  let head = body.slice(0, 12).join(" "); if (head.includes("{")) head = head.slice(0, head.indexOf("{"));
  for (const m of head.matchAll(/([A-Za-z_]\w*)\s*:/g)) locs.add(m[1]);
  direct[key] = new Set(); calls[key] = new Set();
  for (const l of body) {
    for (const m of l.matchAll(WR)) { if (locs.has(m[1])) continue;
      if (m[4] !== undefined && !MUT.has(m[4])) continue;
      const r = res(f, m[1]); if (r && mods[r[0]].decls.has(r[1])) direct[key].add(r.join(":")); }
    for (const m of l.matchAll(CALL)) { if (locs.has(m[1])) continue;
      const r = res(f, m[1]); if (r && r[1] in mods[r[0]].fns && r.join(":") !== key) calls[key].add(r.join(":")); } } }
const trans = {}; for (const k in direct) trans[k] = new Set(direct[k]);
for (let ch = true; ch;) { ch = false;
  for (const k in trans) { const s = trans[k], n = s.size;
    for (const c of calls[k]) for (const x of trans[c] ?? []) s.add(x); if (s.size !== n) ch = true; } }
const seam = Object.keys(calls).filter((k) => /^check_assignable\.vl:(assignable|listArm)/.test(k));
const cs = new Set(); for (const s of seam) for (const c of calls[s]) cs.add(c); for (const s of seam) cs.delete(s);
const free = [...cs].filter((c) => trans[c].size === 0);
console.log(`seam ${seam.length} functions; direct callees ${cs.size}; write-free ${free.length}; reach a write ${cs.size - free.length}`);
console.log(`assignableExpr reaches ${trans["check_assignable.vl:assignableExpr"].size} states; assignable reaches ${trans["check_relate_core.vl:assignable"].size}`);
for (const c of [...cs].filter((c) => trans[c].size > 0).sort()) console.log(`${trans[c].size}\t${c}`);
```

At `414f937dc` it prints `seam 11 functions; direct callees 105; write-free 40; reach a write 65`
and `assignableExpr reaches 560 states; assignable reaches 267`.
